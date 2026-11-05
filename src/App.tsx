import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { localizedTemplate } from './local/localize';
import { workbookBytes } from './engine/excel';
import { TEMPLATES, getTemplate, newPlan } from './engine/templates';
import type { Assumptions } from './engine/types';
import { Pill } from './ui/fields';
import { money } from './ui/format';
import { Compare } from './ui/Compare';
import { LocalReality } from './ui/LocalReality';
import { Downside, MonthlyTable, Overview, Solver, cashRows, pnlRows, useForecasts } from './ui/Results';
import { duplicateScenario, makeScenario, removeScenario, renameScenario, uniqueName, upsertPlan, type Scenario } from './ui/scenarios';
import { STEPS, type Update } from './ui/steps';
import { downloadFile, loadLibrary, parseAnyFile, safeFileName, saveLibrary } from './ui/storage';

type Stage = 'start' | 'wizard' | 'plan';
type Tab = 'overview' | 'compare' | 'pnl' | 'cash' | 'solver' | 'downside' | 'assumptions';
const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'compare', label: 'Compare scenarios' },
  { id: 'pnl', label: 'Monthly P&L' },
  { id: 'cash', label: 'Cash flow' },
  { id: 'solver', label: 'Break-even solver' },
  { id: 'downside', label: 'Downside' },
  { id: 'assumptions', label: 'Assumptions' },
];

function Mark() {
  return (
    <svg className="brand-mark" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="2" y="14" width="5" height="8" rx="1" fill="var(--accent)" opacity="0.45" />
      <rect x="9.5" y="9" width="5" height="13" rx="1" fill="var(--accent)" opacity="0.7" />
      <rect x="17" y="3" width="5" height="19" rx="1" fill="var(--accent)" />
    </svg>
  );
}

