/**
 * Hedera Hydropower MRV REST API Server
 * Provides production-ready HTTP endpoints for telemetry submission
 * 
 * Usage:
 *   node src/api/server.js
 *   curl -X POST http://localhost:3000/api/v1/telemetry \
 *     -H "x-api-key: ghpk_demo_key_001" \
 *     -H "Content-Type: application/json" \
 *     -d '{"plant_id":"PLANT-001", "device_id":"TURBINE-1", "readings":{...}}'
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { register } = require('../monitoring/metrics');

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Rate limiting: 100 requests per 15 minutes per IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP, please try again later'
});
app.use('/api/', limiter);

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
  });
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: Date.now(),
    uptime: process.uptime(),
    version: '1.0.0'
  });
});

// Prometheus metrics endpoint
app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    const metrics = await register.metrics();
    res.send(metrics);
  } catch (error) {
    console.error('[METRICS ERROR]', error);
    res.status(500).json({ error: 'Failed to generate metrics' });
  }
});

// API routes
const telemetryRouter = require('./v1/telemetry');
app.use('/api/v1/telemetry', telemetryRouter);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'Hedera Hydropower MRV API',
    version: '1.0.0',
    documentation: 'https://github.com/BikramBiswas786/https-github.com-BikramBiswas786-hedera-hydropower-mrv/blob/main/docs/API.md',
    endpoints: {
      health: '/health',
      metrics: '/metrics',
      telemetry: '/api/v1/telemetry',
      validation_rules: '/api/v1/telemetry/rules'
    },
    authentication: 'Include x-api-key header with your API key'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Not found',
    message: `Endpoint ${req.method} ${req.path} does not exist`,
    available_endpoints: ['/health', '/metrics', '/api/v1/telemetry']
  });
});

// Error handler
app.use((error, req, res, next) => {
  console.error('[SERVER ERROR]', error);
  res.status(500).json({
    error: 'Internal server error',
    message: error.message,
    request_id: Date.now().toString(36)
  });
});

// Start server
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`✓ Hedera Hydropower MRV API running on port ${PORT}`);
    console.log(`✓ Health: http://localhost:${PORT}/health`);
    console.log(`✓ Metrics: http://localhost:${PORT}/metrics`);
    console.log(`✓ API Docs: http://localhost:${PORT}/`);
  });
}

module.exports = app;
