// Turn "a steakhouse, 5,000 sq ft, in Denver, open these hours" into a full plan whose defaults
// come from local market data, with a note on every number saying where it came from.

import { daypartUnitsPerWeek, hoursBetween } from '../engine/forecast';
import { getTemplate, type BusinessTemplate } from '../engine/templates';
import { DEFAULT_DOWNSIDE } from '../engine/templates/common';
import type { Assumptions, Daypart, ExpenseLine, RevenueStream, StaffRole, StartupLine, VolumeInputs } from '../engine/types';
import { getConcept, type Concept } from './concepts';
import {
  curatedCitiesIn, curatedState, getCounty, getMetro, metroState, NATIONAL, SOURCES, type CuratedCity, type Metro, type Wage,
} from './datapack';
import type { LocalInput, MenuItem, Provenance } from './types';

// National fallbacks, used only when the local or state number is missing (labeled as such).
export const FALLBACK = {
  federalMinWage: 7.25,
  federalTippedWage: 2.13,
  ficaPct: 7.65,
  futaPct: 0.6,
  futaBase: 7000,
  sutaPct: 3.0,
  sutaBase: 12000,
  workersCompPer100: 1.06,
  benefitsPct: 5,
  nationalRetailRentNnn: 24,
  camShareOfRent: 0.3,
};

const oews = SOURCES.oews2025?.name ?? 'BLS wages';
const rppSrc = SOURCES.rpp2024?.name ?? 'BEA price parities';
const ecSrc = SOURCES.ec2022?.name ?? 'Census Economic Census';

export interface LocalContext {
  metro: Metro;
  state: string;
  city?: [string, CuratedCity];
  concept: Concept;
  /** Price level vs. the US (1.00 = national average). */
  priceLevel: number;
  minWage: number;
  tippedWage: number;
  minWageWhere: string;
  payrollBurdenPct: number;
  burdenParts: { label: string; pct: number; where: string }[];
  rentPerSqftYear: number;
  rentWhere: string;
  camPerSqftYear: number;
  buildoutPerSqft: number;
  buildoutWhere: string;
  liquorLicense: number;
  liquorWhere: string;
  foodLicense: number;
}

export interface Localized {
  plan: Assumptions;
  notes: Record<string, string>;
  sources: Provenance[];
  ctx: LocalContext;
  seats: number;
}

export function defaultLocalInput(conceptId: string, cbsa: string): LocalInput {
  const c = getConcept(conceptId);
  return {
    conceptId, cbsa, sqft: c.defaultSqft, spaceType: 'secondGen', diningSharePct: c.diningSharePct, patioSeats: 0,
    daysOpenPerWeek: c.daysOpenPerWeek, weekendDaysOpen: Math.min(2, c.daysOpenPerWeek),
    dayparts: c.dayparts.map((d, i) => ({ id: `dp${i}`, ...d })),
    alcohol: c.menu.some((m) => m.alcohol === 'spirits') ? 'full' : c.menu.some((m) => m.alcohol) ? 'beerWine' : 'none',
    inCityLimits: true,
  };
}

const r2 = (x: number) => Math.round(x * 100) / 100;
const r0 = (x: number) => Math.round(x);
const roundTo = (x: number, step: number) => Math.round(x / step) * step;
const money = (x: number) => `$${x.toLocaleString('en-US', { maximumFractionDigits: x < 100 ? 2 : 0 })}`;