export default function App() {
  const saved = useRef(loadLibrary());
  const [scenarios, setScenarios] = useState<Scenario[]>(saved.current?.scenarios ?? []);
  const [currentId, setCurrentId] = useState<string | null>(saved.current?.currentId ?? null);
  const [plan, setPlan] = useState<Assumptions>(() =>
    saved.current?.scenarios.find((s) => s.id === saved.current?.currentId)?.plan ?? newPlan('full-service-restaurant'));
  const [stage, setStage] = useState<Stage>('start');
  const [step, setStep] = useState(saved.current?.step ?? 0);
  const [savedStage, setSavedStage] = useState<'wizard' | 'plan'>(saved.current?.stage ?? 'wizard');
  const [tab, setTab] = useState<Tab>('overview');
  const [editSection, setEditSection] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [isExample, setIsExample] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const update: Update = useCallback((fn) => {
    setPlan((p) => { const next = structuredClone(p); fn(next); return next; });
    setIsExample(false);
  }, []);

  // Every edit lands in the open scenario; the whole library is kept in this browser.
  useEffect(() => {
    if (stage === 'start' || isExample || !currentId) return;
    setScenarios((list) => upsertPlan(list, currentId, plan.businessName, plan));
    setSavedStage(stage);
  }, [plan, stage, isExample, currentId]);
  useEffect(() => {
    if (scenarios.length) saveLibrary({ scenarios, currentId, stage: savedStage, step });
  }, [scenarios, currentId, savedStage, step]);
  const current = scenarios.find((s) => s.id === currentId);

  const addScenario = (name: string, p: Assumptions) => {
    const s = makeScenario(uniqueName(name, scenarios), p);
    setScenarios((list) => [...list, s]);
    setCurrentId(s.id);
    setPlan(s.plan);
    setIsExample(false);
    return s;
  };
  const openScenario = (id: string, to: Stage = 'plan') => {
    const s = scenarios.find((x) => x.id === id);
    if (!s) return;
    setCurrentId(id); setPlan(s.plan); setIsExample(false); go(to);
  };
  const duplicateCurrent = () => {
    if (!currentId) return;
    const res = duplicateScenario(upsertPlan(scenarios, currentId, plan.businessName, plan), currentId);
    if (!res) return;
    setScenarios(res.scenarios); setCurrentId(res.copy.id); setPlan(res.copy.plan);
    setToast(`Now editing "${res.copy.name}". Change something, then check Compare scenarios.`);
  };
  const deleteCurrent = () => {
    if (!currentId) return;
    const rest = removeScenario(scenarios, currentId);
    setScenarios(rest);
    if (rest.length) { setCurrentId(rest[0].id); setPlan(rest[0].plan); setToast(`Deleted. Now showing "${rest[0].name}".`); }
    else { setCurrentId(null); saveLibrary({ scenarios: [], currentId: null, stage: 'wizard', step: 0 }); go('start'); }
  };
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 3200); return () => clearTimeout(t); }, [toast]);

  // With a location, defaults and notes come from local data, so "Use default" means the local default.
  const template = useMemo(() => {
    if (plan.local) { try { return localizedTemplate(plan.local, plan); } catch { /* fall back below */ } }
    return getTemplate(plan.templateId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan.local, plan.templateId]);
  const { f, d } = useForecasts(plan);
  const labels = f.months.map((m) => m.label);
  const today = new Date().toISOString().slice(0, 10);

  const exportExcel = async () => {
    const bytes = workbookBytes(plan);
    const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const res = await downloadFile(`${safeFileName(plan.businessName)} 36-Month Forecast ${today}.xlsx`, blob);
    setToast(res === 'saved' ? 'Excel file saved' : 'Download cancelled');
  };
  const savePlanFile = async () => {
    const all = currentId ? upsertPlan(scenarios, currentId, plan.businessName, plan) : scenarios;
    const body = all.length > 1
      ? { app: 'Groundwork Forecaster', saved: today, scenarios: all, currentId }
      : { app: 'Groundwork Forecaster', saved: today, plan };
    const blob = new Blob([JSON.stringify(body, null, 2)], { type: 'application/json' });
    const what = all.length > 1 ? `${all.length} scenarios` : 'plan';
    const res = await downloadFile(`${safeFileName(plan.businessName)} ${all.length > 1 ? 'scenarios' : 'plan'} ${today}.json`, blob);
    setToast(res === 'saved' ? `File saved with your ${what}. Open it here any time to keep working.` : 'Download cancelled');
  };
  const openPlanFile = async (file: File) => {
    try {
      const parsed = parseAnyFile(await file.text());
      if ('library' in parsed) {
        const incoming = parsed.library.scenarios.map((s) => ({ ...s, name: uniqueName(s.name, scenarios) }));
        setScenarios((list) => [...list, ...incoming]);
        setCurrentId(incoming[0].id); setPlan(incoming[0].plan); setIsExample(false);
        setToast(`Opened ${incoming.length} scenarios`);
      } else {
        addScenario(parsed.plan.businessName, parsed.plan);
        setToast(`Opened ${parsed.plan.businessName}`);
      }
      setTab('overview'); go('plan');
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Could not open that file.');
    }
  };

  const go = (s: Stage) => { setStage(s); window.scrollTo({ top: 0 }); };

  return (
    <>
      <header className="topbar">
        <div className="wrap gutter topbar-inner">
          <button className="brand" type="button" onClick={() => go('start')}><Mark />Groundwork</button>
          <span className="plan-name">{stage !== 'start' && (isExample ? `${plan.businessName} · example` : `${current?.name ?? plan.businessName} · ${template.name}`)}</span>
          <div className="top-actions">
            {stage === 'plan' && <button className="btn btn-primary" type="button" onClick={exportExcel}>Download Excel</button>}
            {stage !== 'start' && !isExample && <button className="btn" type="button" onClick={savePlanFile}>Save to file</button>}
            {stage === 'start' && <button className="btn" type="button" onClick={() => fileInput.current?.click()}>Open a plan file</button>}
          </div>
          <input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={(e) => { const file = e.target.files?.[0]; if (file) openPlanFile(file); e.target.value = ''; }} />
        </div>
      </header>

      {stage === 'start' && (
        <StartScreen scenarios={scenarios}
          onOpen={(id) => openScenario(id, id === currentId ? savedStage : 'plan')}
          onBegin={(templateId, name, opening) => { addScenario(name, newPlan(templateId, { businessName: name, openingMonth: opening })); setStep(0); go('wizard'); }}
          onExample={(templateId) => { setPlan(newPlan(templateId, { businessName: `Example ${getTemplate(templateId).name.toLowerCase()}` })); setIsExample(true); setTab('overview'); go('plan'); }}
          onOpenFile={() => fileInput.current?.click()} />
      )}

      {stage === 'wizard' && (
        <main className="wrap gutter wizard">
          <nav className="rail" aria-label="Steps">
            {STEPS.map((s, i) => (
              <button key={s.id} type="button" className={i < step ? 'done' : undefined} aria-current={i === step ? 'step' : undefined} onClick={() => setStep(i)}>
                <span className="dot">{i < step ? '✓' : i + 1}</span>{s.title}
              </button>
            ))}
          </nav>
          <section className="step" key={step}>
            <div className="progress">
              <span className="eyebrow">Step {step + 1} of {STEPS.length}</span>
              <div className="progress-bar"><div style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} /></div>
            </div>
            <div className="step-head">
              <span className="eyebrow">Step {step + 1} of {STEPS.length}</span>
              <h1>{STEPS[step].title}</h1>
              <p>{STEPS[step].intro}</p>
            </div>
            {(() => { const E = STEPS[step].Editor; return <E plan={plan} update={update} template={template} />; })()}
            <div className="step-nav">
              <button className="btn" type="button" disabled={step === 0} onClick={() => { setStep(step - 1); window.scrollTo({ top: 0 }); }}>Back</button>
              {step < STEPS.length - 1
                ? <button className="btn btn-primary" type="button" onClick={() => { setStep(step + 1); window.scrollTo({ top: 0 }); }}>Next: {STEPS[step + 1].title}</button>
                : <button className="btn btn-primary" type="button" onClick={() => { setTab('overview'); go('plan'); }}>See my 36-month forecast</button>}
            </div>
          </section>
          <aside className="live" aria-label="Live estimate"><LivePanel f={f} d={d} labels={labels} onFinish={() => { setTab('overview'); go('plan'); }} /></aside>
          <div className="mobile-live gutter">
            <div><span className="muted">Break-even</span><strong>{f.cashBreakEvenMonth ? `Month ${f.cashBreakEvenMonth}` : 'Not yet'}</strong></div>
            <div><span className="muted">Lowest cash</span><strong>{money(f.lowestCash, { compact: true })}</strong></div>
            <div><span className="muted">Y2 DSCR</span><strong>{f.years[1].dscr?.toFixed(2) ?? 'n/a'}</strong></div>
          </div>
        </main>
      )}

      {stage === 'plan' && (
        <main className="wrap gutter plan">
          <div className="plan-head">
            <div style={{ display: 'grid', gap: 6, minWidth: 0 }}>
              <span className="eyebrow">{template.name} · opens {labels[0]}{isExample ? ' · example with industry defaults' : ''}</span>
              <h1>{plan.businessName}</h1>
            </div>
            <button className="btn" type="button" onClick={() => { setStep(0); go('wizard'); }}>Walk through the questions again</button>
          </div>
          {!isExample && current && (
            <ScenarioBar scenarios={scenarios} current={current}
              onSwitch={(id) => openScenario(id)}
              onRename={(name) => setScenarios((list) => renameScenario(list, current.id, name))}
              onDuplicate={duplicateCurrent}
              onDelete={deleteCurrent}
              onNew={() => go('start')}
              onCompare={() => setTab('compare')} />
          )}
          <div className="tabs" role="tablist">
            {TABS.map((t) => <button key={t.id} role="tab" type="button" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>{t.label}</button>)}
          </div>
          {tab === 'overview' && <><Overview plan={plan} f={f} d={d} labels={labels} /><LocalReality plan={plan} f={f} /></>}
          {tab === 'compare' && (isExample
            ? <div className="panel"><h3>Compare scenarios</h3><p className="muted">Save this example as a scenario first, then duplicate it to compare versions.</p></div>
            : <Compare scenarios={scenarios} currentId={currentId} onOpen={(id) => openScenario(id)} />)}
          {tab === 'pnl' && <MonthlyTable f={f} rows={pnlRows(plan)} title="Profit and loss" />}
          {tab === 'cash' && <MonthlyTable f={f} rows={cashRows} title="Cash flow" />}
          {tab === 'solver' && <Solver plan={plan} update={update} template={template} />}
          {tab === 'downside' && <Downside plan={plan} update={update} template={template} f={f} d={d} labels={labels} />}
          {tab === 'assumptions' && (
            <div className="plan" style={{ paddingBlock: 0 }}>
              <div className="kpis">
                <div className="kpi"><span className="eyebrow">Break-even</span><span className="value">{f.cashBreakEvenMonth ? `Month ${f.cashBreakEvenMonth}` : 'Not yet'}</span></div>
                <div className="kpi"><span className="eyebrow">Lowest cash</span><span className="value">{money(f.lowestCash, { compact: true })}</span></div>
                <div className="kpi"><span className="eyebrow">Year 2 DSCR</span><span className="value">{f.years[1].dscr?.toFixed(2) ?? 'n/a'}</span></div>
                <div className="kpi"><span className="eyebrow">Project cost</span><span className="value">{money(f.totalProjectCost, { compact: true })}</span></div>
              </div>
              <div className="chips" role="group" aria-label="Assumption sections">
                {STEPS.map((s, i) => <button key={s.id} type="button" aria-pressed={editSection === i} onClick={() => setEditSection(i)}>{s.title}</button>)}
              </div>
              <div className="step">
                <div className="step-head"><h2>{STEPS[editSection].title}</h2><p>{STEPS[editSection].intro} Changes update the forecast right away.</p></div>
                {(() => { const E = STEPS[editSection].Editor; return <E plan={plan} update={update} template={template} />; })()}
              </div>
            </div>
          )}
          {isExample && <div className="resume"><span>This is an example built only from industry defaults. Save it as a scenario to edit and compare it, or start your own plan.</span><button className="btn btn-primary btn-small" type="button" onClick={() => { addScenario(plan.businessName, plan); setToast('Saved as a scenario. Duplicate it to try changes side by side.'); }}>Save as a scenario</button><button className="btn btn-small" type="button" onClick={() => go('start')}>Start my own plan</button></div>}
        </main>
      )}

      <footer className="wrap gutter footer">
        Groundwork Forecaster. Planning estimates, not financial advice. Defaults are industry rules of thumb; replace them with your own quotes and numbers.
      </footer>
      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}

