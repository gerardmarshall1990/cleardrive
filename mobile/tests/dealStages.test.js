// Regression coverage for the mobile mirror of backend/utils/dealStages.js.
// This file is hand-duplicated in the mobile app (see src/lib/dealStages.js's
// header comment) purely for UI display — if it ever drifts from the
// backend's canonical STAGE_ORDER, the mobile progress bar/timeline would
// silently show the wrong step order to real users.
const { STAGES, STAGE_ORDER, STAGE_LABELS, stageIndex } = require('../src/lib/dealStages');

describe('STAGE_ORDER', () => {
  it('matches the backend deal state machine order', () => {
    expect(STAGE_ORDER).toEqual([
      STAGES.QUOTE,
      STAGES.FINES_VERIFY,
      STAGES.KYC,
      STAGES.DETAILS,
      STAGES.SIGNING,
      STAGES.ESCROW,
      STAGES.TASJEEL,
      STAGES.COMPLETE,
    ]);
  });

  it('does not include CANCELLED (not a forward step)', () => {
    expect(STAGE_ORDER).not.toContain(STAGES.CANCELLED);
  });

  it('has a label for every stage in STAGE_ORDER', () => {
    STAGE_ORDER.forEach((stage) => {
      expect(STAGE_LABELS[stage]).toEqual(expect.any(String));
    });
  });
});

describe('stageIndex', () => {
  it('returns the correct position for each stage', () => {
    expect(stageIndex(STAGES.QUOTE)).toBe(0);
    expect(stageIndex(STAGES.KYC)).toBe(2);
    expect(stageIndex(STAGES.COMPLETE)).toBe(7);
  });

  it('returns -1 for an unknown stage', () => {
    expect(stageIndex('not_a_stage')).toBe(-1);
  });
});