export function context(input: LocalInput): LocalContext {
  const metro = getMetro(input.cbsa);
  if (!metro) throw new Error(`No data for metro ${input.cbsa}`);
  const concept = getConcept(input.conceptId);
  const state = metroState(metro);
  const cs = curatedState(state);
  const cities = curatedCitiesIn(input.cbsa);
  const cityMatch = input.city ? cities.find(([n]) => n.toLowerCase().startsWith(input.city!.toLowerCase())) : undefined;
  const city = cityMatch ?? (input.inCityLimits !== false ? cities[0] : undefined);
  const priceLevel = (metro.rpp?.all ?? 100) / 100;

  // Minimum wage: the city's own if it sets one and you're inside it, else the state's, else federal.
  let minWage = FALLBACK.federalMinWage, tippedWage = FALLBACK.federalTippedWage, minWageWhere = 'federal minimum (no state data)';
  if (cs?.min_wage) { minWage = cs.min_wage; tippedWage = cs.tipped_cash_wage ?? FALLBACK.federalTippedWage; minWageWhere = `${state} state minimum, 2026`; }
  if (city && input.inCityLimits !== false && city[1].min_wage && city[1].min_wage > minWage) {
    minWage = city[1].min_wage; tippedWage = city[1].tipped_cash_wage ?? tippedWage; minWageWhere = `${city[0]} city minimum, 2026`;
  }

  // Payroll burden from its parts.
  const avgAnnualWage = (metro.wages?.cook?.median ?? 18) * 1500; // a part-time-heavy restaurant worker
  const sutaPct = cs?.suta_new_employer_rate_pct ?? FALLBACK.sutaPct;
  const sutaBase = cs?.suta_wage_base ?? FALLBACK.sutaBase;
  const wc = cs?.workers_comp_per_100 ?? FALLBACK.workersCompPer100;
  const burdenParts = [
    { label: 'Social Security and Medicare', pct: FALLBACK.ficaPct, where: 'federal' },
    { label: 'Federal unemployment', pct: r2(FALLBACK.futaPct * Math.min(1, FALLBACK.futaBase / avgAnnualWage)), where: 'federal, first $7,000 per worker' },
    { label: 'State unemployment (new employer rate)', pct: r2(sutaPct * Math.min(1, sutaBase / avgAnnualWage)), where: cs?.suta_new_employer_rate_pct ? `${state}, on the first ${money(sutaBase)} per worker` : 'national estimate' },
    { label: 'Workers comp (restaurant class)', pct: r2(wc), where: cs?.workers_comp_per_100 ? `${state} estimate` : 'national estimate' },
    { label: 'Paid sick leave, staff meals, modest benefits', pct: FALLBACK.benefitsPct, where: 'estimate; raise it if you offer health insurance' },
  ];
  const payrollBurdenPct = r2(burdenParts.reduce((s, p) => s + p.pct, 0));

  // Rent: the city's restaurant-space range or average retail rent; else scaled from the national average.
  let rentPerSqftYear: number, rentWhere: string;
  const cc = city?.[1];
  if (cc?.restaurant_rent_range) { rentPerSqftYear = (cc.restaurant_rent_range[0] + cc.restaurant_rent_range[1]) / 2; rentWhere = `${city![0]} restaurant space, broker reports`; }
  else if (cc?.retail_rent_nnn) { rentPerSqftYear = cc.retail_rent_nnn; rentWhere = `${city![0]} average retail asking rent, broker reports`; }
  else {
    rentPerSqftYear = FALLBACK.nationalRetailRentNnn * Math.sqrt((metro.rpp?.housing ?? 100) / 100);
    rentWhere = 'estimate: US average retail rent scaled by local housing costs (BEA)';
  }
  const camPerSqftYear = cc?.cam_nnn ?? rentPerSqftYear * FALLBACK.camShareOfRent;

  // Build-out: local range if published, else the concept's national cost x local price level.
  // Concept costs are for an empty shell; a former restaurant needs roughly 40% of that.
  const spaceFactor = input.spaceType === 'shell' ? 1 : 0.4;
  const spaceWord = input.spaceType === 'shell' ? 'empty shell' : 'former restaurant space (about 40% of a shell build-out)';
  let buildoutPerSqft = concept.buildoutPerSqft * priceLevel * spaceFactor;
  let buildoutWhere = `${concept.name} national typical x local price level (BEA), ${spaceWord}`;
  if (cc?.buildout_per_sqft && concept.buildoutPerSqft > 0) {
    const [lo, hi] = cc.buildout_per_sqft;
    // Scale the local range by how fancy the concept is relative to a casual restaurant.
    buildoutPerSqft = ((lo + hi) / 2) * (concept.buildoutPerSqft / 250) * spaceFactor;
    buildoutWhere = `${city![0]} build-out range, adjusted for ${concept.name.toLowerCase()}, ${spaceWord}`;
  }

  // Licenses.
  let liquorLicense = 0, liquorWhere = 'no alcohol';
  const lq = cs?.liquor;
  if (input.alcohol === 'full' && lq) {
    liquorLicense = lq.quota_state && lq.secondary_market_price ? lq.secondary_market_price : (lq.full_state_fee ?? 0) + (lq.full_local_fee ?? 0);
    liquorWhere = `${state} ${lq.full_license_name ?? 'full liquor license'}${lq.quota_state ? ' (quota state: bought on the secondary market)' : ''}`;
  } else if (input.alcohol === 'beerWine' && lq) {
    liquorLicense = lq.beer_wine_fee ?? 0;
    liquorWhere = `${state} ${lq.beer_wine_name ?? 'beer and wine license'}`;
  } else if (input.alcohol !== 'none') {
    liquorLicense = input.alcohol === 'full' ? 15000 : 3000;
    liquorWhere = 'estimate (no state data yet)';
  }
  const foodLicense = cc?.food_license_fee ?? 1500;

  return { metro, state, city, concept, priceLevel, minWage, tippedWage, minWageWhere, payrollBurdenPct, burdenParts,
    rentPerSqftYear, rentWhere, camPerSqftYear, buildoutPerSqft, buildoutWhere, liquorLicense, liquorWhere, foodLicense };
}

