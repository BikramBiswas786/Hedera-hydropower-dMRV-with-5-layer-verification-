// src/ml/forecasting.js
// ML Forecasting Engine for v1.6.1 — carbon credit projection
class ForecastingEngine {
  constructor() {
    this.version = '1.6.1';
    this.models = { linear: true, exponential: true, seasonal: true };
  }
  // Linear regression forecast
  linearForecast(historicalData, periodsAhead = 12) {
    const n = historicalData.length;
    if (n < 2) return null;
    const xMean = (n - 1) / 2;
    const yMean = historicalData.reduce((a, b) => a + b, 0) / n;
    let num = 0, den = 0;
    historicalData.forEach((y, x) => {
      num += (x - xMean) * (y - yMean);
      den += (x - xMean) ** 2;
    });
    const slope = den !== 0 ? num / den : 0;
    const intercept = yMean - slope * xMean;
    const forecast = [];
    for (let i = 1; i <= periodsAhead; i++) {
      forecast.push(parseFloat((slope * (n + i - 1) + intercept).toFixed(4)));
    }
    return { model: 'linear', slope, intercept, forecast, confidence: 0.85 };
  }
  // Seasonal decomposition forecast
  seasonalForecast(historicalData, seasonLength = 12, periodsAhead = 12) {
    if (historicalData.length < seasonLength * 2) {
      return this.linearForecast(historicalData, periodsAhead);
    }
    const seasonalIndex = Array(seasonLength).fill(0);
    const count = Array(seasonLength).fill(0);
    historicalData.forEach((val, i) => {
      seasonalIndex[i % seasonLength] += val;
      count[i % seasonLength]++;
    });
    const seasonalFactors = seasonalIndex.map((s, i) => s / count[i]);
    const avg = seasonalFactors.reduce((a, b) => a + b, 0) / seasonLength;
    const normalizedFactors = seasonalFactors.map(f => f / avg);
    const baseLinear = this.linearForecast(historicalData, periodsAhead);
    const forecast = baseLinear.forecast.map((val, i) => {
      const factor = normalizedFactors[(historicalData.length + i) % seasonLength];
      return parseFloat((val * factor).toFixed(4));
    });
    return { model: 'seasonal', forecast, confidence: 0.78, seasonalFactors: normalizedFactors };
  }
  // Project carbon credits for next N months
  projectCarbonCredits(params) {
    const { historicalMwh, emissionFactor, periodsAhead = 12, useSeasonalModel = true } = params;
    const historicalCredits = historicalMwh.map(mwh => mwh * emissionFactor);
    const result = useSeasonalModel
      ? this.seasonalForecast(historicalCredits, 12, periodsAhead)
      : this.linearForecast(historicalCredits, periodsAhead);
    const totalProjected = result.forecast.reduce((a, b) => a + b, 0);
    return {
      ...result,
      totalProjectedCredits: parseFloat(totalProjected.toFixed(4)),
      revenueAtCurrentRate: parseFloat((totalProjected * 16.5).toFixed(2)), // $16.5/tCO2e
      methodology: 'ACM0002 v18.0',
      generatedAt: new Date().toISOString()
    };
  }
}
module.exports = new ForecastingEngine();
