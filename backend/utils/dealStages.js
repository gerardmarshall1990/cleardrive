// Canonical deal stage definitions and ordering, shared by the state machine,
// automation engine, and admin dashboard queries.

const STAGES = Object.freeze({
  QUOTE: 'quote',
  FINES_VERIFY: 'fines_verify',
  KYC: 'kyc',
  DETAILS: 'details',
  SIGNING: 'signing',
  ESCROW: 'escrow',
  TASJEEL: 'tasjeel',
  COMPLETE: 'complete',
  CANCELLED: 'cancelled',
});

// Order matters — used to validate forward-only progression and for the
// admin dashboard's progress display.
const STAGE_ORDER = [
  STAGES.QUOTE,
  STAGES.FINES_VERIFY,
  STAGES.KYC,
  STAGES.DETAILS,
  STAGES.SIGNING,
  STAGES.ESCROW,
  STAGES.TASJEEL,
  STAGES.COMPLETE,
];

function stageIndex(stage) {
  return STAGE_ORDER.indexOf(stage);
}

/** A stage transition is valid if moving forward exactly one step, or cancelling from any non-terminal stage. */
function isValidTransition(from, to) {
  if (to === STAGES.CANCELLED) return from !== STAGES.COMPLETE && from !== STAGES.CANCELLED;
  const fromIdx = stageIndex(from);
  const toIdx = stageIndex(to);
  if (fromIdx === -1 || toIdx === -1) return false;
  return toIdx === fromIdx + 1;
}

module.exports = { STAGES, STAGE_ORDER, stageIndex, isValidTransition };