/** Local hourly wage for an occupation: never below the local minimum. */
function wage(ctx: LocalContext, occ: string, level: 'p25' | 'median'): { rate: number; where: string } {
  const w: Wage | undefined = ctx.metro.wages?.[occ];
  const v = w ? (level === 'p25' ? w.p25 ?? w.median : w.median) : null;
  if (v == null) return { rate: Math.max(ctx.minWage, 16), where: 'estimate (no local data for this job)' };
  const rate = Math.max(ctx.minWage, v);
  const lvl = level === 'p25' ? 'entry level (25th percentile)' : 'median';
  return { rate: r2(rate), where: rate > v ? `${ctx.minWageWhere} (local ${lvl} is lower)` : `${shortMetro(ctx.metro)} ${lvl}, ${oews}` };
}

function shortMetro(m: Metro): string {
  return m.title.split(',')[0].split('-')[0] + ' metro';
}

function seatsFor(input: LocalInput, c: Concept): number {
  if (c.sqftPerSeat <= 0 || input.sqft <= 0) return 0;
  return r0((input.sqft * (input.diningSharePct / 100)) / c.sqftPerSeat);
}

function menuFor(input: LocalInput, ctx: LocalContext): MenuItem[] {
  if (input.menu?.length) return input.menu;
  return ctx.concept.menu
    .filter((m) => !m.alcohol || input.alcohol === 'full' || (input.alcohol === 'beerWine' && m.alcohol === 'beerWine'))
    .map((m, i) => ({ id: `m${i}`, name: m.name, kind: m.kind, price: roundTo(m.price * ctx.priceLevel, 0.25), plateCost: r2(m.price * ctx.priceLevel * m.costPct / 100), perTicket: m.perTicket }));
}

/** Weighted cost of goods % for a menu. Items without a plate cost use the concept's food or drink average. */
export function menuCogsPct(menu: MenuItem[], c: Concept): number {
  const avg = (kind: 'food' | 'drink') => {
    const xs = c.menu.filter((m) => m.kind === kind);
    return xs.length ? xs.reduce((s, m) => s + m.costPct * m.price * m.perTicket, 0) / xs.reduce((s, m) => s + m.price * m.perTicket, 0) : 30;
  };
  const sales = menu.reduce((s, m) => s + m.price * m.perTicket, 0);
  if (sales <= 0) return 30;
  const cost = menu.reduce((s, m) => s + (m.plateCost ?? (m.price * avg(m.kind)) / 100) * m.perTicket, 0);
  return r2((cost / sales) * 100);
}

