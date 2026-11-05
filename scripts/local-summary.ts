// Prints a localized plan's key numbers: npx vite-node scripts/local-summary.ts [conceptId] [cbsa]
import { runDownside, runForecast, startupTotals } from '../src/engine/forecast';
import { defaultLocalInput, localActuals, localize } from '../src/local/localize';

const [conceptId = 'casual-american', cbsa = '19740'] = process.argv.slice(2);
const L = localize(defaultLocalInput(conceptId, cbsa));
const f = runForecast(L.plan), d = runDownside(L.plan);
const y1 = f.years[0], y2 = f.years[1];
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
console.log(`${L.ctx.concept.name} in ${L.ctx.metro.title}: ${L.seats} seats, min wage $${L.ctx.minWage} (${L.ctx.minWageWhere}), burden ${L.plan.labor.payrollBurdenPct}%`);
console.log('roles', L.plan.labor.roles.map((r) => `${r.title} ${r.count}x${r.hoursPerWeek}h @${r.payType === 'salary' ? r.annualSalary : r.hourlyWage}`).join(' | '));
console.log('ticket items', L.plan.streams[0].items.map((i) => `${i.name} $${i.price}`).join(', '), 'cogs', L.plan.streams[0].cogsPct);
console.log(`rent $${L.plan.occupancy.baseRent}/mo + NNN $${L.plan.occupancy.otherOccupancy}; project cost $${Math.round(startupTotals(L.plan).totalProjectCost)}`);
console.log(`Y1 revenue $${Math.round(y1.revenue)} | labor ${pct(y1.labor / y1.revenue)} | cogs ${pct(y1.cogs / y1.revenue)} | occupancy ${pct(y1.occupancy / y1.revenue)} | EBITDA ${pct(y1.ebitda / y1.revenue)} | DSCR Y1 ${y1.dscr?.toFixed(2)} Y2 ${y2.dscr?.toFixed(2)}`);
console.log(`break-even month ${f.cashBreakEvenMonth}, lowest cash $${Math.round(f.lowestCash)}; downside lowest $${Math.round(d.lowestCash)}`);
const a = localActuals(L.plan.local!);
console.log('local actuals', a);
