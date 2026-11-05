import * as XLSX from 'xlsx';
import { localize } from '../local/localize';
import { realityCheck } from '../local/reality';
import { runDownside, runForecast, startupTotals, streamTicket, steadyUnitsPerMonth } from './forecast';
import { getTemplate } from './templates';
import type { Assumptions, Forecast, MonthResult } from './types';

type Cell = string | number | null;
const MONEY = '#,##0;(#,##0)';
const RATIO = '0.00';
const PCT = '0.0%';

function sheet(rows: Cell[][], firstColWidth = 34, colWidth = 11, formats: Record<number, string> = {}): XLSX.WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1');
  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (cell && cell.t === 'n') cell.z = formats[r] ?? MONEY;
    }
  }
  ws['!cols'] = [{ wch: firstColWidth }, ...Array(range.e.c).fill({ wch: colWidth })];
  ws['!freeze'] = { xSplit: 1, ySplit: 1 };
  return ws;
}

function monthlyBlock(f: Forecast, a: Assumptions, title: string): { rows: Cell[][]; formats: Record<number, string> } {
  const header: Cell[] = [title, ...f.months.map((m) => m.label), 'Year 1', 'Year 2', 'Year 3'];
  const line = (label: string, get: (m: MonthResult) => number): Cell[] => {
    const vals = f.months.map(get);
    const yr = [0, 1, 2].map((y) => vals.slice(y * 12, y * 12 + 12).reduce((s, v) => s + v, 0));
    return [label, ...vals, ...yr];
  };
  const rows: Cell[][] = [header];
  for (const s of a.streams) rows.push(line(`Revenue: ${s.name}`, (m) => m.streamRevenue[s.id] ?? 0));
  rows.push(
    line('Total revenue', (m) => m.revenue),
    line('Cost of goods', (m) => -m.cogs),
    line('Gross profit', (m) => m.grossProfit),
    line('Labor incl. payroll burden', (m) => -m.labor),
    line('Occupancy', (m) => -m.occupancy),
    line('Channel and event fees', (m) => -m.channelFees),
    line('Operating expenses', (m) => -m.opex),
    line('EBITDA', (m) => m.ebitda),
    line('Depreciation', (m) => -m.depreciation),
    line('Interest', (m) => -m.interest),
    line('Net income (pre-tax)', (m) => m.netIncome),
    [],
    ['CASH FLOW'],
    line('EBITDA', (m) => m.ebitda),
    line('Interest', (m) => -m.interest),
    line('Principal', (m) => -m.principal),
    line('Owner draws', (m) => -m.ownerDraw),
    line('Net cash flow after debt service', (m) => m.netCashFlow),
  );
  const cash: Cell[] = ['Cash balance (end of month)', ...f.months.map((m) => m.cashBalance), ...f.years.map((y) => y.endingCash)];
  const loan: Cell[] = ['Loan balance', ...f.months.map((m) => m.loanBalance), ...[11, 23, 35].map((i) => f.months[i].loanBalance)];
  rows.push(cash, loan);
  const dscrRow: Cell[] = ['DSCR (EBITDA less owner draws / debt service)', ...f.months.map(() => null), ...f.years.map((y) => y.dscr)];
  rows.push(dscrRow);
  return { rows, formats: { [rows.length - 1]: RATIO } };
}

function detailBlock(f: Forecast, a: Assumptions): Cell[][] {
  const rows: Cell[][] = [['Detail', ...f.months.map((m) => m.label)], ['LABOR BY ROLE (incl. burden)']];
  for (const r of a.labor.roles) rows.push([r.title, ...f.months.map((m) => m.laborByRole[r.id] ?? 0)]);
  rows.push([], ['OPERATING EXPENSES BY LINE']);
  for (const l of a.opex.lines) rows.push([l.name, ...f.months.map((m) => m.opexByLine[l.id] ?? 0)]);
  rows.push([], ['VOLUME AND RAMP'], ['Units (guests, customers, clients)', ...f.months.map((m) => Math.round(m.units))]);
  return rows;
}

