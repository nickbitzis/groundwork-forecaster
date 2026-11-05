import type { DownsideInputs, VolumeInputs } from '../types';

export interface BusinessTemplate {
  id: string;
  name: string;
  tagline: string;
  /** What one unit of volume is called: guests, customers, clients. */
  unitWord: string;
  /** What one sale is called: check, ticket, order. */
  ticketWord: string;
  /** Short benchmark notes keyed by field path ("ramp.startPct", "stream.cogsPct", ...). */
  benchmarks: Record<string, string>;
  defaults: import('../types').Assumptions;
}

export function volume(p: Partial<VolumeInputs> & { method: VolumeInputs['method'] }): VolumeInputs {
  return {
    daysOpenPerWeek: 6, seats: 0, turnsPerDay: 0, transactionsPerDay: 0, eventsPerWeek: 0,
    guestsPerEvent: 0, visitorsPerDay: 0, conversionPct: 0, chairs: 0, servicesPerChairPerDay: 0,
    ...p,
  };
}

/** A typical US pattern for walk-in businesses: slow January and February, strong late spring through summer, a December bump. */
export const SEASONALITY_US_DINING = [0.9, 0.9, 1.0, 1.0, 1.04, 1.04, 1.04, 1.04, 0.98, 1.0, 0.98, 1.08];
/** Outdoor and event driven: strong summer, weak winter. */
export const SEASONALITY_OUTDOOR = [0.7, 0.75, 0.9, 1.05, 1.15, 1.2, 1.2, 1.15, 1.1, 1.0, 0.9, 0.9];
/** Coffee: steadier year round, a little softer in summer, holiday lift. */
export const SEASONALITY_COFFEE = [0.97, 0.97, 1.0, 1.0, 1.0, 0.96, 0.95, 0.96, 1.02, 1.04, 1.04, 1.09];
/** Salons: busy before holidays, prom and wedding season. */
export const SEASONALITY_SALON = [0.88, 0.92, 1.0, 1.02, 1.06, 1.02, 0.98, 0.98, 0.98, 1.0, 1.04, 1.12];

export const DEFAULT_DOWNSIDE: DownsideInputs = {
  volumeChangePct: -10,
  ticketChangePct: -5,
  extraRampMonths: 3,
  cogsPtsChange: 2,
  laborChangePct: 0,
};

/** Notes that apply to every business type unless a template overrides them. */
export const COMMON_BENCHMARKS: Record<string, string> = {
  'labor.payrollBurdenPct': '15% to 22% covers payroll taxes, workers comp and modest benefits',
  'occupancy.annualEscalationPct': 'Commercial leases usually rise 2% to 3% a year',
  'startup.contingencyPct': 'Plan 10% to 15% for overruns on build-outs',
  'financing.interestRatePct': 'SBA 7(a) loans have recently run about prime plus 2.75%, near 10% to 11%',
  'financing.termYears': 'SBA 7(a): 10 years for equipment and working capital, up to 25 with real estate',
  'growth.annualPriceIncreasePct': 'Small menu or price increases of 2% to 4% a year are common',
  'opex.annualInflationPct': '3% is a reasonable planning number',
  'labor.annualWageIncreasePct': '3% to 4% a year keeps pace with recent wage growth',
};

export function role(p: Partial<import('../types').StaffRole> & { id: string; title: string; payType: import('../types').PayType }): import('../types').StaffRole {
  return {
    count: 1, hourlyWage: 0, hoursPerWeek: 40, annualSalary: 0, commissionPct: 0,
    commissionStreamId: null, flexWithVolume: p.payType === 'hourly', ...p,
  };
}
