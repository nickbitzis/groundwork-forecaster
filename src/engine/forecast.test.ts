import { describe, expect, it } from 'vitest';
import {
  amortizedPayment, loanSchedule, normalizeSeasonality, rampFactor, runDownside, runForecast, streamTicket,
} from './forecast';
import { TEMPLATES, newPlan } from './templates';
import { simplePlan } from './testPlan';

// Hand math for simplePlan() month 1:
// revenue 2,600 x $20 = 52,000; COGS 30% = 15,600
// labor: salary 60,000/12 = 5,000; crew 2 x 40 x 15 x 52/12 = 5,200; wages 10,200 x 1.20 burden = 12,240
// occupancy 5,000 + 1,000 = 6,000; opex 1,000 + 5% x 52,000 = 3,600
// EBITDA = 52,000 - 15,600 - 12,240 - 6,000 - 3,600 = 14,560
// project cost = 120,000 lines + 10% x 100,000 contingency = 130,000
// payment at 12% / 120 months = 1,865.12; month 1 interest = 1,300
// depreciation = 100,000 / 120 = 833.33
const PAYMENT = 1865.12;

describe('hand-checked month 1', () => {
  const f = runForecast(simplePlan());
  const m = f.months[0];

  it('revenue, costs and EBITDA', () => {
    expect(m.revenue).toBeCloseTo(52000, 6);
    expect(m.cogs).toBeCloseTo(15600, 6);
    expect(m.labor).toBeCloseTo(12240, 6);
    expect(m.occupancy).toBeCloseTo(6000, 6);
    expect(m.opex).toBeCloseTo(3600, 6);
    expect(m.ebitda).toBeCloseTo(14560, 6);
  });

  it('project cost, loan and cash', () => {
    expect(f.totalProjectCost).toBeCloseTo(130000, 6);
    expect(f.openingCash).toBe(20000);
    expect(f.monthlyPayment).toBeCloseTo(PAYMENT, 1);
    expect(m.interest).toBeCloseTo(1300, 6);
    expect(m.principal).toBeCloseTo(PAYMENT - 1300, 1);
    expect(m.depreciation).toBeCloseTo(833.33, 1);
    expect(m.netIncome).toBeCloseTo(14560 - 833.33 - 1300, 1);
    expect(m.netCashFlow).toBeCloseTo(14560 - PAYMENT, 1);
    expect(m.cashBalance).toBeCloseTo(20000 + 14560 - PAYMENT, 1);
  });

  it('month 2 interest falls as principal is repaid', () => {
    const m2 = f.months[1];
    expect(m2.interest).toBeCloseTo((130000 - (PAYMENT - 1300)) * 0.01, 1);
    expect(m2.debtService).toBeCloseTo(PAYMENT, 1);
  });

  it('year totals and DSCR', () => {
    const y1 = f.years[0];
    expect(y1.revenue).toBeCloseTo(52000 * 12, 4);
    expect(y1.dscr!).toBeCloseTo((14560 * 12) / (PAYMENT * 12), 2);
    expect(f.months).toHaveLength(36);
    expect(f.months[0].label).toBe('Jan 2027');
    expect(f.months[35].label).toBe('Dec 2029');
  });
});

describe('building blocks', () => {
  it('ramp is linear from the start % to 100%', () => {
    expect(rampFactor(0, 50, 4, 'linear')).toBeCloseTo(0.5);
    expect(rampFactor(2, 50, 4, 'linear')).toBeCloseTo(0.75);
    expect(rampFactor(4, 50, 4, 'linear')).toBe(1);
    expect(rampFactor(10, 50, 4, 'linear')).toBe(1);
    expect(rampFactor(2, 50, 4, 'scurve')).toBeCloseTo(0.75); // S-curve passes the midpoint at the middle
    expect(rampFactor(1, 50, 4, 'scurve')).toBeLessThan(rampFactor(1, 50, 4, 'linear'));
  });

  it('seasonality averages to 1 so it never changes the annual total', () => {
    const s = normalizeSeasonality([1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2]);
    expect(s.reduce((a, b) => a + b, 0)).toBeCloseTo(12);
    expect(s[0]).toBeCloseTo(2 / 3);
    const a = simplePlan();
    a.seasonality = [1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2];
    expect(runForecast(a).years[0].revenue).toBeCloseTo(52000 * 12, 4);
  });

  it('seasonality follows the calendar from the opening month', () => {
    const a = simplePlan();
    a.openingMonth = '2027-07';
    a.seasonality = [1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2];
    expect(runForecast(a).months[0].revenue).toBeCloseTo(52000 * 4 / 3, 4);
  });

  it('ticket built up from items x price', () => {
    const s = newPlan('full-service-restaurant').streams[0];
    // 21 + 12 x .35 + 9 x .15 + 3.5 x .5 + 10 x .55
    expect(streamTicket(s)).toBeCloseTo(21 + 4.2 + 1.35 + 1.75 + 5.5, 6);
  });

  it('free rent, escalation, growth and wage increases apply by year', () => {
    const a = simplePlan();
    a.occupancy.freeRentMonths = 2;
    a.occupancy.annualEscalationPct = 3;
    a.growth.annualPriceIncreasePct = 4;
    const f = runForecast(a);
    expect(f.months[0].occupancy).toBeCloseTo(1000);
    expect(f.months[2].occupancy).toBeCloseTo(6000);
    expect(f.months[12].occupancy).toBeCloseTo(6180);
    expect(f.months[12].revenue).toBeCloseTo(52000 * 1.04, 4);
  });

  it('hourly roles on flex track how busy the month is, with a floor', () => {
    const a = simplePlan();
    a.labor.roles[1].flexWithVolume = true;
    a.ramp = { startPct: 50, monthsToSteady: 5, curve: 'linear' };
    const f = runForecast(a);
    // month 1 busy = 50%, floor 70% -> crew 5,200 x .7
    expect(f.months[0].labor).toBeCloseTo((5000 + 5200 * 0.7) * 1.2, 4);
    expect(f.months[5].labor).toBeCloseTo(12240, 4);
  });

  it('commission is a share of the named stream', () => {
    const a = simplePlan();
    a.labor.roles = [{ ...a.labor.roles[0], id: 'c', payType: 'commission', commissionPct: 40, commissionStreamId: 's1' }];
    expect(runForecast(a).months[0].labor).toBeCloseTo(52000 * 0.4 * 1.2, 4);
  });

  it('interest-only months, then amortization over the rest of the term', () => {
    const { payment, rows } = loanSchedule(120000, 12, 10, 6);
    expect(rows[0].principal).toBe(0);
    expect(rows[5].interest).toBeCloseTo(1200);
    expect(payment).toBeCloseTo(amortizedPayment(120000, 12, 114), 6);
    expect(rows[6].principal).toBeGreaterThan(0);
  });

  it('owner draws reduce cash, not profit', () => {
    const a = simplePlan();
    a.owner.monthlyDraw = 3000;
    const f = runForecast(a);
    const base = runForecast(simplePlan());
    expect(f.months[0].netIncome).toBeCloseTo(base.months[0].netIncome);
    expect(f.months[0].netCashFlow).toBeCloseTo(base.months[0].netCashFlow - 3000);
  });
});

