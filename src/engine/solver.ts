import { downsideOptions, runForecast } from './forecast';
import type { Assumptions, Forecast, RunOptions } from './types';

export type SolverLever = 'ticket' | 'volume';
export type SolverMetric = 'cashFlow' | 'netIncome' | 'dscr' | 'minCash';

export interface SolverTarget {
  metric: SolverMetric;
  /** Which year the target applies to (ignored for minCash, which spans all 36 months). */
  year: 1 | 2 | 3;
  /** cashFlow / netIncome / minCash in $, dscr as a ratio (1.25). */
  value: number;
}

export interface SolverResult {
  status: 'solved' | 'unreachable';
  /** Required ticket or volume as a multiple of today's plan (1.15 = 15% higher). */
  multiplier: number;
  currentAvgTicket: number;
  requiredAvgTicket: number;
  currentUnitsPerMonth: number;
  requiredUnitsPerMonth: number;
  currentMetric: number;
  achievedMetric: number;
  forecast: Forecast;
}

export function metricValue(f: Forecast, t: SolverTarget): number {
  const y = f.years[t.year - 1];
  switch (t.metric) {
    case 'cashFlow': return y.netCashFlow;
    case 'netIncome': return y.netIncome;
    case 'dscr': return y.debtService > 0 ? (y.ebitda - y.ownerDraw) / y.debtService : Infinity;
    case 'minCash': return f.lowestCash;
  }
}

const MIN_MULT = 0.01;
const MAX_MULT = 20;

/**
 * Reverse question: how high does the average ticket (or volume) need to be to hit the target?
 * Scales every revenue stream by the same multiple and bisects. Every metric rises with
 * ticket and volume as long as each sale contributes more than its variable costs.
 */
export function solve(a: Assumptions, lever: SolverLever, target: SolverTarget, downside = false): SolverResult {
  const base: RunOptions = downside ? downsideOptions(a) : {};
  const run = (k: number) => runForecast(a, lever === 'ticket'
    ? { ...base, ticketMultiplier: (base.ticketMultiplier ?? 1) * k }
    : { ...base, volumeMultiplier: (base.volumeMultiplier ?? 1) * k });
  const f = (k: number) => metricValue(run(k), target) - target.value;

  const current = run(1);
  const plan = runForecast(a);
  const pack = (status: SolverResult['status'], k: number): SolverResult => {
    const fc = run(k);
    return {
      status, multiplier: k,
      currentAvgTicket: plan.steadyAvgTicket,
      requiredAvgTicket: lever === 'ticket' ? fc.steadyAvgTicket : current.steadyAvgTicket,
      currentUnitsPerMonth: plan.steadyUnitsPerMonth,
      requiredUnitsPerMonth: lever === 'volume' ? fc.steadyUnitsPerMonth : current.steadyUnitsPerMonth,
      currentMetric: metricValue(current, target),
      achievedMetric: metricValue(fc, target),
      forecast: fc,
    };
  };

  if (f(MAX_MULT) < 0) return pack('unreachable', MAX_MULT);
  let lo = MIN_MULT, hi = MAX_MULT;
  if (f(lo) >= 0) return pack('solved', lo);
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) >= 0) hi = mid; else lo = mid;
  }
  return pack('solved', hi);
}
