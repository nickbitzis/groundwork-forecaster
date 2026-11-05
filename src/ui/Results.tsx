import { useMemo, useState } from 'react';
import { applyMultiplier } from '../engine/adjust';
import { runDownside, runForecast, steadyUnitsPerMonth, streamTicket, WEEKS_PER_MONTH } from '../engine/forecast';
import { solve, type SolverLever, type SolverMetric } from '../engine/solver';
import type { BusinessTemplate } from '../engine/templates';
import type { Assumptions, Forecast, MonthResult } from '../engine/types';
import { BarChart, LineChart } from './Chart';
import { NumberField, Pill, Segmented, SelectField, type Status } from './fields';
import { cell, count, money, monthName, pct } from './format';
import type { Update } from './steps';

/* ---------- health checks ---------- */
interface Check { label: string; value: string; status: Status; detail: string }

export function healthChecks(f: Forecast, d: Forecast): Check[] {
  const y2 = f.years[1];
  const dscr = y2.dscr ?? Infinity;
  const occ = y2.occupancy / y2.revenue;
  const prime = y2.primeCostPct;
  return [
    { label: 'Debt coverage (DSCR), year 2', value: Number.isFinite(dscr) ? dscr.toFixed(2) : 'No debt', status: dscr >= 1.25 ? 'ok' : dscr >= 1.0 ? 'watch' : 'risk', detail: 'Lenders usually want at least 1.25: $1.25 of cash earnings for every $1 of loan payments.' },
    { label: 'Lowest cash, base case', value: money(f.lowestCash), status: f.lowestCash >= 0 ? (f.lowestCash < f.openingCash * 0.25 ? 'watch' : 'ok') : 'risk', detail: f.lowestCash < 0 ? 'The bank balance goes below zero. Raise more working capital or change the plan.' : 'Cash never runs out in the base case.' },
    { label: 'Lowest cash, downside case', value: money(d.lowestCash), status: d.lowestCash >= 0 ? 'ok' : 'risk', detail: d.lowestCash < 0 ? `A slower, softer year would need about ${money(-d.lowestCash)} more cash.` : 'Cash holds even if things go worse than planned.' },
    { label: 'Prime cost (goods + labor), year 2', value: pct(prime), status: prime <= 0.65 ? 'ok' : prime <= 0.7 ? 'watch' : 'risk', detail: 'Above 65% of sales leaves little room for rent and everything else.' },
    { label: 'Occupancy, year 2', value: pct(occ), status: occ <= 0.1 ? 'ok' : occ <= 0.12 ? 'watch' : 'risk', detail: 'Rent and NNN above 10% to 12% of sales is hard to carry.' },
  ];
}

