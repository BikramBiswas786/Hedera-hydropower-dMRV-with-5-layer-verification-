'use strict';

/**
 * Plants Router  v1
 * ───────────────────────────────────────────────────────
 * Replaces the inline `let plants = []` block that was in server.js.
 * Now backed by PostgreSQL (with transparent in-memory fallback).
 *
 * Auth:
 *   POST /          → JWT + operator/admin
 *   GET  /          → public (optionalJWT)
 *   GET  /:id       → public (optionalJWT)
 *   GET  /aggregate/stats → JWT (operational data)
 *
 * Validation:
 *   plantCreateRules from src/middleware/validate.js
 */

const express = require('express');
const auth    = require('../../middleware/auth');
const { plantRepo }                              = require('../../db/plants');
const { plantCreateRules, handleValidation }     = require('../../../src/middleware/validate');

const router = express.Router();

// ─── POST /api/v1/plants ─────────────────────────────────────────────────────────
router.post(
  '/',
  auth.jwt,
  auth.requireRole('admin', 'operator'),
  plantCreateRules,
  handleValidation,
  async (req, res) => {
    try {
      const { plant_id, name, location, capacity_mw, plant_type } = req.body;

      const plant = {
        plant_id,
        name:        name.trim(),
        location:    location   ? String(location).trim()   : null,
        capacity_mw: parseFloat(capacity_mw),
        plant_type:  plant_type || 'hydro',
        status:      'active',
        tenant_id:   req.user.tenantId || null,
        created_by:  req.user.email
      };

      try {
        const created = await plantRepo.create(plant);
        return res.status(201).json({
          status:  'success',
          message: 'Plant registered successfully',
          plant:   created,
          storage: plantRepo.isUsingDB() ? 'postgresql' : 'in-memory'
        });
      } catch (err) {
        if (err.message === 'PLANT_EXISTS') {
          return res.status(409).json({ error: 'Plant already exists', plant_id });
        }
        throw err;
      }
    } catch (error) {
      console.error('[PLANTS] Registration error:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

// ─── GET /api/v1/plants/aggregate/stats  (must be before /:id) ────────────────
router.get('/aggregate/stats', auth.jwt, async (req, res) => {
  try {
    const stats = await plantRepo.aggregate();
    res.json({ status: 'success', ...stats });
  } catch (error) {
    console.error('[PLANTS] Aggregate error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── GET /api/v1/plants ────────────────────────────────────────────────────────────
router.get('/', auth.optionalJWT, async (req, res) => {
  try {
    const { status, type } = req.query;
    const plants = await plantRepo.findAll({ status, type });

    res.json({
      status:            'success',
      count:             plants.length,
      total_capacity_mw: plants.reduce((s, p) => s + Number(p.capacity_mw), 0),
      plants,
      storage: plantRepo.isUsingDB() ? 'postgresql' : 'in-memory'
    });
  } catch (error) {
    console.error('[PLANTS] List error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── GET /api/v1/plants/:id ───────────────────────────────────────────────────────
router.get('/:id', auth.optionalJWT, async (req, res) => {
  try {
    const plant = await plantRepo.findById(req.params.id);

    if (!plant) {
      return res.status(404).json({ error: 'Plant not found', plant_id: req.params.id });
    }

    res.json({ status: 'success', plant });
  } catch (error) {
    console.error('[PLANTS] Get error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = { router };
