/**
 * Hedera Hydropower MRV — REST API
 *
 * Minimal Express server exposing the MRV engine over HTTP.
 * Authentication: API-key placeholder (TODO: replace with OAuth2/OIDC in production)
 */
'use strict';

const express = require('express');

const app = express();
app.use(express.json());

// ---------------------------------------------------------------------------
// Auth middleware (placeholder)
// TODO: Replace with OAuth2/OIDC and role-based access control in production.
// ---------------------------------------------------------------------------
function requireApiKey(req, res, next) {
  const key = req.headers['x-api-key'];
  if (!key) {
    return res.status(401).json({ error: 'Missing x-api-key header' });
  }
  // In production: validate key against DB / identity provider
  next();
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/** Health check — no auth required */
app.get('/api/v1/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * POST /api/v1/telemetry
 * Submit a single telemetry reading for MRV verification.
 *
 * Body: { deviceId, flowRate, head, efficiency, generatedKwh, timestamp, ... }
 * Returns: { status, trustScore, attestationId, transactionId }
 */
app.post('/api/v1/telemetry', requireApiKey, async (req, res) => {
  try {
    // Dynamic import so server.js can be loaded without engine initialisation
    const { EngineV1 } = require('../engine/v1/engine-v1');
    const engine = new EngineV1();
    const result = await engine.submitReading(req.body);
    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * GET /api/v1/attestations
 * Retrieve stored attestations (requires auth).
 */
app.get('/api/v1/attestations', requireApiKey, (req, res) => {
  // Placeholder — wire to your AttestationStore in production
  res.json({ attestations: [], note: 'Connect to AttestationStore for production data' });
});

// ---------------------------------------------------------------------------
// Export app (for testing) and optional standalone start
// ---------------------------------------------------------------------------
const PORT = process.env.PORT || 3000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`[MRV API] Server running on port ${PORT}`);
  });
}

module.exports = { app };