/* ---------- overview ---------- */
export function Overview({ plan, f, d, labels }: { plan: Assumptions; f: Forecast; d: Forecast; labels: string[] }) {
  const y2dscr = f.years[1].dscr;
  const checks = healthChecks(f, d);
  return (
    <div className="plan" style={{ paddingBlock: 0 }}>
      <div className="kpis">
        <div className="kpi"><span className="eyebrow">Total project cost</span><span className="value">{money(f.totalProjectCost)}</span><span className="sub">all financed, {money(f.openingCash)} kept as cash</span></div>
        <div className="kpi"><span className="eyebrow">Loan payment</span><span className="value">{money(f.monthlyPayment)}</span><span className="sub">per month, {plan.financing.termYears} years at {plan.financing.interestRatePct}%</span></div>
        <div className="kpi"><span className="eyebrow">Break-even month</span><span className="value">{f.cashBreakEvenMonth ? `Month ${f.cashBreakEvenMonth}` : 'Not yet'}</span><span className="sub">{f.cashBreakEvenMonth ? `${labels[f.cashBreakEvenMonth - 1]}, cash flow after loan payments` : 'within 36 months'}</span></div>
        <div className="kpi"><span className="eyebrow">Lowest cash</span><span className="value">{money(f.lowestCash, { compact: true })}</span><span className="sub"><Pill status={f.lowestCash >= 0 ? 'ok' : 'risk'}>{f.lowestCash >= 0 ? 'Covered' : 'Short'}</Pill>{monthName(f.lowestCashMonth, labels)}</span></div>
        <div className="kpi"><span className="eyebrow">Year 2 DSCR</span><span className="value">{y2dscr === null ? 'n/a' : y2dscr.toFixed(2)}</span><span className="sub"><Pill status={(y2dscr ?? 9) >= 1.25 ? 'ok' : (y2dscr ?? 9) >= 1 ? 'watch' : 'risk'} />lenders look for 1.25+</span></div>
        <div className="kpi"><span className="eyebrow">Year 1 revenue</span><span className="value">{money(f.years[0].revenue, { compact: true })}</span><span className="sub">{money(f.years[2].revenue, { compact: true })} by year 3</span></div>
      </div>
      <div className="two">
        <div className="panel">
          <div className="panel-head"><h3>Cash in the bank</h3>
            <div className="legend"><span><svg width="26" height="8" aria-hidden="true"><line x1="0" x2="26" y1="4" y2="4" stroke="var(--series-base)" strokeWidth="2.5" /></svg>Base case</span>
              <span><svg width="26" height="8" aria-hidden="true"><line x1="0" x2="26" y1="4" y2="4" stroke="var(--series-down)" strokeWidth="2.5" strokeDasharray="7 5" /></svg>Downside</span></div>
          </div>
          <LineChart title="Cash balance by month, base and downside" labels={labels}
            series={[{ label: 'Base case', values: f.months.map((m) => m.cashBalance), color: 'var(--series-base)' }, { label: 'Downside', values: d.months.map((m) => m.cashBalance), color: 'var(--series-down)', dashed: true }]} />
          <span className="why">Starts from {money(f.openingCash)} cash on hand at opening. Below the dark zero line means you would need more money.</span>
        </div>
        <div className="panel">
          <h3>Health checks</h3>
          <div className="checks">
            {checks.map((c) => (
              <div className="check" key={c.label}>
                <span><strong>{c.label}</strong> <span className="num">{c.value}</span></span>
                <Pill status={c.status} />
                <span className="detail">{c.detail}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="two">
        <YearTable f={f} />
        <div className="panel">
          <h3>Monthly cash flow after loan payments</h3>
          <BarChart title="Net cash flow by month" values={f.months.map((m) => m.netCashFlow)} labels={labels} />
          <span className="why">Bars above the line add cash; bars below it use cash.</span>
        </div>
      </div>
    </div>
  );
}

function YearTable({ f }: { f: Forecast }) {
  const rows: [string, (y: Forecast['years'][number]) => string, boolean?][] = [
    ['Revenue', (y) => cell(y.revenue), true],
    ['Cost of goods', (y) => cell(-y.cogs)],
    ['Labor', (y) => cell(-y.labor)],
    ['Occupancy', (y) => cell(-y.occupancy)],
    ['Fees and other expenses', (y) => cell(-(y.opex + y.channelFees))],
    ['EBITDA', (y) => cell(y.ebitda), true],
    ['EBITDA margin', (y) => pct(y.ebitda / y.revenue)],
    ['Loan payments', (y) => cell(-y.debtService)],
    ['Net income (pre-tax)', (y) => cell(y.netIncome)],
    ['Cash flow after loan payments', (y) => cell(y.netCashFlow), true],
    ['Cash at year end', (y) => cell(y.endingCash)],
    ['DSCR', (y) => (y.dscr === null ? 'n/a' : y.dscr.toFixed(2))],
  ];
  return (
    <div className="table-scroll">
      <table>
        <thead><tr><th>By year</th><th>Year 1</th><th>Year 2</th><th>Year 3</th></tr></thead>
        <tbody>{rows.map(([label, get, bold]) => (
          <tr key={label} className={bold ? 'total' : undefined}><td>{label}</td>{f.years.map((y) => <td key={y.year}>{get(y)}</td>)}</tr>
        ))}</tbody>
      </table>
    </div>
  );
}

/* ---------- monthly tables (months run left to right) ---------- */
type Row = { label: string; get: (m: MonthResult) => number; total?: boolean; section?: boolean; yearMode?: 'sum' | 'end' };

export function MonthlyTable({ f, rows, title }: { f: Forecast; rows: Row[]; title: string }) {
  return (
    <div className="table-scroll" style={{ maxHeight: '70vh' }}>
      <table>
        <thead><tr><th>{title}</th>{f.months.map((m) => <th key={m.index}>{m.label}</th>)}<th className="year">Year 1</th><th className="year">Year 2</th><th className="year">Year 3</th></tr></thead>
        <tbody>
          {rows.map((r) => {
            if (r.section) return <tr key={r.label} className="section"><td colSpan={40}>{r.label}</td></tr>;
            const vals = f.months.map(r.get);
            const yrs = [0, 1, 2].map((y) => r.yearMode === 'end' ? vals[y * 12 + 11] : vals.slice(y * 12, y * 12 + 12).reduce((s, v) => s + v, 0));
            return (
              <tr key={r.label} className={r.total ? 'total' : undefined}>
                <td>{r.label}</td>
                {vals.map((v, i) => <td key={i} className={v < -0.5 ? 'neg' : undefined}>{cell(v)}</td>)}
                {yrs.map((v, i) => <td key={`y${i}`} className={`year${v < -0.5 ? ' neg' : ''}`}>{cell(v)}</td>)}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function pnlRows(plan: Assumptions): Row[] {
  return [
    { label: 'Revenue', get: () => 0, section: true },
    ...plan.streams.map((s) => ({ label: s.name, get: (m: MonthResult) => m.streamRevenue[s.id] ?? 0 })),
    { label: 'Total revenue', get: (m) => m.revenue, total: true },
    { label: 'Cost of goods', get: (m) => -m.cogs },
    { label: 'Gross profit', get: (m) => m.grossProfit, total: true },
    { label: 'Operating costs', get: () => 0, section: true },
    { label: 'Labor incl. payroll burden', get: (m) => -m.labor },
    { label: 'Occupancy', get: (m) => -m.occupancy },
    { label: 'Channel and event fees', get: (m) => -m.channelFees },
    ...plan.opex.lines.map((l) => ({ label: l.name, get: (m: MonthResult) => -(m.opexByLine[l.id] ?? 0) })),
    { label: 'EBITDA', get: (m) => m.ebitda, total: true },
    { label: 'Depreciation', get: (m) => -m.depreciation },
    { label: 'Interest', get: (m) => -m.interest },
    { label: 'Net income (pre-tax)', get: (m) => m.netIncome, total: true },
  ];
}

export const cashRows: Row[] = [
  { label: 'EBITDA', get: (m) => m.ebitda },
  { label: 'Interest', get: (m) => -m.interest },
  { label: 'Loan principal', get: (m) => -m.principal },
  { label: 'Owner draws', get: (m) => -m.ownerDraw },
  { label: 'Cash flow after loan payments', get: (m) => m.netCashFlow, total: true },
  { label: 'Cash balance, end of month', get: (m) => m.cashBalance, total: true, yearMode: 'end' },
  { label: 'Loan balance', get: (m) => m.loanBalance, yearMode: 'end' },
];

/* ---------- solver ---------- */
const GOALS: { value: SolverMetric; label: string }[] = [
  { value: 'cashFlow', label: 'Break even after loan payments' },
  { value: 'netIncome', label: 'Hit a yearly profit' },
  { value: 'dscr', label: "Meet a lender's DSCR" },
  { value: 'minCash', label: 'Never let cash drop below' },
];

export function Solver({ plan, update, template }: { plan: Assumptions; update: Update; template: BusinessTemplate }) {
  const [lever, setLever] = useState<SolverLever>('ticket');
  const [metric, setMetric] = useState<SolverMetric>('cashFlow');
  const [year, setYear] = useState<1 | 2 | 3>(1);
  const [value, setValue] = useState(0);
  const [downside, setDownside] = useState(false);
  const [applied, setApplied] = useState(false);
  const targetValue = metric === 'cashFlow' ? 0 : value;
  const r = useMemo(() => solve(plan, lever, { metric, year, value: targetValue }, downside), [plan, lever, metric, year, targetValue, downside]);

  const change = r.multiplier - 1;
  const goalText = metric === 'cashFlow' ? `break even after loan payments in year ${year}`
    : metric === 'netIncome' ? `make ${money(value)} pre-tax profit in year ${year}`
      : metric === 'dscr' ? `reach a DSCR of ${value.toFixed(2)} in year ${year}`
        : `keep cash above ${money(value)} for all 36 months`;
  const caseText = downside ? ' in the downside case' : '';
  const currentDaily = plan.streams.reduce((s, x) => s + (x.volume.method === 'events' ? 0 : steadyUnitsPerMonth(x.volume) / (x.volume.daysOpenPerWeek * WEEKS_PER_MONTH || 1)), 0);

  const onGoal = (m: SolverMetric) => {
    setMetric(m);
    setValue(m === 'dscr' ? 1.25 : m === 'netIncome' ? 100000 : m === 'minCash' ? 10000 : 0);
    setApplied(false);
  };

  return (
    <div className="plan" style={{ paddingBlock: 0 }}>
      <div className="panel">
        <div className="step-head"><h2>What would it take?</h2><p>Pick a goal. The app works backward to the average ticket or the customer volume you need, keeping every other assumption as it is.</p></div>
        <div className="solver-form">
          <div className="field"><span className="label">Solve for</span>
            <Segmented label="Solve for" value={lever} onChange={(v) => { setLever(v); setApplied(false); }} options={[{ value: 'ticket', label: 'Average ticket' }, { value: 'volume', label: `${template.unitWord[0].toUpperCase()}${template.unitWord.slice(1)} per day` }]} /></div>
          <SelectField label="Goal" value={metric} options={GOALS} onChange={onGoal} />
          {metric !== 'minCash' && <SelectField label="In year" value={String(year)} options={[{ value: '1', label: 'Year 1' }, { value: '2', label: 'Year 2' }, { value: '3', label: 'Year 3' }]} onChange={(v) => setYear(Number(v) as 1 | 2 | 3)} />}
          {metric === 'netIncome' && <NumberField label="Profit target" unit="$" value={value} onChange={setValue} />}
          {metric === 'dscr' && <NumberField label="DSCR target" unit="x" value={value} onChange={setValue} why="1.25 is the usual SBA minimum." />}
          {metric === 'minCash' && <NumberField label="Cash floor" unit="$" value={value} onChange={setValue} />}
          <div className="field"><span className="label">Case</span>
            <Segmented label="Case" value={downside ? 'down' : 'base'} onChange={(v) => setDownside(v === 'down')} options={[{ value: 'base', label: 'Base' }, { value: 'down', label: 'Downside' }]} /></div>
        </div>
      </div>
      <div className="panel">
        {r.status === 'unreachable' ? (
          <p className="answer">No realistic {lever === 'ticket' ? 'ticket' : 'volume'} reaches this goal. Each sale costs more than it brings in once goods and fees are paid, so look at cost of goods and fees first.</p>
        ) : lever === 'ticket' ? (
          <p className="answer">To {goalText}{caseText}, your average ticket needs to be <em>{money(r.requiredAvgTicket, { cents: true })}</em>. Today it is {money(r.currentAvgTicket, { cents: true })}, {change >= 0 ? `${pct(change)} higher` : `so you have ${pct(-change)} of room`}.</p>
        ) : (
          <p className="answer">To {goalText}{caseText}, you need about <em>{count(currentDaily * r.multiplier * (downside ? 1 + plan.downside.volumeChangePct / 100 : 1))} {template.unitWord} a day</em>. Your plan has {count(currentDaily)}, {change >= 0 ? `${pct(change)} more needed` : `so you have ${pct(-change)} of room`}.</p>
        )}
        {r.status === 'solved' && (
          <div className="table-scroll">
            <table>
              <thead><tr><th>Revenue stream</th><th>{lever === 'ticket' ? 'Ticket today' : 'Per month today'}</th><th>{lever === 'ticket' ? 'Ticket needed' : 'Per month needed'}</th></tr></thead>
              <tbody>{plan.streams.map((s) => {
                const extra = downside ? 1 + (lever === 'ticket' ? plan.downside.ticketChangePct : plan.downside.volumeChangePct) / 100 : 1;
                return (
                  <tr key={s.id}><td>{s.name}</td>
                    {lever === 'ticket'
                      ? <><td>{money(streamTicket(s), { cents: true })}</td><td>{money(streamTicket(s) * r.multiplier * extra, { cents: true })}</td></>
                      : <><td>{count(steadyUnitsPerMonth(s.volume))}</td><td>{count(steadyUnitsPerMonth(s.volume) * r.multiplier * extra)}</td></>}
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        )}
        {r.status === 'solved' && (
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-primary" type="button" disabled={applied || Math.abs(change) < 0.0005} onClick={() => { update((d) => { Object.assign(d, applyMultiplier(d, lever, r.multiplier)); }); setApplied(true); }}>
              {applied ? 'Applied to your plan' : `Use this ${lever === 'ticket' ? 'ticket' : 'volume'} in my plan`}
            </button>
            <span className="why">Scales every stream by {pct(change)}. Staffing stays as you entered it.</span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- downside ---------- */
export function Downside({ plan, update, template, f, d, labels }: { plan: Assumptions; update: Update; template: BusinessTemplate; f: Forecast; d: Forecast; labels: string[] }) {
  const ds = plan.downside;
  const d0 = template.defaults.downside;
  const rows: [string, (x: Forecast) => string][] = [
    ['Year 1 revenue', (x) => money(x.years[0].revenue)],
    ['Year 2 revenue', (x) => money(x.years[1].revenue)],
    ['Break-even month', (x) => (x.cashBreakEvenMonth ? `Month ${x.cashBreakEvenMonth}` : 'Not within 36')],
    ['Lowest cash', (x) => money(x.lowestCash)],
    ['Year 1 DSCR', (x) => x.years[0].dscr?.toFixed(2) ?? 'n/a'],
    ['Year 2 DSCR', (x) => x.years[1].dscr?.toFixed(2) ?? 'n/a'],
    ['Cash at month 36', (x) => money(x.months[35].cashBalance)],
  ];
  return (
    <div className="plan" style={{ paddingBlock: 0 }}>
      <div className="panel">
        <div className="step-head"><h2>Downside case</h2><p>The same plan with things going worse. Lenders ask for this, and it tells you how much cash cushion you really need.</p></div>
        <div className="fields">
          <NumberField label="Volume change" unit="%" value={ds.volumeChangePct} onChange={(v) => update((x) => { x.downside.volumeChangePct = v; })} typical={d0.volumeChangePct} why="Fewer customers than planned." />
          <NumberField label="Ticket change" unit="%" value={ds.ticketChangePct} onChange={(v) => update((x) => { x.downside.ticketChangePct = v; })} typical={d0.ticketChangePct} why="Customers spend less per visit." />
          <NumberField label="Extra months to ramp up" unit="mo" value={ds.extraRampMonths} onChange={(v) => update((x) => { x.downside.extraRampMonths = v; })} typical={d0.extraRampMonths} why="The slow start lasts longer." />
          <NumberField label="Cost of goods change" unit="%" value={ds.cogsPtsChange} onChange={(v) => update((x) => { x.downside.cogsPtsChange = v; })} typical={d0.cogsPtsChange} why="Percentage points added, for price spikes and waste." />
          <NumberField label="Labor change" unit="%" value={ds.laborChangePct} onChange={(v) => update((x) => { x.downside.laborChangePct = v; })} typical={d0.laborChangePct} why="Wage pressure or overtime." />
        </div>
      </div>
      <div className="two">
        <div className="table-scroll">
          <table>
            <thead><tr><th>Headline</th><th>Base</th><th>Downside</th></tr></thead>
            <tbody>{rows.map(([label, get]) => <tr key={label}><td>{label}</td><td>{get(f)}</td><td>{get(d)}</td></tr>)}</tbody>
          </table>
        </div>
        <div className="panel">
          <div className="panel-head"><h3>Cash in the bank</h3>
            <div className="legend"><span><svg width="26" height="8" aria-hidden="true"><line x1="0" x2="26" y1="4" y2="4" stroke="var(--series-base)" strokeWidth="2.5" /></svg>Base</span>
              <span><svg width="26" height="8" aria-hidden="true"><line x1="0" x2="26" y1="4" y2="4" stroke="var(--series-down)" strokeWidth="2.5" strokeDasharray="7 5" /></svg>Downside</span></div></div>
          <LineChart title="Cash balance, base and downside" labels={labels}
            series={[{ label: 'Base', values: f.months.map((m) => m.cashBalance), color: 'var(--series-base)' }, { label: 'Downside', values: d.months.map((m) => m.cashBalance), color: 'var(--series-down)', dashed: true }]} />
          {d.lowestCash < 0 && <p className="why"><Pill status="risk">Short</Pill> In this case you would need about {money(-d.lowestCash)} more working capital to stay above zero.</p>}
        </div>
      </div>
      <MonthlyTable f={d} rows={[...pnlRows(plan), { label: 'Cash flow', get: () => 0, section: true }, ...cashRows]} title="Downside, by month" />
    </div>
  );
}

export function useForecasts(plan: Assumptions) {
  return useMemo(() => ({ f: runForecast(plan), d: runDownside(plan) }), [plan]);
}
