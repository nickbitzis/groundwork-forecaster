// Every input the forecast uses. Plain data, so a plan can be saved, loaded and edited.

export type VolumeMethod = 'seats' | 'transactions' | 'events' | 'traffic' | 'chairs' | 'dayparts';

/** One meal period. Seated: seats x turns x how full. Counter: orders per hour x hours x how busy. */
export interface Daypart {
  id: string;
  name: string;
  /** 'HH:MM', 24-hour. */
  start: string;
  end: string;
  /** Seated: table turns in this period at 100% full. */
  turns: number;
  /** Counter: orders per hour at full speed. */
  ordersPerHour: number;
  /** How full (seated) or busy (counter), Monday to Thursday and Sunday. */
  weekdayPct: number;
  /** How full or busy on Friday and Saturday. */
  weekendPct: number;
}

export interface TicketItem {
  id: string;
  name: string;
  price: number;
  /** How many of this item an average ticket includes (0.4 = 40% of tickets have one). */
  perTicket: number;
}

export interface VolumeInputs {
  method: VolumeMethod;
  daysOpenPerWeek: number;
  seats: number;
  turnsPerDay: number;
  transactionsPerDay: number;
  eventsPerWeek: number;
  guestsPerEvent: number;
  visitorsPerDay: number;
  conversionPct: number;
  chairs: number;
  servicesPerChairPerDay: number;
  /** 'dayparts' method only. */
  service?: 'seated' | 'counter';
  dayparts?: Daypart[];
  /** How many of the open days are Friday or Saturday (0 to 2). */
  weekendDaysOpen?: number;
}

export interface RevenueStream {
  id: string;
  name: string;
  note?: string;
  ticketMode: 'simple' | 'buildup';
  avgTicket: number;
  items: TicketItem[];
  volume: VolumeInputs;
  /** Cost of goods as % of this stream's sales. */
  cogsPct: number;
  /** Fees taken off the top: delivery apps, event organizers, lot fees. % of this stream's sales. */
  channelFeePct: number;
}

export type PayType = 'hourly' | 'salary' | 'commission';

export interface StaffRole {
  id: string;
  title: string;
  count: number;
  payType: PayType;
  hourlyWage: number;
  hoursPerWeek: number;
  annualSalary: number;
  /** % of sales paid as commission (commission roles only). */
  commissionPct: number;
  /** Stream the commission is paid on; null = all sales. */
  commissionStreamId: string | null;
  /** Hourly roles only: hours flex up and down with how busy the business is. */
  flexWithVolume: boolean;
  note?: string;
}

export interface ExpenseLine {
  id: string;
  name: string;
  kind: 'fixed' | 'pctRevenue';
  /** $ per month for fixed lines, % of sales for pctRevenue lines. */
  amount: number;
  note?: string;
}

export interface StartupLine {
  id: string;
  name: string;
  amount: number;
  /** Years to depreciate. 0 = not depreciated (pre-opening costs, deposits, cash). */
  depreciationYears: number;
  /** Cash that stays in the bank at opening to cover early losses. */
  isWorkingCapital?: boolean;
  note?: string;
}

export interface Assumptions {
  version: 1;
  templateId: string;
  businessName: string;
  /** First month open, 'YYYY-MM'. */
  openingMonth: string;
  streams: RevenueStream[];
  ramp: {
    /** Month 1 volume as % of steady state. */
    startPct: number;
    /** Months until volume reaches steady state. */
    monthsToSteady: number;
    curve: 'linear' | 'scurve';
  };
  growth: {
    annualPriceIncreasePct: number;
    annualVolumeGrowthPct: number;
  };
  /** 12 values, Jan to Dec. Relative busyness; normalized so the average is 1. */
  seasonality: number[];
  labor: {
    roles: StaffRole[];
    /** Payroll taxes, workers comp, benefits as % of wages. */
    payrollBurdenPct: number;
    /** Floor for flexing hourly roles: never staff below this % of planned hours. */
    minFlexPct: number;
    annualWageIncreasePct: number;
  };
  occupancy: {
    rentLabel: string;
    baseRent: number;
    otherLabel: string;
    otherOccupancy: number;
    annualEscalationPct: number;
    /** Months of free base rent at the start. */
    freeRentMonths: number;
  };
  opex: {
    lines: ExpenseLine[];
    /** Yearly increase on fixed expense lines. */
    annualInflationPct: number;
  };
  startup: {
    lines: StartupLine[];
    /** % added on top of all non-cash startup lines for overruns. */
    contingencyPct: number;
  };
  financing: {
    interestRatePct: number;
    termYears: number;
    /** Months paying interest only before principal starts. */
    interestOnlyMonths: number;
  };
  owner: {
    /** Cash the owner takes out each month, beyond any salary in the staffing plan. */
    monthlyDraw: number;
  };
  downside: DownsideInputs;
  /** Where and what: when set, defaults and notes come from local market data (src/local). */
  local?: import('../local/types').LocalInput;
}

export interface DownsideInputs {
  volumeChangePct: number;
  ticketChangePct: number;
  extraRampMonths: number;
  cogsPtsChange: number;
  laborChangePct: number;
}

/** Knobs applied on top of assumptions without editing them (solver and downside use these). */
export interface RunOptions {
  ticketMultiplier?: number;
  volumeMultiplier?: number;
  extraRampMonths?: number;
  cogsPtsChange?: number;
  laborMultiplier?: number;
}

export interface MonthResult {
  index: number; // 0-based
  label: string; // 'Jan 2027'
  year: number; // 1, 2, 3
  rampFactor: number;
  seasonFactor: number;
  units: number;
  streamRevenue: Record<string, number>;
  revenue: number;
  cogs: number;
  grossProfit: number;
  labor: number;
  occupancy: number;
  channelFees: number;
  opex: number;
  ebitda: number;
  depreciation: number;
  interest: number;
  principal: number;
  debtService: number;
  netIncome: number;
  ownerDraw: number;
  netCashFlow: number;
  cashBalance: number;
  loanBalance: number;
  opexByLine: Record<string, number>;
  laborByRole: Record<string, number>;
}

export interface YearSummary {
  year: number;
  revenue: number;
  cogs: number;
  grossProfit: number;
  labor: number;
  occupancy: number;
  channelFees: number;
  opex: number;
  ebitda: number;
  depreciation: number;
  interest: number;
  principal: number;
  debtService: number;
  netIncome: number;
  ownerDraw: number;
  netCashFlow: number;
  endingCash: number;
  /** EBITDA / debt service. Null when there is no debt. */
  dscr: number | null;
  primeCostPct: number;
}

export interface Forecast {
  months: MonthResult[];
  years: YearSummary[];
  totalProjectCost: number;
  contingency: number;
  openingCash: number;
  monthlyPayment: number;
  /** First month (1-based) with net cash flow after debt service >= 0. */
  cashBreakEvenMonth: number | null;
  /** First month (1-based) with net income >= 0. */
  profitBreakEvenMonth: number | null;
  lowestCash: number;
  lowestCashMonth: number; // 1-based
  steadyAvgTicket: number;
  steadyUnitsPerMonth: number;
}
