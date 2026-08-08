// Download + gunzip + parse the NDW OCPI open-data feeds.
// Adapted from fleetsim/scripts/import-charging-points.ts (Prisma upsert removed).

import { gunzipSync } from 'node:zlib';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, stat } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { join } from 'node:path';
import { CACHE_DIR } from './paths.js';
import type { OCPILocation, OCPITariff } from './types.js';

const NDW_LOCATIONS_URL = 'https://opendata.ndw.nu/charging_point_locations_ocpi.json.gz';
const NDW_TARIFFS_URL = 'https://opendata.ndw.nu/charging_point_tariffs_ocpi.json.gz';

// Re-download cached files older than this (ms). Default: 12 hours.
const MAX_CACHE_AGE_MS = 12 * 60 * 60 * 1000;

async function fileFreshEnough(path: string): Promise<boolean> {
  try {
    const s = await stat(path);
    return Date.now() - s.mtimeMs < MAX_CACHE_AGE_MS;
  } catch {
    return false;
  }
}

async function download(url: string, outputPath: string): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true });
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }
  const fileStream = createWriteStream(outputPath);
  await pipeline(Readable.fromWeb(response.body as any), fileStream);
}

async function loadGzJson<T>(url: string, cacheName: string, refresh: boolean): Promise<T> {
  const cachePath = join(CACHE_DIR, cacheName);
  const fresh = !refresh && (await fileFreshEnough(cachePath));
  if (fresh) {
    console.log(`  using cached ${cacheName}`);
  } else {
    console.log(`  downloading ${cacheName} ...`);
    try {
      await download(url, cachePath);
    } catch (err) {
      // Fall back to a stale cache if the download fails.
      if (await fileFreshEnough(cachePath).catch(() => false) || (await stat(cachePath).then(() => true).catch(() => false))) {
        console.warn(`  download failed, falling back to cached ${cacheName}: ${(err as Error).message}`);
      } else {
        throw err;
      }
    }
  }
  const buffer = await readFile(cachePath);
  const json = gunzipSync(buffer).toString('utf-8');
  return JSON.parse(json) as T;
}

function isUsable(loc: OCPILocation): boolean {
  if (loc.publish === false) return false;
  const lat = Number.parseFloat(loc.coordinates?.latitude ?? '');
  const lng = Number.parseFloat(loc.coordinates?.longitude ?? '');
  return Number.isFinite(lat) && Number.isFinite(lng);
}

// Locations only — used by the hourly snapshot job (no tariffs needed).
export async function fetchNdwLocations(refresh = false): Promise<OCPILocation[]> {
  const raw = await loadGzJson<OCPILocation[]>(NDW_LOCATIONS_URL, 'charging-locations.json.gz', refresh);
  return raw.filter(isUsable);
}

export interface NdwData {
  locations: OCPILocation[];
  tariffMap: Map<string, OCPITariff>;
}

export async function fetchNdw(refresh = false): Promise<NdwData> {
  console.log('Fetching NDW OCPI data...');
  const [rawLocations, tariffs] = await Promise.all([
    loadGzJson<OCPILocation[]>(NDW_LOCATIONS_URL, 'charging-locations.json.gz', refresh),
    loadGzJson<OCPITariff[]>(NDW_TARIFFS_URL, 'charging-tariffs.json.gz', refresh),
  ]);

  const locations = rawLocations.filter(isUsable);

  const tariffMap = new Map<string, OCPITariff>();
  for (const t of tariffs) tariffMap.set(t.id, t);

  console.log(`  loaded ${locations.length} published locations, ${tariffMap.size} tariffs`);
  return { locations, tariffMap };
}
