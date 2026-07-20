export function DarkCard({ className = '', children, ...props }) {
  return (
    <div className={`rounded-2xl border border-white/9 bg-white/4 p-6 transition-all ${className}`} {...props}>
      {children}
    </div>
  );
}

export function LightCard({ className = '', children, ...props }) {
  return (
    <div className={`rounded-xl border border-border bg-white p-5 text-dark-text ${className}`} {...props}>
      {children}
    </div>
  );
}

export function GoldCard({ className = '', children, ...props }) {
  return (
    <div className={`rounded-xl border border-gold/25 bg-gold/6 p-5 ${className}`} {...props}>
      {children}
    </div>
  );
}