function assumptionRows(a: Assumptions): { rows: Cell[][]; formats: Record<number, string> } {
  const rows: Cell[][] = [['Assumption', 'Value', 'Notes']];
  const formats: Record<number, string> = {};
  const add = (k: string, v: Cell, note = '', fmt?: string) => { rows.push([k, v, note]); if (fmt) formats[rows.length - 1] = fmt; };
  const t = getTemplate(a.templateId);
  add('Business', a.businessName);
  add('Business type', t.name);
  add('Opening month', a.openingMonth);
  rows.push([], ['REVENUE STREAMS']);
  for (const s of a.streams) {
    add(`${s.name}: average ticket`, streamTicket(s), s.ticketMode === 'buildup' ? 'built from items x price' : '', '#,##0.00');
    if (s.ticketMode === 'buildup') for (const i of s.items) add(`   ${i.name}`, i.price, `${i.perTicket} per ticket`, '#,##0.00');
    add(`${s.name}: volume per month at steady state`, Math.round(steadyUnitsPerMonth(s.volume)), `method: ${s.volume.method}, ${s.volume.daysOpenPerWeek} days a week`, '#,##0');
    add(`${s.name}: cost of goods %`, s.cogsPct / 100, '', PCT);
    add(`${s.name}: channel or event fees %`, s.channelFeePct / 100, '', PCT);
  }
  rows.push([], ['RAMP, GROWTH, SEASONALITY']);
  add('Month 1 volume, % of steady state', a.ramp.startPct / 100, '', PCT);
  add('Months to steady state', a.ramp.monthsToSteady, a.ramp.curve === 'scurve' ? 'S-curve' : 'straight line', '0');
  add('Annual price increase', a.growth.annualPriceIncreasePct / 100, '', PCT);
  add('Annual volume growth after year 1', a.growth.annualVolumeGrowthPct / 100, '', PCT);
  add('Seasonality Jan to Dec', a.seasonality.map((x) => x.toFixed(2)).join('  '), 'relative; averaged to 1.00');
  rows.push([], ['STAFFING']);
  for (const r of a.labor.roles) {
    const pay = r.payType === 'salary' ? `$${r.annualSalary.toLocaleString()} a year`
      : r.payType === 'hourly' ? `$${r.hourlyWage}/hr x ${r.hoursPerWeek} hrs/wk${r.flexWithVolume ? ', flexes with volume' : ''}`
      : `${r.commissionPct}% commission`;
    add(r.title, r.count, pay, '0.0');
  }
  add('Payroll burden', a.labor.payrollBurdenPct / 100, 'taxes, workers comp, benefits', PCT);
  add('Minimum staffing when slow', a.labor.minFlexPct / 100, 'floor for flexed hours', PCT);
  add('Annual wage increase', a.labor.annualWageIncreasePct / 100, '', PCT);
  rows.push([], ['OCCUPANCY']);
  add(a.occupancy.rentLabel, a.occupancy.baseRent, 'per month');
  add(a.occupancy.otherLabel, a.occupancy.otherOccupancy, 'per month');
  add('Annual escalation', a.occupancy.annualEscalationPct / 100, '', PCT);
  add('Free rent months', a.occupancy.freeRentMonths, '', '0');
  rows.push([], ['OPERATING EXPENSES']);
  for (const l of a.opex.lines) {
    if (l.kind === 'fixed') add(l.name, l.amount, 'per month');
    else add(l.name, l.amount / 100, 'of sales', PCT);
  }
  add('Annual inflation on fixed expenses', a.opex.annualInflationPct / 100, '', PCT);
  rows.push([], ['FINANCING']);
  add('Total project cost (financed in full)', startupTotals(a).totalProjectCost);
  add('Interest rate', a.financing.interestRatePct / 100, '', PCT);
  add('Term (years)', a.financing.termYears, '', '0');
  add('Interest-only months', a.financing.interestOnlyMonths, '', '0');
  add('Owner draws per month', a.owner.monthlyDraw);
  rows.push([], ['DOWNSIDE CASE']);
  add('Volume change', a.downside.volumeChangePct / 100, '', PCT);
  add('Ticket change', a.downside.ticketChangePct / 100, '', PCT);
  add('Extra ramp months', a.downside.extraRampMonths, '', '0');
  add('Cost of goods change (points)', a.downside.cogsPtsChange, '', '0.0');
  add('Labor change', a.downside.laborChangePct / 100, '', PCT);
  return { rows, formats };
}

