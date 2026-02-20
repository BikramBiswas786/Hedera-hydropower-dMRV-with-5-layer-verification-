#!/usr/bin/env node
/**
 * Generate Synthetic Training Data for ML Models
 * 
 * This creates physics-based synthetic hydropower readings
 * with labeled fraud patterns for supervised learning.
 */

const fs = require('fs');
const crypto = require('crypto');

class SyntheticDataGenerator {
  constructor(config = {}) {
    this.config = {
      normalSamples: config.normalSamples || 800,
      fraudSamples: config.fraudSamples || 200,
      seed: config.seed || 42,
      ...config
    };
    
    // Seed random for reproducibility
    this.rng = this.seededRandom(this.config.seed);
  }

  seededRandom(seed) {
    let state = seed;
    return () => {
      state = (state * 9301 + 49297) % 233280;
      return state / 233280;
    };
  }

  /**
   * Generate normal (non-fraudulent) readings
   * Uses physics formula: P = ρ × g × Q × H × η
   */
  generateNormalReadings(count) {
    const readings = [];
    const rho = 1000;  // water density
    const g = 9.81;    // gravity

    for (let i = 0; i < count; i++) {
      // Random but realistic parameters
      const flowRate = 1.5 + this.rng() * 3.0;      // 1.5-4.5 m³/s
      const head = 30 + this.rng() * 40;            // 30-70 m
      const efficiency = 0.75 + this.rng() * 0.15;  // 75-90%
      const pH = 6.8 + this.rng() * 1.0;            // 6.8-7.8
      const turbidity = this.rng() * 30;            // 0-30 NTU
      const temperature = 12 + this.rng() * 12;     // 12-24°C

      // Calculate physics-correct generation
      const P_theoretical = (rho * g * flowRate * head * efficiency) / 1000;
      
      // Add realistic measurement noise (±5%)
      const noise = 0.95 + this.rng() * 0.10;
      const generatedKwh = P_theoretical * noise;

      readings.push({
        id: `NORMAL-${i}`,
        deviceId: `TURBINE-${Math.floor(this.rng() * 5) + 1}`,
        timestamp: new Date(Date.now() - (count - i) * 3600000).toISOString(),
        flowRate: parseFloat(flowRate.toFixed(3)),
        head: parseFloat(head.toFixed(2)),
        generatedKwh: parseFloat(generatedKwh.toFixed(2)),
        pH: parseFloat(pH.toFixed(2)),
        turbidity: parseFloat(turbidity.toFixed(1)),
        temperature: parseFloat(temperature.toFixed(1)),
        efficiency: parseFloat(efficiency.toFixed(3)),
        pressure: parseFloat((85 + this.rng() * 15).toFixed(2)),      // ✅ NEW: 85-100 bar (normal)
        vibration: parseFloat((1.0 + this.rng() * 1.5).toFixed(3)),   // ✅ NEW: 1.0-2.5 mm/s (normal)
        isFraud: false,
        fraudType: null
      });
    }

    return readings;
  }

  /**
   * Generate fraudulent readings with known patterns
   */
  generateFraudReadings(count) {
    const readings = [];
    const rho = 1000;
    const g = 9.81;

    const fraudPatterns = [
      { type: 'INFLATION', weight: 0.4 },      // Inflated generation
      { type: 'DUPLICATION', weight: 0.2 },    // Duplicate readings
      { type: 'PHYSICS_IMPOSSIBLE', weight: 0.3 }, // Impossible physics
      { type: 'TEMPORAL_ANOMALY', weight: 0.1 }   // Time manipulation
    ];

    for (let i = 0; i < count; i++) {
      const rand = this.rng();
      let fraudType = 'INFLATION';
      let cumWeight = 0;
      
      for (const pattern of fraudPatterns) {
        cumWeight += pattern.weight;
        if (rand <= cumWeight) {
          fraudType = pattern.type;
          break;
        }
      }

      const reading = this._generateFraudByType(fraudType, i);
      readings.push(reading);
    }

    return readings;
  }

