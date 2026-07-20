export function ErrorBanner({ message }) {
  if (!message) return null;
  return (
    <div className="rounded-lg border border-error/30 bg-error/12 px-4 py-3 text-sm text-error font-sans">{message}</div>
  );
}

export function SuccessBanner({ message }) {
  if (!message) return null;
  return (
    <div className="rounded-lg border border-green/30 bg-green/12 px-4 py-3 text-sm text-green font-sans">{message}</div>
  );
}
