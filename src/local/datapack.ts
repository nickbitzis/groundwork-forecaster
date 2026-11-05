// The bundled local market data pack (built by data/pipeline/build_datapack.py) and lookups on it.

import pack from '../data/datapack.json';

export interface EcStats { estab: number; salesPerEstab: number; payrollPct: number | null; empPerEstab: number | null }
export interface Wage { p25: number | null; median: number; p75: number | null }
export interface Climate { station: string; name: string; tmaxF: (number | null)[] | null; tminF: (number | null)[] | null; precipDays: (number | null)[] | null; snowIn: (number | null)[] | null }
export interface Metro {
  code: string;
  title: string;
  pop?: number;
  rpp?: { all?: number; goods?: number; housing?: number; otherServices?: number };
  wages?: Record<string, Wage>;
  ec?: Record<string, EcStats & { payPerEmp?: number | null }>;
  cbp?: Record<string, number>;
  climate?: Climate;
}

export interface CuratedSource { field: string; url: string; published?: string; note?: string }
export interface CuratedState {
  min_wage?: number | null; tipped_cash_wage?: number | null;
  suta_new_employer_rate_pct?: number | null; suta_wage_base?: number | null;
  workers_comp_per_100?: number | null;
  liquor?: { full_license_name?: string; full_state_fee?: number | null; full_local_fee?: number | null; quota_state?: boolean;
    secondary_market_price?: number | null; beer_wine_name?: string; beer_wine_fee?: number | null };
  sources?: CuratedSource[];
}
export interface CuratedCity {
  cbsa_name?: string; state: string; min_wage?: number | null; tipped_cash_wage?: number | null;
  retail_rent_nnn?: number | null; restaurant_rent_range?: [number, number] | null; cam_nnn?: number | null;
  buildout_per_sqft?: [number, number] | null; food_license_fee?: number | null; sources?: CuratedSource[];
}

type Pack = {
  meta: { built: string; sources: Record<string, { name: string; released: string; url: string }> };
  national: { ec: Record<string, EcStats>; seasonality722: number[] };
  metros: Record<string, Omit<Metro, 'code'>>;
  counties: Record<string, [string | null, string | null, Record<string, [number, number, number | null, number | null]>]>;
  curated: { as_of?: string; states: Record<string, CuratedState>; cities: Record<string, CuratedCity> };
};

const P = pack as unknown as Pack;

export const SOURCES = P.meta.sources;
export const PACK_BUILT = P.meta.built;
export const NATIONAL = P.national;

export const STATE_ABBR: Record<string, string> = {
  Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR', California: 'CA', Colorado: 'CO', Connecticut: 'CT', Delaware: 'DE',
  'District of Columbia': 'DC', Florida: 'FL', Georgia: 'GA', Hawaii: 'HI', Idaho: 'ID', Illinois: 'IL', Indiana: 'IN', Iowa: 'IA',
  Kansas: 'KS', Kentucky: 'KY', Louisiana: 'LA', Maine: 'ME', Maryland: 'MD', Massachusetts: 'MA', Michigan: 'MI', Minnesota: 'MN',
  Mississippi: 'MS', Missouri: 'MO', Montana: 'MT', Nebraska: 'NE', Nevada: 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ',
  'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC', 'North Dakota': 'ND', Ohio: 'OH', Oklahoma: 'OK', Oregon: 'OR',
  Pennsylvania: 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC', 'South Dakota': 'SD', Tennessee: 'TN', Texas: 'TX', Utah: 'UT',
  Vermont: 'VT', Virginia: 'VA', Washington: 'WA', 'West Virginia': 'WV', Wisconsin: 'WI', Wyoming: 'WY', 'Puerto Rico': 'PR',
};

export function getMetro(code: string): Metro | undefined {
  const m = P.metros[code];
  return m ? { code, ...m } : undefined;
}

/** All metros, biggest first, for the picker. */
export function metroList(): { code: string; title: string; pop: number }[] {
  return Object.entries(P.metros)
    .map(([code, m]) => ({ code, title: m.title, pop: m.pop ?? 0 }))
    .sort((a, b) => b.pop - a.pop);
}

/** The metro's main state: the first state in its title ('Chicago-Naperville-Elgin, IL-IN' -> 'IL'). */
export function metroState(m: Metro): string {
  const tail = m.title.split(',').pop()?.trim() ?? '';
  return tail.split('-')[0];
}

export function getCounty(fips: string): { fips: string; name: string | null; cbsa: string | null; ec: Record<string, EcStats> } | undefined {
  const c = P.counties[fips];
  if (!c) return undefined;
  const ec: Record<string, EcStats> = {};
  for (const [n, v] of Object.entries(c[2])) ec[n] = { estab: v[0], salesPerEstab: v[1], payrollPct: v[2], empPerEstab: v[3] };
  return { fips, name: c[0], cbsa: c[1], ec };
}

/** County from a geocoder's 'Denver County' + 'Colorado'. */
export function findCounty(countyName: string, stateName: string): string | undefined {
  const want = `${countyName}, ${stateName}`.toLowerCase();
  const loose = (s: string) => s.toLowerCase().replace(/ (county|parish|borough|city and borough|census area|municipality)/g, '');
  const looseWant = loose(want);
  for (const [fips, c] of Object.entries(P.counties)) {
    const n = (c[0] ?? '').toLowerCase();
    if (n === want || loose(n) === looseWant) return fips;
  }
  return undefined;
}

export function curatedState(abbr: string): CuratedState | undefined {
  return P.curated.states?.[abbr];
}

/** Curated city data for cities in this metro, e.g. 'Denver, CO'. */
export function curatedCitiesIn(cbsa: string): [string, CuratedCity][] {
  const m = getMetro(cbsa);
  if (!m) return [];
  const st = metroState(m);
  const first = m.title.split(',')[0].split('-')[0].trim().toLowerCase();
  return Object.entries(P.curated.cities ?? {}).filter(([name, c]) =>
    c.state === st && (name.toLowerCase().startsWith(first) || (c.cbsa_name ?? '').toLowerCase().startsWith(first)));
}
