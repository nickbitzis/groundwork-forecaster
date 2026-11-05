import { describe, expect, it } from 'vitest';
import { runForecast } from './forecast';
import { solve } from './solver';
import { newPlan } from './templates';
import { simplePlan } from './testPlan';

// simplePlan: fixed costs 21,105.12 a month including debt; each sales dollar keeps 65 cents.
const FIXED = 12240 + 6000 + 1000 + 1865.12;

describe('break-even solver', () => {
  it('finds the average ticket that makes year 1 cash flow zero', () => {
    const r = solve(simplePlan(), 'ticket', { metric: 'cashFlow', year: 1, value: 0 });
    const breakEvenRevenue = FIXED / 0.65;
    expect(r.status).toBe('solved');
    expect(r.multiplier).toBeCloseTo(breakEvenRevenue / 52000, 4);
    expect(r.requiredAvgTicket).toBeCloseTo(20 * breakEvenRevenue / 52000, 2);
    expect(r.currentAvgTicket).toBeCloseTo(20, 6);
    expect(Math.abs(r.achievedMetric)).toBeLessThan(0.01);
  });

  it('volume gives the same answer when no costs flex with volume', () => {
    const t = solve(simplePlan(), 'ticket', { metric: 'cashFlow', year: 1, value: 0 });
    const v = solve(simplePlan(), 'volume', { metric: 'cashFlow', year: 1, value: 0 });
    expect(v.multiplier).toBeCloseTo(t.multiplier, 4);
    expect(v.requiredUnitsPerMonth).toBeCloseTo(2600 * v.multiplier, 2);
  });

  it('volume keeps the staffing plan as entered, even for flexed hourly roles', () => {
    const a = simplePlan();
    a.labor.roles[1].flexWithVolume = true;
    const t = solve(a, 'ticket', { metric: 'cashFlow', year: 1, value: 0 });
    const v = solve(a, 'volume', { metric: 'cashFlow', year: 1, value: 0 });
    expect(v.multiplier).toBeCloseTo(t.multiplier, 4);
  });

  it('hits a lender DSCR target', () => {
    // 0.65 R - 19,240 = 1.25 x 1,865.12  ->  R = 33,186.8
    const r = solve(simplePlan(), 'ticket', { metric: 'dscr', year: 2, value: 1.25 });
    expect(r.multiplier * 52000).toBeCloseTo((19240 + 1.25 * 1865.12) / 0.65, 0);
    expect(r.achievedMetric).toBeCloseTo(1.25, 3);
  });

  it('hits a profit target', () => {
    const r = solve(simplePlan(), 'ticket', { metric: 'netIncome', year: 1, value: 100000 });
    expect(runForecast(simplePlan(), { ticketMultiplier: r.multiplier }).years[0].netIncome).toBeCloseTo(100000, 0);
  });

  it('keeps cash above a floor across all 36 months', () => {
    const a = simplePlan();
    a.ramp = { startPct: 20, monthsToSteady: 10, curve: 'linear' };
    const r = solve(a, 'volume', { metric: 'minCash', year: 1, value: 10000 });
    expect(r.forecast.lowestCash).toBeCloseTo(10000, 0);
  });

  it('solves the downside case too', () => {
    const a = newPlan('full-service-restaurant');
    const base = solve(a, 'ticket', { metric: 'cashFlow', year: 2, value: 0 });
    const down = solve(a, 'ticket', { metric: 'cashFlow', year: 2, value: 0 }, true);
    expect(down.multiplier).toBeGreaterThan(base.multiplier);
    expect(down.forecast.years[1].netCashFlow).toBeCloseTo(0, 0);
  });

  it('reports unreachable when each sale loses money', () => {
    const a = simplePlan();
    a.streams[0].cogsPct = 98;
    const r = solve(a, 'ticket', { metric: 'cashFlow', year: 1, value: 0 });
    expect(r.status).toBe('unreachable');
  });
});
