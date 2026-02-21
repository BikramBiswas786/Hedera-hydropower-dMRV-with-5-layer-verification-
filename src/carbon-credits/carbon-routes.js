/**
 * Carbon Credit API Routes
 * 
 * ENDPOINTS:
 *   POST   /api/v1/carbon-credits/calculate       - Calculate from attestation
 *   POST   /api/v1/carbon-credits/mint             - Mint Hedera tokens
 *   POST   /api/v1/carbon-credits/verra/register   - Register with Verra
 *   POST   /api/v1/carbon-credits/goldstandard/register - Register with Gold Standard
 *   GET    /api/v1/carbon-credits/marketplace/prices    - Get market prices
 *   GET    /api/v1/carbon-credits/inventory/:tenantId   - Get tenant inventory
 *   POST   /api/v1/carbon-credits/marketplace/sell      - Create sell order
 */

const express = require('express');
const { CarbonCreditManager } = require('./CarbonCreditManager');
const { VerraIntegration } = require('./VerraIntegration');
const { GoldStandardIntegration } = require('./GoldStandardIntegration');
const { CarbonMarketplace } = require('./CarbonMarketplace');

const router = express.Router();

const verra = new VerraIntegration();
const goldStandard = new GoldStandardIntegration();
const marketplace = new CarbonMarketplace(verra, goldStandard);
const manager = new CarbonCreditManager(null);

router.post('/calculate', async (req, res) => {
  try {
    const { attestation } = req.body;
    
    if (!attestation) {
      return res.status(400).json({ error: 'Missing attestation' });
    }

    const result = manager.calculateCredits(attestation);
    
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/mint', async (req, res) => {
  try {
    const { tenantId, quantity, metadata } = req.body;
    
    if (!tenantId || !quantity) {
      return res.status(400).json({ error: 'Missing tenantId or quantity' });
    }

    const result = await manager.mintCredits(tenantId, quantity, metadata || {});
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/verra/register', async (req, res) => {
  try {
    const { creditId } = req.body;
    
    if (!creditId) {
      return res.status(400).json({ error: 'Missing creditId' });
    }

    const credit = manager.getCredit(creditId);
    if (!credit) {
      return res.status(404).json({ error: 'Credit not found' });
    }

    const result = await verra.registerCredit(credit);
    
    manager.updateCreditStatus(creditId, 'registered_verra', result);
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/goldstandard/register', async (req, res) => {
  try {
    const { creditId } = req.body;
    
    if (!creditId) {
      return res.status(400).json({ error: 'Missing creditId' });
    }

    const credit = manager.getCredit(creditId);
    if (!credit) {
      return res.status(404).json({ error: 'Credit not found' });
    }

    const result = await goldStandard.registerCredit(credit);
    
    manager.updateCreditStatus(creditId, 'registered_goldstandard', result);
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/marketplace/prices', async (req, res) => {
  try {
    const prices = await marketplace.getMarketPrices();
    res.json(prices);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/inventory/:tenantId', async (req, res) => {
  try {
    const { tenantId } = req.params;
    const inventory = manager.getTenantInventory(tenantId);
    res.json(inventory);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/marketplace/sell', async (req, res) => {
  try {
    const { tenantId, creditId, quantity_tco2e, asking_price_per_tco2e } = req.body;
    
    if (!tenantId || !creditId || !quantity_tco2e || !asking_price_per_tco2e) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const result = await marketplace.createSellOrder(
      tenantId,
      creditId,
      quantity_tco2e,
      asking_price_per_tco2e
    );
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/marketplace/orderbook', async (req, res) => {
  try {
    const orderBook = marketplace.getOrderBook();
    res.json(orderBook);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = { router, manager, verra, goldStandard, marketplace };