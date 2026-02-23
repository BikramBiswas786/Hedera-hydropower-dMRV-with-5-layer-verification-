// src/adapters/biomass.js
// Biomass energy adapter for v1.6.1
class BiomassAdapter {
  constructor() {
    this.type = 'biomass';
    this.version = '1.6.1';
    // Default emission factors for biomass types (tCO2e/MWh)
    this.emissionFactors = {
      woodchips: 0.018,
      agricultural_residue: 0.012,
      municipal_waste: 0.095,
      biogas: 0.025
    };
  }
  validateReading(reading) {
    const { fuelType, fuelConsumption_tonnes, generatedKwh, moistureContent_pct = 20 } = reading;
    const issues = [];
    if (!this.emissionFactors[fuelType]) issues.push(`Unknown fuel type: ${fuelType}`);
    if (moistureContent_pct > 60) issues.push('Moisture content too high (>60%) — reduces efficiency');
    if (fuelConsumption_tonnes <= 0) issues.push('Fuel consumption must be positive');
    // Typical biomass efficiency: 25-35%
    const calorificValue_kwh_tonne = fuelType === 'biogas' ? 6500 : 3500;
    const theoreticalKwh = fuelConsumption_tonnes * calorificValue_kwh_tonne * 0.30;
    if (generatedKwh > theoreticalKwh * 1.1) issues.push('Generation exceeds thermodynamic limit');
    return { valid: issues.length === 0, issues, theoreticalMax: theoreticalKwh };
  }
  calculateProjectEmissions(fuelType, fuelConsumption_tonnes) {
    const ef = this.emissionFactors[fuelType] || 0.025;
    return parseFloat((fuelConsumption_tonnes * ef).toFixed(6));
  }
  calculateCarbonCredits(generatedKwh, gridEmissionFactor, projectEmissions) {
    const baseline = (generatedKwh / 1000) * gridEmissionFactor;
    const credits = baseline - projectEmissions;
    return parseFloat(Math.max(credits, 0).toFixed(6));
  }
}
module.exports = new BiomassAdapter();
