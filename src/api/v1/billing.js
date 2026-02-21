/**
 * Billing & Metering API
 * Transaction tracking and usage statistics
 */

const express = require('express');
const { tenantStore } = require('../../middleware/tenant');
const { transactionStore } = require('./tenants');

const router = express.Router();

/**
 * POST /api/v1/billing/meters
 * Record transaction for billing (internal use)
 * 
 * Body: { tenantId, type, costUsd, costInr }
 */
router.post('/meters', async (req, res) => {
  try {
    const { tenantId, type, costUsd, costInr } = req.body;

    if (!tenantId || !type) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['tenantId', 'type']
      });
    }

    const transaction = await transactionStore.record(
      tenantId,
      type,
      costUsd || 0,
      costInr || 0
    );

    res.json({
      status: 'success',
      transaction_id: transaction.id
    });
  } catch (error) {
    console.error('[BILLING METER ERROR]', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/v1/billing/usage
 * Get usage and billing stats
 * Query: ?periodStart=ISO8601&periodEnd=ISO8601
 */
router.get('/usage', async (req, res) => {
  try {
    const licenseKey = req.headers['x-license-key'];

    if (!licenseKey) {
      return res.status(401).json({ error: 'Missing x-license-key header' });
    }

    const tenant = await tenantStore.findByLicenseKey(licenseKey);
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const { periodStart, periodEnd } = req.query;
    const usage = await transactionStore.getUsageByTenantId(
      tenant.id,
      periodStart,
      periodEnd
    );

    res.json({
      status: 'success',
      tenant_id: tenant.id,
      period: {
        start: periodStart || 'all time',
        end: periodEnd || 'now'
      },
      ...usage,
      transactions: undefined // Don't return full transaction list
    });
  } catch (error) {
    console.error('[BILLING USAGE ERROR]', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = { router };
