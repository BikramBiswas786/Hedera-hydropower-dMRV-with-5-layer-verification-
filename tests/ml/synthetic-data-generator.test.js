'use strict';

const { generateReading, generateDataset, getSeasonalFlowMultiplier } = require('../../src/ml/SyntheticDataGenerator');

describe('Monsoon-Aware Synthetic Data Generator', () => {
  describe('Seasonal flow multipliers', () => {
    test('Monsoon months (Jun-Sep) have high multiplier (2.5-3.5×)', () => {
      for (let month = 6; month <= 9; month++) {
        const multiplier = getSeasonalFlowMultiplier(month);
        expect(multiplier).toBeGreaterThanOrEqual(2.5);
        expect(multiplier).toBeLessThanOrEqual(3.5);
      }
    });

    test('Post-monsoon months (Oct-Nov) have medium multiplier (1.5-2.0×)', () => {
      for (let month = 10; month <= 11; month++) {
        const multiplier = getSeasonalFlowMultiplier(month);
        expect(multiplier).toBeGreaterThanOrEqual(1.5);
        expect(multiplier).toBeLessThanOrEqual(2.0);
      }
    });

    test('Dry season months (Dec-May) have low multiplier (0.8-1.2×)', () => {
      const dryMonths = [12, 1, 2, 3, 4, 5];
      dryMonths.forEach(month => {
        const multiplier = getSeasonalFlowMultiplier(month);
        expect(multiplier).toBeGreaterThanOrEqual(0.8);
        expect(multiplier).toBeLessThanOrEqual(1.2);
      });
    });
  });

  describe('generateReading() with month parameter', () => {
    test('July (monsoon) reading has high flow rate', () => {
      const { reading, month } = generateReading(7);
      expect(month).toBe(7);
      // Base flow is 0.3-8.0 m³/s, monsoon multiplier is 2.5-3.5×
      // So expected range: 0.3×2.5 = 0.75 to 8.0×3.5 = 28 m³/s
      expect(reading.flowRate_m3_per_s).toBeGreaterThanOrEqual(0.75);
      expect(reading.flowRate_m3_per_s).toBeLessThanOrEqual(28.0);
    });

    test('January (dry) reading has low flow rate', () => {
      const { reading, month } = generateReading(1);
      expect(month).toBe(1);
      // Base flow is 0.3-8.0 m³/s, dry multiplier is 0.8-1.2×
      // So expected range: 0.3×0.8 = 0.24 to 8.0×1.2 = 9.6 m³/s
      expect(reading.flowRate_m3_per_s).toBeGreaterThanOrEqual(0.24);
      expect(reading.flowRate_m3_per_s).toBeLessThanOrEqual(9.6);
    });

    test('Reading includes month and seasonalMultiplier metadata', () => {
      const sample = generateReading(8);
      expect(sample).toHaveProperty('month');
      expect(sample).toHaveProperty('seasonalMultiplier');
      expect(sample.month).toBe(8);
      expect(typeof sample.seasonalMultiplier).toBe('number');
    });
  });

  describe('generateDataset() 12-month distribution', () => {
    test('Dataset is evenly distributed across 12 months', () => {
      const dataset = generateDataset(1200);  // 100 per month
      const monthCounts = {};
      dataset.forEach(d => {
        monthCounts[d.month] = (monthCounts[d.month] || 0) + 1;
      });

      // Each month should have ~100 samples (±1 due to rounding)
      for (let month = 1; month <= 12; month++) {
        expect(monthCounts[month]).toBeGreaterThanOrEqual(99);
        expect(monthCounts[month]).toBeLessThanOrEqual(101);
      }
    });

    test('Monsoon months have higher average flow than dry months', () => {
      const dataset = generateDataset(2400);  // 200 per month
      const monsoonFlows = dataset
        .filter(d => d.month >= 6 && d.month <= 9)
        .map(d => d.reading.flowRate_m3_per_s);
      const dryFlows = dataset
        .filter(d => [12, 1, 2, 3, 4, 5].includes(d.month))
        .map(d => d.reading.flowRate_m3_per_s);

      const avgMonsoon = monsoonFlows.reduce((a, b) => a + b, 0) / monsoonFlows.length;
      const avgDry = dryFlows.reduce((a, b) => a + b, 0) / dryFlows.length;

      // Monsoon flow should be at least 2× dry season flow
      expect(avgMonsoon).toBeGreaterThan(avgDry * 2);
    });

    test('All readings have valid month (1-12)', () => {
      const dataset = generateDataset(500);
      dataset.forEach(d => {
        expect(d.month).toBeGreaterThanOrEqual(1);
        expect(d.month).toBeLessThanOrEqual(12);
      });
    });
  });
});
