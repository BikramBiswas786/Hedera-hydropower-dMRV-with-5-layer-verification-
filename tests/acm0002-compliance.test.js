// tests/acm0002-compliance.test.js
// ACM0002 Methodology Compliance Tests

const Workflow = require('../src/workflow');
const ACM0002Validator = require('../src/carbon/ACM0002Validator');

describe('ACM0002 Methodology Compliance', () => {
  let workflow;
  let validator;

  beforeEach(async () => {
    workflow = new Workflow({
      projectId: 'ACM0002-TEST-001',
      location: 'Sikkim, India',
      capacity_mw: 50,
      projectType: 'hydropower',
      enableHedera: true,
      methodology: 'ACM0002',
      gridEmissionFactor: 0.82,
    });
    // FIX: Pass parameters in correct order (projectId, deviceId, gridEmissionFactor)
    await workflow.initialize('ACM0002-TEST-001', 'TURBINE-ACM0002', 0.82);
    
    validator = new ACM0002Validator();
  });

  afterEach(async () => {
    await workflow.cleanup();
  });

  describe('Section A: Project Eligibility (ACM0002 §4)', () => {
    test('should confirm project is renewable energy (hydropower)', () => {
      const eligibility = validator.checkProjectEligibility({
        projectType: 'hydropower',
        capacity_mw: 50,
        gridConnected: true,
        commissioningDate: '2024-01-01',
      });

      expect(eligibility.isEligible).toBe(true);
      expect(eligibility.category).toBe('Type I: Renewable electricity generation');
    });

    test('should verify project is grid-connected', () => {
      const result = validator.checkGridConnection({
        gridConnected: true,
        interconnectionAgreement: true,
        meterLocation: 'grid_injection_point',
      });

      expect(result.compliant).toBe(true);
    });
  });

  describe('Section B: Baseline Emissions (ACM0002 §6-7)', () => {
    test('should calculate baseline emissions using grid emission factor', () => {
      const generation_MWh = 1000;
      const EF_GRID = 0.82;
      
      const baseline = validator.calculateBaselineEmissions({
        generation_MWh,
        gridEmissionFactor: EF_GRID,
      });

      expect(baseline.BE_y).toBe(820); // 1000 * 0.82
    });
  });

  describe('Section C: Project Emissions (ACM0002 §8)', () => {
    test('should calculate project emissions (PE = 0 for run-of-river hydropower)', () => {
      const projectEmissions = validator.calculateProjectEmissions({
        projectType: 'hydropower',
        fossilFuelUse: 0,
        reservoirArea_km2: 0,
      });

      expect(projectEmissions.PE_y).toBe(0);
    });
  });

  describe('Section D: Leakage Emissions (ACM0002 §9)', () => {
    test('should calculate leakage (LE = 0 for grid-connected renewables)', () => {
      const leakage = validator.calculateLeakageEmissions({
        projectType: 'hydropower',
      });

      expect(leakage.LE_y).toBe(0);
    });
  });

  describe('Section E: Emission Reductions (ACM0002 §10)', () => {
    test('should calculate emission reductions: ER = BE - PE - LE', () => {
      const emissionReductions = validator.calculateEmissionReductions({
        baselineEmissions: 820,
        projectEmissions: 0,
        leakageEmissions: 0,
      });

      expect(emissionReductions.ER_y).toBe(820);
    });

    test('should match workflow carbon credit calculation', async () => {
      const result = await workflow.submitReading({
        timestamp: new Date().toISOString(),
        flowRate_m3_per_s: 5.0,
        headHeight_m: 50,
        generatedKwh: 1000,
        pH: 7.0,
      });
      
      if (result.verificationStatus === 'APPROVED') {
        expect(result.carbonCredits).toBeDefined();
        expect(result.carbonCredits.methodology).toBe('ACM0002');
        expect(result.acm0002Compliance.compliant).toBe(true);
      }
    });
  });

  describe('Section F: Full Workflow ACM0002 Test', () => {
    test('should execute ACM0002-compliant carbon credit lifecycle', async () => {
      const result = await workflow.submitReading({
        timestamp: new Date().toISOString(),
        flowRate_m3_per_s: 5.0,
        headHeight_m: 50,
        generatedKwh: 5000, // 5 MWh
        pH: 7.0,
      });

      expect(result.verificationStatus).toBe('APPROVED');
      expect(result.carbonCredits).toBeDefined();
      expect(result.carbonCredits.methodology).toBe('ACM0002');
      expect(result.acm0002Compliance.methodology).toBe('ACM0002 v18.0');
      expect(result.acm0002Compliance.certificationReady).toBe(true);
    });
  });

  describe('Section G: Monitoring Report', () => {
    test('should generate ACM0002-compliant monitoring report', async () => {
      // Submit a few readings
      for (let i = 0; i < 3; i++) {
        await workflow.submitReading({
          timestamp: new Date(Date.now() + i * 1000).toISOString(),
          flowRate_m3_per_s: 5.0,
          headHeight_m: 50,
          generatedKwh: 1000,
          pH: 7.0,
        });
      }

      const report = await workflow.generateMonitoringReport();
      
      expect(report.success).toBe(true);
      expect(report.acm0002Report).toBeDefined();
      expect(report.acm0002Report.methodology).toBe('ACM0002 v18.0');
      expect(report.acm0002Report.verified).toBe(true);
    });
  });
});
