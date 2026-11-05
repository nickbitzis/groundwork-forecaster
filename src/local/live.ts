// Live lookups, free and keyless: address search (OpenStreetMap Nominatim), county (FCC Area API),
// and nearby food and drink places with their hours (OpenStreetMap Overpass).
// They work when the app runs from a file or a website; sandboxed previews may block them.

import { getCounty } from './datapack';

export interface Place {
  label: string;
  lat: number;
  lon: number;
  city?: string;
  state?: string;
  postcode?: string;
}

export async function searchAddress(q: string): Promise<Place[]> {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&countrycodes=us&limit=5&q=${encodeURIComponent(q)}`;
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(`Address search failed (${r.status})`);
  const rows = (await r.json()) as { display_name: string; lat: string; lon: string; address?: Record<string, string> }[];
  return rows.map((x) => ({
    label: x.display_name.replace(/, United States$/, ''), lat: Number(x.lat), lon: Number(x.lon),
    city: x.address?.city ?? x.address?.town ?? x.address?.village ?? x.address?.hamlet,
    state: x.address?.state, postcode: x.address?.postcode,
  }));
}

/** County FIPS and metro (CBSA) for a point. */
export async function countyAt(lat: number, lon: number): Promise<{ fips: string; name: string; cbsa: string | null } | null> {
  const r = await fetch(`https://geo.fcc.gov/api/census/area?lat=${lat}&lon=${lon}&format=json`);
  if (!r.ok) return null;
  const j = await r.json() as { results?: { county_fips: string; county_name: string }[] };
  const c = j.results?.[0];
  if (!c) return null;
  return { fips: c.county_fips, name: c.county_name, cbsa: getCounty(c.county_fips)?.cbsa ?? null };
}

export interface Nearby {
  name: string;
  kind: string;
  cuisine?: string;
  hours?: string;
}

export interface NearbySummary {
  radiusMeters: number;
  places: Nearby[];
  byKind: Record<string, number>;
  topCuisines: [string, number][];
  withHours: number;
  /** Most common opening and closing times among places that list hours. */
  typicalOpen?: string;
  typicalClose?: string;
  /** Share of places that list hours that are open on Monday. */
  openMondayPct?: number;
}

const KINDS: Record<string, string> = { restaurant: 'Restaurants', fast_food: 'Fast food and counter', cafe: 'Cafes and coffee', bar: 'Bars', pub: 'Pubs', food_court: 'Food courts', ice_cream: 'Ice cream' };

export async function nearbyFood(lat: number, lon: number, radiusMeters = 800): Promise<NearbySummary> {
  const q = `[out:json][timeout:25];nwr(around:${radiusMeters},${lat},${lon})[amenity~"^(restaurant|fast_food|cafe|bar|pub|food_court|ice_cream)$"];out center tags;`;
  const body = new URLSearchParams({ data: q });
  // Public Overpass servers can take 30+ seconds; ask two at once and use whichever answers first.
  const ask = async (ep: string) => {
    const r = await fetch(ep, { method: 'POST', body, signal: AbortSignal.timeout(90000) });
    if (!r.ok) throw new Error(`${r.status}`);
    return r.json() as Promise<{ elements: { tags?: Record<string, string> }[] }>;
  };
  let j: { elements: { tags?: Record<string, string> }[] };
  try {
    j = await Promise.any(['https://overpass-api.de/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'].map(ask));
  } catch { throw new Error('Nearby places lookup failed'); }
  const places: Nearby[] = j.elements.filter((e) => e.tags?.name).map((e) => ({
    name: e.tags!.name, kind: KINDS[e.tags!.amenity] ?? e.tags!.amenity, cuisine: e.tags!.cuisine?.split(';')[0].replace(/_/g, ' '), hours: e.tags!.opening_hours,
  }));
  return summarize(places, radiusMeters);
}

export function summarize(places: Nearby[], radiusMeters: number): NearbySummary {
  const byKind: Record<string, number> = {};
  const cuisines: Record<string, number> = {};
  for (const p of places) {
    byKind[p.kind] = (byKind[p.kind] ?? 0) + 1;
    if (p.cuisine) cuisines[p.cuisine] = (cuisines[p.cuisine] ?? 0) + 1;
  }
  const opens: Record<string, number> = {}, closes: Record<string, number> = {};
  let withHours = 0, openMonday = 0;
  for (const p of places) {
    if (!p.hours) continue;
    const spans = [...p.hours.matchAll(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/g)];
    if (!spans.length) continue;
    withHours++;
    opens[spans[0][1].padStart(5, '0')] = (opens[spans[0][1].padStart(5, '0')] ?? 0) + 1;
    const last = spans[spans.length - 1][2].padStart(5, '0');
    closes[last] = (closes[last] ?? 0) + 1;
    if (opensMonday(p.hours)) openMonday++;
  }
  const mode = (m: Record<string, number>) => Object.entries(m).sort((a, b) => b[1] - a[1])[0]?.[0];
  return {
    radiusMeters, places, byKind, withHours,
    topCuisines: Object.entries(cuisines).sort((a, b) => b[1] - a[1]).slice(0, 6),
    typicalOpen: mode(opens), typicalClose: mode(closes),
    openMondayPct: withHours ? Math.round((openMonday / withHours) * 100) : undefined,
  };
}

/** Rough reading of OpenStreetMap hours: is Monday covered by a day range and not marked off? */
export function opensMonday(h: string): boolean {
  if (/24\/7/.test(h)) return true;
  if (/Mo[^;]*off/.test(h)) return false;
  const DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
  for (const part of h.split(';')) {
    const days = part.trim().split(/\s+\d/)[0];
    for (const tok of days.split(',')) {
      const [a, b] = tok.trim().split('-');
      if (!DAYS.includes(a)) continue;
      if (a === 'Mo') return true;
      if (b && DAYS.includes(b) && DAYS.indexOf(a) > DAYS.indexOf(b)) return true; // wraps past Sunday
    }
  }
  return false;
}
