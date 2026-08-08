// Open Charge Map source. Requires a free API key (env OCM_API_KEY).
// Filters to high-power POIs (>= 150 kW) as a freight-capable heuristic.
import { join } from 'node:path';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { CACHE_DIR } from '../paths.js';
import type { FreightSource } from './types.js';
import type { NormalizedFreightLocation } from '../types.js';

const OCM_MIN_KW = 150;
const CACHE_PATH = join(CACHE_DIR, 'ocm-nl.json');
const MAX_CACHE_AGE_MS = 24 * 60 * 60 * 1000;

interface OcmConnection {
  PowerKW?: number;
  LevelID?: number;
}
interface OcmPoi {
  ID: number;
  AddressInfo?: {
    Title?: string;
    AddressLine1?: string;
    Town?: string;
    Latitude: number;
    Longitude: number;
  };
  OperatorInfo?: { Title?: string };
  Connections?: OcmConnection[];
}

async function loadCached(refresh: boolean): Promise<OcmPoi[] | null> {
  if (refresh) return null;
  try {
    const s = await stat(CACHE_PATH);
    if (Date.now() - s.mtimeMs > MAX_CACHE_AGE_MS) return null;
    return JSON.parse(await readFile(CACHE_PATH, 'utf-8')) as OcmPoi[];
  } catch {
    return null;
  }
}

export const openChargeMapSource: FreightSource = {
  id: 'ocm',
  async fetch(refresh: boolean): Promise<NormalizedFreightLocation[]> {
    const key = process.env.OCM_API_KEY;
    let pois = await loadCached(refresh);

    if (!pois) {
      if (!key) {
        console.warn('  [ocm] OCM_API_KEY not set and no fresh cache — skipping Open Charge Map');
        return [];
      }
      const url =
        `https://api.openchargemap.io/v3/poi/?countrycode=NL&maxresults=10000` +
        `&compact=true&verbose=false&key=${encodeURIComponent(key)}`;
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`OCM API ${res.status} ${res.statusText}`);
      pois = (await res.json()) as OcmPoi[];
      await writeFile(CACHE_PATH, JSON.stringify(pois));
    }

    const out: NormalizedFreightLocation[] = [];
    for (const p of pois) {
      const info = p.AddressInfo;
      if (!info || !Number.isFinite(info.Latitude) || !Number.isFinite(info.Longitude)) continue;
      const maxKw = Math.max(0, ...(p.Connections ?? []).map((c) => c.PowerKW ?? 0));
      if (maxKw < OCM_MIN_KW) continue; // freight-capable heuristic
      out.push({
        id: `ocm:${p.ID}`,
        source: 'ocm',
        name: info.Title ?? 'Charging location',
        address: info.AddressLine1,
        city: info.Town,
        lat: info.Latitude,
        lng: info.Longitude,
        operatorName: p.OperatorInfo?.Title,
        maxPowerKw: Math.round(maxKw),
        isMegawatt: maxKw >= 1000,
        sourceUrl: `https://openchargemap.org/site/poi/details/${p.ID}`,
      });
    }
    return out;
  },
};
