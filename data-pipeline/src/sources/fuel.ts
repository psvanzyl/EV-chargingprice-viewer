// Fuel source: scrape brandstofprijzen.nl (crowdsourced NL pump prices) and
// geocode each station via Nominatim (OpenStreetMap). Prices are in euro-cents
// per litre on the site; we normalise to €/L. Only Dutch stations (postal code
// like "1234 AB") are kept — Belgian/German border stations are dropped.
//
// The site is a frameset; the price table lives in tanks.php. Each data row is
// a <tr> whose <input> cells carry: [brand, address, city, euro95, e10, plus98,
// super, diesel, lpg, cng]. The postal code is the first <a> text matching
// ^\d{4}. Coordinates are NOT in the table — we geocode "address, postal city"
// via Nominatim and cache the result so re-runs don't hammer the API.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { CACHE_DIR } from '../paths.js';
import type { FreightSource } from './types.js';
import type { NormalizedFreightLocation } from '../types.js';

const TANKS_URL = 'https://www.brandstofprijzen.nl/tanks.php';
const GEOCODE_URL = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'EV-chargingprice-viewer/1.0 (homelab; contact: psvanzyl@gmail.com)';
const GEOCODE_CACHE = join(CACHE_DIR, 'fuel-geocode.json');

// Fuel types we surface on the map. Key = column index in the input array.
const FUEL_COLUMNS: Record<string, number> = {
  euro95: 3,
  e10: 4,
  plus98: 5,
  super: 6,
  diesel: 7,
  lpg: 8,
  cng: 9,
};

export interface FuelStation {
  id: string;
  name: string;
  brand: string;
  address: string;
  city: string;
  postalCode: string;
  lat: number;
  lng: number;
  prices: Record<string, number>; // €/L, only present when > 0
  lastUpdated: string;
}

interface GeoCache {
  [key: string]: { lat: number; lng: number } | null;
}

async function loadGeoCache(): Promise<GeoCache> {
  try {
    return JSON.parse(await readFile(GEOCODE_CACHE, 'utf-8')) as GeoCache;
  } catch {
    return {};
  }
}

async function saveGeoCache(cache: GeoCache): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(GEOCODE_CACHE, JSON.stringify(cache));
}

// Geocode "address, postal city" via Nominatim with a small delay to respect
// the usage policy. Returns null when no result (station dropped).
async function geocode(
  address: string,
  postalCode: string,
  city: string,
  cache: GeoCache,
): Promise<{ lat: number; lng: number } | null> {
  const key = `${address}, ${postalCode} ${city}`.toLowerCase();
  if (key in cache) return cache[key];

  const q = encodeURIComponent(`${address}, ${postalCode} ${city}, Nederland`);
  const url = `${GEOCODE_URL}?q=${q}&format=json&limit=1&countrycodes=nl`;
  try {
    const resp = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!resp.ok) {
      console.warn(`  geocode HTTP ${resp.status} for ${key}`);
      cache[key] = null;
      return null;
    }
    const data = (await resp.json()) as Array<{ lat: string; lon: string }>;
    if (!data.length) {
      cache[key] = null;
      return null;
    }
    const hit = { lat: Number.parseFloat(data[0].lat), lng: Number.parseFloat(data[0].lon) };
    cache[key] = hit;
    // Be polite to Nominatim: ~1s between requests.
    await new Promise((r) => setTimeout(r, 1000));
    return hit;
  } catch (err) {
    console.warn(`  geocode failed for ${key}: ${(err as Error).message}`);
    cache[key] = null;
    return null;
  }
}

function parsePrice(v: string): number | null {
  const n = Number.parseFloat(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n / 100; // cents -> €
}

export const fuelSource: FreightSource = {
  id: 'fuel',
  async fetch(): Promise<NormalizedFreightLocation[]> {
    console.log('  [fuel] scraping brandstofprijzen.nl ...');
    const resp = await fetch(TANKS_URL, { headers: { 'User-Agent': USER_AGENT } });
    if (!resp.ok) throw new Error(`brandstofprijzen.nl HTTP ${resp.status}`);
    const html = await resp.text();

    // Extract <tr> rows; each data row has >= 8 <input> cells.
    const rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) ?? [];
    const cache = await loadGeoCache();
    const stations: FuelStation[] = [];

    for (const row of rows) {
      const inputs = [...row.matchAll(/<input[^>]*value="?([^">]*)"?[^>]*>/g)].map((m) => m[1]);
      if (inputs.length < 8) continue;

      const brand = inputs[0]?.trim() ?? '';
      const address = inputs[1]?.trim() ?? '';
      const city = inputs[2]?.trim() ?? '';
      // Drop non-NL stations (city marked "(B)" or "(D)").
      if (/\([BD]\)$/.test(city)) continue;

      // Postal code: first <a> text matching ^\d{4}.
      const links = [...row.matchAll(/<a[^>]*>([\s\S]*?)<\/a>/g)].map((m) =>
        m[1].replace(/<[^>]+>/g, '').trim(),
      );
      const postal = links.find((t) => /^\d{4}/.test(t)) ?? '';
      if (!postal) continue;

      const prices: Record<string, number> = {};
      for (const [fuel, idx] of Object.entries(FUEL_COLUMNS)) {
        const p = parsePrice(inputs[idx] ?? '');
        if (p !== null) prices[fuel] = p;
      }
      if (Object.keys(prices).length === 0) continue;

      const geo = await geocode(address, postal, city, cache);
      if (!geo) continue;

      const name = `${brand} ${city}`.trim();
      stations.push({
        id: `fuel:${postal.replace(/\s/g, '')}-${address.replace(/[^a-z0-9]/gi, '').toLowerCase()}`,
        name,
        brand,
        address,
        city,
        postalCode: postal,
        lat: geo.lat,
        lng: geo.lng,
        prices,
        lastUpdated: new Date().toISOString(),
      });
    }

    await saveGeoCache(cache);
    console.log(`  [fuel] ${stations.length} NL stations scraped`);

    // Map to the freight-location shape so the pipeline can merge them. We use
    // the cheapest fuel price as the "price" for colouring, and stash the full
    // price map in a custom field the webapp reads.
    return stations.map((s) => {
      const cheapest = Math.min(...Object.values(s.prices));
      return {
        id: s.id,
        source: 'fuel',
        name: s.name,
        address: s.address,
        city: s.city,
        lat: s.lat,
        lng: s.lng,
        operatorName: s.brand,
        maxPowerKw: 0,
        isMegawatt: false,
        status: 'UNKNOWN' as const,
        priceKwh: cheapest,
        freightKind: 'dedicated' as const,
        freightReason: 'curated' as const,
        // Custom payload for the webapp fuel layer.
        fuel: s.prices,
        fuelPostal: s.postalCode,
        fuelUpdated: s.lastUpdated,
      } as NormalizedFreightLocation & {
        fuel?: Record<string, number>;
        fuelPostal?: string;
        fuelUpdated?: string;
      };
    });
  },
};
