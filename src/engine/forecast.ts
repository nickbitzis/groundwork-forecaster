import type {
  Assumptions, Forecast, MonthResult, RevenueStream, RunOptions, StaffRole, VolumeInputs, YearSummary,
} from './types';

export const MONTHS = 36;
export const WEEKS_PER_MONTH = 52 / 12;
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Average ticket for one stream: either typed in, or built up from items x price. */
export function streamTicket(s: RevenueStream): number {
  if (s.ticketMode === 'buildup') {
    return s.items.reduce((sum, i) => sum + i.price * i.perTicket, 0);
  }
  return s.avgTicket;
}

/** Hours between two 'HH:MM' times; a period past midnight wraps. */
export function hoursBetween(start: string, end: string): number {
  const toH = (t: string) => { const [h, m] = t.split(':').map(Number); return (h || 0) + (m || 0) / 60; };
  const d = toH(end) - toH(start);
  return d > 0 ? d : d + 24;
}

/** Guests or orders in one week from the meal periods. */
export function daypartUnitsPerWeek(v: VolumeInputs): number {
  const open = Math.max(0, Math.min(7, v.daysOpenPerWeek));
  const weekend = Math.max(0, Math.min(2, v.weekendDaysOpen ?? 2, open));
  const weekday = open - weekend;
  return (v.dayparts ?? []).reduce((sum, p) => {
    const perFullDay = v.service === 'counter' ? p.ordersPerHour * hoursBetween(p.start, p.end) : v.seats * p.turns;
    return sum + perFullDay * ((weekday * p.weekdayPct + weekend * p.weekendPct) / 100);
  }, 0);
}

/** Customers (or transactions, or services) per open day at steady state. */
export function unitsPerOpenDay(v: VolumeInputs): number {
  switch (v.method) {
    case 'dayparts': return v.daysOpenPerWeek > 0 ? daypartUnitsPerWeek(v) / v.daysOpenPerWeek : 0;
    case 'seats': return v.seats * v.turnsPerDay;
    case 'transactions': return v.transactionsPerDay;
    case 'traffic': return v.visitorsPerDay * (v.conversionPct / 100);
    case 'chairs': return v.chairs * v.servicesPerChairPerDay;
    case 'events': return v.daysOpenPerWeek > 0 ? (v.eventsPerWeek * v.guestsPerEvent) / v.daysOpenPerWeek : 0;
  }
}

/** Steady-state units per month before ramp, seasonality and growth. */
export function steadyUnitsPerMonth(v: VolumeInputs): number {
  if (v.method === 'events') return v.eventsPerWeek * v.guestsPerEvent * WEEKS_PER_MONTH;
  if (v.method === 'dayparts') return daypartUnitsPerWeek(v) * WEEKS_PER_MONTH;
  return unitsPerOpenDay(v) * v.daysOpenPerWeek * WEEKS_PER_MONTH;
}

/** Seasonality scaled so the 12 values average exactly 1 (it shifts timing, not the annual total). */
export function normalizeSeasonality(s: number[]): number[] {
  const vals = s.length === 12 ? s : Array(12).fill(1);
  const mean = vals.reduce((a, b) => a + b, 0) / 12;
  return mean > 0 ? vals.map((x) => x / mean) : Array(12).fill(1);
}

/** Share of steady-state volume in month index m (0-based). */
export function rampFactor(m: number, startPct: number, monthsToSteady: number, curve: 'linear' | 'scurve'): number {
  const start = Math.min(Math.max(startPct / 100, 0), 1);
  if (monthsToSteady <= 0 || m >= monthsToSteady) return 1;
  const t = m / monthsToSteady;
  const shape = curve === 'scurve' ? t * t * (3 - 2 * t) : t;
  return start + (1 - start) * shape;
}

export function parseOpening(openingMonth: string): { year: number; month: number } {
  const [y, mo] = openingMonth.split('-').map(Number);
  return { year: Number.isFinite(y) ? y : 2027, month: Number.isFinite(mo) ? Math.min(Math.max(mo, 1), 12) - 1 : 0 };
}

export function monthLabel(openingMonth: string, m: number): string {
  const { year, month } = parseOpening(openingMonth);
  const idx = month + m;
  return `${MONTH_NAMES[idx % 12]} ${year + Math.floor(idx / 12)}`;
}

export interface StartupTotals {
  linesTotal: number;
  contingency: number;
  totalProjectCost: number;
  workingCapital: number;
}

export function startupTotals(a: Assumptions): StartupTotals {
  const linesTotal = a.startup.lines.reduce((s, l) => s + l.amount, 0);
  const workingCapital = a.startup.lines.filter((l) => l.isWorkingCapital).reduce((s, l) => s + l.amount, 0);
  const contingency = (linesTotal - workingCapital) * (a.startup.contingencyPct / 100);
  return { linesTotal, contingency, totalProjectCost: linesTotal + contingency, workingCapital };
}

