// What the owner tells us about where and what. Everything else is looked up.

import type { Daypart } from '../engine/types';

export interface LocalInput {
  conceptId: string;
  /** CBSA code of the metro, e.g. '19740' for Denver. */
  cbsa: string;
  /** County FIPS (5 digits) when known from the address; finer local restaurant numbers. */
  countyFips?: string;
  /** City name from the address, e.g. 'Denver'; picks up a city minimum wage. */
  city?: string;
  /** Inside a city that sets its own minimum wage (e.g. Denver). */
  inCityLimits?: boolean;
  address?: string;
  lat?: number;
  lon?: number;
  /** Total space in square feet. */
  sqft: number;
  /** A former restaurant (hood, grease trap, plumbing in place) costs far less to build out than an empty shell. */
  spaceType: 'secondGen' | 'shell';
  /** Share of the space that is dining room (seated concepts). */
  diningSharePct: number;
  /** Extra seasonal patio seats (0 if none). */
  patioSeats: number;
  daysOpenPerWeek: number;
  weekendDaysOpen: number;
  dayparts: Daypart[];
  /** Serve beer, wine or spirits. */
  alcohol: 'none' | 'beerWine' | 'full';
  /** Owner's own menu; when present it sets the ticket and cost of goods. */
  menu?: MenuItem[];
}

export interface MenuItem {
  id: string;
  name: string;
  /** Food or drink: drink items use the drink cost of goods when no plate cost is given. */
  kind: 'food' | 'drink';
  price: number;
  /** What it costs you to make one, if you know it. */
  plateCost?: number;
  /** How often it's on a ticket: 1 = every ticket, 0.3 = about one in three. */
  perTicket: number;
}

/** Where a default came from, shown next to the field. */
export interface Provenance {
  /** 'local' = this metro/county/city, 'state', 'national', 'concept' = concept rule of thumb. */
  scope: 'local' | 'state' | 'national' | 'concept' | 'estimate';
  text: string;
}

export interface RealityRow {
  label: string;
  plan: number;
  local: number | null;
  unit: '$' | '%' | '#';
  where: string;
  status: 'ok' | 'watch' | 'risk' | 'n/a';
  note: string;
}
