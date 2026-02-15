require("dotenv").config();

const { validatePhysics } = require("./src/engine/v1/physics");

async function main() {
  console.log("🚀 Hedera Hydropower MRV Engine V1 Starting...\n");

  const sampleTelemetry = {
    flowRate_m3_s: 12,
    headHeight_m: 50,
    generatedKwh: 4800
  };

  const result = validatePhysics(sampleTelemetry);

  console.log("Physics Validation Result:");
  console.log(result);

  if (!result.isValid) {
    console.log("\n❌ Telemetry failed physics validation.");
  } else {
    console.log("\n✅ Telemetry passed physics validation.");
  }
}

main().catch(console.error);
