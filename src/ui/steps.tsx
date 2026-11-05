import { useMemo, useState, type ReactNode } from 'react';
import {
  amortizedPayment, rampFactor, runForecast, startupTotals, steadyUnitsPerMonth, streamTicket, unitsPerOpenDay,
} from '../engine/forecast';
import { TEMPLATES, getTemplate, type BusinessTemplate } from '../engine/templates';
import {
  SEASONALITY_COFFEE, SEASONALITY_OUTDOOR, SEASONALITY_SALON, SEASONALITY_US_DINING, volume as blankVolume,
} from '../engine/templates/common';
import type { Assumptions, PayType, StaffRole, VolumeMethod } from '../engine/types';
import { NumberField, SelectField, Segmented, TextField, Toggle } from './fields';
import { count, money, pct, uid } from './format';
import { LocationStep } from './LocationStep';

export type Update = (fn: (d: Assumptions) => void) => void;
export interface StepProps { plan: Assumptions; update: Update; template: BusinessTemplate }

export interface StepDef {
  id: string;
  title: string;
  intro: string;
  Editor: (p: StepProps) => ReactNode;
}

const typicalStream = (t: BusinessTemplate, id: string) => t.defaults.streams.find((s) => s.id === id);
const bm = (t: BusinessTemplate, key: string) => t.benchmarks[key];

function steadyMonthlyRevenue(plan: Assumptions): number {
  return plan.streams.reduce((s, x) => s + streamTicket(x) * steadyUnitsPerMonth(x.volume), 0);
}

/* ---------- Concept ---------- */
function ConceptStep({ plan, update, template }: StepProps) {
  const [pendingType, setPendingType] = useState<string | null>(null);
  return (
    <>
      <div className="panel">
        <div className="fields">
          <TextField label="Business name" value={plan.businessName} onChange={(v) => update((d) => { d.businessName = v; })} why="Shows on your forecast and the Excel file you send a lender." />
          <TextField label="Opening month" type="month" value={plan.openingMonth} onChange={(v) => update((d) => { if (v) d.openingMonth = v; })} why="Month 1 of the forecast. Seasonality lines up with the calendar from here." />
        </div>
      </div>
      <div className="panel">
        <div className="panel-head"><h3>Business type</h3><span className="muted small">Sets the industry defaults for every question</span></div>
        <div className="type-grid">
          {TEMPLATES.map((t) => (
            <button key={t.id} type="button" className="type-card" aria-pressed={t.id === plan.templateId} onClick={() => t.id !== plan.templateId && setPendingType(t.id)}>
              <strong>{t.name}</strong>
              <span className="muted small">{t.tagline}</span>
            </button>
          ))}
        </div>
        {pendingType && (
          <div className="confirm" role="alert">
            <span>Switch to {getTemplate(pendingType).name}? Every answer resets to that type's defaults. Your name and opening month stay.</span>
            <button className="btn btn-primary btn-small" type="button" onClick={() => { update((d) => { const fresh = structuredClone(getTemplate(pendingType).defaults); Object.assign(d, { ...fresh, businessName: d.businessName, openingMonth: d.openingMonth }); }); setPendingType(null); }}>Switch and reset</button>
            <button className="btn btn-small" type="button" onClick={() => setPendingType(null)}>Keep current</button>
          </div>
        )}
      </div>
      <div className="panel">
        <div className="panel-head">
          <h3>Revenue streams</h3>
          <span className="muted small">Each way you make money gets its own ticket, volume and cost of goods</span>
        </div>
        <div className="list">
          {plan.streams.map((s, i) => (
            <div className="row-card" key={s.id}>
              <div className="row-top">
                <div className="input-wrap"><input aria-label="Stream name" value={s.name} onChange={(e) => update((d) => { d.streams[i].name = e.target.value; })} /></div>
                {plan.streams.length > 1 && <button className="icon-btn" type="button" onClick={() => update((d) => { d.streams.splice(i, 1); })}>Remove</button>}
              </div>
              {s.note && <span className="note">{s.note}</span>}
            </div>
          ))}
        </div>
        <div>
          <button className="btn btn-small" type="button" onClick={() => update((d) => {
            d.streams.push({ id: uid(), name: 'New revenue stream', ticketMode: 'simple', avgTicket: 20, items: [], volume: blankVolume({ method: 'transactions', transactionsPerDay: 10, daysOpenPerWeek: 6 }), cogsPct: 30, channelFeePct: 0 });
          })}>Add a revenue stream</button>
        </div>
        <span className="why">{template.name} default: {template.defaults.streams.map((s) => s.name).join(' and ')}.</span>
      </div>
    </>
  );
}

