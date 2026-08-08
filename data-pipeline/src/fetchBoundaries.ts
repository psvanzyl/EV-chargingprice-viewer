// Fetch gemeente + provincie boundaries from the PDOK CBS Gebiedsindelingen WFS.
// Generalized layers, GeoJSON output, EPSG:4326 ([lon,lat]).
import { readFile, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import bbox from '@turf/bbox';
import { CACHE_DIR } from './paths.js';

export const BOUNDARY_YEAR = process.env.BOUNDARY_YEAR ?? '2025';
const WFS_BASE = `https://service.pdok.nl/cbs/gebiedsindelingen/${BOUNDARY_YEAR}/wfs/v1_0`;
const PAGE_SIZE = 1000;
const MAX_CACHE_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface BoundaryFeature {
  type: 'Feature';
  properties: { statcode: string; statnaam: string; rubriek?: string };
  geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown };
}
export interface BoundaryCollection {
  type: 'FeatureCollection';
  features: BoundaryFeature[];
}

async function fetchAllPages(typeName: string): Promise<BoundaryFeature[]> {
  const features: BoundaryFeature[] = [];
  let startIndex = 0;
  // Defensive paging: stop when a page returns fewer than PAGE_SIZE.
  for (;;) {
    const url =
      `${WFS_BASE}?service=WFS&version=2.0.0&request=GetFeature` +
      `&typeName=${encodeURIComponent(typeName)}` +
      `&outputFormat=application/json&srsName=EPSG:4326` +
      `&count=${PAGE_SIZE}&startIndex=${startIndex}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`PDOK WFS ${res.status} for ${typeName}`);
    const data = (await res.json()) as BoundaryCollection;
    const page = data.features ?? [];
    features.push(...page);
    if (page.length < PAGE_SIZE) break;
    startIndex += PAGE_SIZE;
  }
  return features;
}

async function cachedFetch(typeName: string, cacheName: string, refresh: boolean): Promise<BoundaryFeature[]> {
  const cachePath = join(CACHE_DIR, cacheName);
  if (!refresh) {
    try {
      const s = await stat(cachePath);
      if (Date.now() - s.mtimeMs < MAX_CACHE_AGE_MS) {
        return JSON.parse(await readFile(cachePath, 'utf-8')) as BoundaryFeature[];
      }
    } catch {
      /* fall through to fetch */
    }
  }
  const features = await fetchAllPages(typeName);
  await writeFile(cachePath, JSON.stringify(features));
  return features;
}

export interface Boundaries {
  gemeenten: BoundaryFeature[];
  provinces: BoundaryFeature[];
  // Precomputed bbox per gemeente: [minX, minY, maxX, maxY]
  gemeenteBboxes: Map<string, [number, number, number, number]>;
}

export async function fetchBoundaries(refresh = false): Promise<Boundaries> {
  console.log(`Fetching PDOK CBS boundaries (year ${BOUNDARY_YEAR})...`);
  const [gemeenten, provinces] = await Promise.all([
    cachedFetch('gebiedsindelingen:gemeente_gegeneraliseerd', `gemeenten-${BOUNDARY_YEAR}.json`, refresh),
    cachedFetch('gebiedsindelingen:provincie_gegeneraliseerd', `provincies-${BOUNDARY_YEAR}.json`, refresh),
  ]);

  const gemeenteBboxes = new Map<string, [number, number, number, number]>();
  for (const g of gemeenten) {
    gemeenteBboxes.set(g.properties.statcode, bbox(g as any) as [number, number, number, number]);
  }

  console.log(`  ${gemeenten.length} gemeenten, ${provinces.length} provinces`);
  return { gemeenten, provinces, gemeenteBboxes };
}
