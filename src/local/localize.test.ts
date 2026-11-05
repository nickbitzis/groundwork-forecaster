import { describe, expect, it } from 'vitest';
import { daypartUnitsPerWeek, runForecast, steadyUnitsPerMonth, WEEKS_PER_MONTH } from '../engine/forecast';
import { volume } from '../engine/templates/common';
import { CONCEPTS } from './concepts';
import { findCounty, getMetro, metroList } from './datapack';
import { defaultLocalInput, localActuals, localize, localizedTemplate, menuCogsPct } from './localize';
import { realityCheck } from './reality';

const DENVER = '19740', AUSTIN = '12420';

describe('daypart volume', () => {
  it('seated: seats x turns x how full, weekday and weekend days', () => {
    const v = volume({ method: 'dayparts', service: 'seated', seats: 100, daysOpenPerWeek: 7, weekendDaysOpen: 2,
      dayparts: [{ id: 'd', name: 'Dinner', start: '17:00', end: '22:00', turns: 1.5, ordersPerHour: 0, weekdayPct: 50, weekendPct: 80 }] });
    // 5 weekdays x 100 x 1.5 x 0.5 + 2 weekend days x 100 x 1.5 x 0.8 = 375 + 240
    expect(daypartUnitsPerWeek(v)).toBeCloseTo(615);
    expect(steadyUnitsPerMonth(v)).toBeCloseTo(615 * WEEKS_PER_MONTH);
  });
  it('counter: orders per hour x hours x how busy; periods past midnight wrap', () => {
    const v = volume({ method: 'dayparts', service: 'counter', daysOpenPerWeek: 6, weekendDaysOpen: 1,
      dayparts: [{ id: 'l', name: 'Late', start: '22:00', end: '02:00', turns: 0, ordersPerHour: 30, weekdayPct: 50, weekendPct: 100 }] });
    // 4 hours x 30 = 120 a full night; 5 weekdays at 50% + 1 weekend day at 100%
    expect(daypartUnitsPerWeek(v)).toBeCloseTo(5 * 60 + 120);
  });
});

describe('data pack', () => {
  it('has every metro with wages and finds counties by name', () => {
    expect(metroList().length).toBeGreaterThan(380);
    const d = getMetro(DENVER)!;
    expect(d.title).toContain('Denver');
    expect(d.wages?.cook?.median).toBeGreaterThan(15);
    expect(d.ec?.['722511']?.salesPerEstab).toBeGreaterThan(500000);
    expect(findCounty('Denver County', 'Colorado')).toBe('08031');
  });
});

