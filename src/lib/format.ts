// Display helpers. Numbers are the interface (docs/01 §4.2): probabilities in
// %, one decimal; times shown with age; money in USD.

export function pct(p: number | null | undefined): string {
  if (p === null || p === undefined) return "—";
  return `${(p * 100).toFixed(1)}%`;
}

export function cents(p: number | null | undefined): string {
  if (p === null || p === undefined) return "—";
  return `${Math.round(p * 100)}¢`;
}

export function relativeTime(d: Date | null | undefined, now: Date = new Date()): string {
  if (!d) return "never";
  const ms = now.getTime() - new Date(d).getTime();
  const min = Math.round(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.round(h / 24);
  return `${days}d ago`;
}

export function timeToClose(d: Date | null | undefined, now: Date = new Date()): string {
  if (!d) return "—";
  const ms = new Date(d).getTime() - now.getTime();
  if (ms <= 0) return "closed";
  const h = Math.round(ms / 3600000);
  if (h < 48) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}
