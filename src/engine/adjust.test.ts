import { describe, expect, it } from 'vitest';
import { applyMultiplier } from './adjust';
import { runForecast } from './forecast';
import { solve } from './solver';
import { TEMPLATES, newPlan } from './templates';

describe('applying a solver answer', () => {
  it('lands the plan on the target (within rounding) for every template and lever', () => {
    for (const t of TEMPLATES) {
      for (const lever of ['ticket', 'volume'] as const) {
        const a = newPlan(t.id);
        const r = solve(a, lever, { metric: 'cashFlow', year: 1, value: 0 });
        const f = runForecast(applyMultiplier(a, lever, r.multiplier));
        expect(Math.abs(f.years[0].netCashFlow)).toBeLessThan(f.years[0].revenue * 0.002);
      }
    }
  });
});
