// src/adapters/solar.js
// Solar energy adapter for v1.6.1
class SolarAdapter {
  constructor() {
    this.type = 'solar';
    this.version = '1.6.1';
  }
  // Calculate solar generation from irradiance
  calculateGeneration(params) {
    const { irradiance_kwm2, panelArea_m2, efficiency = 0.20, performanceRatio = 0.85 } = params;
    const generatedKwh = irradiance_kwm2 * panelArea_m2 * efficiency * performanceRatio;
    return parseFloat(generatedKwh.toFixed(4));
  }
  validateReading(reading) {
    const { irradiance_kwm2, panelArea_m2, generatedKwh, temperature_c } = reading;
    const issues = [];
    if (irradiance_kwm2 < 0 || irradiance_kwm2 > 1.5) issues.push('Irradiance out of range (0-1.5 kW/m2)');
    if (temperature_c > 85) issues.push('Panel temperature too high (>85C)');
    const theoretical = this.calculateGeneration({ irradiance_kwm2, panelArea_m2 });
    if (generatedKwh > theoretical * 1.1) issues.push('Generation exceeds theoretical maximum');
    return { valid: issues.length === 0, issues, theoreticalMax: theoretical };
  }
  calculateCarbonCredits(generatedKwh, gridEmissionFactor) {
    return parseFloat((generatedKwh / 1000 * gridEmissionFactor).toFixed(6));
  }
}
module.exports = new SolarAdapter();
