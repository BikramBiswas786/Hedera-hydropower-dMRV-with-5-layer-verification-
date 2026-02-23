// src/adapters/wind.js
// Wind energy adapter for v1.6.1
class WindAdapter {
  constructor() {
    this.type = 'wind';
    this.version = '1.6.1';
  }
  // Betz limit: max theoretical power = 0.593 * 0.5 * rho * A * v^3
  calculateTheoreticalPower(params) {
    const { windSpeed_ms, rotorDiameter_m, airDensity_kgm3 = 1.225, efficiency = 0.45 } = params;
    const rotorArea = Math.PI * (rotorDiameter_m / 2) ** 2;
    const powerW = 0.5 * airDensity_kgm3 * rotorArea * Math.pow(windSpeed_ms, 3) * efficiency;
    return parseFloat((powerW / 1000).toFixed(4)); // kW
  }
  validateReading(reading) {
    const { windSpeed_ms, rotorDiameter_m, generatedKw } = reading;
    const issues = [];
    if (windSpeed_ms < 0 || windSpeed_ms > 90) issues.push('Wind speed out of range (0-90 m/s)');
    if (windSpeed_ms < 3) issues.push('Below cut-in speed (3 m/s) — turbine should not generate');
    if (windSpeed_ms > 25) issues.push('Above cut-out speed (25 m/s) — turbine should be stopped');
    const theoretical = this.calculateTheoreticalPower({ windSpeed_ms, rotorDiameter_m });
    if (generatedKw > theoretical * 1.05) issues.push('Generation exceeds Betz limit');
    return { valid: issues.length === 0, issues, theoreticalMax: theoretical };
  }
  calculateCarbonCredits(generatedKwh, gridEmissionFactor) {
    return parseFloat((generatedKwh / 1000 * gridEmissionFactor).toFixed(6));
  }
}
module.exports = new WindAdapter();