  _generateFraudByType(type, index) {
    const rho = 1000;
    const g = 9.81;
    
    const flowRate = 1.5 + this.rng() * 3.0;
    const head = 30 + this.rng() * 40;
    const efficiency = 0.75 + this.rng() * 0.15;
    const P_theoretical = (rho * g * flowRate * head * efficiency) / 1000;

    let generatedKwh;
    let fraudType = type;

    switch (type) {
      case 'INFLATION':
        // Inflate by 150-400%
        const inflationFactor = 2.5 + this.rng() * 1.5;
        generatedKwh = P_theoretical * inflationFactor;
        break;

      case 'PHYSICS_IMPOSSIBLE':
        // Generate impossible values (>100% efficiency)
        generatedKwh = (rho * g * flowRate * head * 1.5) / 1000;
        break;

      case 'DUPLICATION':
        // Same values repeated
        generatedKwh = P_theoretical * 0.98;
        break;

      case 'TEMPORAL_ANOMALY':
        // Sudden spike
        generatedKwh = P_theoretical * 5.0;
        break;

      default:
        generatedKwh = P_theoretical * 3.0;
    }

    return {
      id: `FRAUD-${index}`,
      deviceId: `TURBINE-${Math.floor(this.rng() * 5) + 1}`,
      timestamp: new Date(Date.now() - (index * 3600000)).toISOString(),
      flowRate: parseFloat(flowRate.toFixed(3)),
      head: parseFloat(head.toFixed(2)),
      generatedKwh: parseFloat(generatedKwh.toFixed(2)),
      pH: parseFloat((6.8 + this.rng() * 1.0).toFixed(2)),
      turbidity: parseFloat((this.rng() * 30).toFixed(1)),
      temperature: parseFloat((12 + this.rng() * 12).toFixed(1)),
      efficiency: parseFloat(efficiency.toFixed(3)),
      pressure: parseFloat((60 + this.rng() * 50).toFixed(2)),      // ✅ NEW: 60-110 bar (anomalous)
      vibration: parseFloat((3.0 + this.rng() * 4.0).toFixed(3)),   // ✅ NEW: 3.0-7.0 mm/s (high)
      isFraud: true,
      fraudType
    };
  }

  /**
   * Generate complete training dataset
   */
  generate() {
    console.log('Generating synthetic training data...');
    console.log(`- Normal samples: ${this.config.normalSamples}`);
    console.log(`- Fraud samples: ${this.config.fraudSamples}`);

    const normalReadings = this.generateNormalReadings(this.config.normalSamples);
    const fraudReadings = this.generateFraudReadings(this.config.fraudSamples);

    // Combine and shuffle
    const allReadings = [...normalReadings, ...fraudReadings];
    this._shuffle(allReadings);

    const metadata = {
      version: '0.1.0',
      generated_at: new Date().toISOString(),
      total_samples: allReadings.length,
      normal_samples: this.config.normalSamples,
      fraud_samples: this.config.fraudSamples,
      fraud_rate: (this.config.fraudSamples / allReadings.length * 100).toFixed(1) + '%',
      seed: this.config.seed,
      generator: 'synthetic_v0.1',
      features: ['flowRate', 'head', 'generatedKwh', 'pH', 'turbidity', 'temperature', 'efficiency', 'pressure', 'vibration'],
      sha256: this._calculateSHA256(JSON.stringify(allReadings))
    };

    return {
      metadata,
      data: allReadings
    };
  }

  _shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }

  _calculateSHA256(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
  }
}

// CLI Interface
if (require.main === module) {
  const generator = new SyntheticDataGenerator({
    normalSamples: 800,
    fraudSamples: 200,
    seed: 42
  });

  const dataset = generator.generate();

  // Save to file
  const outputPath = __dirname + '/training_v0.1.0.json';
  fs.writeFileSync(outputPath, JSON.stringify(dataset, null, 2));

  console.log('\n✅ Dataset generated successfully!');
  console.log(`📁 Saved to: ${outputPath}`);
  console.log(`📊 Total samples: ${dataset.metadata.total_samples}`);
  console.log(`🔒 SHA256: ${dataset.metadata.sha256}`);
  console.log('\nTo verify integrity:');
  console.log(`  sha256sum ${outputPath}`);
}

module.exports = SyntheticDataGenerator;