/* ---------- Average ticket ---------- */
function TicketStep({ plan, update, template }: StepProps) {
  return (
    <>
      {plan.streams.map((s, i) => {
        const typical = typicalStream(template, s.id);
        const ticket = streamTicket(s);
        return (
          <div className="panel" key={s.id}>
            <div className="panel-head">
              <h3>{s.name}</h3>
              <Segmented label="How to set the ticket" value={s.ticketMode} onChange={(v) => update((d) => {
                const st = d.streams[i];
                if (v === 'buildup' && st.items.length === 0) st.items = [{ id: uid(), name: 'Main item', price: st.avgTicket, perTicket: 1 }];
                if (v === 'simple') st.avgTicket = Math.round(streamTicket(st) * 100) / 100;
                st.ticketMode = v;
              })} options={[{ value: 'buildup', label: 'Build it up' }, { value: 'simple', label: 'Type one number' }]} />
            </div>
            {s.ticketMode === 'simple' ? (
              <div className="fields">
                <NumberField label={`Average ${template.ticketWord}`} unit="$" value={s.avgTicket} onChange={(v) => update((d) => { d.streams[i].avgTicket = v; })}
                  why="Every revenue number is ticket times volume, so a small change here moves everything." typical={typical ? streamTicket(typical) : undefined} benchmark={bm(template, 'stream.ticket')} />
              </div>
            ) : (
              <>
                <p className="why">List what a typical {template.ticketWord.replace('per guest', '')} includes. "Per ticket" is how often it is bought: 1 means every time, 0.35 means about one in three.</p>
                <div className="list">
                  {s.items.map((it, j) => (
                    <div className="row-card" key={it.id}>
                      <div className="row-top">
                        <div className="input-wrap"><input aria-label="Item name" value={it.name} onChange={(e) => update((d) => { d.streams[i].items[j].name = e.target.value; })} /></div>
                        <button className="icon-btn" type="button" onClick={() => update((d) => { d.streams[i].items.splice(j, 1); })}>Remove</button>
                      </div>
                      <div className="row-grid">
                        <NumberField label="Price" unit="$" value={it.price} onChange={(v) => update((d) => { d.streams[i].items[j].price = v; })} />
                        <NumberField label="Per ticket" unit="x" value={it.perTicket} onChange={(v) => update((d) => { d.streams[i].items[j].perTicket = v; })} />
                        <div className="field"><span className="label">Adds</span><span className="num" style={{ paddingBlock: 8 }}>{money(it.price * it.perTicket, { cents: true })}</span></div>
                      </div>
                    </div>
                  ))}
                </div>
                <div><button className="btn btn-small" type="button" onClick={() => update((d) => { d.streams[i].items.push({ id: uid(), name: 'New item', price: 5, perTicket: 0.25 }); })}>Add an item</button></div>
              </>
            )}
            <div className="computed"><span>Average {template.ticketWord}</span><strong>{money(ticket, { cents: true })}</strong>
              {typical && <span className="muted small">default {money(streamTicket(typical), { cents: true })}</span>}</div>
          </div>
        );
      })}
    </>
  );
}

/* ---------- Volume ---------- */
const METHODS: { value: VolumeMethod; label: string }[] = [
  { value: 'seats', label: 'Seats x turns' },
  { value: 'transactions', label: 'Transactions per day' },
  { value: 'events', label: 'Events per week' },
  { value: 'traffic', label: 'Foot traffic x conversion' },
  { value: 'chairs', label: 'Chairs or stations' },
  { value: 'dayparts', label: 'Meal periods (set on the Location step)' },
];

