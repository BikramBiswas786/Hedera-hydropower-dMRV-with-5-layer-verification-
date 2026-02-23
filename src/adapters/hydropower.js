// src/adapters/hydropower.js
// Hydropower adapter for v1.6.1 — wraps existing ACM0002 workflow
const ACM0002Validator = require('../carbon/ACM0002Validator');
class HydropowerAdapter {
  constructor() {
    this.type = 'hydropower';
    this.version = '1.6.1';
    this.validator = new ACM0002Validator();
  }
  validateReading(reading) {
    const { flowRate_m3s, head_m, generatedKwh, pH = 7, turbidity = 10, temperature = 18 } = reading;
    const issues = [];
    // Physics: P = rho * g * Q * H * eta
    const rho = 1000, g = 9.81, eta = 0.85;
    const theoreticalKw = (rho * g * flowRate_m3s * head_m * eta) / 1000;
    const theoreticalKwh = theoreticalKw; // per hour
    if (generatedKwh > theoreticalKwh * 1.05) issues.push('Generation exceeds physical maximum');
    if (flowRate_m3s < 0) issues.push('Flow rate cannot be negative');
    if (head_m < 0) issues.push('Head cannot be negative');
    if (pH < 6 || pH > 9) issues.push('pH out of acceptable range (6-9)');
    return { valid: issues.length === 0, issues, theoreticalMax: theoreticalKwh };
  }
  calculateCarbonCredits(generatedKwh, gridEmissionFactor) {
    return parseFloat((generatedKwh / 1000 * gridEmissionFactor).toFixed(6));
  }
}
module.exports = new HydropowerAdapter();
