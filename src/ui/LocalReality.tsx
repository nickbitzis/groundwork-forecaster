import { useMemo } from 'react';
import type { Assumptions, Forecast } from '../engine/types';
import { localize } from '../local/localize';
import { realityCheck } from '../local/reality';
import { Pill } from './fields';
import { money } from './format';

/** How the plan compares with real restaurants in the same area, and where the local numbers came from. */
export function LocalReality({ plan, f }: { plan: Assumptions; f: Forecast }) {
  const rows = useMemo(() => realityCheck(plan, f), [plan, f]);
  const sources = useMemo(() => { try { return plan.local ? localize(plan.local, plan).sources : []; } catch { return []; } }, [plan]);
  if (!plan.local || !rows.length) return null;
  const fmt = (v: number, unit: string) => unit === '$' ? money(v, { compact: true }) : unit === '%' ? `${v.toFixed(1)}%` : Math.round(v).toLocaleString();
  return (
    <div className="two">
      <div className="panel">
        <div className="panel-head"><h3>Local reality check</h3><span className="muted small">{rows[0].where}, Census 2022 Economic Census</span></div>
        <div className="checks">
          {rows.map((r) => (
            <div className="check" key={r.label}>
              <span><strong>{r.label}</strong> <span className="num">{r.local != null ? `${fmt(r.plan, r.unit)} vs ${fmt(r.local, r.unit)} local` : fmt(r.plan, r.unit)}</span></span>
              {r.status !== 'n/a' && <Pill status={r.status} />}
              <span className="detail">{r.note}</span>
            </div>
          ))}
        </div>
        <span className="why">A lender compares your plan with places like yours nearby. Big gaps need a reason you can explain.</span>
      </div>
      <div className="panel">
        <h3>Where the local numbers come from</h3>
        <ul className="sources">{sources.map((s, i) => <li key={i}><span className={`scope scope-${s.scope}`}>{s.scope}</span> {s.text}</li>)}</ul>
      </div>
    </div>
  );
}
