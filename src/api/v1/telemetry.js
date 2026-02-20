const express = require('express');
const router = express.Router();
const Workflow = require('../../workflow');
const { authenticateAPI } = require('../../middleware/auth');

const workflow = new Workflow();

router.post('/', authenticateAPI, async (req, res) => {
  try {
    const { plant_id, device_id, timestamp, readings } = req.body;
    await workflow.initialize(plant_id, device_id);
    const result = await workflow.submitReading({ timestamp, readings });
    res.status(200).json({
      verification_id: result.verification_id,
      status: result.status,
      trust_score: result.trustScore,
      hedera_tx_id: result.hedera_tx_id,
      hashscan_url: result.hashscan_url,
      carbon_credits_eligible_tco2e: parseFloat(((readings.power_output_kw || 0) / 1000 * 0.82).toFixed(4))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
