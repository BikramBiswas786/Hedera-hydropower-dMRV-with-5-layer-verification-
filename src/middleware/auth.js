/**
 * Authentication middleware for Hedera Hydropower MRV API
 * Supports API key authentication for device gateways
 * TODO: Add JWT/OAuth2 for web dashboard when multi-tenancy is implemented
 */

const crypto = require('crypto');

/**
 * Validate API key from request headers
 * @param {string} apiKey - API key from x-api-key header
 * @returns {Object|null} Organization info if valid, null otherwise
 */
function validateAPIKey(apiKey) {
  if (!apiKey) {
    return null;
  }

  // Get valid API keys from environment (comma-separated)
  const validKeys = (process.env.VALID_API_KEYS || '').split(',').filter(k => k.trim());
  
  if (validKeys.length === 0) {
    console.warn('[AUTH] No VALID_API_KEYS configured - authentication disabled in dev mode');
    return { org_id: 'ORG-DEFAULT', mode: 'dev' };
  }

  // Constant-time comparison to prevent timing attacks
  const isValid = validKeys.some(validKey => {
    return crypto.timingSafeEqual(
      Buffer.from(apiKey),
      Buffer.from(validKey)
    );
  });

  if (!isValid) {
    return null;
  }

  // For now, single-tenant; return default org
  // TODO: Map API key to org_id from database when multi-tenancy added
  return { 
    org_id: 'ORG-DEFAULT',
    api_key: apiKey,
    mode: 'authenticated'
  };
}

/**
 * Express middleware to authenticate API requests
 * Checks x-api-key header and validates against VALID_API_KEYS env var
 */
function authenticateAPI(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey) {
    return res.status(401).json({ 
      error: 'Missing x-api-key header',
      message: 'API authentication required. Include x-api-key header with your request.'
    });
  }
  
  const org = validateAPIKey(apiKey);
  
  if (!org) {
    return res.status(403).json({ 
      error: 'Invalid API key',
      message: 'The provided API key is not valid. Check your credentials.'
    });
  }
  
  // Attach org info to request for downstream handlers
  req.org_id = org.org_id;
  req.auth_mode = org.mode;
  
  next();
}

/**
 * Optional middleware for role-based access control (future use)
 * @param {Array<string>} allowedRoles - Roles that can access this endpoint
 */
function requireRole(allowedRoles) {
  return (req, res, next) => {
    // TODO: Implement when JWT auth + user roles added
    // For now, all authenticated requests pass
    next();
  };
}

module.exports = {
  authenticateAPI,
  requireRole,
  validateAPIKey
};
