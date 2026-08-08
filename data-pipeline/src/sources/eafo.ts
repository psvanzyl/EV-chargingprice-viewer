// EAFO (European Alternative Fuels Observatory) source.
// EAFO has no stable per-location public JSON API, so this source reads an
// optional, periodically-refreshed static export checked into data/.
// Drop a file at data/eafo-nl-freight.json with shape: { locations: [...] }.
// If absent, the source logs and returns nothing (never fails the pipeline).
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PIPELINE_DATA_DIR } from '../paths.js';
import type { FreightSource } from './types.js';
import type { NormalizedFreightLocation } from '../types.js';

interface EafoEntry {
  id?: string | number;
  name?: string;
  operator?: string;
  city?: string;
  address?: string;
  lat: number;
  lng: number;
  maxPowerKw?: number;
}

export const eafoSource: FreightSource = {
  id: 'eafo',
  async fetch(): Promise<NormalizedFreightLocation[]> {
    let raw: string;
    try {
      raw = await readFile(join(PIPELINE_DATA_DIR, 'eafo-nl-freight.json'), 'utf-8');
    } catch {
      console.warn('  [eafo] no data/eafo-nl-freight.json export found — skipping EAFO');
      return [];
    }
    const parsed = JSON.parse(raw) as { locations?: EafoEntry[] };
    return (parsed.locations ?? [])
      .filter((e) => Number.isFinite(e.lat) && Number.isFinite(e.lng))
      .map((e, i) => ({
        id: `eafo:${e.id ?? i}`,
        source: 'eafo',
        name: e.name ?? 'EAFO heavy-duty location',
        address: e.address,
        city: e.city,
        lat: e.lat,
        lng: e.lng,
        operatorName: e.operator,
        maxPowerKw: e.maxPowerKw ?? 0,
        isMegawatt: (e.maxPowerKw ?? 0) >= 1000,
      }));
  },
};