function avgBusy(p: Daypart, input: LocalInput): number {
  const open = input.daysOpenPerWeek, wk = Math.min(2, input.weekendDaysOpen, open);
  return open > 0 ? ((open - wk) * p.weekdayPct + wk * p.weekendPct) / open / 100 : 0;
}

/** Staffing from seats, hours and how busy each meal period is. */
function staff(input: LocalInput, ctx: LocalContext, seats: number, notes: Record<string, string>): StaffRole[] {
  const c = ctx.concept;
  const days = input.daysOpenPerWeek;
  const dps = input.dayparts;
  const openHours = dps.reduce((s, p) => s + hoursBetween(p.start, p.end), 0);
  const roles: StaffRole[] = [];
  const add = (id: string, title: string, weeklyHours: number, occ: string, level: 'p25' | 'median', tipped = false, note?: string) => {
    if (weeklyHours <= 0) return;
    const count = Math.max(1, Math.ceil(weeklyHours / 32));
    const w = tipped ? { rate: ctx.tippedWage, where: `tipped cash wage, ${ctx.minWageWhere}` } : wage(ctx, occ, level);
    const localMed = ctx.metro.wages?.[occ]?.median;
    roles.push({ id, title, count, payType: 'hourly', hourlyWage: w.rate, hoursPerWeek: r0(weeklyHours / count), annualSalary: 0,
      commissionPct: 0, commissionStreamId: null, flexWithVolume: true,
      note: tipped ? `Tips come from guests on top of this. Local median with tips: ${localMed ? money(localMed) : 'n/a'} an hour` : note });
    notes[`role.${id}`] = `${money(w.rate)}/hr: ${w.where}`;
  };
  const salary = (id: string, title: string, occ: string, fallback: number) => {
    const med = ctx.metro.wages?.[occ]?.median;
    const annual = med ? roundTo(med * 2080, 500) : fallback;
    roles.push({ id, title, count: 1, payType: 'salary', hourlyWage: 0, hoursPerWeek: 50, annualSalary: annual, commissionPct: 0, commissionStreamId: null, flexWithVolume: false });
    notes[`role.${id}`] = med ? `${money(annual)}/yr: ${shortMetro(ctx.metro)} median, ${oews}` : 'estimate (no local data for this job)';
  };

  if (c.id === 'food-truck') {
    add('lead', 'Lead cook', openHours * days + days * 3, 'cook', 'median');
    const crewHours = dps.reduce((s, p) => s + Math.max(1, Math.ceil((p.ordersPerHour * avgBusy(p, input)) / c.ordersPerCrewHour)) * hoursBetween(p.start, p.end), 0) * days;
    add('crew', 'Cook and cashier', crewHours, 'counter', 'p25');
    return roles;
  }

  salary('gm', c.service === 'seated' ? 'General manager' : 'Store manager', 'manager', 60000);
  if (c.service === 'seated') {
    salary('chef', 'Chef or kitchen manager', 'chef', 56000);
    if (seats >= 120) salary('agm', 'Assistant or front-of-house manager', 'supervisor', 48000);
    if (c.id === 'fine-dining' || c.id === 'steakhouse') salary('sous', 'Sous chef', 'cook', 50000);
    // Staff on the floor per meal period, plus an hour of setup and side work per shift.
    let server = 0, cook = 0, host = 0, bar = 0, dish = 0;
    for (const p of dps) {
      const service = hoursBetween(p.start, p.end), busy = avgBusy(p, input);
      const h = service + 0.5;
      const coversPerHour = (seats * p.turns * busy) / service;
      server += Math.max(1.5, (seats * busy) / c.seatsPerServer) * h;
      cook += Math.max(2, coversPerHour / c.coversPerCookHour) * h;
      host += (c.hasHost ? Math.max(1, (seats * busy) / 60) : Math.max(0.5, (seats * busy) / 80)) * service;
      bar += c.hasBar && input.alcohol !== 'none' ? Math.max(1, (seats * busy) / 60) * h : 0;
      dish += Math.max(1, coversPerHour / 60) * h;
    }
    add('servers', 'Servers', server * days, 'server', 'median', true);
    if (bar > 0) add('bar', 'Bartenders', bar * days, 'bartender', 'median', true);
    add('host', c.hasHost ? 'Hosts, bussers and food runners' : 'Bussers and barbacks', host * days, 'busser', 'p25');
    add('cooks', 'Line cooks', cook * days, 'cook', 'median');
    add('prep', 'Prep cooks', 5 * dps.length * days, 'prep', 'median');
    add('dish', 'Dishwashers', (dish + 1) * days, 'dishwasher', 'p25');
  } else {
    const leadOcc = 'supervisor';
    add('leads', 'Shift leads', (openHours + 1.5) * days, leadOcc, 'median');
    const crewOcc = c.id === 'coffee' ? 'counter' : 'cook_fastfood';
    // People needed on the floor, minus the shift lead who also works the line.
    const crew = dps.reduce((s, p) => s + Math.max(2, (p.ordersPerHour * avgBusy(p, input) * (1 + c.offPremisePct / 100)) / c.ordersPerCrewHour) * hoursBetween(p.start, p.end), 0);
    const leadOnFloor = openHours;
    const prep = c.id === 'coffee' ? 2 : 6;
    add('crew', c.id === 'coffee' ? 'Baristas' : 'Crew (cooks and cashiers)', (Math.max(crew - leadOnFloor, openHours) + prep) * days, crewOcc, 'p25',
      false, c.id === 'coffee' ? 'Tips are extra and paid by customers' : undefined);
    if (c.id === 'bakery-cafe') add('baker', 'Bakers', 6 * days, 'baker', 'median');
  }
  return roles;
}

