const flags = [];
if (verificationResult.verificationStatus === 'FLAGGED' || verificationResult.verificationStatus === 'REJECTED') {
  if (verificationResult.layers.physics.score < 0.7) flags.push('PHYSICS_ANOMALY');
  if (verificationResult.layers.temporal.score < 0.7) flags.push('TEMPORAL_ANOMALY');
  if (verificationResult.layers.environmental.score < 0.7) flags.push('ENVIRONMENTAL_ANOMALY');
  if (verificationResult.layers.statistical && verificationResult.layers.statistical.score < 0.7) flags.push('STATISTICAL_ANOMALY');
  if (verificationResult.layers.device && verificationResult.layers.device.score < 0.7) flags.push('DEVICE_ANOMALY');
}
