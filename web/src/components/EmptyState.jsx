export function EmptyState({ icon = '📄', title, subtitle, action }) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center px-6">
      <div className="text-4xl">{icon}</div>
      <h4 className="font-display text-lg font-semibold text-white">{title}</h4>
      {subtitle && <p className="text-sm text-white/50 max-w-xs">{subtitle}</p>}
      {action}
    </div>
  );
}
