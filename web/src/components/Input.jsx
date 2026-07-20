export function Field({ label, error, children }) {
  return (
    <div className="flex flex-col gap-2">
      {label && <label className="text-[11px] font-bold tracking-[1.5px] uppercase text-white/50 font-sans">{label}</label>}
      {children}
      {error && <span className="text-[13px] text-error font-sans">{error}</span>}
    </div>
  );
}

export function Input({ label, error, className = '', ...props }) {
  return (
    <Field label={label} error={error}>
      <input
        className={`w-full rounded-lg border-[1.5px] bg-white/5 px-4 py-3.5 text-[15px] text-white font-sans placeholder:text-white/30 outline-none transition-all focus:shadow-[0_0_0_3px_rgba(201,168,76,0.15)] ${
          error ? 'border-error' : 'border-white/12 focus:border-gold'
        } ${className}`}
        {...props}
      />
    </Field>
  );
}

export function Select({ label, error, children, className = '', ...props }) {
  return (
    <Field label={label} error={error}>
      <select
        className={`w-full rounded-lg border-[1.5px] bg-white/5 px-4 py-3.5 text-[15px] text-white font-sans outline-none transition-all focus:shadow-[0_0_0_3px_rgba(201,168,76,0.15)] ${
          error ? 'border-error' : 'border-white/12 focus:border-gold'
        } ${className}`}
        {...props}
      >
        {children}
      </select>
    </Field>
  );
}
