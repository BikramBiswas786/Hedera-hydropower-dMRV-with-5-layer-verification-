'use strict';

/**
 * Multi-Plant Manager
 * ════════════════════════════════════════════════════════════════
 * Manage multiple hydropower plants with aggregated analytics
 */

class PlantManager {
  constructor() {
    this.plants = new Map();
  }

  /**
   * Register a plant
   */
  registerPlant(plantId, config) {
    this.plants.set(plantId, {
      id: plantId,
      name: config.name,
      location: config.location,
      capacity_mw: config.capacity_mw,
      region: config.region || 'unknown',
      commissioned: config.commissioned || new Date().toISOString(),
      workflow: null,
      stats: {
        totalGeneration: 0,
        totalCarbonCredits: 0,
        uptime: 100,
        lastReading: null
      }
    });
  }

  /**
   * Get aggregated stats across all plants
   */
  getFleetStats() {
    let totalGen = 0;
    let totalCredits = 0;
    let avgUptime = 0;
    let plantCount = 0;

    for (const plant of this.plants.values()) {
      totalGen += plant.stats.totalGeneration;
      totalCredits += plant.stats.totalCarbonCredits;
      avgUptime += plant.stats.uptime;
      plantCount++;
    }

    return {
      total_plants: plantCount,
      total_capacity_mw: Array.from(this.plants.values())
        .reduce((sum, p) => sum + p.capacity_mw, 0),
      fleet_generation_mwh: parseFloat(totalGen.toFixed(2)),
      fleet_carbon_credits_tco2e: parseFloat(totalCredits.toFixed(4)),
      average_uptime: plantCount > 0 ? parseFloat((avgUptime / plantCount).toFixed(2)) : 0,
      plants: Array.from(this.plants.values()).map(p => ({
        id: p.id,
        name: p.name,
        location: p.location,
        generation_mwh: p.stats.totalGeneration,
        uptime: p.stats.uptime
      }))
    };
  }

  /**
   * Compare plant performance
   */
  comparePlants(plantId1, plantId2) {
    const p1 = this.plants.get(plantId1);
    const p2 = this.plants.get(plantId2);

    if (!p1 || !p2) {
      throw new Error('Plant not found');
    }

    return {
      plants: [p1.name, p2.name],
      capacity_ratio: (p1.capacity_mw / p2.capacity_mw).toFixed(2),
      generation_ratio: (p1.stats.totalGeneration / p2.stats.totalGeneration).toFixed(2),
      uptime_diff: parseFloat((p1.stats.uptime - p2.stats.uptime).toFixed(2)),
      efficiency_comparison: {
        [p1.name]: (p1.stats.totalGeneration / p1.capacity_mw).toFixed(2),
        [p2.name]: (p2.stats.totalGeneration / p2.capacity_mw).toFixed(2)
      }
    };
  }

  /**
   * Get regional breakdown (monsoon patterns)
   */
  getRegionalBreakdown() {
    const regions = new Map();

    for (const plant of this.plants.values()) {
      if (!regions.has(plant.region)) {
        regions.set(plant.region, {
          region: plant.region,
          plant_count: 0,
          total_capacity_mw: 0,
          total_generation_mwh: 0
        });
      }

      const region = regions.get(plant.region);
      region.plant_count++;
      region.total_capacity_mw += plant.capacity_mw;
      region.total_generation_mwh += plant.stats.totalGeneration;
    }

    return Array.from(regions.values());
  }
}

module.exports = { PlantManager };
