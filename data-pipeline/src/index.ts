// Orchestrator: NDW OCPI + external freight + PDOK boundaries -> static files.
import { fetchNdw } from './fetchNdw.js';
import { classifyLocation, aggregateStatus, connectorPowerW } from './classifyFreight.js';
import { fetchBoundaries } from './fetchBoundaries.js';
import { writeOutputs } from './writeOutputs.js';
import { sanitizeId } from './slugify.js';
import { curatedSource } from './sources/curated.js';
import { eafoSource } from './sources/eafo.js';
import { openChargeMapSource } from './sources/openChargeMap.js';
import { mergeFreight } from './sources/merge.js';
import { resolveConnectorPrice } from './tariff.js';
import type { FreightSource } from './sources/types.js';
import type {
  OCPILocation,
  OCPITariff,
  LightLocation,
  EnrichedLocation,
  NormalizedFreightLocation,
  ClassificationMeta,
} from './types.js';

const EXTERNAL_SOURCES: FreightSource[] = [curatedSource, eafoSource, openChargeMapSource];

function enrich(
  loc: OCPILocation,
  meta: ClassificationMeta,
  tariffMap: Map<string, OCPITariff>,
  locationId: string,
  now: Date,
): EnrichedLocation {
  return {
    locationId,
    ocpiId: loc.id,
    name: loc.name || loc.address,
    address: loc.address,
    city: loc.city,
    postalCode: loc.postal_code,
    country: loc.country,
    latitude: Number.parseFloat(loc.coordinates.latitude),
    longitude: Number.parseFloat(loc.coordinates.longitude),
    parkingType: loc.parking_type,
    operatorName: loc.operator?.name ?? 'Onbekend',
    operatorWebsite: loc.operator?.website,
    ownerName: loc.owner?.name,
    twentyFourSeven: loc.opening_times?.twentyfourseven ?? false,
    lastUpdated: loc.last_updated,
    layer: meta.category,
    maxPowerKw: meta.maxPowerKw,
    freightKind: meta.freightKind,
    freightReason: meta.freightReason,
    evses: (loc.evses ?? []).map((evse) => ({
      ...evse,
      connectors: (evse.connectors ?? []).map((c) => {
        const tariffs = (c.tariff_ids ?? [])
          .map((id) => tariffMap.get(id))
          .filter((t): t is OCPITariff => Boolean(t));
        const powerKw = connectorPowerW(c) / 1000;
        const resolved = resolveConnectorPrice(tariffs, powerKw, now);
        return {
          ...c,
          tariffs,
          ...(resolved ? { priceKwh: resolved.price, priceVat: resolved.vat } : {}),
        };
      }),
    })),
  };
}

// Cheapest resolved €/kWh across a location's connectors (the headline shown on
// the map / used by the analysis layer). undefined when no connector has a price.
function locationPriceKwh(loc: EnrichedLocation): number | undefined {
  let min: number | undefined;
  for (const e of loc.evses) {
    for (const c of e.connectors) {
      if (typeof c.priceKwh === 'number' && (min === undefined || c.priceKwh < min)) min = c.priceKwh;
    }
  }
  return min;
}

async function main() {
  const refresh = process.argv.includes('--refresh');
  const now = new Date();
  const generatedAt = now.toISOString();
  console.log(`\n=== Laadpalenviewer data pipeline (${generatedAt}) ===\n`);

  // 1. NDW OCPI.
  const { locations, tariffMap } = await fetchNdw(refresh);

  // 2. Classify + build lights + enriched.
  const passengerLights: LightLocation[] = [];
  const ndwFreightNormalized: NormalizedFreightLocation[] = [];
  const enrichedById = new Map<string, EnrichedLocation>();
  let freightFromNdw = 0;

  for (const loc of locations) {
    const meta = classifyLocation(loc);
    const status = aggregateStatus(loc);
    const lat = Number.parseFloat(loc.coordinates.latitude);
    const lng = Number.parseFloat(loc.coordinates.longitude);
    const locationId = sanitizeId(loc.id);
    const enriched = enrich(loc, meta, tariffMap, locationId, now);
    enrichedById.set(locationId, enriched);
    const priceKwh = locationPriceKwh(enriched);

    if (meta.category === 'passenger') {
      passengerLights.push({
        locationId,
        ocpiId: loc.id,
        name: loc.name || loc.address,
        address: loc.address,
        city: loc.city,
        operatorName: loc.operator?.name,
        lat,
        lng,
        layer: 'passenger',
        maxPowerKw: meta.maxPowerKw,
        isMegawatt: meta.isMegawatt,
        status,
        source: 'ndw',
        priceKwh,
      });
    } else {
      freightFromNdw++;
      ndwFreightNormalized.push({
        id: locationId, // matches enrichedById key so detail bundle resolves
        source: 'ndw',
        name: loc.name || loc.address,
        address: loc.address,
        city: loc.city,
        lat,
        lng,
        operatorName: loc.operator?.name,
        maxPowerKw: meta.maxPowerKw,
        isMegawatt: meta.isMegawatt,
        status,
        priceKwh,
        freightKind: meta.freightKind,
        freightReason: meta.freightReason,
      });
    }
  }
  console.log(`  classified: ${passengerLights.length} passenger, ${freightFromNdw} freight (NDW)`);

  // 3. External freight sources (each isolated; failure -> skip).
  const externalGroups: NormalizedFreightLocation[][] = [];
  for (const src of EXTERNAL_SOURCES) {
    try {
      const items = await src.fetch(refresh);
      console.log(`  [${src.id}] ${items.length} freight locations`);
      externalGroups.push(items);
    } catch (err) {
      console.warn(`  [${src.id}] failed, skipping: ${(err as Error).message}`);
    }
  }

  // 4. Merge + dedupe freight.
  const mergedFreight = mergeFreight([ndwFreightNormalized, ...externalGroups]);
  console.log(`  merged freight (deduped): ${mergedFreight.length}`);

  const freightLights: LightLocation[] = mergedFreight.map((f) => ({
    locationId: f.id,
    name: f.name,
    address: f.address,
    city: f.city,
    operatorName: f.operatorName,
    lat: f.lat,
    lng: f.lng,
    layer: 'freight',
    maxPowerKw: f.maxPowerKw,
    isMegawatt: f.isMegawatt ?? false,
    status: f.status ?? 'UNKNOWN',
    source: f.source,
    sourceUrl: f.sourceUrl,
    priceKwh: f.priceKwh,
    freightKind: f.freightKind ?? 'dedicated',
    freightReason: f.freightReason ?? 'curated',
  }));

  // 5. Boundaries.
  const boundaries = await fetchBoundaries(refresh);

  // 6. Write.
  await writeOutputs({ passengerLights, freightLights, enrichedById, boundaries, generatedAt });

  console.log('\n=== Done ===\n');
}

main().catch((err) => {
  console.error('Pipeline failed:', err);
  process.exit(1);
});
