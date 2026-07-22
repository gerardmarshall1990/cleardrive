const { STAGES, STAGE_ORDER, stageIndex, isValidTransition } = require('../utils/dealStages');

describe('dealStages.isValidTransition', () => {
  test('allows exactly one step forward through the full happy path', () => {
    for (let i = 0; i < STAGE_ORDER.length - 1; i++) {
      expect(isValidTransition(STAGE_ORDER[i], STAGE_ORDER[i + 1])).toBe(true);
    }
  });

  test('rejects skipping a stage', () => {
    expect(isValidTransition(STAGES.QUOTE, STAGES.KYC)).toBe(false);
    expect(isValidTransition(STAGES.FINES_VERIFY, STAGES.SIGNING)).toBe(false);
  });

  test('rejects moving backward', () => {
    expect(isValidTransition(STAGES.ESCROW, STAGES.SIGNING)).toBe(false);
    expect(isValidTransition(STAGES.KYC, STAGES.QUOTE)).toBe(false);
  });

  test('rejects staying on the same stage', () => {
    expect(isValidTransition(STAGES.DETAILS, STAGES.DETAILS)).toBe(false);
  });

  test('rejects transitions from/to unknown stage strings', () => {
    expect(isValidTransition('bogus', STAGES.QUOTE)).toBe(false);
    expect(isValidTransition(STAGES.QUOTE, 'bogus')).toBe(false);
  });

  describe('cancellation', () => {
    test('allows cancelling from any non-terminal stage', () => {
      STAGE_ORDER.filter((s) => s !== STAGES.COMPLETE).forEach((stage) => {
        expect(isValidTransition(stage, STAGES.CANCELLED)).toBe(true);
      });
    });

    test('rejects cancelling a completed deal', () => {
      expect(isValidTransition(STAGES.COMPLETE, STAGES.CANCELLED)).toBe(false);
    });

    test('rejects cancelling an already-cancelled deal', () => {
      expect(isValidTransition(STAGES.CANCELLED, STAGES.CANCELLED)).toBe(false);
    });
  });
});

describe('dealStages.stageIndex', () => {
  test('returns the correct position for each stage', () => {
    STAGE_ORDER.forEach((stage, i) => expect(stageIndex(stage)).toBe(i));
  });

  test('returns -1 for an unknown stage', () => {
    expect(stageIndex('not-a-stage')).toBe(-1);
  });
});
