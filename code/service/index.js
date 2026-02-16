require('dotenv').config();
const express = require('express');
const { EngineV1 } = require('../../src/engine/v1/mrv_engine'); // Assuming path

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

// In-memory store for demo (should use database in production)
const mrvHistory = new Map();

app.post('/telemetry', async (req, res) => {
  try {
    const telemetry = req.body;
    if (!telemetry.deviceId || !telemetry.readings) {
      return res.status(400).json({ error: 'Invalid telemetry data' });
    }

    const engine = new EngineV1();
    const result = await engine.verifyAndPublish(telemetry);

    // Store result
    if (!mrvHistory.has(telemetry.deviceId)) {
      mrvHistory.set(telemetry.deviceId, []);
    }
    mrvHistory.get(telemetry.deviceId).push(result);

    res.json({
      success: true,
      status: result.attestation.verificationStatus,
      trustScore: result.attestation.trustScore,
      transactionId: result.transactionId
    });
  } catch (error) {
    console.error('Error processing telemetry:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

app.get('/mrv-snapshot/:deviceId', (req, res) => {
  const deviceId = req.params.deviceId;
  const history = mrvHistory.get(deviceId) || [];
  res.json({ deviceId, history });
});

app.listen(port, () => {
  console.log(`Hedera Hydropower MRV Service listening at http://localhost:${port}`);
});
