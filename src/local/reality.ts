// Compare the plan with what restaurants in the same area actually do (Census Economic Census).

import type { Assumptions, Forecast } from '../engine/types';
import { getConcept } from './concepts';
import { localActuals } from './localize';
import type { RealityRow } from './types';

export function realityCheck(plan: Assumptions, f: Forecast): RealityRow[] {
  if (!plan.local) return [];
  const a = localActuals(plan.local);
  const c = getConcept(plan.local.conceptId);
  if (!a) return [];
  const y2 = f.years[1]; // year 2: past the ramp, closest to an established place
  const wages = y2.labor / (1 + plan.labor.payrollBurdenPct / 100);
  const staff = plan.labor.roles.reduce((s, r) => s + r.count, 0);
  const kind = c.naics === '722511' ? 'full-service restaurants' : c.naics === '722513' ? 'limited-service restaurants'
    : c.naics === '722515' ? 'coffee shops and snack bars' : c.naics === '722410' ? 'bars' : 'food trucks';
  const ratio = (plan: number, local: number) => plan / local;
  const rows: RealityRow[] = [];

  const salesRatio = ratio(y2.revenue, a.salesPerEstab);
  rows.push({
    label: 'Sales per year (year 2)', plan: y2.revenue, local: a.salesPerEstab, unit: '$', where: a.where,
    status: salesRatio > 1.6 || salesRatio < 0.4 ? 'risk' : salesRatio > 1.25 || salesRatio < 0.6 ? 'watch' : 'ok',
    note: `Average for the ${a.estab.toLocaleString()} ${kind} there (2022, including chains). ${salesRatio > 1.25 ? 'Your plan is well above average: a lender will ask why.' : salesRatio < 0.6 ? 'Well below average: fine for a small place, but check the space and hours.' : 'In line with the area.'}`,
  });
  if (a.payrollPct != null) {
    const pp = (wages / y2.revenue) * 100;
    const diff = pp - a.payrollPct;
    rows.push({
      label: 'Payroll as % of sales (before payroll taxes)', plan: pp, local: a.payrollPct, unit: '%', where: a.where,
      status: Math.abs(diff) > 12 ? 'risk' : Math.abs(diff) > 6 ? 'watch' : 'ok',
      note: diff < -6 ? 'Leaner than local restaurants: double-check the staffing plan.' : diff > 6 ? 'Heavier than local restaurants: more staff or higher wages than typical.' : 'Close to what local restaurants pay.',
    });
  }
  if (a.empPerEstab != null) {
    rows.push({
      label: 'People on payroll', plan: staff, local: a.empPerEstab, unit: '#', where: a.where,
      status: staff > a.empPerEstab * 2 || staff < a.empPerEstab * 0.35 ? 'watch' : 'ok',
      note: 'Average headcount per location there, full and part time.',
    });
  }
  const local = a.estab;
  rows.push({
    label: `Competing ${kind}`, plan: local, local: null, unit: '#', where: a.where, status: 'n/a',
    note: 'Number of locations in the area (2022). Look up who is near your address on the Location step.',
  });
  return rows;
}