/** Standard amortizing payment. */
export function amortizedPayment(principal: number, annualRatePct: number, months: number): number {
  if (principal <= 0 || months <= 0) return 0;
  const r = annualRatePct / 100 / 12;
  if (r === 0) return principal / months;
  return (principal * r) / (1 - Math.pow(1 + r, -months));
}

export interface LoanMonth { interest: number; principal: number; balance: number }

/** Loan on the full project cost: optional interest-only months, then amortizes over the rest of the term. */
export function loanSchedule(principal: number, ratePct: number, termYears: number, ioMonths: number, months = MONTHS): { payment: number; rows: LoanMonth[] } {
  const term = Math.round(termYears * 12);
  const io = Math.min(Math.max(Math.round(ioMonths), 0), term);
  const payment = amortizedPayment(principal, ratePct, term - io);
  const r = ratePct / 100 / 12;
  const rows: LoanMonth[] = [];
  let bal = principal;
  for (let m = 0; m < months; m++) {
    if (bal <= 0.005 || m >= term) { rows.push({ interest: 0, principal: 0, balance: 0 }); bal = 0; continue; }
    const interest = bal * r;
    const prin = m < io ? 0 : Math.min(payment - interest, bal);
    bal -= prin;
    rows.push({ interest, principal: prin, balance: bal });
  }
  return { payment, rows };
}

function roleMonthlyWages(role: StaffRole, flex: number, wageGrowth: number, streamRev: Record<string, number>, revenue: number): number {
  switch (role.payType) {
    case 'salary': return (role.count * role.annualSalary / 12) * wageGrowth;
    case 'hourly': return role.count * role.hoursPerWeek * WEEKS_PER_MONTH * role.hourlyWage * wageGrowth * (role.flexWithVolume ? flex : 1);
    case 'commission': {
      const base = role.commissionStreamId ? (streamRev[role.commissionStreamId] ?? 0) : revenue;
      return base * (role.commissionPct / 100);
    }
  }
}