function LivePanel({ f, d, labels, onFinish }: { f: ReturnType<typeof useForecasts>['f']; d: ReturnType<typeof useForecasts>['d']; labels: string[]; onFinish: () => void }) {
  const dscr = f.years[1].dscr;
  return (
    <div className="panel">
      <span className="eyebrow">Live estimate</span>
      <div className="kv"><span>Project cost</span><strong>{money(f.totalProjectCost)}</strong></div>
      <div className="kv"><span>Loan payment</span><strong>{money(f.monthlyPayment)}/mo</strong></div>
      <div className="kv"><span>Year 1 revenue</span><strong>{money(f.years[0].revenue, { compact: true })}</strong></div>
      <div className="kv"><span>Break-even</span><strong>{f.cashBreakEvenMonth ? `Month ${f.cashBreakEvenMonth}` : 'Not yet'}</strong></div>
      <div className="kv"><span>Lowest cash</span><strong>{money(f.lowestCash, { compact: true })}</strong></div>
      <div className="kv"><span>Year 2 DSCR</span><span style={{ display: 'flex', gap: 6, alignItems: 'center' }}><Pill status={(dscr ?? 9) >= 1.25 ? 'ok' : (dscr ?? 9) >= 1 ? 'watch' : 'risk'} /><strong>{dscr?.toFixed(2) ?? 'n/a'}</strong></span></div>
      <div className="kv"><span>Downside low cash</span><span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>{d.lowestCash < 0 && <Pill status="risk">Short</Pill>}<strong>{money(d.lowestCash, { compact: true })}</strong></span></div>
      <span className="why">Updates as you answer. Opens {labels[0]}.</span>
      <button className="btn btn-small" type="button" onClick={onFinish}>Jump to the forecast</button>
    </div>
  );
}

