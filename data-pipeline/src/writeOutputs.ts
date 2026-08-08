// Write all static artifacts into webapp/public/.
import { mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DATA_DIR, GEMEENTEN_DIR, MUNICIPALITIES_JSON, PIPELINE_DATA_DIR } from './paths.js';
import { slugify } from './slugify.js';
import type { Boundaries, BoundaryFeature } from './fetchBoundaries.js';
import { GemeenteAssigner } from './assignGemeente.js';
import type { LightLocation, EnrichedLocation } from './types.js';

interface SeedMunicipality {
  name: string;
  slug: string;
  province: string;
  population: number;
  code: string | null;
}

interface WriteInput {
  passengerLights: LightLocation[];
  freightLights: LightLocation[];
  enrichedById: Map<string, EnrichedLocation>;
  boundaries: Boundaries;
  generatedAt: string;
}

function pointFeature(l: LightLocation) {
  return {
    type: 'Feature' as const,
    geometry: { type: 'Point' as const, coordinates: [l.lng, l.lat] },
    properties: {
      type: 'charge',
      layer: l.layer,
      locationId: l.locationId,
      name: l.name,
      address: l.address ?? '',
      city: l.city ?? '',
      operatorName: l.operatorName ?? '',
      maxPowerKw: l.maxPowerKw,
      isMegawatt: l.isMegawatt,
      status: l.status,
      source: l.source,
      ...(l.priceKwh != null ? { priceKwh: l.priceKwh } : {}),
      ...(l.freightKind ? { freightKind: l.freightKind } : {}),
      ...(l.freightReason ? { freightReason: l.freightReason } : {}),
    },
  };
}

function boundaryFeature(g: BoundaryFeature) {
  return {
    type: 'Feature' as const,
    geometry: g.geometry,
    properties: { type: 'boundary', gemeente: g.properties.statnaam, code: g.properties.statcode },
  };
}

export async function writeOutputs(input: WriteInput): Promise<void> {
  const { passengerLights, freightLights, enrichedById, boundaries, generatedAt } = input;
  console.log('Writing outputs...');

  // Fresh gemeenten dir.
  await rm(GEMEENTEN_DIR, { recursive: true, force: true });
  await mkdir(GEMEENTEN_DIR, { recursive: true });

  const assigner = new GemeenteAssigner(boundaries);
  const seed = JSON.parse(await readFile(join(PIPELINE_DATA_DIR, 'municipalities-seed.json'), 'utf-8')) as SeedMunicipality[];
  const seedByCode = new Map<string, SeedMunicipality>();
  for (const m of seed) if (m.code) seedByCode.set(m.code, m);

  // Group lights by gemeente code.
  const byGemeente = new Map<string, LightLocation[]>();
  let unassigned = 0;
  let viaFallback = 0;
  for (const l of [...passengerLights, ...freightLights]) {
    const res = assigner.assignWithFallback(l);
    if (!res) {
      unassigned++;
      continue;
    }
    if (res.fallback) viaFallback++;
    let arr = byGemeente.get(res.code);
    if (!arr) byGemeente.set(res.code, (arr = []));
    arr.push(l);
  }
  console.log(
    `  assigned points; ${viaFallback} via nearest-gemeente fallback, ${unassigned} unassigned (kept in national files only)`,
  );

  // Per-gemeente crop-out + detail bundle.
  const municipalities: Array<SeedMunicipality & { passengerCount: number; freightCount: number }> = [];
  const slugByCode = new Map<string, string>();

  for (const g of boundaries.gemeenten) {
    const code = g.properties.statcode;
    const name = g.properties.statnaam;
    const slug = slugify(name);
    slugByCode.set(code, slug);

    const lights = byGemeente.get(code) ?? [];
    const passengerCount = lights.filter((l) => l.layer === 'passenger').length;
    const freightCount = lights.filter((l) => l.layer === 'freight').length;
    const bounds = boundaries.gemeenteBboxes.get(code) ?? [0, 0, 0, 0];
    const operators = [...new Set(lights.map((l) => l.operatorName).filter(Boolean))].sort() as string[];

    const cropout = {
      type: 'FeatureCollection' as const,
      metadata: {
        gemeente: name,
        slug,
        code,
        generated_at: generatedAt,
        total_passenger: passengerCount,
        total_freight: freightCount,
        bounds,
        operators,
      },
      features: [...lights.map(pointFeature), boundaryFeature(g)],
    };

    // Detail bundle: enriched details for the lights in this gemeente that have them.
    const details: Record<string, EnrichedLocation> = {};
    for (const l of lights) {
      const d = enrichedById.get(l.locationId);
      if (d) details[l.locationId] = d;
    }

    await writeFile(join(GEMEENTEN_DIR, `${slug}.geojson`), JSON.stringify(cropout));
    await writeFile(join(GEMEENTEN_DIR, `${slug}.details.json`), JSON.stringify(details));

    const sm = seedByCode.get(code);
    municipalities.push({
      name,
      slug,
      province: sm?.province ?? '',
      population: sm?.population ?? 0,
      code,
      passengerCount,
      freightCount,
    });
  }

  // National lightweight files (every point, no details), split by layer.
  await writeFile(
    join(DATA_DIR, 'nederland-passenger.geojson'),
    JSON.stringify({
      type: 'FeatureCollection',
      metadata: { generated_at: generatedAt, layer: 'passenger', total: passengerLights.length },
      features: passengerLights.map(pointFeature),
    }),
  );
  await writeFile(
    join(DATA_DIR, 'nederland-freight.geojson'),
    JSON.stringify({
      type: 'FeatureCollection',
      metadata: { generated_at: generatedAt, layer: 'freight', total: freightLights.length },
      features: freightLights.map(pointFeature),
    }),
  );

  // Province boundaries.
  await writeFile(
    join(DATA_DIR, 'provinces.geojson'),
    JSON.stringify({
      type: 'FeatureCollection',
      metadata: { generated_at: generatedAt },
      features: boundaries.provinces.map(boundaryFeature),
    }),
  );

  // municipalities.json: Nederland (total) first, then gemeenten alphabetical.
  municipalities.sort((a, b) => a.name.localeCompare(b.name));
  const totalPassenger = passengerLights.length;
  const totalFreight = freightLights.length;
  const nederland = {
    name: 'Nederland (totaal)',
    slug: 'nederland',
    province: 'Alle provincies',
    population: 17561268,
    code: null,
    passengerCount: totalPassenger,
    freightCount: totalFreight,
  };
  await writeFile(MUNICIPALITIES_JSON, JSON.stringify([nederland, ...municipalities], null, 2));

  console.log(
    `  wrote ${municipalities.length} gemeente crop-outs + detail bundles, ` +
      `national files (${totalPassenger} passenger / ${totalFreight} freight), provinces, municipalities.json`,
  );
}
