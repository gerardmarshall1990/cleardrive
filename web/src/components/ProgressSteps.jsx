import { STAGE_ORDER, STAGE_LABELS, stageIndex } from '../lib/dealStages';

/**
 * Horizontal-scroll progress stepper — active/complete/inactive step circles
 * connected by lines, per Design Guidelines "Progress Steps" spec. `accent`
 * controls gold (LoanClear) vs green (SafePay) for the active step.
 */
export function ProgressSteps({ currentStage, accent = 'gold' }) {
  const currentIdx = stageIndex(currentStage);
  const accentClass = accent === 'green' ? 'bg-green text-white' : 'bg-gold text-navy';

  return (
    <div className="flex items-center overflow-x-auto pb-2 -mx-1 px-1">
      {STAGE_ORDER.map((stage, idx) => {
        const isComplete = idx < currentIdx;
        const isActive = idx === currentIdx;
        const isLast = idx === STAGE_ORDER.length - 1;

        return (
          <div key={stage} className="flex items-center shrink-0">
            <div className="flex flex-col items-center gap-1.5 w-16">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-full font-display text-base font-bold ${
                  isComplete ? 'bg-green text-white' : isActive ? accentClass : 'bg-white/8 text-white/30'
                }`}
              >
                {isComplete ? '✓' : idx + 1}
              </div>
              <span className={`text-center text-[10px] font-sans leading-tight ${isActive ? 'text-white' : 'text-white/35'}`}>
                {STAGE_LABELS[stage]}
              </span>
            </div>
            {!isLast && <div className={`h-0.5 w-6 shrink-0 ${isComplete ? 'bg-gold' : 'bg-white/8'}`} />}
          </div>
        );
      })}
    </div>
  );
}