function StartScreen(props: {
  scenarios: Scenario[];
  onOpen: (id: string) => void; onBegin: (templateId: string, name: string, opening: string) => void;
  onExample: (templateId: string) => void; onOpenFile: () => void;
}) {
  const [templateId, setTemplateId] = useState('full-service-restaurant');
  const [name, setName] = useState('');
  const [opening, setOpening] = useState(() => {
    const dt = new Date(); dt.setMonth(dt.getMonth() + 6);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
  });
  const t = getTemplate(templateId);
  return (
    <main className="wrap gutter start">
      <div className="start-hero">
        <span className="eyebrow">36-month forecast for new businesses</span>
        <h1>Know your numbers before you sign the lease.</h1>
        <p>Tell it where you're opening and what you'll sell. Wages, tipped wages, payroll taxes, rent, prices and seasonality come from public data for that area, and your space and hours set how many guests you can serve. You get a monthly P&L, cash flow, break-even month, lender coverage, a downside case, and a check against what restaurants nearby actually do.</p>
      </div>
      {props.scenarios.length > 0 && (
        <div className="panel">
          <div className="panel-head"><h3>Your scenarios</h3><span className="muted small">Saved in this browser</span></div>
          <div className="scenario-list">
            {props.scenarios.map((s) => (
              <div className="scenario-row" key={s.id}>
                <span><strong>{s.name}</strong> <span className="muted small">{getTemplate(s.plan.templateId).name} · changed {new Date(s.updated).toLocaleDateString()}</span></span>
                <button className="btn btn-small" type="button" onClick={() => props.onOpen(s.id)}>Open</button>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="type-grid">
        {TEMPLATES.map((x, i) => (
          <button key={x.id} type="button" className="type-card" aria-pressed={x.id === templateId} onClick={() => setTemplateId(x.id)}>
            {i === 0 && <span className="first">Most detailed</span>}
            <strong>{x.name}</strong>
            <span className="muted small">{x.tagline}</span>
          </button>
        ))}
      </div>
      <div className="start-form">
        <div className="field"><label htmlFor="start-name">Business name</label><div className="input-wrap"><input id="start-name" placeholder={t.defaults.businessName} value={name} onChange={(e) => setName(e.target.value)} /></div></div>
        <div className="field"><label htmlFor="start-open">Opening month</label><div className="input-wrap"><input id="start-open" type="month" value={opening} onChange={(e) => setOpening(e.target.value)} /></div></div>
        <button className="btn btn-primary" type="button" onClick={() => props.onBegin(templateId, name.trim() || t.defaults.businessName, opening || t.defaults.openingMonth)}>{props.scenarios.length ? 'Start a new scenario' : 'Start the questions'}</button>
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="btn" type="button" onClick={() => props.onExample(templateId)}>See an example {t.name.toLowerCase()} forecast</button>
        <span className="muted small">Built only from industry defaults, so you can see what you get first.</span>
      </div>
    </main>
  );
}

function ScenarioBar(props: {
  scenarios: Scenario[]; current: Scenario;
  onSwitch: (id: string) => void; onRename: (name: string) => void; onDuplicate: () => void;
  onDelete: () => void; onNew: () => void; onCompare: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  useEffect(() => setConfirming(false), [props.current.id]);
  return (
    <div className="scenario-bar">
      <div className="field">
        <label htmlFor="scn-pick">Scenario</label>
        <div className="input-wrap">
          <select id="scn-pick" value={props.current.id} onChange={(e) => props.onSwitch(e.target.value)}>
            {props.scenarios.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      </div>
      <div className="field">
        <label htmlFor="scn-name">Name</label>
        <div className="input-wrap"><input id="scn-name" value={props.current.name} onChange={(e) => props.onRename(e.target.value)} /></div>
      </div>
      <div className="scenario-actions">
        <button className="btn btn-primary btn-small" type="button" onClick={props.onDuplicate}>Duplicate</button>
        <button className="btn btn-small" type="button" onClick={props.onCompare}>Compare ({props.scenarios.length})</button>
        <button className="btn btn-small" type="button" onClick={props.onNew}>New</button>
        {confirming
          ? <span className="confirm-inline">Delete "{props.current.name}"? <button className="btn btn-small danger" type="button" onClick={props.onDelete}>Delete</button><button className="btn btn-ghost btn-small" type="button" onClick={() => setConfirming(false)}>Cancel</button></span>
          : <button className="btn btn-ghost btn-small" type="button" onClick={() => setConfirming(true)}>Delete</button>}
      </div>
    </div>
  );
}
