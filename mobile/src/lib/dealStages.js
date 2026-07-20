// Mirrors backend/utils/dealStages.js — single source of truth for the UI's
// progress display, labels, and forward-navigation logic.
export const STAGES = Object.freeze({
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

export const STAGE_ORDER = [
  STAGES.QUOTE,
  STAGES.FINES_VERIFY,
  STAGES.KYC,
  STAGES.DETAILS,
  STAGES.SIGNING,
  STAGES.ESCROW,
  STAGES.TASJEEL,
  STAGES.COMPLETE,
];

export const STAGE_LABELS = {
  [STAGES.QUOTE]: 'Quote',
  [STAGES.FINES_VERIFY]: 'Fines Check',
  [STAGES.KYC]: 'Identity Check',
  [STAGES.DETAILS]: 'Vehicle Details',
  [STAGES.SIGNING]: 'Signing',
  [STAGES.ESCROW]: 'Escrow',
  [STAGES.TASJEEL]: 'Tasjeel Transfer',
  [STAGES.COMPLETE]: 'Complete',
};

export function stageIndex(stage) {
  return STAGE_ORDER.indexOf(stage);
}
