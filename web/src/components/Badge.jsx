const VARIANTS = {
  verified: 'bg-green/12 text-green border-green/30',
  pending: 'bg-gold/12 text-gold border-gold/30',
  error: 'bg-error/12 text-error border-error/30',
};

export function Badge({ variant = 'pending', children, className = '' }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-bold font-sans ${VARIANTS[variant]} ${className}`}
    >
      {children}
    </span>
  );
}

export function ProductBadge({ product }) {
  const isLoanClear = product === 'loanclear';
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-bold font-sans ${
        isLoanClear ? 'bg-gold/12 text-gold border-gold/30' : 'bg-green/12 text-green border-green/30'
      }`}
    >
      {isLoanClear ? 'LoanClear' : 'SafePay'}
    </span>
  );
}
