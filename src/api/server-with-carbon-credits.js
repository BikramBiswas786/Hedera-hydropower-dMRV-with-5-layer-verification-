/**
 * Express Server with Carbon Credit Integration
 * 
 * This is a complete server setup with carbon credit routes.
 * Copy this to src/api/server.js or merge with your existing server.
 * 
 * Start: node src/api/server-with-carbon-credits.js
 */

const express = require('express');
const cors = require('cors');
const { router: carbonRoutes } = require('../carbon-credits/carbon-routes');
const { router: tenantRoutes } = require('./v1/tenants');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    features: {
      carbon_credits: true,
      multi_tenant: true,
      hedera_integration: true
    }
  });
});

// API Routes
app.use('/api/v1/carbon-credits', carbonRoutes);
app.use('/api/v1/tenants', tenantRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'Hedera Hydropower MRV API',
    version: '1.0.0',
    description: 'Carbon credit MRV system with Hedera blockchain verification',
    endpoints: {
      health: '/health',
      carbon_credits: '/api/v1/carbon-credits',
      tenants: '/api/v1/tenants'
    },
    documentation: 'https://github.com/BikramBiswas786/hedera-hydropower-mrv'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    path: req.path,
    method: req.method
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('[ERROR]', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    path: req.path
  });
});

// Start server
if (require.main === module) {
  app.listen(PORT, () => {
    console.log('\n' + '='.repeat(60));
    console.log('  🚀 Hedera Hydropower MRV API Server');
    console.log('='.repeat(60));
    console.log(`\n  ✅ Server running at http://localhost:${PORT}`);
    console.log(`  ✅ Health check: http://localhost:${PORT}/health`);
    console.log(`  ✅ Carbon credits: http://localhost:${PORT}/api/v1/carbon-credits`);
    console.log(`  ✅ Tenants: http://localhost:${PORT}/api/v1/tenants`);
    console.log('\n' + '='.repeat(60) + '\n');
  });
}

module.exports = app;