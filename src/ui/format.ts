export function money(n: number, opts: { cents?: boolean; compact?: boolean } = {}): string {
  if (!Number.isFinite(n)) return '-';
  const neg = n < 0;
  const abs = Math.abs(n);
  let s: string;
  if (opts.compact && abs >= 1_000_000) s = `$${(abs / 1_000_000).toFixed(2)}M`;
  else if (opts.compact && abs >= 10_000) s = `$${(abs / 1000).toFixed(0)}K`;
  else s = '$' + abs.toLocaleString('en-US', { minimumFractionDigits: opts.cents ? 2 : 0, maximumFractionDigits: opts.cents ? 2 : 0 });
  return neg ? `(${s})` : s;
}

/** Table cells: whole dollars, negatives in parentheses. */
export function cell(n: number): string {
  if (!Number.isFinite(n)) return '-';
  const r = Math.round(n);
  if (r === 0) return '-';
  const s = Math.abs(r).toLocaleString('en-US');
  return r < 0 ? `(${s})` : s;
}

export function pct(n: number, digits = 1): string {
  return Number.isFinite(n) ? `${(n * 100).toFixed(digits)}%` : '-';
}

export function count(n: number, digits = 0): string {
  return Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits }) : '-';
}

export function monthName(n: number | null, labels: string[]): string {
  if (n === null) return 'Not within 36 months';
  if (n === 0) return 'Opening';
  return `Month ${n} (${labels[n - 1]})`;
}

export const uid = () => Math.random().toString(36).slice(2, 9);
