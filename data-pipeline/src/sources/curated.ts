// Curated source: hand-maintained known truck hubs (Milence, WattHub, ...).
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PIPELINE_DATA_DIR } from '../paths.js';
import type { FreightSource } from './types.js';
import type { NormalizedFreightLocation } from '../types.js';

interface CuratedHub {
  id: string;
  name: string;
  operatorName?: string;
  city?: string;
  address?: string;
  lat: number;
  lng: number;
  maxPowerKw?: number;
  isMegawatt?: boolean;
  sourceUrl?: string;
}

export const curatedSource: FreightSource = {
  id: 'curated',
  async fetch(): Promise<NormalizedFreightLocation[]> {
    const raw = await readFile(join(PIPELINE_DATA_DIR, 'curated-hubs.json'), 'utf-8');
    const parsed = JSON.parse(raw) as { hubs: CuratedHub[] };
    return (parsed.hubs ?? []).map((h) => ({
      id: `curated:${h.id}`,
      source: 'curated',
      name: h.name,
      address: h.address,
      city: h.city,
      lat: h.lat,
      lng: h.lng,
      operatorName: h.operatorName,
      maxPowerKw: h.maxPowerKw ?? 0,
      isMegawatt: h.isMegawatt ?? false,
      sourceUrl: h.sourceUrl,
      freightKind: 'dedicated',
      freightReason: 'curated',
    }));
  },
};
