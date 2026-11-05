import { useMemo } from 'react';
import { runDownside, runForecast } from '../engine/forecast';
import { getTemplate } from '../engine/templates';
import type { Forecast } from '../engine/types';
import { Pill } from './fields';
import { money, pct } from './format';
import type { Scenario } from './scenarios';

type Row = { label: string; get: (f: Forecast, d: Forecast, s: Scenario) => React.ReactNode; section?: boolean; total?: boolean };

const dscrCell = (v: number | null) => v === null ? 'n/a' : (
  <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><Pill status={v >= 1.25 ? 'ok' : v >= 1 ? 'watch' : 'risk'} />{v.toFixed(2)}</span>
);
const cashCell = (v: number) => <span className={v < 0 ? 'neg-text' : undefined}>{money(v, { compact: true })}</span>;

const ROWS: Row[] = [
  { label: 'The plan', get: () => null, section: true },
  { label: 'Business type', get: (_f, _d, s) => getTemplate(s.plan.templateId).name },
  { label: 'Opens', get: (f) => f.months[0].label },
  { label: 'Total project cost', get: (f) => money(f.totalProjectCost, { compact: true }) },
  { label: 'Loan payment / month', get: (f) => money(f.monthlyPayment) },
  { label: 'Revenue', get: () => null, section: true },
  { label: 'Year 1', get: (f) => money(f.years[0].revenue, { compact: true }) },
  { label: 'Year 2', get: (f) => money(f.years[1].revenue, { compact: true }) },
  { label: 'Year 3', get: (f) => money(f.years[2].revenue, { compact: true }) },
  { label: 'Profit and coverage', get: () => null, section: true },
  { label: 'EBITDA, year 1', get: (f) => cashCell(f.years[0].ebitda) },
  { label: 'EBITDA, year 2', get: (f) => cashCell(f.years[1].ebitda) },
  { label: 'EBITDA, year 3', get: (f) => cashCell(f.years[2].ebitda) },
  { label: 'Prime cost %, year 2', get: (f) => pct(f.years[1].primeCostPct) },
  { label: 'DSCR, year 2', get: (f) => dscrCell(f.years[1].dscr), total: true },
  { label: 'DSCR, year 3', get: (f) => dscrCell(f.years[2].dscr) },
  { label: 'Cash', get: () => null, section: true },
  { label: 'Break-even month', get: (f) => f.cashBreakEvenMonth ? `Month ${f.cashBreakEvenMonth}` : 'Not yet' },
  { label: 'Lowest cash, base', get: (f) => cashCell(f.lowestCash), total: true },
  { label: 'Lowest cash, downside', get: (_f, d) => cashCell(d.lowestCash), total: true },
  { label: 'Cash at month 36', get: (f) => cashCell(f.months[35].cashBalance) },
];

export function Compare({ scenarios, currentId, onOpen }: { scenarios: Scenario[]; currentId: string | null; onOpen: (id: string) => void }) {
  const runs = useMemo(() => scenarios.map((s) => ({ s, f: runForecast(s.plan), d: runDownside(s.plan) })), [scenarios]);
  if (scenarios.length < 2) {
    return (
      <div className="panel">
        <h3>Compare scenarios</h3>
        <p className="muted">You have one scenario. Use <strong>Duplicate</strong> above to copy it, change something (rent, ticket, staff, loan), and the two will line up here side by side.</p>
      </div>
    );
  }
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <p className="muted small" style={{ margin: 0 }}>Every scenario, side by side. The highlighted column is the one you are editing. Tap a name to open it.</p>
      <div className="table-scroll compare">
        <table>
          <thead>
            <tr>
              <th>Scenario</th>
              {runs.map(({ s }) => (
                <th key={s.id} className={s.id === currentId ? 'current' : undefined}>
                  {s.id === currentId ? s.name : <button type="button" className="btn-ghost btn-small linkish" onClick={() => onOpen(s.id)}>{s.name}</button>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => r.section
              ? <tr key={r.label} className="section"><td colSpan={runs.length + 1}>{r.label}</td></tr>
              : (
                <tr key={r.label} className={r.total ? 'total' : undefined}>
                  <td>{r.label}</td>
                  {runs.map(({ s, f, d }) => <td key={s.id} className={s.id === currentId ? 'current' : undefined}>{r.get(f, d, s)}</td>)}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
