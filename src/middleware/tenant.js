/**
 * Tenant Middleware - Multi-Tenant Architecture Foundation
 * 
 * PURPOSE: Resolve tenant from license key and attach to request
 * STATUS: MVP implementation (in-memory, ready to activate)
 * PRODUCTION: Replace in-memory store with PostgreSQL after hackathon
 * 
 * USAGE:
 *   const { tenantMiddleware } = require('./middleware/tenant');
 *   app.use('/api/v1', tenantMiddleware); // Apply to all tenant-scoped routes
 * 
 * SECURITY:
 *   - Validates x-license-key header
 *   - Rejects requests without valid license
 *   - Attaches tenantId to req object for downstream use
 */

const crypto = require('crypto');

// ═══════════════════════════════════════════════════════════════
// IN-MEMORY TENANT STORE (MVP)
// Replace with PostgreSQL queries after hackathon
// ═══════════════════════════════════════════════════════════════

class TenantStore {
  constructor() {
    this.tenants = new Map();
    this._initializeDefaults();
  }

  _initializeDefaults() {
    // Create demo tenant for testing
    const demoTenant = {
      id: crypto.randomUUID(),
      name: 'Demo Hydropower Operator',
      tier: 'pro',
      license_key: 'demo-license-key-12345',
      plants_limit: 20,
      created_at: new Date().toISOString(),
      expires_at: null,
      status: 'active'
    };

    this.tenants.set(demoTenant.license_key, demoTenant);
    console.log(`[TENANT STORE] Initialized with demo tenant (ID: ${demoTenant.id})`);
  }

  async findByLicenseKey(licenseKey) {
    return this.tenants.get(licenseKey) || null;
  }

  async create(tenantData) {
    const tenant = {
      id: crypto.randomUUID(),
      name: tenantData.name,
      tier: tenantData.tier,
      license_key: crypto.randomUUID(),
      plants_limit: this._getPlantsLimit(tenantData.tier),
      created_at: new Date().toISOString(),
      expires_at: tenantData.expires_at || null,
      status: 'active'
    };

    this.tenants.set(tenant.license_key, tenant);
    return tenant;
  }

  async getAll() {
    return Array.from(this.tenants.values());
  }

  async getStats() {
    const tenants = Array.from(this.tenants.values());
    return {
      total: tenants.length,
      active: tenants.filter(t => t.status === 'active').length,
      by_tier: {
        starter: tenants.filter(t => t.tier === 'starter').length,
        pro: tenants.filter(t => t.tier === 'pro').length,
        enterprise: tenants.filter(t => t.tier === 'enterprise').length
      }
    };
  }

  _getPlantsLimit(tier) {
    const limits = {
      starter: 5,
      pro: 20,
      enterprise: 100
    };
    return limits[tier] || 5;
  }
}

// Singleton instance
const tenantStore = new TenantStore();

// ═══════════════════════════════════════════════════════════════
// TENANT MIDDLEWARE
// ═══════════════════════════════════════════════════════════════

/**
 * Middleware to resolve tenant from x-license-key header
 * 
 * ACTIVATION:
 *   - Currently DISABLED by default (to avoid breaking existing tests)
 *   - To enable: Set ENABLE_MULTI_TENANT=true in .env
 *   - Or apply selectively to specific routes
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
async function tenantMiddleware(req, res, next) {
  try {
    // Check if multi-tenant mode is enabled
    if (process.env.ENABLE_MULTI_TENANT !== 'true') {
      // Skip tenant resolution in single-tenant mode
      req.tenantId = null;
      req.tenant = null;
      return next();
    }

    // Extract license key from header
    const licenseKey = req.headers['x-license-key'];

    if (!licenseKey) {
      return res.status(401).json({
        error: 'Missing x-license-key header',
        hint: 'Include x-license-key header with your API request',
        documentation: '/api/tenants/docs'
      });
    }

    // Resolve tenant
    const tenant = await tenantStore.findByLicenseKey(licenseKey);

    if (!tenant) {
      return res.status(401).json({
        error: 'Invalid license key',
        hint: 'Check your license key or contact support'
      });
    }

    // Check if tenant is active
    if (tenant.status !== 'active') {
      return res.status(403).json({
        error: 'Tenant account is not active',
        status: tenant.status,
        hint: 'Contact support to reactivate your account'
      });
    }

    // Check expiration
    if (tenant.expires_at && new Date(tenant.expires_at) < new Date()) {
      return res.status(403).json({
        error: 'Tenant license has expired',
        expires_at: tenant.expires_at,
        hint: 'Renew your license to continue using the platform'
      });
    }

    // Attach tenant info to request
    req.tenantId = tenant.id;
    req.tenant = tenant;

    // Log tenant access (for audit trail)
    console.log(`[TENANT ACCESS] ${tenant.name} (${tenant.id}) - ${req.method} ${req.path}`);

    next();
  } catch (error) {
    console.error('[TENANT MIDDLEWARE ERROR]', error);
    res.status(500).json({
      error: 'Tenant resolution failed',
      message: error.message
    });
  }
}

/**
 * Optional middleware for tenant-specific rate limiting
 * Apply higher limits for enterprise tiers
 */
function tenantRateLimitConfig(req) {
  if (!req.tenant) {
    return { windowMs: 15 * 60 * 1000, max: 100 }; // Default
  }

  const limits = {
    starter: { windowMs: 15 * 60 * 1000, max: 100 },
    pro: { windowMs: 15 * 60 * 1000, max: 500 },
    enterprise: { windowMs: 15 * 60 * 1000, max: 2000 }
  };

  return limits[req.tenant.tier] || limits.starter;
}

// ═══════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════

module.exports = {
  tenantMiddleware,
  tenantRateLimitConfig,
  tenantStore, // Export for use in tenant management endpoints

  // Helper function to check if multi-tenant mode is enabled
  isMultiTenantEnabled: () => process.env.ENABLE_MULTI_TENANT === 'true',

  // Helper to get tenant from request (works in both modes)
  getTenantId: (req) => req.tenantId || null
};