function VolumeStep({ plan, update, template }: StepProps) {
  return (
    <>
      {plan.streams.map((s, i) => {
        const v = s.volume;
        const tv = typicalStream(template, s.id)?.volume;
        const t = <K extends keyof typeof v>(k: K) => (tv && tv.method === v.method ? (tv[k] as number) : undefined);
        const set = <K extends keyof typeof v>(k: K) => (val: (typeof v)[K]) => update((d) => { d.streams[i].volume[k] = val; });
        const perDay = unitsPerOpenDay(v);
        const perMonth = steadyUnitsPerMonth(v);
        return (
          <div className="panel" key={s.id}>
            <div className="panel-head"><h3>{s.name}</h3></div>
            <div className="fields">
              <SelectField label="How to count volume" value={v.method} options={METHODS} onChange={set('method')} why="Pick the way you naturally think about how busy you will be." />
              {v.method !== 'events' && (
                <NumberField label="Days open per week" unit="days" value={v.daysOpenPerWeek} min={0} max={7} onChange={set('daysOpenPerWeek')} typical={t('daysOpenPerWeek')} why="Closed days cost rent but earn nothing." />
              )}
              {v.method === 'seats' && <>
                <NumberField label="Seats" unit="#" value={v.seats} onChange={set('seats')} typical={t('seats')} benchmark={bm(template, 'volume.seats')} why="Your capacity ceiling on a full night." />
                <NumberField label="Turns per day" unit="x" value={v.turnsPerDay} onChange={set('turnsPerDay')} typical={t('turnsPerDay')} benchmark={bm(template, 'volume.turnsPerDay')} why="How many times each seat is filled across the whole day, all meal periods combined." />
              </>}
              {v.method === 'transactions' && (
                <NumberField label="Transactions per day" unit="#" value={v.transactionsPerDay} onChange={set('transactionsPerDay')} typical={t('transactionsPerDay')} benchmark={bm(template, 'volume.transactionsPerDay')} why="Orders on an average open day once you are established." />
              )}
              {v.method === 'events' && <>
                <NumberField label="Events per week" unit="#" value={v.eventsPerWeek} onChange={set('eventsPerWeek')} typical={t('eventsPerWeek')} benchmark={bm(template, 'volume.eventsPerWeek')} why="Average across the year; 0.5 means one every other week." />
                <NumberField label="Guests per event" unit="#" value={v.guestsPerEvent} onChange={set('guestsPerEvent')} typical={t('guestsPerEvent')} why="The ticket for this stream is then revenue per guest." />
              </>}
              {v.method === 'traffic' && <>
                <NumberField label="Visitors per day" unit="#" value={v.visitorsPerDay} onChange={set('visitorsPerDay')} typical={t('visitorsPerDay')} why="People who walk in or are already in for another service." />
                <NumberField label="Share who buy" unit="%" value={v.conversionPct} min={0} max={100} onChange={set('conversionPct')} typical={t('conversionPct')} benchmark={bm(template, 'volume.conversionPct')} why="Conversion turns traffic into sales." />
              </>}
              {v.method === 'dayparts' && <>
                {v.service !== 'counter' && <NumberField label="Seats" unit="#" value={v.seats} onChange={set('seats')} typical={t('seats')} benchmark={bm(template, 'volume.seats')} why="Your capacity ceiling on a full night." />}
                <NumberField label="Of the open days, Friday and Saturday" unit="days" min={0} max={2} value={v.weekendDaysOpen ?? 2} onChange={set('weekendDaysOpen')} typical={t('weekendDaysOpen')} />
                <div className="field wide">
                  <label>Meal periods</label>
                  <span className="why">{(v.dayparts ?? []).map((p) => `${p.name} ${p.start} to ${p.end}: ${v.service === 'counter' ? `${p.ordersPerHour} orders/hr` : `${p.turns} turns`}, ${p.weekdayPct}% weekdays, ${p.weekendPct}% Fri and Sat`).join(' · ')}. Change hours and how busy on the Location step, then re-apply.</span>
                </div>
              </>}
              {v.method === 'chairs' && <>
                <NumberField label="Chairs or stations" unit="#" value={v.chairs} onChange={set('chairs')} typical={t('chairs')} benchmark={bm(template, 'volume.chairs')} why="Each staffed chair is a small revenue engine." />
                <NumberField label="Services per chair per day" unit="x" value={v.servicesPerChairPerDay} onChange={set('servicesPerChairPerDay')} typical={t('servicesPerChairPerDay')} benchmark={bm(template, 'volume.servicesPerChairPerDay')} why="Already accounts for gaps in the book." />
              </>}
            </div>
            <div className="computed">
              <span>At steady state</span>
              {v.method === 'events'
                ? <strong>{count(perMonth)} {template.unitWord} a month</strong>
                : <><strong>{count(perDay, perDay < 10 ? 1 : 0)} a day</strong><span className="muted">{count(perMonth)} a month</span></>}
              <span className="muted">{money(perMonth * streamTicket(s))} in monthly sales</span>
            </div>
          </div>
        );
      })}
    </>
  );
}

