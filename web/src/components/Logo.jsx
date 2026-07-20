export function Logo({ size = 'md', showTagline = true }) {
  const sizes = { sm: 'text-lg', md: 'text-2xl', lg: 'text-4xl' };
  return (
    <div className="flex flex-col items-center gap-1">
      <span className={`font-display font-bold ${sizes[size]}`}>
        <span className="text-gold">Clear</span>
        <span className="text-white">Drive</span>
      </span>
      {showTagline && (
        <span className="font-sans text-[10px] font-semibold tracking-[2px] uppercase text-white/50">
          UAE&apos;s Vehicle Escrow Service
        </span>
      )}
    </div>
  );
}
