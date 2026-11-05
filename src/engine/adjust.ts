import type { Assumptions } from './types';

/** Bake a solver answer into the plan: scale every ticket or the main volume driver of every stream. */
export function applyMultiplier(a: Assumptions, lever: 'ticket' | 'volume', k: number): Assumptions {
  const next = structuredClone(a);
  for (const s of next.streams) {
    if (lever === 'ticket') {
      if (s.ticketMode === 'buildup') s.items.forEach((i) => { i.price = round2(i.price * k); });
      else s.avgTicket = round2(s.avgTicket * k);
    } else {
      const v = s.volume;
      switch (v.method) {
        case 'seats': v.turnsPerDay = round2(v.turnsPerDay * k); break;
        case 'transactions': v.transactionsPerDay = round2(v.transactionsPerDay * k); break;
        case 'events': v.guestsPerEvent = round2(v.guestsPerEvent * k); break;
        case 'traffic': v.visitorsPerDay = round2(v.visitorsPerDay * k); break;
        case 'chairs': v.servicesPerChairPerDay = round2(v.servicesPerChairPerDay * k); break;
      }
    }
  }
  return next;
}

const round2 = (x: number) => Math.round(x * 100) / 100;