export function runForecast(a: Assumptions, opts: RunOptions = {}): Forecast {
  const tMult = opts.ticketMultiplier ?? 1;
  const vMult = opts.volumeMultiplier ?? 1;
  const cogsAdd = (opts.cogsPtsChange ?? 0) / 100;
  const laborMult = opts.laborMultiplier ?? 1;
  const monthsToSteady = a.ramp.monthsToSteady + (opts.extraRampMonths ?? 0);

  const season = normalizeSeasonality(a.seasonality);
  const { month: openMonth } = parseOpening(a.openingMonth);
  const st = startupTotals(a);
  const loan = loanSchedule(st.totalProjectCost, a.financing.interestRatePct, a.financing.termYears, a.financing.interestOnlyMonths);

  const baseTickets = a.streams.map((s) => streamTicket(s) * tMult);
  const baseUnits = a.streams.map((s) => steadyUnitsPerMonth(s.volume) * vMult);

  const months: MonthResult[] = [];
  let cash = st.workingCapital;

  for (let m = 0; m < MONTHS; m++) {
    const yearIdx = Math.floor(m / 12);
    const ramp = rampFactor(m, a.ramp.startPct, monthsToSteady, a.ramp.curve);
    const seas = season[(openMonth + m) % 12];
    const priceGrowth = Math.pow(1 + a.growth.annualPriceIncreasePct / 100, yearIdx);
    const volGrowth = Math.pow(1 + a.growth.annualVolumeGrowthPct / 100, yearIdx);

    const streamRevenue: Record<string, number> = {};
    let revenue = 0, cogs = 0, channelFees = 0, units = 0;
    a.streams.forEach((s, i) => {
      const u = baseUnits[i] * ramp * seas * volGrowth;
      const rev = u * baseTickets[i] * priceGrowth;
      streamRevenue[s.id] = rev;
      units += u;
      revenue += rev;
      cogs += rev * Math.max(0, s.cogsPct / 100 + cogsAdd);
      channelFees += rev * (s.channelFeePct / 100);
    });

    // Hourly staff on "flex" follow the plan's own timeline (ramp, season, growth), never below the floor.
    // Volume changes from the solver or downside keep the staffing plan as entered.
    const busy = ramp * seas * volGrowth;
    const flex = Math.max(a.labor.minFlexPct / 100, busy);
    const wageGrowth = Math.pow(1 + a.labor.annualWageIncreasePct / 100, yearIdx);
    const laborByRole: Record<string, number> = {};
    let wages = 0;
    for (const r of a.labor.roles) {
      const w = roleMonthlyWages(r, flex, wageGrowth, streamRevenue, revenue) * laborMult;
      laborByRole[r.id] = w * (1 + a.labor.payrollBurdenPct / 100);
      wages += w;
    }
    const labor = wages * (1 + a.labor.payrollBurdenPct / 100);

    const rentGrowth = Math.pow(1 + a.occupancy.annualEscalationPct / 100, yearIdx);
    const rent = m < a.occupancy.freeRentMonths ? 0 : a.occupancy.baseRent * rentGrowth;
    const occupancy = rent + a.occupancy.otherOccupancy * rentGrowth;

    const inflation = Math.pow(1 + a.opex.annualInflationPct / 100, yearIdx);
    const opexByLine: Record<string, number> = {};
    let opex = 0;
    for (const l of a.opex.lines) {
      const v = l.kind === 'fixed' ? l.amount * inflation : revenue * (l.amount / 100);
      opexByLine[l.id] = v;
      opex += v;
    }

    const ebitda = revenue - cogs - labor - occupancy - channelFees - opex;
    const depreciation = a.startup.lines.reduce((s, l) =>
      s + (l.depreciationYears > 0 && m < l.depreciationYears * 12 ? l.amount / (l.depreciationYears * 12) : 0), 0);
    const { interest, principal, balance } = loan.rows[m];
    const debtService = interest + principal;
    const netIncome = ebitda - depreciation - interest;
    const ownerDraw = a.owner.monthlyDraw;
    const netCashFlow = ebitda - debtService - ownerDraw;
    cash += netCashFlow;

    months.push({
      index: m, label: monthLabel(a.openingMonth, m), year: yearIdx + 1,
      rampFactor: ramp, seasonFactor: seas, units, streamRevenue,
      revenue, cogs, grossProfit: revenue - cogs, labor, occupancy, channelFees, opex, ebitda,
      depreciation, interest, principal, debtService, netIncome, ownerDraw, netCashFlow,
      cashBalance: cash, loanBalance: balance, opexByLine, laborByRole,
    });
  }

  const years: YearSummary[] = [1, 2, 3].map((y) => {
    const ms = months.filter((r) => r.year === y);
    const sum = (k: keyof MonthResult) => ms.reduce((s, r) => s + (r[k] as number), 0);
    const debtService = sum('debtService');
    const ebitda = sum('ebitda');
    const revenue = sum('revenue');
    const ownerDraw = sum('ownerDraw');
    return {
      year: y, revenue, cogs: sum('cogs'), grossProfit: sum('grossProfit'), labor: sum('labor'),
      occupancy: sum('occupancy'), channelFees: sum('channelFees'), opex: sum('opex'), ebitda,
      depreciation: sum('depreciation'), interest: sum('interest'), principal: sum('principal'), debtService,
      netIncome: sum('netIncome'), ownerDraw, netCashFlow: sum('netCashFlow'),
      endingCash: ms[ms.length - 1].cashBalance,
      dscr: debtService > 0 ? (ebitda - ownerDraw) / debtService : null,
      primeCostPct: revenue > 0 ? (sum('cogs') + sum('labor')) / revenue : 0,
    };
  });

  const firstIdx = (pred: (r: MonthResult) => boolean) => {
    const i = months.findIndex(pred);
    return i === -1 ? null : i + 1;
  };
  let lowIdx = 0;
  months.forEach((r, i) => { if (r.cashBalance < months[lowIdx].cashBalance) lowIdx = i; });
  const startingLow = st.workingCapital < months[lowIdx].cashBalance;

  const steadyUnits = baseUnits.reduce((s, u) => s + u, 0);
  const steadyRev = baseUnits.reduce((s, u, i) => s + u * baseTickets[i], 0);

  return {
    months, years,
    totalProjectCost: st.totalProjectCost,
    contingency: st.contingency,
    openingCash: st.workingCapital,
    monthlyPayment: loan.payment,
    cashBreakEvenMonth: firstIdx((r) => r.netCashFlow >= 0),
    profitBreakEvenMonth: firstIdx((r) => r.netIncome >= 0),
    lowestCash: startingLow ? st.workingCapital : months[lowIdx].cashBalance,
    lowestCashMonth: startingLow ? 0 : lowIdx + 1,
    steadyAvgTicket: steadyUnits > 0 ? steadyRev / steadyUnits : 0,
    steadyUnitsPerMonth: steadyUnits,
  };
}

export function downsideOptions(a: Assumptions): RunOptions {
  const d = a.downside;
  return {
    volumeMultiplier: 1 + d.volumeChangePct / 100,
    ticketMultiplier: 1 + d.ticketChangePct / 100,
    extraRampMonths: d.extraRampMonths,
    cogsPtsChange: d.cogsPtsChange,
    laborMultiplier: 1 + d.laborChangePct / 100,
  };
}

export function runDownside(a: Assumptions): Forecast {
  return runForecast(a, downsideOptions(a));
}