export function localize(input: LocalInput, base?: Assumptions): Localized {
  const ctx = context(input);
  const c = ctx.concept;
  const tpl = getTemplate(c.baseTemplate).defaults;
  const notes: Record<string, string> = {};
  const metroName = shortMetro(ctx.metro);
  const pl = ctx.priceLevel;

  // Menu, ticket and cost of goods.
  const menu = menuFor(input, ctx);
  const cogs = menuCogsPct(menu, c);
  notes['stream.ticket'] = input.menu?.length
    ? 'From your own menu prices'
    : `${c.name} typical menu, prices x ${metroName} price level ${(pl * 100).toFixed(1)} (US = 100), ${rppSrc}`;
  notes['stream.cogsPct'] = input.menu?.length
    ? 'From your plate costs (items without one use the concept average)'
    : `${c.name}: weighted from typical plate costs (${cogs.toFixed(1)}%). Cost of goods % is set by the concept more than the city`;

  // Volume from space and hours.
  const seats = seatsFor(input, c) + (input.patioSeats || 0);
  const volume: VolumeInputs = {
    method: 'dayparts', service: c.service, daysOpenPerWeek: input.daysOpenPerWeek, weekendDaysOpen: input.weekendDaysOpen,
    dayparts: structuredClone(input.dayparts), seats,
    turnsPerDay: 0, transactionsPerDay: 0, eventsPerWeek: 0, guestsPerEvent: 0, visitorsPerDay: 0, conversionPct: 0, chairs: 0, servicesPerChairPerDay: 0,
  };
  if (c.service === 'seated') {
    notes['volume.seats'] = `${input.sqft.toLocaleString()} sq ft x ${input.diningSharePct}% dining room / ${c.sqftPerSeat} sq ft per seat${input.patioSeats ? ` + ${input.patioSeats} patio seats` : ''}`;
  }
  const guestsPerWeek = daypartUnitsPerWeek(volume);
  const guestsPerDay = input.daysOpenPerWeek > 0 ? guestsPerWeek / input.daysOpenPerWeek : 0;
  const ticketItems = menu.map((m) => ({ id: m.id, name: m.name, price: m.price, perTicket: m.perTicket }));

  const streams: RevenueStream[] = [{
    id: 'main', name: c.service === 'seated' ? 'Dine-in' : c.id === 'food-truck' ? 'Street service' : 'Counter and dine-in',
    note: c.service === 'seated' ? 'Seated guests: seats x turns x how full, by meal period' : 'Orders per hour x hours x how busy, by meal period',
    ticketMode: 'buildup', avgTicket: 0, items: ticketItems, volume, cogsPct: cogs, channelFeePct: 0,
  }];
  if (c.offPremisePct > 0) {
    const ticket = menu.reduce((s, m) => s + m.price * m.perTicket, 0) * (c.service === 'seated' ? 1.6 : 1.1);
    streams.push({
      id: 'offprem', name: 'Takeout and delivery', note: 'Online, phone and delivery app orders',
      ticketMode: 'simple', avgTicket: r2(ticket), items: [],
      volume: { ...volume, method: 'transactions', dayparts: undefined, transactionsPerDay: r0((guestsPerDay * c.offPremisePct) / 100 / (c.service === 'seated' ? 1.6 : 1)) },
      cogsPct: r2(cogs + 1), channelFeePct: c.offPremiseFeePct,
    });
    notes['stream.channelFeePct'] = 'Delivery apps take 15% to 30%; a mix with your own online ordering lands near the default';
  }

  // Labor.
  const roles = staff(input, ctx, seats, notes);
  notes['labor.payrollBurdenPct'] = ctx.burdenParts.map((p) => `${p.label} ${p.pct}% (${p.where})`).join('; ');

  // Occupancy.
  const sqft = input.sqft;
  const baseRent = r0((sqft * ctx.rentPerSqftYear) / 12);
  const otherOcc = r0((sqft * ctx.camPerSqftYear) / 12);
  if (sqft > 0) notes['occupancy.baseRent'] = `${sqft.toLocaleString()} sq ft x ${money(r2(ctx.rentPerSqftYear))}/sq ft/yr: ${ctx.rentWhere}. Use your quoted rent if you have one`;

  // Operating expenses.
  const goods = (ctx.metro.rpp?.goods ?? 100) / 100;
  const lines: ExpenseLine[] = [];
  const line = (id: string, name: string, kind: 'fixed' | 'pctRevenue', amount: number, note?: string) => lines.push({ id, name, kind, amount, note });
  if (c.id === 'food-truck') {
    line('fuel', 'Fuel, propane and generator', 'fixed', r0(1200 * goods));
    line('commissary', 'Commissary kitchen and parking', 'fixed', r0(1000 * pl), 'Most cities require a licensed commissary');
  } else {
    line('utilities', 'Utilities (power, gas, water)', 'fixed', r0((sqft * c.utilitiesPerSqftYear * goods) / 12), `${c.utilitiesPerSqftYear}/sq ft/yr typical for ${c.name.toLowerCase()}, x local goods prices`);
  }
  line('cards', 'Card processing', 'pctRevenue', 2.75);
  if (c.royaltyPct) line('royalty', 'Franchise royalty', 'pctRevenue', c.royaltyPct, 'Check your franchise disclosure document (Item 6)');
  if (c.adFundPct) line('adfund', 'Franchise ad fund', 'pctRevenue', c.adFundPct);
  line('marketing', 'Marketing', 'pctRevenue', c.adFundPct ? 1 : 2);
  line('repairs', 'Repairs and maintenance', 'pctRevenue', 1.5);
  line('supplies', 'Supplies, smallwares, to-go packaging', 'pctRevenue', c.service === 'seated' ? 2.5 : 4);
  line('insurance', input.alcohol === 'full' ? 'Insurance (liability, liquor, property)' : 'Insurance (liability, property)', 'fixed', r0(c.insuranceMonthly * pl));
  line('tech', 'POS, software, music licensing', 'fixed', c.service === 'seated' ? 600 : 400);
  line('pro', 'Accounting, payroll service, legal', 'fixed', r0((c.service === 'seated' ? 1000 : 700) * pl));
  if (c.id !== 'food-truck') line('services', 'Linen, waste, pest control', 'fixed', r0(Math.max(300, sqft * 0.22) * pl));
  line('misc', 'Miscellaneous', 'pctRevenue', 1);

  // Startup budget.
  const ticket = menu.reduce((s, m) => s + m.price * m.perTicket, 0);
  const weeklySales = guestsPerWeek * ticket * (1 + c.offPremisePct / 100);
  const weeklyLabor = roles.reduce((s, r) => s + (r.payType === 'salary' ? r.annualSalary / 52 : r.count * r.hoursPerWeek * r.hourlyWage), 0) * (1 + ctx.payrollBurdenPct / 100);
  const buildout = r0(sqft * ctx.buildoutPerSqft);
  const startup: StartupLine[] = [];
  const s = (id: string, name: string, amount: number, depreciationYears: number, note?: string, isWorkingCapital?: boolean) =>
    amount > 0 && startup.push({ id, name, amount: roundTo(amount, 100), depreciationYears, note, isWorkingCapital });
  if (c.id === 'food-truck') {
    s('truck', 'Truck and kitchen build-out', c.kitchenEquipment * goods, 7);
    s('wrap', 'Wrap and branding', 6000, 5);
  } else {
    s('buildout', 'Build-out and leasehold improvements', buildout, 15, `${money(r0(ctx.buildoutPerSqft))}/sq ft: ${ctx.buildoutWhere}. A landlord allowance lowers this`);
    s('kitchen', 'Kitchen equipment', c.kitchenEquipment * goods, 7, 'National typical for this concept x local goods prices');
    s('ffe', 'Furniture, fixtures and decor', seats * c.ffePerSeat * pl, 7);
    s('signage', 'Signage', 10000 * pl, 7);
    s('design', 'Architect, design and permits', buildout * 0.08, 15);
    s('deposits', 'Rent and utility deposits', (baseRent + otherOcc) * 2, 0);
  }
  s('pos', 'POS and technology', c.service === 'seated' ? 12000 : 6000, 5);
  if (c.franchiseFee) s('franchise', 'Franchise fee', c.franchiseFee, 10, 'Check your franchise disclosure document (Item 5)');
  if (ctx.liquorLicense > 0) s('liquor', 'Liquor license', ctx.liquorLicense, 0, ctx.liquorWhere);
  s('licenses', 'Business license, health permit and other permits', ctx.foodLicense + 1000, 0);
  s('smallwares', 'Smallwares, plates, glassware', Math.max(3000, seats * 90), 0);
  s('inventory', 'Opening food and beverage inventory', weeklySales * (cogs / 100) * 1.5, 0, 'About 1.5 weeks of cost of goods');
  s('preopen-payroll', 'Pre-opening payroll and training', weeklyLabor * 2.5, 0, 'About 2.5 weeks of payroll');
  s('launch', 'Launch marketing', Math.min(15000, weeklySales * 0.5), 0);
  s('fees', 'Legal, accounting and loan fees', c.service === 'seated' ? 15000 : 9000, 0);
  const fixedMonthly = baseRent + otherOcc + lines.filter((l) => l.kind === 'fixed').reduce((x, l) => x + l.amount, 0) + weeklyLabor * 4.33;
  s('wc', 'Working capital reserve (cash on hand)', fixedMonthly * 2.5, 0, 'About 2.5 months of fixed costs and payroll', true);

  // Seasonality: national restaurant sales by month; weather-sensitive concepts follow local temperatures too.
  let seasonality = NATIONAL.seasonality722.slice();
  notes['season'] = `US restaurant sales by month (${SOURCES.mrts?.name ?? 'Census'})`;
  const tmax = ctx.metro.climate?.tmaxF;
  if (tmax && (c.weatherSensitive || input.patioSeats > 0)) {
    const weight = c.weatherSensitive ? 1 : Math.min(1, input.patioSeats / Math.max(seats, 1));
    seasonality = seasonality.map((v, i) => {
      const t = tmax[i] ?? 65;
      const comfort = t < 45 ? 0.75 : t < 60 ? 0.9 : t > 100 ? 0.85 : t > 92 ? 0.95 : 1.05;
      return r2(v * (1 + (comfort - 1) * weight));
    });
    notes['season'] += `, adjusted for ${ctx.metro.climate!.name} average highs (NOAA 1991-2020 normals)`;
  }

  const plan: Assumptions = {
    ...structuredClone(tpl),
    businessName: base?.businessName ?? tpl.businessName,
    openingMonth: base?.openingMonth ?? tpl.openingMonth,
    templateId: c.baseTemplate,
    streams,
    ramp: { startPct: c.ramp.startPct, monthsToSteady: c.ramp.monthsToSteady, curve: 'linear' },
    seasonality,
    labor: { roles, payrollBurdenPct: ctx.payrollBurdenPct, minFlexPct: 75, annualWageIncreasePct: 3.5 },
    occupancy: { rentLabel: 'Base rent', baseRent, otherLabel: 'NNN / CAM (taxes, insurance, common area)', otherOccupancy: otherOcc, annualEscalationPct: 3, freeRentMonths: c.id === 'food-truck' ? 0 : 2 },
    opex: { lines, annualInflationPct: 3 },
    startup: { lines: startup, contingencyPct: 10 },
    downside: DEFAULT_DOWNSIDE,
    local: structuredClone(input),
  };
  if (c.id === 'food-truck') plan.occupancy = { ...plan.occupancy, rentLabel: 'Commissary and parking (in other expenses)', baseRent: 0, otherOccupancy: 0, freeRentMonths: 0 };

  const sources: Provenance[] = [
    { scope: 'local', text: `Wages: ${metroName}, ${oews}` },
    { scope: ctx.minWageWhere.includes('city') ? 'local' : 'state', text: `Minimum wage ${money(ctx.minWage)}, tipped ${money(ctx.tippedWage)}: ${ctx.minWageWhere}` },
    { scope: 'local', text: `Prices: ${metroName} price level ${(pl * 100).toFixed(1)} (US = 100), ${rppSrc}` },
    { scope: ctx.rentWhere.startsWith('estimate') ? 'estimate' : 'local', text: `Rent ${money(r2(ctx.rentPerSqftYear))}/sq ft/yr: ${ctx.rentWhere}` },
    { scope: 'state', text: `Payroll burden ${ctx.payrollBurdenPct}%: ${ctx.burdenParts.map((p) => `${p.label} ${p.pct}%`).join(', ')}` },
    { scope: ctx.liquorWhere.startsWith('estimate') ? 'estimate' : 'state', text: `Liquor license ${money(ctx.liquorLicense)}: ${ctx.liquorWhere}` },
    { scope: 'concept', text: `Menu, cost of goods, space per seat, staffing ratios: ${c.name} industry rules of thumb` },
    { scope: 'national', text: notes['season'] },
    { scope: 'local', text: `Reality check: ${ecSrc}` },
  ];
  return { plan, notes, sources, ctx, seats };
}

