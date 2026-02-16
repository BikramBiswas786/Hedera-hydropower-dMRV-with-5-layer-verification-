const AnomalyDetector = require("../../anomaly-detector");

/**
 * Validates the physics constraints of a telemetry reading.
 * Provides a simplified interface for the MRV engine.
 */
function validatePhysics(reading) {
  const detector = new AnomalyDetector();
  try {
    return detector.validatePhysicsConstraints(reading);
  } catch (error) {
    return { 
      isValid: false, 
      reason: "Error in physics validation: " + error.message 
    };
  }
}

module.exports = { validatePhysics };