describe('localize', () => {
  it('Denver: city minimum and tipped wage, local cook wage, payroll burden from its parts', () => {
    const L = localize(defaultLocalInput('casual-american', DENVER));
    expect(L.ctx.minWage).toBeGreaterThanOrEqual(19);
    expect(L.ctx.minWageWhere).toContain('Denver');
    const servers = L.plan.labor.roles.find((r) => r.id === 'servers')!;
    expect(servers.hourlyWage).toBe(L.ctx.tippedWage);
    const cooks = L.plan.labor.roles.find((r) => r.id === 'cooks')!;
    expect(cooks.hourlyWage).toBe(Math.max(L.ctx.minWage, getMetro(DENVER)!.wages!.cook.median));
    const parts = L.ctx.burdenParts.reduce((s, p) => s + p.pct, 0);
    expect(L.plan.labor.payrollBurdenPct).toBeCloseTo(parts, 1);
    expect(L.notes['labor.payrollBurdenPct']).toContain('Social Security');
  });

  it('no hourly wage is ever below the local minimum (tipped roles use the tipped wage)', () => {
    for (const c of CONCEPTS) {
      for (const m of [DENVER, AUSTIN]) {
        const L = localize(defaultLocalInput(c.id, m));
        for (const r of L.plan.labor.roles.filter((x) => x.payType === 'hourly')) {
          const floor = r.id === 'servers' || r.id === 'bar' ? L.ctx.tippedWage : L.ctx.minWage;
          expect(r.hourlyWage, `${c.id} ${m} ${r.title}`).toBeGreaterThanOrEqual(floor);
        }
      }
    }
  });

  it('space drives seats, rent and build-out', () => {
    const small = localize({ ...defaultLocalInput('casual-american', DENVER), sqft: 2000 });
    const big = localize({ ...defaultLocalInput('casual-american', DENVER), sqft: 4000 });
    expect(big.seats).toBe(small.seats * 2);
    expect(big.plan.occupancy.baseRent).toBeCloseTo(small.plan.occupancy.baseRent * 2, -1);
    const bo = (L: typeof big) => L.plan.startup.lines.find((l) => l.id === 'buildout')!.amount;
    expect(bo(big)).toBeGreaterThan(bo(small) * 1.9);
    const shell = localize({ ...defaultLocalInput('casual-american', DENVER), sqft: 4000, spaceType: 'shell' });
    expect(bo(shell)).toBeGreaterThan(bo(big) * 2);
  });

  it('local prices move the menu; a pricier metro gets higher suggested prices', () => {
    const rich = metroList().map((m) => getMetro(m.code)!).filter((m) => m.rpp?.all).sort((a, b) => b.rpp!.all! - a.rpp!.all!);
    const hi = localize(defaultLocalInput('casual-american', rich[0].code));
    const lo = localize(defaultLocalInput('casual-american', rich[rich.length - 1].code));
    expect(hi.plan.streams[0].items[0].price).toBeGreaterThan(lo.plan.streams[0].items[0].price);
  });

  it('your own menu sets the ticket and cost of goods', () => {
    const c = CONCEPTS.find((x) => x.id === 'steakhouse')!;
    const menu = [
      { id: 'a', name: 'Ribeye', kind: 'food' as const, price: 60, plateCost: 24, perTicket: 1 },
      { id: 'b', name: 'Wine', kind: 'drink' as const, price: 15, perTicket: 1 },
    ];
    const pct = menuCogsPct(menu, c);
    const drinkAvg = 27 * 16 * 0.9 / (16 * 0.9) + 0; // steakhouse drinks: wine 27% (+ soft drinks)
    expect(pct).toBeGreaterThan(30);
    expect(pct).toBeLessThan(40);
    expect(drinkAvg).toBeGreaterThan(0);
    const L = localize({ ...defaultLocalInput('steakhouse', DENVER), menu });
    expect(L.plan.streams[0].items.map((i) => i.price)).toEqual([60, 15]);
    expect(L.notes['stream.ticket']).toContain('your own menu');
  });

  it('every concept in every test metro runs a clean forecast', () => {
    for (const c of CONCEPTS) {
      for (const m of [DENVER, AUSTIN, '38060', '34980', '16980']) {
        const f = runForecast(localize(defaultLocalInput(c.id, m)).plan);
        expect(Number.isFinite(f.years[0].revenue), `${c.id} ${m}`).toBe(true);
        expect(f.years[0].revenue).toBeGreaterThan(100000);
        expect(f.totalProjectCost).toBeGreaterThan(50000);
      }
    }
  });

  it('a localized template makes "Use default" local and keeps the notes', () => {
    const t = localizedTemplate(defaultLocalInput('coffee', DENVER));
    expect(t.name).toContain('Denver');
    expect(t.defaults.local?.cbsa).toBe(DENVER);
    expect(t.benchmarks['stream.ticket']).toMatch(/price level/);
  });

  it('reality check compares the plan with local restaurants', () => {
    const input = { ...defaultLocalInput('casual-american', DENVER), countyFips: '08031' };
    const L = localize(input);
    const a = localActuals(input)!;
    expect(a.where).toContain('Denver County');
    const rows = realityCheck(L.plan, runForecast(L.plan));
    expect(rows.find((r) => r.label.includes('Sales'))?.local).toBe(a.salesPerEstab);
  });
});