/** A template whose defaults and notes are the local ones, so every "Use default" in the wizard is local. */
export function localizedTemplate(input: LocalInput, base?: Assumptions): BusinessTemplate {
  const L = localize(input, base);
  const t = getTemplate(L.ctx.concept.baseTemplate);
  return {
    ...t,
    name: `${L.ctx.concept.name} · ${shortMetro(L.ctx.metro)}`,
    unitWord: L.ctx.concept.service === 'seated' ? 'guests' : 'orders',
    ticketWord: L.ctx.concept.service === 'seated' ? 'check per guest' : 'ticket per order',
    benchmarks: { ...t.benchmarks, ...L.notes },
    defaults: L.plan,
  };
}

/** Local actuals for the concept's industry: county when known, else metro, else US. */
export function localActuals(input: LocalInput) {
  const c = getConcept(input.conceptId);
  const county = input.countyFips ? getCounty(input.countyFips) : undefined;
  const cty = county?.ec[c.naics];
  if (cty && cty.estab >= 10) return { ...cty, where: county!.name ?? 'your county' };
  const m = getMetro(input.cbsa)?.ec?.[c.naics];
  if (m) return { ...m, where: getMetro(input.cbsa)!.title + ' metro' };
  const us = NATIONAL.ec[c.naics];
  return us ? { ...us, where: 'United States' } : undefined;
}
