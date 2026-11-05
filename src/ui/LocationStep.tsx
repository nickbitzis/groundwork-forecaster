import { useMemo, useState } from 'react';
import { daypartUnitsPerWeek, hoursBetween } from '../engine/forecast';
import type { Assumptions, Daypart } from '../engine/types';
import { CONCEPTS, getConcept } from '../local/concepts';
import { curatedCitiesIn, getMetro, metroList, PACK_BUILT } from '../local/datapack';
import { countyAt, nearbyFood, searchAddress, type NearbySummary, type Place } from '../local/live';
import { defaultLocalInput, localize } from '../local/localize';
import type { LocalInput, MenuItem } from '../local/types';
import { NumberField, Segmented, Toggle } from './fields';
import { money as moneyWhole, uid } from './format';

/** Dollars with cents when there are any ($13.75, $19.29); whole dollars otherwise. */
const money = (n: number) => moneyWhole(n, { cents: Math.round(n * 100) % 100 !== 0 && Math.abs(n) < 1000 });
import type { StepProps, Update } from './steps';

const DENVER = '19740';

/** Rebuild the whole plan from the location inputs, keeping the name and opening month. */
export function applyLocal(update: Update) {
  update((d) => {
    if (!d.local) return;
    const L = localize(d.local, d);
    const keep = { businessName: d.businessName, openingMonth: d.openingMonth };
    Object.assign(d, L.plan, keep);
  });
}