export function buildWorkbook(a: Assumptions): XLSX.WorkBook {
  const base = runForecast(a);
  const down = runDownside(a);
  const st = startupTotals(a);
  const wb = XLSX.utils.book_new();

  const fmtMonth = (n: number | null) => (n === null ? 'Not within 36 months' : `Month ${n}`);
  const summary: Cell[][] = [
    [`${a.businessName}: 36-month forecast`, 'Base case', 'Downside case'],
    ['Business type', getTemplate(a.templateId).name, ''],
    ['Opening month', base.months[0].label, ''],
    ['Total project cost (financed in full)', base.totalProjectCost, down.totalProjectCost],
    ['Monthly loan payment', base.monthlyPayment, down.monthlyPayment],
    ['Cash at opening', base.openingCash, down.openingCash],
    ['First month cash flow is positive after debt service', fmtMonth(base.cashBreakEvenMonth), fmtMonth(down.cashBreakEvenMonth)],
    ['Lowest cash balance', base.lowestCash, down.lowestCash],
    ['Month of lowest cash', base.lowestCashMonth, down.lowestCashMonth],
    [],
    ['By year', 'Year 1', 'Year 2', 'Year 3', 'Downside Y1', 'Downside Y2', 'Downside Y3'],
  ];
  const yr = (label: string, get: (y: Forecast['years'][number]) => number | null): Cell[] =>
    [label, ...base.years.map(get), ...down.years.map(get)];
  summary.push(
    yr('Revenue', (y) => y.revenue),
    yr('EBITDA', (y) => y.ebitda),
    yr('Debt service', (y) => y.debtService),
    yr('Net income (pre-tax)', (y) => y.netIncome),
    yr('Net cash flow after debt service', (y) => y.netCashFlow),
    yr('Ending cash', (y) => y.endingCash),
    yr('DSCR', (y) => y.dscr),
    yr('Prime cost (COGS + labor) % of sales', (y) => y.primeCostPct),
  );
  const sumFormats = { [summary.length - 2]: RATIO, [summary.length - 1]: PCT, 8: '0' };
  XLSX.utils.book_append_sheet(wb, sheet(summary, 46, 14, sumFormats), 'Summary');

  const b = monthlyBlock(base, a, 'Base case');
  XLSX.utils.book_append_sheet(wb, sheet(b.rows, 40, 11, b.formats), 'Monthly P&L and cash');
  const d = monthlyBlock(down, a, 'Downside case');
  XLSX.utils.book_append_sheet(wb, sheet(d.rows, 40, 11, d.formats), 'Downside');
  XLSX.utils.book_append_sheet(wb, sheet(detailBlock(base, a), 40, 11), 'Labor and expense detail');

  const startup: Cell[][] = [['Startup budget', 'Amount', 'Depreciation years']];
  for (const l of a.startup.lines) startup.push([l.name, l.amount, l.isWorkingCapital ? 'cash on hand' : l.depreciationYears || 'not depreciated']);
  startup.push([`Contingency (${a.startup.contingencyPct}% of non-cash lines)`, st.contingency, ''], ['Total project cost', st.totalProjectCost, '']);
  XLSX.utils.book_append_sheet(wb, sheet(startup, 46, 18), 'Startup budget');

  const as = assumptionRows(a);
  XLSX.utils.book_append_sheet(wb, sheet(as.rows, 46, 16, as.formats), 'Assumptions');

  if (a.local) {
    const L = localize(a.local, a);
    const local: Cell[][] = [
      ['Local market data', ''],
      ['Location', a.local.address ?? L.ctx.metro.title],
      ['Metro area', L.ctx.metro.title],
      ['Concept', L.ctx.concept.name],
      ['Square feet', a.local.sqft],
      ['Seats', L.seats],
      ['Minimum wage', L.ctx.minWage],
      ['Tipped cash wage', L.ctx.tippedWage],
      ['Minimum wage source', L.ctx.minWageWhere],
      ['Payroll burden %', L.ctx.payrollBurdenPct],
      ...L.ctx.burdenParts.map((p) => [`  ${p.label} %`, p.pct] as Cell[]),
      ['Rent per sq ft per year', Math.round(L.ctx.rentPerSqftYear * 100) / 100],
      ['Rent source', L.ctx.rentWhere],
      ['Local price level (US = 100)', Math.round(L.ctx.priceLevel * 1000) / 10],
      [],
      ['Local reality check (year 2 of the plan vs. local averages)', 'Plan', 'Local', 'Where'],
      ...realityCheck(a, base).map((r) => [r.label, Math.round(r.plan * 10) / 10, r.local ?? '', r.where] as Cell[]),
      [],
      ['Sources', ''],
      ...L.sources.map((s) => [s.scope, s.text] as Cell[]),
    ];
    XLSX.utils.book_append_sheet(wb, sheet(local, 48, 30), 'Local market data');
  }
  return wb;
}

export function workbookBytes(a: Assumptions): Uint8Array {
  return new Uint8Array(XLSX.write(buildWorkbook(a), { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);
}