/* ---------- Ramp ---------- */
function RampStep({ plan, update, template }: StepProps) {
  const d0 = template.defaults;
  const pts = Array.from({ length: 18 }, (_, m) => rampFactor(m, plan.ramp.startPct, plan.ramp.monthsToSteady, plan.ramp.curve));
  return (
    <>
      <div className="panel">
        <div className="fields">
          <NumberField label="Month 1 volume, as % of steady state" unit="%" min={0} max={100} value={plan.ramp.startPct} onChange={(v) => update((d) => { d.ramp.startPct = v; })} typical={d0.ramp.startPct} benchmark={bm(template, 'ramp.startPct')} why="New businesses rarely open at full speed; this is the biggest driver of early cash needs." />
          <NumberField label="Months to reach steady state" unit="mo" min={0} value={plan.ramp.monthsToSteady} onChange={(v) => update((d) => { d.ramp.monthsToSteady = v; })} typical={d0.ramp.monthsToSteady} benchmark={bm(template, 'ramp.monthsToSteady')} why="How long until you hit the volume you entered." />
          <SelectField label="Ramp shape" value={plan.ramp.curve} onChange={(v) => update((d) => { d.ramp.curve = v; })} options={[{ value: 'linear', label: 'Steady climb' }, { value: 'scurve', label: 'Slow start, then faster (S-curve)' }]} why="An S-curve is more cautious in the first months." />
        </div>
        <svg className="chart" viewBox="0 0 360 90" role="img" aria-label="Ramp-up curve over the first 18 months">
          <line x1="20" x2="356" y1="10" y2="10" stroke="var(--grid)" />
          <line x1="20" x2="356" y1="76" y2="76" stroke="var(--line)" />
          <text x="0" y="14" fontSize="9" fill="var(--muted)">100%</text>
          <text x="6" y="80" fontSize="9" fill="var(--muted)">0%</text>
          {pts.map((p, m) => (
            <rect key={m} x={22 + m * 18.6} y={76 - p * 66} width="13" height={p * 66} rx="2" fill="var(--accent)" opacity={p >= 1 ? 1 : 0.55} />
          ))}
          <text x="22" y="88" fontSize="9" fill="var(--muted)">Month 1</text>
          <text x="318" y="88" fontSize="9" fill="var(--muted)">Month 18</text>
        </svg>
      </div>
      <div className="panel">
        <h3>After the first year</h3>
        <div className="fields">
          <NumberField label="Yearly price increase" unit="%" value={plan.growth.annualPriceIncreasePct} onChange={(v) => update((d) => { d.growth.annualPriceIncreasePct = v; })} typical={d0.growth.annualPriceIncreasePct} benchmark={bm(template, 'growth.annualPriceIncreasePct')} why="Raises the ticket in years 2 and 3 to keep up with costs." />
          <NumberField label="Yearly volume growth" unit="%" value={plan.growth.annualVolumeGrowthPct} onChange={(v) => update((d) => { d.growth.annualVolumeGrowthPct = v; })} typical={d0.growth.annualVolumeGrowthPct} why="Word of mouth and regulars after you reach steady state. Keep it modest." />
        </div>
      </div>
    </>
  );
}

/* ---------- Seasonality ---------- */
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const PRESETS: { label: string; values: number[] }[] = [
  { label: 'Flat', values: Array(12).fill(1) },
  { label: 'Restaurant', values: SEASONALITY_US_DINING },
  { label: 'Outdoor and events', values: SEASONALITY_OUTDOOR },
  { label: 'Coffee', values: SEASONALITY_COFFEE },
  { label: 'Salon', values: SEASONALITY_SALON },
];

