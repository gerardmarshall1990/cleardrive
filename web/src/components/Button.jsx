// Button variants exactly per Design Guidelines: primary (gold/green), secondary, ghost.
const BASE =
  'inline-flex items-center justify-center gap-2 rounded-lg px-7 py-3.5 text-[15px] font-bold font-sans transition-all active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none';

const VARIANTS = {
  gold: 'bg-gold text-navy shadow-[0_4px_14px_rgba(201,168,76,0.25)] hover:bg-gold-hover hover:-translate-y-px',
  green: 'bg-green text-white shadow-[0_4px_14px_rgba(22,163,74,0.25)] hover:brightness-110 hover:-translate-y-px',
  secondary: 'bg-transparent text-white border-[1.5px] border-white/25 hover:border-gold hover:text-gold',
  ghost: 'bg-gold/10 text-gold border border-gold/30 hover:bg-gold/20',
};

export function Button({ variant = 'gold', loading = false, className = '', children, disabled, ...props }) {
  return (
    <button className={`${BASE} ${VARIANTS[variant]} ${className}`} disabled={disabled || loading} {...props}>
      {loading && (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
      )}
      {children}
    </button>
  );
}
