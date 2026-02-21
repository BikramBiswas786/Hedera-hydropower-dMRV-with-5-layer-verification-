'use strict';

/**
 * Authentication Middleware
 * ─────────────────────────────────────────────────────────────────
 * JWT and API Key authentication for production
 */

const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const API_KEY_SALT = process.env.API_KEY_SALT || 'dev-salt';

/**
 * Generate JWT token for user
 */
function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

/**
 * Verify JWT token middleware
 */
function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Missing or invalid Authorization header'
    });
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid or expired token'
    });
  }
}

/**
 * Verify API Key middleware (for devices)
 */
function verifyAPIKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Missing X-API-Key header'
    });
  }

  // Hash API key for comparison
  const hashedKey = crypto
    .createHmac('sha256', API_KEY_SALT)
    .update(apiKey)
    .digest('hex');

  // In production, validate against database
  // For now, accept any valid-looking key in dev mode
  if (process.env.NODE_ENV !== 'production') {
    req.device = {
      apiKey,
      deviceId: req.body.deviceId || 'UNKNOWN',
      role: 'device'
    };
    return next();
  }

  // TODO: Query database for matching API key hash
  // const device = await db.devices.findByAPIKeyHash(hashedKey);
  // if (!device) return res.status(401).json({ error: 'Invalid API key' });
  // req.device = device;

  next();
}

/**
 * Require admin role
 */
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Admin access required'
    });
  }
  next();
}

/**
 * Require specific roles
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: `Required role: ${roles.join(' or ')}`
      });
    }
    next();
  };
}

/**
 * Optional authentication (doesn't fail if missing)
 */
function optionalJWT(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
  } catch (error) {
    // Silently ignore invalid tokens for optional auth
  }

  next();
}

/**
 * Generate API key for device
 */
function generateAPIKey(deviceId) {
  const randomBytes = crypto.randomBytes(32).toString('hex');
  const apiKey = `mrv_${deviceId}_${randomBytes}`;

  const hash = crypto
    .createHmac('sha256', API_KEY_SALT)
    .update(apiKey)
    .digest('hex');

  return { apiKey, hash };
}

/**
 * Hash password (for user registration)
 */
async function hashPassword(password) {
  const bcrypt = require('bcrypt');
  return await bcrypt.hash(password, 10);
}

/**
 * Compare password
 */
async function comparePassword(password, hash) {
  const bcrypt = require('bcrypt');
  return await bcrypt.compare(password, hash);
}

module.exports = {
  // Middleware
  jwt: verifyJWT,
  apiKey: verifyAPIKey,
  requireAdmin,
  requireRole,
  optionalJWT,

  // Utilities
  generateToken,
  generateAPIKey,
  hashPassword,
  comparePassword
};
