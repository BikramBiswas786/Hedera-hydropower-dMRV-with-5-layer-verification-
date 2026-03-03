const Redis = require("ioredis");
let redis;
let redisAvailable = false;
try {
  redis = new Redis(process.env.REDIS_URL || "redis://127.0.0.1:6379", {
    maxRetriesPerRequest: 1,
    enableReadyCheck: true,
    lazyConnect: true
  });
  redis.connect().then(() => {
    redisAvailable = true;
    console.log("[ReplayProtection] Redis connected");
  }).catch((err) => {
    console.warn("[ReplayProtection] Redis unavailable:", err.message);
  });
  redis.on("error", (err) => {
    redisAvailable = false;
    console.warn("[ReplayProtection] Redis error:", err.message);
  });
  redis.on("ready", () => {
    redisAvailable = true;
  });
} catch (err) {
  console.warn("[ReplayProtection] Redis init failed:", err.message);
}
async function checkReplay(plantId, deviceId, timestamp) {
  if (!redis || !redisAvailable) {
    console.warn("[ReplayProtection] Redis unavailable, skipping dedup");
    return { isDuplicate: false, degraded: true };
  }
  try {
    const key = "replay:" + plantId + ":" + deviceId + ":" + timestamp;
    const result = await redis.set(key, "1", "EX", 86400, "NX");
    return { 
      isDuplicate: result === null,
      degraded: false
    };
  } catch (err) {
    console.warn("[ReplayProtection] Check failed:", err.message);
    return { isDuplicate: false, degraded: true };
  }
}
module.exports = { checkReplay };