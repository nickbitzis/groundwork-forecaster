import { useEffect, useState } from 'react';
import { money } from './format';

/** Phones get a smaller drawing so labels stay readable instead of shrinking. */
function useSize() {
  const q = '(max-width: 760px)';
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setNarrow(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return narrow ? { W: 380, H: 230, L: 56, R: 10, T: 12, B: 28 } : { W: 720, H: 260, L: 64, R: 14, T: 14, B: 30 };
}

function niceTicks(min: number, max: number, target = 5): number[] {
  if (min === max) { min -= 1; max += 1; }
  const raw = (max - min) / target;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const ticks: number[] = [];
  const end = Math.ceil(max / step - 1e-9) * step;
  for (let v = Math.floor(min / step + 1e-9) * step; v <= end + step * 0.001; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return ticks;
}

export interface Series { label: string; values: number[]; color: string; dashed?: boolean }


/** Line chart over the 36 months. Series differ by dash pattern as well as color. */
export function LineChart({ series, labels, title }: { series: Series[]; labels: string[]; title: string }) {
  const { W, H, L, R, T, B } = useSize();
  const all = series.flatMap((s) => s.values);
  const ticks = niceTicks(Math.min(0, ...all), Math.max(0, ...all));
  const lo = ticks[0], hi = ticks[ticks.length - 1];
  const n = labels.length;
  const x = (i: number) => L + (i / (n - 1)) * (W - L - R);
  const y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke={t === 0 ? 'var(--muted)' : 'var(--grid)'} strokeWidth={t === 0 ? 1.2 : 1} />
          <text x={L - 8} y={y(t) + 4} fontSize="11" textAnchor="end" fill="var(--muted)" className="num">{money(t, { compact: true })}</text>
        </g>
      ))}
      {(W < 500 ? [0, 18, 35] : [0, 12, 24, 35]).map((i) => (
        <text key={i} x={x(i)} y={H - 8} fontSize="11" textAnchor={i === 35 ? 'end' : i === 0 ? 'start' : 'middle'} fill="var(--muted)">{labels[i]}</text>
      ))}
      {[12, 24].map((i) => <line key={i} x1={x(i - 0.5)} x2={x(i - 0.5)} y1={T} y2={H - B} stroke="var(--grid)" strokeDasharray="2 3" />)}
      {series.map((s) => (
        <g key={s.label}>
          <polyline fill="none" stroke={s.color} strokeWidth="2.5" strokeDasharray={s.dashed ? '7 5' : undefined} strokeLinejoin="round"
            points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')} />
          <circle cx={x(n - 1)} cy={y(s.values[n - 1])} r="4" fill={s.color} />
        </g>
      ))}
    </svg>
  );
}

/** Monthly bars around a zero line: above the line is cash coming in, below is cash going out. */
export function BarChart({ values, labels, title }: { values: number[]; labels: string[]; title: string }) {
  const { W, H, L, R, T, B } = useSize();
  const ticks = niceTicks(Math.min(0, ...values), Math.max(0, ...values), 4);
  const lo = ticks[0], hi = ticks[ticks.length - 1];
  const n = values.length;
  const bw = (W - L - R) / n;
  const y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke={t === 0 ? 'var(--muted)' : 'var(--grid)'} />
          <text x={L - 8} y={y(t) + 4} fontSize="11" textAnchor="end" fill="var(--muted)">{money(t, { compact: true })}</text>
        </g>
      ))}
      {values.map((v, i) => (
        <rect key={i} x={L + i * bw + 1.5} width={bw - 3} y={Math.min(y(v), y(0))} height={Math.max(1, Math.abs(y(v) - y(0)))} rx="1.5"
          fill={v < 0 ? 'var(--series-down)' : 'var(--series-base)'} opacity={v < 0 ? 0.9 : 0.85} />
      ))}
      {(W < 500 ? [0, 18, 35] : [0, 12, 24, 35]).map((i) => (
        <text key={i} x={L + i * bw + bw / 2} y={H - 8} fontSize="11" textAnchor={i === 35 ? 'end' : i === 0 ? 'start' : 'middle'} fill="var(--muted)">{labels[i]}</text>
      ))}
    </svg>
  );
}
