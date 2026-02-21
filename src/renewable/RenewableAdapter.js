'use strict';

/**
 * Renewable Energy Source Adapter
 * ════════════════════════════════════════════════════════════════
 * Adapts MRV engine for solar, wind, biomass
 */

class RenewableAdapter {
  constructor(sourceType) {
    this.sourceType = sourceType; // 'solar', 'wind', 'biomass', 'hydropower'
  }

  /**
   * Normalize telemetry to standard format
   */
  normalizeTelemetry(rawTelemetry) {
    switch (this.sourceType) {
      case 'solar':
        return this._normalizeSolar(rawTelemetry);
      case 'wind':
        return this._normalizeWind(rawTelemetry);
      case 'biomass':
        return this._normalizeBiomass(rawTelemetry);
      case 'hydropower':
      default:
        return rawTelemetry; // Already in standard format
    }
  }

  _normalizeSolar(raw) {
    return {
      deviceId: raw.deviceId,
      timestamp: raw.timestamp || new Date().toISOString(),
      readings: {
        // Map solar-specific to generic
        flowRate_m3_per_s: 0, // N/A for solar
        headHeight_m: 0,       // N/A
        generatedKwh: raw.generatedKwh || 0,
        pH: 7.0,               // Neutral default
        turbidity_ntu: 0,
        temperature_celsius: raw.panelTemperature_c || 25,
        efficiency: raw.efficiency || this._estimateSolarEfficiency(raw)
      },
      sourceSpecific: {
        irradiance_w_per_m2: raw.irradiance || 1000,
        panelArea_m2: raw.panelArea || 100,
        inverterEfficiency: raw.inverterEfficiency || 0.96
      }
    };
  }

  _normalizeWind(raw) {
    return {
      deviceId: raw.deviceId,
      timestamp: raw.timestamp || new Date().toISOString(),
      readings: {
        flowRate_m3_per_s: 0,
        headHeight_m: raw.hubHeight_m || 80,
        generatedKwh: raw.generatedKwh || 0,
        pH: 7.0,
        turbidity_ntu: 0,
        temperature_celsius: raw.ambientTemperature_c || 20,
        efficiency: raw.efficiency || this._estimateWindEfficiency(raw)
      },
      sourceSpecific: {
        windSpeed_m_per_s: raw.windSpeed || 10,
        windDirection_degrees: raw.windDirection || 180,
        bladeRPM: raw.bladeRPM || 15,
        rotorDiameter_m: raw.rotorDiameter || 90
      }
    };
  }

  _normalizeBiomass(raw) {
    return {
      deviceId: raw.deviceId,
      timestamp: raw.timestamp || new Date().toISOString(),
      readings: {
        flowRate_m3_per_s: raw.fuelFlowRate_kg_per_s / 1000 || 0,
        headHeight_m: 0,
        generatedKwh: raw.generatedKwh || 0,
        pH: 7.0,
        turbidity_ntu: 0,
        temperature_celsius: raw.combustionTemp_c || 800,
        efficiency: raw.efficiency || 0.25
      },
      sourceSpecific: {
        fuelType: raw.fuelType || 'wood_pellets',
        fuelMoisture_percent: raw.fuelMoisture || 10,
        ashContent_percent: raw.ashContent || 2
      }
    };
  }

  _estimateSolarEfficiency(raw) {
    const theoreticalMax = raw.irradiance * raw.panelArea * 0.20; // 20% panel efficiency
    return raw.generatedKwh / theoreticalMax || 0.18;
  }

  _estimateWindEfficiency(raw) {
    const airDensity = 1.225; // kg/m³
    const area = Math.PI * Math.pow(raw.rotorDiameter / 2, 2);
    const windPower = 0.5 * airDensity * area * Math.pow(raw.windSpeed, 3) / 1000; // kW
    return raw.generatedKwh / windPower || 0.35;
  }
}

module.exports = { RenewableAdapter };
