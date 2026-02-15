const validator = require("./validator");
const verifyEvidence = require("./verify-evidence");
const logger = require("./logger");

async function runMRV() {
    console.log("========================================");
    console.log("Hydropower MRV Engine v1");
    console.log("========================================");

    try {
        // Sample telemetry data
        const telemetry = {
            deviceId: "HYDRO-001",
            kwh: 125,
            timestamp: new Date().toISOString()
        };

        console.log("Step 1: Validating telemetry...");
        validator.validateTelemetry(telemetry);
        console.log("✓ Telemetry Valid");

        console.log("Step 2: Verifying evidence...");
        await verifyEvidence.verify(telemetry);
        console.log("✓ Evidence Verified");

        console.log("Step 3: Logging telemetry...");
        logger.info("Telemetry processed successfully");

        console.log("========================================");
        console.log("MRV PROCESS COMPLETE");
        console.log("========================================");

    } catch (error) {
        console.error("❌ MRV ERROR:", error.message);
    }
}

runMRV();