export function LocationStep({ plan, update }: StepProps) {
  if (plan.templateId === 'service-shop' && !plan.local) {
    return <div className="panel"><p>Local market data covers restaurants, cafes, bars and food trucks for now. Salons and service shops use national defaults: go on to the next step.</p></div>;
  }
  const local: LocalInput = plan.local ?? defaultLocalInput('casual-american', DENVER);
  const setLocal = (fn: (l: LocalInput) => void) => update((d) => { if (!d.local) d.local = structuredClone(local); fn(d.local); });
  const metros = useMemo(() => metroList(), []);
  const metro = getMetro(local.cbsa);
  const concept = getConcept(local.conceptId);
  const preview = useMemo(() => { try { return localize(local, plan); } catch { return null; } }, [local, plan]);
  const cities = curatedCitiesIn(local.cbsa);
  const [applied, setApplied] = useState(!!plan.local);

  const apply = () => { if (!plan.local) update((d) => { d.local = structuredClone(local); }); applyLocal(update); setApplied(true); };
  const switchConcept = (id: string) => setLocal((l) => {
    const fresh = defaultLocalInput(id, l.cbsa);
    Object.assign(l, { ...fresh, cbsa: l.cbsa, countyFips: l.countyFips, city: l.city, inCityLimits: l.inCityLimits, address: l.address, lat: l.lat, lon: l.lon });
  });

  return (
    <>
      <AddressPanel local={local} setLocal={setLocal} metros={metros} />
      {cities.length > 0 && (
        <div className="panel">
          <Toggle label={`Inside ${cities[0][0]} city limits (city minimum wage ${money(cities[0][1].min_wage ?? 0)} applies)`}
            checked={local.inCityLimits !== false} onChange={(v) => setLocal((l) => { l.inCityLimits = v; })} />
        </div>
      )}

      <div className="panel">
        <div className="panel-head"><h3>What you sell</h3><span className="muted small">Sets the menu, cost of goods, space per seat and staffing style</span></div>
        {(['Sit-down', 'Counter service', 'Bar', 'Mobile'] as const).map((g) => (
          <div key={g} className="concept-group">
            <span className="eyebrow">{g}</span>
            <div className="type-grid">
              {CONCEPTS.filter((c) => c.group === g).map((c) => (
                <button key={c.id} type="button" className="type-card" aria-pressed={c.id === local.conceptId} onClick={() => c.id !== local.conceptId && switchConcept(c.id)}>
                  <strong>{c.name}</strong><span className="muted small">{c.tagline}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
        <div>
          <span className="eyebrow">Alcohol</span>
          <Segmented label="Alcohol" value={local.alcohol} onChange={(v) => setLocal((l) => { l.alcohol = v; })}
            options={[{ value: 'none', label: 'None' }, { value: 'beerWine', label: 'Beer and wine' }, { value: 'full', label: 'Full bar' }]} />
        </div>
      </div>

      {concept.id !== 'food-truck' && (
        <div className="panel">
          <div className="panel-head"><h3>The space</h3><span className="muted small">Square footage sets seats, rent, build-out and utilities</span></div>
          <div className="fields">
            <NumberField label="Total square feet" unit="#" value={local.sqft} min={0} onChange={(v) => setLocal((l) => { l.sqft = v; })} typical={concept.defaultSqft} why="Dining room, kitchen, bar, restrooms and storage together." />
            <NumberField label="Share that is dining room" unit="%" value={local.diningSharePct} min={0} max={100} onChange={(v) => setLocal((l) => { l.diningSharePct = v; })} typical={concept.diningSharePct} why={`About ${concept.sqftPerSeat} sq ft of dining room per seat for this concept.`} />
            <NumberField label="Seasonal patio seats" unit="#" value={local.patioSeats} min={0} onChange={(v) => setLocal((l) => { l.patioSeats = v; })} why="Extra seats in good weather; local temperatures shape the seasons." />
          </div>
          <div>
            <span className="eyebrow">Condition of the space</span>
            <Segmented label="Space condition" value={local.spaceType} onChange={(v) => setLocal((l) => { l.spaceType = v; })}
              options={[{ value: 'secondGen', label: 'Former restaurant' }, { value: 'shell', label: 'Empty shell' }]} />
            <p className="why">A former restaurant with a hood, grease trap and plumbing in place costs much less to build out.</p>
          </div>
        </div>
      )}

      <HoursPanel local={local} setLocal={setLocal} />
      <MenuPanel local={local} setLocal={setLocal} preview={preview?.plan} />

      {preview && (
        <div className="panel local-summary">
          <div className="panel-head"><h3>What the local data says</h3><span className="muted small">{metro?.title} · data pack built {PACK_BUILT}</span></div>
          <div className="kpis kpis-tight">
            <div className="kpi"><span className="eyebrow">Minimum wage</span><span className="value">{money(preview.ctx.minWage)}</span><span className="sub">tipped {money(preview.ctx.tippedWage)} · {preview.ctx.minWageWhere}</span></div>
            <div className="kpi"><span className="eyebrow">Payroll taxes and costs</span><span className="value">{preview.ctx.payrollBurdenPct}%</span><span className="sub">on top of wages</span></div>
            <div className="kpi"><span className="eyebrow">Rent</span><span className="value">{money(Math.round(preview.ctx.rentPerSqftYear * 100) / 100)}</span><span className="sub">per sq ft a year, plus {money(Math.round(preview.ctx.camPerSqftYear * 100) / 100)} NNN</span></div>
            <div className="kpi"><span className="eyebrow">Local price level</span><span className="value">{(preview.ctx.priceLevel * 100).toFixed(1)}</span><span className="sub">US average = 100 (BEA)</span></div>
            {concept.service === 'seated' && <div className="kpi"><span className="eyebrow">Seats</span><span className="value">{preview.seats}</span><span className="sub">from the space</span></div>}
            <div className="kpi"><span className="eyebrow">{concept.service === 'seated' ? 'Guests' : 'Orders'} per week</span><span className="value">{Math.round(daypartUnitsPerWeek(preview.plan.streams[0].volume)).toLocaleString()}</span><span className="sub">at steady state, before takeout</span></div>
          </div>
          <details>
            <summary>Where every number comes from</summary>
            <ul className="sources">{preview.sources.map((s, i) => <li key={i}><span className={`scope scope-${s.scope}`}>{s.scope}</span> {s.text}</li>)}</ul>
          </details>
          <div className="apply-row">
            <button className="btn btn-primary" type="button" onClick={apply}>{applied ? 'Re-apply local data' : 'Build my plan from this'}</button>
            <span className="why">{applied ? 'Re-applying resets the later steps to these local defaults. Your name and opening month stay.' : 'Fills every later step with local defaults. You can change any of them.'}</span>
          </div>
        </div>
      )}
      {local.lat != null && local.lon != null && <NearbyPanel lat={local.lat} lon={local.lon} conceptName={concept.name} />}
    </>
  );
}

function AddressPanel({ local, setLocal, metros }: { local: LocalInput; setLocal: (fn: (l: LocalInput) => void) => void; metros: { code: string; title: string }[] }) {
  const [q, setQ] = useState(local.address ?? '');
  const [results, setResults] = useState<Place[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [metroText, setMetroText] = useState(getMetro(local.cbsa)?.title ?? '');

  const find = async () => {
    setBusy(true); setErr(null);
    try { setResults(await searchAddress(q)); } catch { setErr('Could not reach the address search from here. Pick your metro below instead.'); }
    setBusy(false);
  };
  const pick = async (p: Place) => {
    setBusy(true); setErr(null);
    try {
      const c = await countyAt(p.lat, p.lon);
      if (!c?.cbsa || !getMetro(c.cbsa)) { setErr(`${c?.name ?? 'That place'} is outside a metro area we have data for. Pick the nearest metro below.`); setBusy(false); return; }
      setLocal((l) => { Object.assign(l, { address: p.label, lat: p.lat, lon: p.lon, city: p.city, cbsa: c.cbsa!, countyFips: c.fips }); });
      setMetroText(getMetro(c.cbsa)!.title);
      setResults(null);
    } catch { setErr('Found the address but not its county. Pick your metro below.'); }
    setBusy(false);
  };
  return (
    <div className="panel">
      <div className="panel-head"><h3>Where you're opening</h3><span className="muted small">Wages, taxes, rent and prices all come from here</span></div>
      <div className="search-row">
        <div className="input-wrap grow"><input aria-label="Address" placeholder="Street address, or a city and state" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && q.trim() && find()} /></div>
        <button className="btn" type="button" disabled={!q.trim() || busy} onClick={find}>{busy ? 'Looking...' : 'Find'}</button>
      </div>
      {results && (results.length ? (
        <div className="list">{results.map((p) => <button key={`${p.lat},${p.lon}`} type="button" className="result" onClick={() => pick(p)}>{p.label}</button>)}</div>
      ) : <span className="note">No matches. Try adding the city and state.</span>)}
      {local.address && <span className="note">Using {local.address}</span>}
      {err && <span className="note warn-text">{err}</span>}
      <div className="field">
        <label htmlFor="metro">Metro area</label>
        <div className="input-wrap">
          <input id="metro" list="metro-list" value={metroText} onChange={(e) => {
            setMetroText(e.target.value);
            const m = metros.find((x) => x.title === e.target.value);
            if (m) setLocal((l) => { l.cbsa = m.code; l.countyFips = undefined; l.address = undefined; l.lat = undefined; l.lon = undefined; l.city = undefined; });
          }} />
        </div>
        <datalist id="metro-list">{metros.map((m) => <option key={m.code} value={m.title} />)}</datalist>
        <span className="why">All {metros.length} US metro areas. An address also gives county-level numbers and nearby competitors.</span>
      </div>
    </div>
  );
}

function HoursPanel({ local, setLocal }: { local: LocalInput; setLocal: (fn: (l: LocalInput) => void) => void }) {
  const c = getConcept(local.conceptId);
  const seated = c.service === 'seated';
  const set = (i: number, fn: (p: Daypart) => void) => setLocal((l) => fn(l.dayparts[i]));
  const total = local.dayparts.reduce((s, p) => s + hoursBetween(p.start, p.end), 0);
  return (
    <div className="panel">
      <div className="panel-head"><h3>Hours and how busy</h3><span className="muted small">{total.toFixed(1)} hours a day across {local.dayparts.length} meal period{local.dayparts.length === 1 ? '' : 's'}</span></div>
      <div className="fields">
        <NumberField label="Days open per week" unit="days" min={1} max={7} value={local.daysOpenPerWeek} onChange={(v) => setLocal((l) => { l.daysOpenPerWeek = v; l.weekendDaysOpen = Math.min(l.weekendDaysOpen, 2, v); })} typical={c.daysOpenPerWeek} />
        <NumberField label="Of those, Friday and Saturday" unit="days" min={0} max={2} value={local.weekendDaysOpen} onChange={(v) => setLocal((l) => { l.weekendDaysOpen = v; })} why="Busier days, counted separately." />
      </div>
      <div className="list">
        {local.dayparts.map((p, i) => (
          <div className="row-card" key={p.id}>
            <div className="row-top">
              <div className="input-wrap"><input aria-label="Meal period" value={p.name} onChange={(e) => set(i, (x) => { x.name = e.target.value; })} /></div>
              {local.dayparts.length > 1 && <button className="icon-btn" type="button" onClick={() => setLocal((l) => { l.dayparts.splice(i, 1); })}>Remove</button>}
            </div>
            <div className="row-grid">
              <div className="field"><label>Opens</label><div className="input-wrap"><input type="time" value={p.start} onChange={(e) => set(i, (x) => { x.start = e.target.value; })} /></div></div>
              <div className="field"><label>Closes</label><div className="input-wrap"><input type="time" value={p.end} onChange={(e) => set(i, (x) => { x.end = e.target.value; })} /></div></div>
              {seated
                ? <NumberField label="Table turns when full" unit="x" value={p.turns} onChange={(v) => set(i, (x) => { x.turns = v; })} />
                : <NumberField label="Orders per hour when busy" unit="#" value={p.ordersPerHour} onChange={(v) => set(i, (x) => { x.ordersPerHour = v; })} />}
              <NumberField label={seated ? 'How full, weekdays' : 'How busy, weekdays'} unit="%" min={0} max={100} value={p.weekdayPct} onChange={(v) => set(i, (x) => { x.weekdayPct = v; })} />
              <NumberField label={seated ? 'How full, Fri and Sat' : 'How busy, Fri and Sat'} unit="%" min={0} max={100} value={p.weekendPct} onChange={(v) => set(i, (x) => { x.weekendPct = v; })} />
            </div>
          </div>
        ))}
      </div>
      <div><button className="btn btn-small" type="button" onClick={() => setLocal((l) => { l.dayparts.push({ id: uid(), name: 'Late night', start: '22:00', end: '00:00', turns: seated ? 0.5 : 0, ordersPerHour: seated ? 0 : 15, weekdayPct: 25, weekendPct: 55 }); })}>Add a meal period</button></div>
      <p className="why">{seated ? '"How full" is the share of seats in use on average through the period; a 100% full period seats every chair the number of turns shown.' : '"How busy" is the share of the busy-hour pace you average through the period.'} Defaults are typical for {c.name.toLowerCase()}; an address adds the hours nearby places keep.</p>
    </div>
  );
}

function MenuPanel({ local, setLocal, preview }: { local: LocalInput; setLocal: (fn: (l: LocalInput) => void) => void; preview?: Assumptions }) {
  const own = !!local.menu?.length;
  const suggested: MenuItem[] = (preview?.streams[0].items ?? []).map((it, i) => {
    const c = getConcept(local.conceptId).menu.find((m) => m.name === it.name);
    return { id: it.id || `s${i}`, name: it.name, kind: c?.kind ?? 'food', price: it.price, plateCost: c ? Math.round(it.price * c.costPct) / 100 : undefined, perTicket: it.perTicket };
  });
  const items = own ? local.menu! : suggested;
  const ticket = items.reduce((s, m) => s + m.price * m.perTicket, 0);
  const set = (i: number, fn: (m: MenuItem) => void) => setLocal((l) => fn(l.menu![i]));
  return (
    <div className="panel">
      <div className="panel-head">
        <h3>Menu and prices</h3>
        <Segmented label="Menu source" value={own ? 'own' : 'suggested'} onChange={(v) => setLocal((l) => { l.menu = v === 'own' ? structuredClone(suggested) : undefined; })}
          options={[{ value: 'suggested', label: 'Suggested for this area' }, { value: 'own', label: 'My own menu' }]} />
      </div>
      {!own && <p className="why">Typical {getConcept(local.conceptId).name.toLowerCase()} items, priced for the local price level. Switch to "My own menu" to enter your real prices and plate costs.</p>}
      <div className="menu-table scroll">
        <table>
          <thead><tr><th>Item</th><th>Food or drink</th><th>Price</th><th>Plate cost</th><th>Cost %</th><th>Per ticket</th>{own && <th />}</tr></thead>
          <tbody>
            {items.map((m, i) => (
              <tr key={m.id}>
                <td>{own ? <input aria-label="Item" value={m.name} onChange={(e) => set(i, (x) => { x.name = e.target.value; })} /> : m.name}</td>
                <td>{own ? <select aria-label="Food or drink" value={m.kind} onChange={(e) => set(i, (x) => { x.kind = e.target.value as 'food' | 'drink'; })}><option value="food">Food</option><option value="drink">Drink</option></select> : m.kind}</td>
                <td className="num">{own ? <input aria-label="Price" inputMode="decimal" value={m.price} onChange={(e) => set(i, (x) => { x.price = Number(e.target.value) || 0; })} /> : money(m.price)}</td>
                <td className="num">{own ? <input aria-label="Plate cost" inputMode="decimal" placeholder="optional" value={m.plateCost ?? ''} onChange={(e) => set(i, (x) => { x.plateCost = e.target.value === '' ? undefined : Number(e.target.value) || 0; })} /> : m.plateCost != null ? money(m.plateCost) : 'n/a'}</td>
                <td className="num">{m.plateCost != null && m.price > 0 ? `${Math.round((m.plateCost / m.price) * 100)}%` : 'avg'}</td>
                <td className="num">{own ? <input aria-label="Per ticket" inputMode="decimal" value={m.perTicket} onChange={(e) => set(i, (x) => { x.perTicket = Number(e.target.value) || 0; })} /> : m.perTicket}</td>
                {own && <td><button className="icon-btn" type="button" onClick={() => setLocal((l) => { l.menu!.splice(i, 1); })}>Remove</button></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {own && <div><button className="btn btn-small" type="button" onClick={() => setLocal((l) => { l.menu!.push({ id: uid(), name: 'New item', kind: 'food', price: 10, perTicket: 0.2 }); })}>Add an item</button></div>}
      <div className="computed"><span>Average {getConcept(local.conceptId).service === 'seated' ? 'check per guest' : 'ticket per order'}</span><strong>{money(ticket)}</strong>
        {preview && <span className="muted">cost of goods {preview.streams[0].cogsPct.toFixed(1)}%</span>}</div>
      <p className="why">"Per ticket" is how often an item is on a ticket: 1 = every ticket, 0.3 = about one in three. Items without a plate cost use the concept's average.</p>
    </div>
  );
}

function NearbyPanel({ lat, lon, conceptName }: { lat: number; lon: number; conceptName: string }) {
  const [s, setS] = useState<NearbySummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const look = async () => {
    setBusy(true); setErr(null);
    try { setS(await nearbyFood(lat, lon)); } catch { setErr('Could not reach OpenStreetMap from here. This works when the app runs from the file on your computer or a website.'); }
    setBusy(false);
  };
  return (
    <div className="panel">
      <div className="panel-head"><h3>Who is nearby</h3><span className="muted small">Live from OpenStreetMap, within half a mile</span></div>
      {!s && <div><button className="btn" type="button" disabled={busy} onClick={look}>{busy ? 'Looking... this can take up to a minute' : 'Look up nearby restaurants and their hours'}</button></div>}
      {err && <span className="note warn-text">{err}</span>}
      {s && (
        <>
          <div className="kpis kpis-tight">
            <div className="kpi"><span className="eyebrow">Food and drink places</span><span className="value">{s.places.length}</span><span className="sub">{Object.entries(s.byKind).map(([k, v]) => `${v} ${k.toLowerCase()}`).join(', ')}</span></div>
            {s.typicalOpen && <div className="kpi"><span className="eyebrow">Typical hours</span><span className="value">{s.typicalOpen} to {s.typicalClose}</span><span className="sub">most common among {s.withHours} that list hours</span></div>}
            {s.openMondayPct != null && <div className="kpi"><span className="eyebrow">Open Mondays</span><span className="value">{s.openMondayPct}%</span><span className="sub">of places that list hours</span></div>}
          </div>
          {s.topCuisines.length > 0 && <span className="why">Most common cuisines: {s.topCuisines.map(([c, n]) => `${c} (${n})`).join(', ')}. Compare with {conceptName.toLowerCase()} before you choose a menu.</span>}
          <details><summary>All {s.places.length} places</summary>
            <ul className="sources">{s.places.slice(0, 120).map((p, i) => <li key={i}><strong>{p.name}</strong> <span className="muted small">{p.kind}{p.cuisine ? `, ${p.cuisine}` : ''}{p.hours ? ` · ${p.hours}` : ''}</span></li>)}</ul>
          </details>
          <span className="note">OpenStreetMap is volunteer-mapped: counts are a floor, and hours may be out of date.</span>
        </>
      )}
    </div>
  );
}
