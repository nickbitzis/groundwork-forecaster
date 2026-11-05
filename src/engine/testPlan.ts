import { DEFAULT_DOWNSIDE } from './templates/common';
import type { Assumptions } from './types';

/**
 * A deliberately simple plan with round numbers so results can be checked by hand.
 * 100 transactions/day x 6 days x 52/12 weeks = 2,600 a month at $20 = $52,000 revenue.
 */
export function simplePlan(): Assumptions {
  return {
    version: 1,
    templateId: 'test',
    businessName: 'Test',
    openingMonth: '2027-01',
    streams: [{
      id: 's1', name: 'Sales', ticketMode: 'simple', avgTicket: 20, items: [],
      volume: {
        method: 'transactions', daysOpenPerWeek: 6, transactionsPerDay: 100, seats: 0, turnsPerDay: 0,
        eventsPerWeek: 0, guestsPerEvent: 0, visitorsPerDay: 0, conversionPct: 0, chairs: 0, servicesPerChairPerDay: 0,
      },
      cogsPct: 30, channelFeePct: 0,
    }],
    ramp: { startPct: 100, monthsToSteady: 0, curve: 'linear' },
    growth: { annualPriceIncreasePct: 0, annualVolumeGrowthPct: 0 },
    seasonality: Array(12).fill(1),
    labor: {
      roles: [
        { id: 'mgr', title: 'Manager', count: 1, payType: 'salary', hourlyWage: 0, hoursPerWeek: 40, annualSalary: 60000, commissionPct: 0, commissionStreamId: null, flexWithVolume: false },
        { id: 'crew', title: 'Crew', count: 2, payType: 'hourly', hourlyWage: 15, hoursPerWeek: 40, annualSalary: 0, commissionPct: 0, commissionStreamId: null, flexWithVolume: false },
      ],
      payrollBurdenPct: 20, minFlexPct: 70, annualWageIncreasePct: 0,
    },
    occupancy: { rentLabel: 'Rent', baseRent: 5000, otherLabel: 'NNN', otherOccupancy: 1000, annualEscalationPct: 0, freeRentMonths: 0 },
    opex: {
      annualInflationPct: 0,
      lines: [
        { id: 'fixed', name: 'Fixed', kind: 'fixed', amount: 1000 },
        { id: 'pct', name: 'Percent', kind: 'pctRevenue', amount: 5 },
      ],
    },
    startup: {
      contingencyPct: 10,
      lines: [
        { id: 'equip', name: 'Equipment', amount: 100000, depreciationYears: 10 },
        { id: 'wc', name: 'Working capital', amount: 20000, depreciationYears: 0, isWorkingCapital: true },
      ],
    },
    financing: { interestRatePct: 12, termYears: 10, interestOnlyMonths: 0 },
    owner: { monthlyDraw: 0 },
    downside: { ...DEFAULT_DOWNSIDE },
  };
}
