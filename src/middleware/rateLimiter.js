'use strict';

/**
 * Rate Limiter - Redis-backed Sliding Window
 * ─────────────────────────────────────────────────────────────────
 * Prevents abuse with distributed rate limiting
 */

const redis = require('redis');

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || 900000); // 15 min
const MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || 100);

let redisClient = null;
let redisAvailable = false;

// Initialize Redis client
(async () => {
  try {
    redisClient = redis.createClient({ url: REDIS_URL });
    redisClient.on('error', (err) => {
      console.error('[RateLimiter] Redis error:', err.message);
      redisAvailable = false;
    });
    redisClient.on('connect', () => {
      console.log('[RateLimiter] Redis connected');
      redisAvailable = true;
    });
    await redisClient.connect();
  } catch (error) {
    console.error('[RateLimiter] Redis connection failed:', error.message);
    redisAvailable = false;
  }
})();

/**
 * In-memory fallback for rate limiting (when Redis unavailable)
 */
const memoryStore = new Map();

function cleanupMemoryStore() {
  const now = Date.now();
  for (const [key, data] of memoryStore.entries()) {
    if (now - data.resetTime > WINDOW_MS) {
      memoryStore.delete(key);
    }
  }
}

setInterval(cleanupMemoryStore, 60000); // Cleanup every minute

/**
 * Core rate limiter function
 */
async function checkRateLimit(identifier, maxRequests = MAX_REQUESTS, windowMs = WINDOW_MS) {
  const key = `ratelimit:${identifier}`;
  const now = Date.now();
  const windowStart = now - windowMs;

  if (redisAvailable && redisClient) {
    try {
      // Remove old requests outside window
      await redisClient.zRemRangeByScore(key, 0, windowStart);

      // Count requests in current window
      const count = await redisClient.zCard(key);

      if (count >= maxRequests) {
        // Get oldest request timestamp to calculate reset time
        const oldest = await redisClient.zRange(key, 0, 0, { WITHSCORES: true });
        const resetTime = oldest[0] ? parseInt(oldest[0].score) + windowMs : now + windowMs;

        return {
          allowed: false,
          remaining: 0,
          resetTime,
          total: maxRequests
        };
      }

      // Add current request
      await redisClient.zAdd(key, { score: now, value: `${now}-${Math.random()}` });
      await redisClient.expire(key, Math.ceil(windowMs / 1000));

      return {
        allowed: true,
        remaining: maxRequests - count - 1,
        resetTime: now + windowMs,
        total: maxRequests
      };
    } catch (error) {
      console.error('[RateLimiter] Redis error:', error.message);
      // Fall through to memory store
    }
  }

  // Fallback to in-memory store
  let data = memoryStore.get(key);

  if (!data || now - data.resetTime > windowMs) {
    data = {
      requests: [],
      resetTime: now
    };
  }

  // Remove old requests
  data.requests = data.requests.filter(ts => now - ts < windowMs);

  if (data.requests.length >= maxRequests) {
    memoryStore.set(key, data);
    return {
      allowed: false,
      remaining: 0,
      resetTime: data.resetTime + windowMs,
      total: maxRequests
    };
  }

  data.requests.push(now);
  memoryStore.set(key, data);

  return {
    allowed: true,
    remaining: maxRequests - data.requests.length,
    resetTime: data.resetTime + windowMs,
    total: maxRequests
  };
}

/**
 * Global rate limiter (by IP)
 */
function globalLimiter(maxRequests = MAX_REQUESTS, windowMs = WINDOW_MS) {
  return async (req, res, next) => {
    const identifier = req.ip || req.connection.remoteAddress || 'unknown';

    const result = await checkRateLimit(identifier, maxRequests, windowMs);

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', result.total);
    res.setHeader('X-RateLimit-Remaining', result.remaining);
    res.setHeader('X-RateLimit-Reset', Math.ceil(result.resetTime / 1000));

    if (!result.allowed) {
      return res.status(429).json({
        error: 'Too Many Requests',
        message: `Rate limit exceeded. Try again in ${Math.ceil((result.resetTime - Date.now()) / 1000)}s`,
        retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000)
      });
    }

    next();
  };
}

/**
 * Device rate limiter (by API key)
 */
function deviceLimiter(maxRequests = 10000, windowMs = 3600000) {
  return async (req, res, next) => {
    const apiKey = req.headers['x-api-key'] || req.device?.apiKey;

    if (!apiKey) {
      // Fall back to IP-based limiting
      return globalLimiter(maxRequests, windowMs)(req, res, next);
    }

    const identifier = `device:${apiKey}`;
    const result = await checkRateLimit(identifier, maxRequests, windowMs);

    res.setHeader('X-RateLimit-Limit', result.total);
    res.setHeader('X-RateLimit-Remaining', result.remaining);
    res.setHeader('X-RateLimit-Reset', Math.ceil(result.resetTime / 1000));

    if (!result.allowed) {
      return res.status(429).json({
        error: 'Too Many Requests',
        message: `Device rate limit exceeded. Try again in ${Math.ceil((result.resetTime - Date.now()) / 1000)}s`,
        retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000)
      });
    }

    next();
  };
}

/**
 * User rate limiter (by user ID)
 */
function userLimiter(maxRequests = 1000, windowMs = WINDOW_MS) {
  return async (req, res, next) => {
    const userId = req.user?.id;

    if (!userId) {
      // Fall back to IP-based limiting
      return globalLimiter(maxRequests, windowMs)(req, res, next);
    }

    const identifier = `user:${userId}`;
    const result = await checkRateLimit(identifier, maxRequests, windowMs);

    res.setHeader('X-RateLimit-Limit', result.total);
    res.setHeader('X-RateLimit-Remaining', result.remaining);
    res.setHeader('X-RateLimit-Reset', Math.ceil(result.resetTime / 1000));

    if (!result.allowed) {
      return res.status(429).json({
        error: 'Too Many Requests',
        message: `User rate limit exceeded. Try again in ${Math.ceil((result.resetTime - Date.now()) / 1000)}s`,
        retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000)
      });
    }

    next();
  };
}

/**
 * Cleanup on shutdown
 */
process.on('SIGTERM', async () => {
  if (redisClient) {
    await redisClient.quit();
  }
});

module.exports = {
  global: globalLimiter,
  device: deviceLimiter,
  user: userLimiter,
  checkRateLimit  // Export for testing
};