describe('break-even month', () => {
  // Fixed costs per month = labor 12,240 + occupancy 6,000 + fixed opex 1,000 + debt 1,865.12 = 21,105.12
  // Each sales dollar keeps 65 cents (30% COGS, 5% opex), so break-even sales = 32,469.42
  // = 62.44% of the 52,000 steady state. Ramp 20% + 8% per month reaches that at month index 6 (68%).
  it('is the first month cash flow after debt service turns positive', () => {
    const a = simplePlan();
    a.ramp = { startPct: 20, monthsToSteady: 10, curve: 'linear' };
    const f = runForecast(a);
    expect(f.cashBreakEvenMonth).toBe(7);
    expect(f.months[5].netCashFlow).toBeLessThan(0);
    expect(f.months[6].netCashFlow).toBeGreaterThanOrEqual(0);
  });

  it('lowest cash is the month before break-even', () => {
    const a = simplePlan();
    a.ramp = { startPct: 20, monthsToSteady: 10, curve: 'linear' };
    const f = runForecast(a);
    expect(f.lowestCashMonth).toBe(6);
    expect(f.lowestCash).toBeCloseTo(f.months[5].cashBalance, 6);
  });

  it('is null when the business never covers its costs', () => {
    const a = simplePlan();
    a.streams[0].avgTicket = 5;
    const f = runForecast(a);
    expect(f.cashBreakEvenMonth).toBeNull();
    expect(f.lowestCash).toBeLessThan(0);
    expect(f.lowestCashMonth).toBe(36);
  });

  it('is month 1 when the business makes money from day one', () => {
    expect(runForecast(simplePlan()).cashBreakEvenMonth).toBe(1);
  });
});

describe('downside case', () => {
  it('matches a hand-checked month', () => {
    // volume -10%, ticket -5%: 52,000 x .9 x .95 = 44,460; COGS 32% = 14,227.20; opex 1,000 + 5% = 3,223
    // EBITDA = 44,460 - 14,227.20 - 12,240 - 6,000 - 3,223 = 8,769.80
    const d = runDownside(simplePlan());
    expect(d.months[0].revenue).toBeCloseTo(44460, 4);
    expect(d.months[0].ebitda).toBeCloseTo(8769.8, 4);
  });

  it('is worse than the base case on every headline', () => {
    for (const t of TEMPLATES) {
      const a = newPlan(t.id);
      const b = runForecast(a);
      const d = runDownside(a);
      expect(d.years[0].revenue).toBeLessThan(b.years[0].revenue);
      expect(d.lowestCash).toBeLessThan(b.lowestCash);
      expect(d.years[1].dscr!).toBeLessThan(b.years[1].dscr!);
    }
  });

  it('slower ramp pushes break-even later', () => {
    const a = simplePlan();
    a.ramp = { startPct: 20, monthsToSteady: 10, curve: 'linear' };
    a.downside = { volumeChangePct: 0, ticketChangePct: 0, extraRampMonths: 5, cogsPtsChange: 0, laborChangePct: 0 };
    // ramp over 15 months: 20% + 5.33% per month reaches 62.44% at index 8
    expect(runDownside(a).cashBreakEvenMonth).toBe(9);
  });

  it('labor change scales payroll', () => {
    const a = simplePlan();
    a.downside = { volumeChangePct: 0, ticketChangePct: 0, extraRampMonths: 0, cogsPtsChange: 0, laborChangePct: 10 };
    expect(runDownside(a).months[0].labor).toBeCloseTo(12240 * 1.1, 4);
  });
});

describe('templates', () => {
  it('every template produces a complete, finite 36 month plan', () => {
    for (const t of TEMPLATES) {
      const f = runForecast(newPlan(t.id));
      expect(f.months).toHaveLength(36);
      for (const m of f.months) {
        expect(Number.isFinite(m.cashBalance)).toBe(true);
        expect(m.revenue).toBeGreaterThan(0);
      }
      expect(f.totalProjectCost).toBeGreaterThan(0);
    }
  });

  it('newPlan returns an independent copy', () => {
    const a = newPlan('coffee-shop');
    a.streams[0].cogsPct = 99;
    expect(newPlan('coffee-shop').streams[0].cogsPct).toBe(28);
  });
});
