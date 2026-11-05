// Prints a quick summary of every template's default plan. Run: npx vite-node scripts/summary.ts
import { runDownside, runForecast } from '../src/engine/forecast';
import { TEMPLATES, newPlan } from '../src/engine/templates';

const k = (n: number) => `${(n / 1000).toFixed(1)}K`;
for (const t of TEMPLATES) {
  const a = newPlan(t.id);
  const f = runForecast(a);
  const d = runDownside(a);
  console.log(`\n${t.name}: project ${k(f.totalProjectCost)}, payment ${k(f.monthlyPayment)}/mo, ticket ${f.steadyAvgTicket.toFixed(2)}, units/mo ${f.steadyUnitsPerMonth.toFixed(0)}`);
  for (const y of f.years) {
    const pct = (x: number) => `${((x / y.revenue) * 100).toFixed(1)}%`;
    console.log(`  Y${y.year} rev ${k(y.revenue)} cogs ${pct(y.cogs)} labor ${pct(y.labor)} occ ${pct(y.occupancy)} opex+fees ${pct(y.opex + y.channelFees)} ebitda ${pct(y.ebitda)} DSCR ${y.dscr?.toFixed(2)} cashflow ${k(y.netCashFlow)} end ${k(y.endingCash)}`);
  }
  console.log(`  base: BE month ${f.cashBreakEvenMonth}, low cash ${k(f.lowestCash)} @${f.lowestCashMonth} | downside: BE ${d.cashBreakEvenMonth}, low ${k(d.lowestCash)} @${d.lowestCashMonth}, Y2 DSCR ${d.years[1].dscr?.toFixed(2)}`);
}
