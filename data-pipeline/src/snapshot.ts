// Hourly snapshot job: download NDW OCPI gz, compute per-location occupancy% +
// aggregate status, group by gemeente, append an hourly sample to per-gemeente
// per-day files, refresh per-gemeente current-status files, then roll up old
// hourly files into daily averages and prune.
//
// Run by the GitHub Action (and locally via `npm run snapshot`).
import { readdir, readFile, writeFile, mkdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fetchNdwLocations } from './fetchNdw.js';
import { aggregateStatus } from './classifyFreight.js';
import { sanitizeId } from './slugify.js';
import { GEMEENTEN_DIR, SNAPSHOTS_DIR, STATUS_DIR } from './paths.js';
import type { OCPILocation, AggregateStatus } from './types.js';

const HOURLY_RETENTION_DAYS = 30; // keep raw hourly files this long
const DAILY_RETENTION_DAYS = 365; // keep daily averages this long

interface DayFile {
  date: string;
  tz: string;
  locations: Record<string, { n: number; occ: (number | null)[] }>;
}
type DailyFile = Record<string, Record<string, number>>; // locId -> { date -> avgOcc }

// Amsterdam-local date (YYYY-MM-DD) + hour (0-23) for "over the day" semantics.
function amsterdamNow(): { date: string; hour: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Amsterdam',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const date = `${get('year')}-${get('month')}-${get('day')}`;
  const hour = Number.parseInt(get('hour'), 10) % 24;
  return { date, hour };
}

function dayNumber(date: string): number {
  return Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000);
}

// Build locationId -> gemeente slug from the committed crop-out GeoJSONs.
async function buildSlugMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  let files: string[] = [];
  try {
    files = (await readdir(GEMEENTEN_DIR)).filter((f) => f.endsWith('.geojson'));
  } catch {
    throw new Error(`No crop-outs found in ${GEMEENTEN_DIR}; run the full pipeline first.`);
  }
  for (const f of files) {
    const slug = f.replace(/\.geojson$/, '');
    const data = JSON.parse(await readFile(join(GEMEENTEN_DIR, f), 'utf-8')) as {
      features: Array<{ properties: { type: string; locationId?: string } }>;
    };
    for (const feat of data.features) {
      if (feat.properties.type === 'charge' && feat.properties.locationId) {
        map.set(feat.properties.locationId, slug);
      }
    }
  }
  return map;
}

function occupancyAndStatus(loc: OCPILocation): { n: number; occ: number | null; status: AggregateStatus } {
  const evses = loc.evses ?? [];
  const n = evses.length;
  const status = aggregateStatus(loc);
  if (n === 0) return { n: 0, occ: null, status };
  const charging = evses.filter((e) => e.status === 'CHARGING').length;
  // "Usage" = share of connectors actively charging.
  return { n, occ: Math.round((100 * charging) / n), status };
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, 'utf-8')) as T;
  } catch {
    return null;
  }
}

async function main() {
  const refresh = true; // always pull a fresh gz in the hourly job
  const { date, hour } = amsterdamNow();
  console.log(`\n=== Charging snapshot ${date} hour ${hour} (Europe/Amsterdam) ===`);

  const [locations, slugMap] = await Promise.all([fetchNdwLocations(refresh), buildSlugMap()]);
  console.log(`  ${locations.length} locations, ${slugMap.size} mapped to a gemeente`);

  // Group this hour's samples + statuses by gemeente.
  const byGemeente = new Map<string, Map<string, { n: number; occ: number | null }>>();
  const statusByGemeente = new Map<string, Record<string, AggregateStatus>>();
  let sampled = 0;

  for (const loc of locations) {
    const locId = sanitizeId(loc.id);
    const slug = slugMap.get(locId);
    if (!slug) continue;
    const { n, occ, status } = occupancyAndStatus(loc);
    let g = byGemeente.get(slug);
    if (!g) byGemeente.set(slug, (g = new Map()));
    g.set(locId, { n, occ });
    let s = statusByGemeente.get(slug);
    if (!s) statusByGemeente.set(slug, (s = {}));
    s[locId] = status;
    sampled++;
  }
  console.log(`  sampled ${sampled} locations across ${byGemeente.size} gemeenten`);

  await mkdir(STATUS_DIR, { recursive: true });

  // Append hourly samples + write current-status per gemeente.
  for (const [slug, samples] of byGemeente) {
    const dir = join(SNAPSHOTS_DIR, slug);
    await mkdir(dir, { recursive: true });
    const dayPath = join(dir, `${date}.json`);
    const day = (await readJson<DayFile>(dayPath)) ?? { date, tz: 'Europe/Amsterdam', locations: {} };
    for (const [locId, { n, occ }] of samples) {
      let entry = day.locations[locId];
      if (!entry) entry = day.locations[locId] = { n, occ: Array(24).fill(null) };
      entry.n = n;
      entry.occ[hour] = occ;
    }
    await writeFile(dayPath, JSON.stringify(day));
    await writeFile(join(STATUS_DIR, `${slug}.json`), JSON.stringify(statusByGemeente.get(slug) ?? {}));
  }

  await rollupAndPrune(date);
  console.log('=== Snapshot done ===\n');
}

// Collapse hourly files older than HOURLY_RETENTION_DAYS into per-gemeente daily
// averages, delete them, and trim daily entries older than DAILY_RETENTION_DAYS.
async function rollupAndPrune(today: string): Promise<void> {
  const todayNum = dayNumber(today);
  let slugs: string[] = [];
  try {
    slugs = await readdir(SNAPSHOTS_DIR);
  } catch {
    return;
  }
  let rolled = 0;
  let pruned = 0;

  for (const slug of slugs) {
    const dir = join(SNAPSHOTS_DIR, slug);
    let entries: string[];
    try {
      if (!(await stat(dir)).isDirectory()) continue;
      entries = await readdir(dir);
    } catch {
      continue;
    }
    const dailyPath = join(dir, 'daily.json');
    const daily = (await readJson<DailyFile>(dailyPath)) ?? {};
    let dailyChanged = false;

    for (const file of entries) {
      const m = file.match(/^(\d{4}-\d{2}-\d{2})\.json$/);
      if (!m) continue;
      const fileDate = m[1];
      const age = todayNum - dayNumber(fileDate);
      if (age <= HOURLY_RETENTION_DAYS) continue;

      const day = await readJson<DayFile>(join(dir, file));
      if (day) {
        for (const [locId, { occ }] of Object.entries(day.locations)) {
          const vals = occ.filter((v): v is number => v !== null);
          if (vals.length === 0) continue;
          const avg = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
          (daily[locId] ??= {})[fileDate] = avg;
        }
      }
      await rm(join(dir, file), { force: true });
      rolled++;
      dailyChanged = true;
    }

    // Trim daily entries older than DAILY_RETENTION_DAYS.
    for (const locId of Object.keys(daily)) {
      for (const d of Object.keys(daily[locId])) {
        if (todayNum - dayNumber(d) > DAILY_RETENTION_DAYS) {
          delete daily[locId][d];
          dailyChanged = true;
          pruned++;
        }
      }
      if (Object.keys(daily[locId]).length === 0) delete daily[locId];
    }

    if (dailyChanged) await writeFile(dailyPath, JSON.stringify(daily));
  }
  if (rolled || pruned) console.log(`  rollup: ${rolled} day-files -> daily averages, pruned ${pruned} old entries`);
}

main().catch((err) => {
  console.error('Snapshot failed:', err);
  process.exit(1);
});
