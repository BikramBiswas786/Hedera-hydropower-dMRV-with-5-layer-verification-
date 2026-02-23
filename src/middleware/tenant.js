// src/middleware/tenant.js
// Multi-tenancy middleware for v1.6.1
const tenantRegistry = new Map();
function registerTenant(tenantId, config) {
  tenantRegistry.set(tenantId, {
    id: tenantId,
    name: config.name || tenantId,
    plants: config.plants || [],
    emissionFactor: config.emissionFactor || 0.8,
    currency: config.currency || 'USD',
    createdAt: new Date().toISOString()
  });
}
function tenantMiddleware(req, res, next) {
  const tenantId = req.headers['x-tenant-id'] || req.query.tenantId || 'default';
  if (!tenantRegistry.has(tenantId) && tenantId !== 'default') {
    return res.status(403).json({ error: 'Unknown tenant', tenantId });
  }
  req.tenant = tenantRegistry.get(tenantId) || { id: 'default', name: 'Default Tenant' };
  next();
}
// Pre-register default tenant
registerTenant('default', { name: 'Default Tenant', emissionFactor: 0.8 });
module.exports = { tenantMiddleware, registerTenant, tenantRegistry };