function SeasonStep({ plan, update, template }: StepProps) {
  const max = Math.max(...plan.seasonality, 1.3);
  return (
    <div className="panel">
      <div className="panel-head"><h3>Busy and slow months</h3>
        <div className="chips">{PRESETS.map((p) => (
          <button key={p.label} type="button" aria-pressed={p.values.every((v, i) => v === plan.seasonality[i])} onClick={() => update((d) => { d.seasonality = [...p.values]; })}>{p.label}</button>
        ))}</div>
      </div>
      {bm(template, 'season') && <div className="local-note">Local default: {bm(template, 'season')}. <button className="btn-ghost" type="button" onClick={() => update((d) => { d.seasonality = [...template.defaults.seasonality]; })}>Use it</button></div>}
      <p className="why">1.00 is an average month. 1.20 is 20% busier, 0.80 is 20% slower. The app evens these out so they shift sales between months without changing the yearly total.</p>
      <div className="season">
        {plan.seasonality.map((v, i) => (
          <div className="season-col" key={i}>
            <div className="season-bar" style={{ height: `${(v / max) * 90}px` }} />
            <input aria-label={`${MONTHS_SHORT[i]} seasonality`} inputMode="decimal" value={v} onChange={(e) => { const n = Number(e.target.value); if (e.target.value !== '' && Number.isFinite(n)) update((d) => { d.seasonality[i] = n; }); }} />
            <span className="small muted">{MONTHS_SHORT[i]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- COGS ---------- */
function CogsStep({ plan, update, template }: StepProps) {
  return (
    <>
      {plan.streams.map((s, i) => {
        const typ = typicalStream(template, s.id);
        return (
          <div className="panel" key={s.id}>
            <h3>{s.name}</h3>
            <div className="fields">
              <NumberField label="Cost of goods" unit="%" value={s.cogsPct} min={0} max={100} onChange={(v) => update((d) => { d.streams[i].cogsPct = v; })} typical={typ?.cogsPct} benchmark={bm(template, 'stream.cogsPct')} why="What the food, drinks or products cost you for each dollar sold." />
              <NumberField label="Channel or event fees" unit="%" value={s.channelFeePct} min={0} max={100} onChange={(v) => update((d) => { d.streams[i].channelFeePct = v; })} typical={typ?.channelFeePct} benchmark={bm(template, 'stream.channelFeePct')} why="Cuts taken by delivery apps, festivals or host venues before you see the money." />
            </div>
            <div className="computed"><span>You keep</span><strong>{money(streamTicket(s) * (1 - s.cogsPct / 100 - s.channelFeePct / 100), { cents: true })}</strong><span className="muted">of each {money(streamTicket(s), { cents: true })} ticket after goods and fees</span></div>
          </div>
        );
      })}
    </>
  );
}

/* ---------- Staffing ---------- */
const PAY: { value: PayType; label: string }[] = [
  { value: 'hourly', label: 'Hourly' }, { value: 'salary', label: 'Salary' }, { value: 'commission', label: 'Commission' },
];

function StaffStep({ plan, update, template }: StepProps) {
  const L = plan.labor;
  const d0 = template.defaults.labor;
  const f = useMemo(() => runForecast({ ...plan, ramp: { ...plan.ramp, startPct: 100, monthsToSteady: 0 }, seasonality: Array(12).fill(1) }), [plan]);
  const m = f.months[0];
  const setRole = (i: number, fn: (r: StaffRole) => void) => update((d) => fn(d.labor.roles[i]));
  return (
    <>
      <div className="panel">
        <div className="panel-head"><h3>Roles</h3><span className="muted small">Plan for a normal week at steady state</span></div>
        <div className="list">
          {L.roles.map((r, i) => (
            <div className="row-card" key={r.id}>
              <div className="row-top">
                <div className="input-wrap"><input aria-label="Role title" value={r.title} onChange={(e) => setRole(i, (x) => { x.title = e.target.value; })} /></div>
                <button className="icon-btn" type="button" onClick={() => update((d) => { d.labor.roles.splice(i, 1); })}>Remove</button>
              </div>
              <div className="row-grid">
                <SelectField label="Pay" value={r.payType} options={PAY} onChange={(v) => setRole(i, (x) => { x.payType = v; })} />
                {r.payType !== 'commission' && <NumberField label="People" unit="#" value={r.count} onChange={(v) => setRole(i, (x) => { x.count = v; })} />}
                {r.payType === 'hourly' && <>
                  <NumberField label="Hourly wage" unit="$" value={r.hourlyWage} onChange={(v) => setRole(i, (x) => { x.hourlyWage = v; })} />
                  <NumberField label="Hours a week, each" unit="hrs" value={r.hoursPerWeek} onChange={(v) => setRole(i, (x) => { x.hoursPerWeek = v; })} />
                </>}
                {r.payType === 'salary' && <NumberField label="Yearly salary, each" unit="$" value={r.annualSalary} onChange={(v) => setRole(i, (x) => { x.annualSalary = v; })} />}
                {r.payType === 'commission' && <>
                  <NumberField label="Commission" unit="%" value={r.commissionPct} onChange={(v) => setRole(i, (x) => { x.commissionPct = v; })} />
                  <SelectField label="Paid on" value={r.commissionStreamId ?? ''} onChange={(v) => setRole(i, (x) => { x.commissionStreamId = v || null; })}
                    options={[{ value: '', label: 'All sales' }, ...plan.streams.map((s) => ({ value: s.id, label: s.name }))]} />
                </>}
              </div>
              {r.payType === 'hourly' && <Toggle label="Hours flex with how busy it is (fewer while ramping up or in slow months)" checked={r.flexWithVolume} onChange={(v) => setRole(i, (x) => { x.flexWithVolume = v; })} />}
              <span className="note">{money(m.laborByRole[r.id] ?? 0)} a month with burden{r.note ? `. ${r.note}` : ''}{bm(template, `role.${r.id}`) ? `. Wage: ${bm(template, `role.${r.id}`)}` : ''}</span>
            </div>
          ))}
        </div>
        <div><button className="btn btn-small" type="button" onClick={() => update((d) => { d.labor.roles.push({ id: uid(), title: 'New role', count: 1, payType: 'hourly', hourlyWage: 16, hoursPerWeek: 30, annualSalary: 0, commissionPct: 0, commissionStreamId: null, flexWithVolume: true }); })}>Add a role</button></div>
        <div className="computed"><span>Labor at steady state</span><strong>{money(m.labor)} a month</strong><span className="muted">{pct(m.labor / m.revenue)} of sales</span><span className="muted small">{bm(template, 'labor.total')}</span></div>
      </div>
      <div className="panel">
        <h3>Payroll costs and rules</h3>
        <div className="fields">
          <NumberField label="Payroll burden" unit="%" value={L.payrollBurdenPct} onChange={(v) => update((d) => { d.labor.payrollBurdenPct = v; })} typical={d0.payrollBurdenPct} benchmark={bm(template, 'labor.payrollBurdenPct')} why="Added on top of every wage. Easy to forget and adds up fast." />
          <NumberField label="Minimum staffing when slow" unit="%" min={0} max={100} value={L.minFlexPct} onChange={(v) => update((d) => { d.labor.minFlexPct = v; })} typical={d0.minFlexPct} why="Flexed roles never drop below this share of planned hours. You still need a crew to open the doors." />
          <NumberField label="Yearly wage increase" unit="%" value={L.annualWageIncreasePct} onChange={(v) => update((d) => { d.labor.annualWageIncreasePct = v; })} typical={d0.annualWageIncreasePct} benchmark={bm(template, 'labor.annualWageIncreasePct')} why="Raises in years 2 and 3. Commission grows with sales instead." />
        </div>
      </div>
    </>
  );
}

/* ---------- Occupancy ---------- */
function RentStep({ plan, update, template }: StepProps) {
  const o = plan.occupancy;
  const d0 = template.defaults.occupancy;
  const rev = steadyMonthlyRevenue(plan);
  const total = o.baseRent + o.otherOccupancy;
  return (
    <div className="panel">
      <div className="fields">
        <NumberField label={`${o.rentLabel}, per month`} unit="$" value={o.baseRent} onChange={(v) => update((d) => { d.occupancy.baseRent = v; })} typical={d0.baseRent} benchmark={bm(template, 'occupancy.baseRent')} why="Fixed every month whether you are busy or not, so it sets your break-even." />
        <NumberField label={`${o.otherLabel}, per month`} unit="$" value={o.otherOccupancy} onChange={(v) => update((d) => { d.occupancy.otherOccupancy = v; })} typical={d0.otherOccupancy} why="Often left out of the asking rent but paid every month all the same." />
        <NumberField label="Yearly increase" unit="%" value={o.annualEscalationPct} onChange={(v) => update((d) => { d.occupancy.annualEscalationPct = v; })} typical={d0.annualEscalationPct} benchmark={bm(template, 'occupancy.annualEscalationPct')} why="Built into most leases." />
        <NumberField label="Free rent months at the start" unit="mo" min={0} value={o.freeRentMonths} onChange={(v) => update((d) => { d.occupancy.freeRentMonths = v; })} typical={d0.freeRentMonths} why="Landlords often give a few months free on a new lease; it helps most while sales ramp." />
      </div>
      <div className="computed"><span>Occupancy at steady state</span><strong>{money(total)} a month</strong><span className="muted">{pct(rev > 0 ? total / rev : 0)} of sales</span><span className="muted small">{bm(template, 'occupancy.total')}</span></div>
    </div>
  );
}

/* ---------- Other expenses ---------- */
function OpexStep({ plan, update, template }: StepProps) {
  const rev = steadyMonthlyRevenue(plan);
  const total = plan.opex.lines.reduce((s, l) => s + (l.kind === 'fixed' ? l.amount : rev * l.amount / 100), 0);
  return (
    <div className="panel">
      <p className="why">Fixed lines are dollars a month. Percent lines move with sales.</p>
      <div className="list">
        {plan.opex.lines.map((l, i) => (
          <div className="row-card" key={l.id}>
            <div className="row-top">
              <div className="input-wrap"><input aria-label="Expense name" value={l.name} onChange={(e) => update((d) => { d.opex.lines[i].name = e.target.value; })} /></div>
              <button className="icon-btn" type="button" onClick={() => update((d) => { d.opex.lines.splice(i, 1); })}>Remove</button>
            </div>
            <div className="row-grid">
              <SelectField label="Type" value={l.kind} onChange={(v) => update((d) => { d.opex.lines[i].kind = v; })} options={[{ value: 'fixed', label: '$ per month' }, { value: 'pctRevenue', label: '% of sales' }]} />
              <NumberField label="Amount" unit={l.kind === 'fixed' ? '$' : '%'} value={l.amount} onChange={(v) => update((d) => { d.opex.lines[i].amount = v; })} />
              <div className="field"><span className="label">At steady state</span><span className="num" style={{ paddingBlock: 8 }}>{money(l.kind === 'fixed' ? l.amount : rev * l.amount / 100)}/mo</span></div>
            </div>
            {l.note && <span className="note">{l.note}</span>}
          </div>
        ))}
      </div>
      <div><button className="btn btn-small" type="button" onClick={() => update((d) => { d.opex.lines.push({ id: uid(), name: 'New expense', kind: 'fixed', amount: 100 }); })}>Add an expense</button></div>
      <div className="fields">
        <NumberField label="Yearly increase on fixed lines" unit="%" value={plan.opex.annualInflationPct} onChange={(v) => update((d) => { d.opex.annualInflationPct = v; })} typical={template.defaults.opex.annualInflationPct} benchmark={bm(template, 'opex.annualInflationPct')} why="Insurance, software and utilities creep up every year." />
      </div>
      <div className="computed"><span>Other expenses at steady state</span><strong>{money(total)} a month</strong><span className="muted">{pct(rev > 0 ? total / rev : 0)} of sales</span></div>
    </div>
  );
}

/* ---------- Startup budget ---------- */
function StartupStep({ plan, update, template }: StepProps) {
  const st = startupTotals(plan);
  return (
    <div className="panel">
      <p className="why">Everything you spend before the doors open, plus cash in the bank for the first slow months. The total is the project cost, and the forecast assumes all of it is borrowed, which is the conservative case for loan payments.</p>
      <div className="list">
        {plan.startup.lines.map((l, i) => (
          <div className="row-card" key={l.id}>
            <div className="row-top">
              <div className="input-wrap"><input aria-label="Startup item" value={l.name} onChange={(e) => update((d) => { d.startup.lines[i].name = e.target.value; })} /></div>
              <button className="icon-btn" type="button" onClick={() => update((d) => { d.startup.lines.splice(i, 1); })}>Remove</button>
            </div>
            <div className="row-grid">
              <NumberField label="Amount" unit="$" value={l.amount} onChange={(v) => update((d) => { d.startup.lines[i].amount = v; })} />
              {!l.isWorkingCapital && <NumberField label="Depreciate over" unit="yrs" value={l.depreciationYears} onChange={(v) => update((d) => { d.startup.lines[i].depreciationYears = v; })} />}
            </div>
            <Toggle label="This is cash kept in the bank at opening" checked={!!l.isWorkingCapital} onChange={(v) => update((d) => { d.startup.lines[i].isWorkingCapital = v; if (v) d.startup.lines[i].depreciationYears = 0; })} />
            {l.note && <span className="note">{l.note}</span>}
          </div>
        ))}
      </div>
      <div><button className="btn btn-small" type="button" onClick={() => update((d) => { d.startup.lines.push({ id: uid(), name: 'New item', amount: 1000, depreciationYears: 0 }); })}>Add an item</button></div>
      <div className="fields">
        <NumberField label="Contingency" unit="%" value={plan.startup.contingencyPct} onChange={(v) => update((d) => { d.startup.contingencyPct = v; })} typical={template.defaults.startup.contingencyPct} benchmark={bm(template, 'startup.contingencyPct')} why="Added to every line except cash on hand. Build-outs almost always run over." />
      </div>
      <div className="computed">
        <span>Total project cost</span><strong>{money(st.totalProjectCost)}</strong>
        <span className="muted">includes {money(st.contingency)} contingency and {money(st.workingCapital)} cash on hand</span>
      </div>
    </div>
  );
}

/* ---------- Financing ---------- */
function FinanceStep({ plan, update, template }: StepProps) {
  const fi = plan.financing;
  const d0 = template.defaults.financing;
  const st = startupTotals(plan);
  const pay = amortizedPayment(st.totalProjectCost, fi.interestRatePct, Math.round(fi.termYears * 12) - fi.interestOnlyMonths);
  return (
    <div className="panel">
      <div className="fields">
        <NumberField label="Interest rate" unit="%" value={fi.interestRatePct} onChange={(v) => update((d) => { d.financing.interestRatePct = v; })} typical={d0.interestRatePct} benchmark={bm(template, 'financing.interestRatePct')} why="Sets how much of each payment is cost rather than paying down the loan." />
        <NumberField label="Loan term" unit="yrs" min={1} value={fi.termYears} onChange={(v) => update((d) => { d.financing.termYears = v; })} typical={d0.termYears} benchmark={bm(template, 'financing.termYears')} why="Longer terms mean smaller payments and an easier first year." />
        <NumberField label="Interest-only months" unit="mo" min={0} value={fi.interestOnlyMonths} onChange={(v) => update((d) => { d.financing.interestOnlyMonths = v; })} typical={d0.interestOnlyMonths} why="Some lenders let you pay only interest while you ramp up." />
        <NumberField label="Owner draw per month" unit="$" min={0} value={plan.owner.monthlyDraw} onChange={(v) => update((d) => { d.owner.monthlyDraw = v; })} typical={template.defaults.owner.monthlyDraw} why="What you plan to take home beyond any salary listed in staffing. Comes out of cash, not profit." />
      </div>
      <div className="computed">
        <span>Loan on the full project cost of {money(st.totalProjectCost)}</span>
        <strong>{money(pay)} a month</strong>
        {fi.interestOnlyMonths > 0 && <span className="muted">after {fi.interestOnlyMonths} interest-only months at {money(st.totalProjectCost * fi.interestRatePct / 1200)}</span>}
      </div>
    </div>
  );
}

export const STEPS: StepDef[] = [
  { id: 'location', title: 'Location and concept', intro: 'Where you are opening, what you sell, the space and your hours. Local wages, taxes, rent and prices come from public data for that area; every later step starts from them.', Editor: LocationStep },
  { id: 'concept', title: 'Concept', intro: 'Name the business, pick the closest type and list the ways it makes money. Every later question starts from industry defaults for the type you pick.', Editor: ConceptStep },
  { id: 'ticket', title: 'Average ticket', intro: 'How much a typical customer spends per visit. Building it up from items and prices makes the number easier to defend to a lender.', Editor: TicketStep },
  { id: 'volume', title: 'Volume', intro: 'How many customers you serve on a normal day once you are established. Ticket times volume is your revenue.', Editor: VolumeStep },
  { id: 'ramp', title: 'Ramp-up', intro: 'How fast you get from opening day to that normal level, and how prices and volume grow after.', Editor: RampStep },
  { id: 'season', title: 'Seasonality', intro: 'Which months run busy or slow. This decides when cash gets tight, even if the yearly total looks fine.', Editor: SeasonStep },
  { id: 'cogs', title: 'Cost of goods', intro: 'What you pay for what you sell, and any fees taken off the top.', Editor: CogsStep },
  { id: 'staff', title: 'Staffing', intro: 'Who you need on payroll. Labor is usually the biggest cost you control.', Editor: StaffStep },
  { id: 'rent', title: 'Rent', intro: 'Rent and the charges that come with it. Fixed costs like these set how much you must sell to break even.', Editor: RentStep },
  { id: 'opex', title: 'Other expenses', intro: 'Utilities, card fees, marketing, insurance and the rest of the monthly bills.', Editor: OpexStep },
  { id: 'startup', title: 'Startup budget', intro: 'What it costs to open the doors. This is the capital you need to raise.', Editor: StartupStep },
  { id: 'finance', title: 'Financing', intro: 'Loan terms on the full project cost, and what you plan to take home.', Editor: FinanceStep },
];

