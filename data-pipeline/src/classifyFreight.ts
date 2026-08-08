// Classify an OCPI location as passenger vs freight (heavy-duty / truck) charging.
// Signals, in decreasing precision: dedicated truck operator, explicit truck naming,
// logistics-depot naming + serious DC power, MCS standard, parking_type, raw DC power.
// Locations that only qualify on raw DC power are marked freightKind 'hpc'
// (truck-capable high-power charging, e.g. 400 kW Fastned/IONITY lanes that a tractor-
// trailer may not physically fit); everything else is 'dedicated'.

import type { OCPILocation, OCPIConnector, ClassificationMeta, AggregateStatus } from './types.js';

// Aggregate EVSE statuses into one availability value (fleetsim priority:
// AVAILABLE > CHARGING > any other status -> UNAVAILABLE; no EVSEs -> UNKNOWN).
export function aggregateStatus(loc: OCPILocation): AggregateStatus {
  const evses = loc.evses ?? [];
  if (evses.length === 0) return 'UNKNOWN';
  if (evses.some((e) => e.status === 'AVAILABLE')) return 'AVAILABLE';
  if (evses.some((e) => e.status === 'CHARGING')) return 'CHARGING';
  return 'UNAVAILABLE';
}

export const THRESHOLDS = {
  // Watts. A DC connector at/above this makes a location truck-capable ('hpc').
  // 350 kW+ is above the CCS power most passenger cars can take, but several
  // passenger networks (Fastned/IONITY) run 400 kW lanes, so power alone is only
  // a 'truck-capable' signal, never a 'dedicated truck facility' signal.
  FREIGHT_DC_WATTS: 350_000,
  // Watts. Megawatt Charging System territory.
  MEGAWATT_WATTS: 1_000_000,
  // Watts. Minimum DC power for a logistics-named depot / motorway parking to count.
  DEPOT_MIN_DC_WATTS: 150_000,
  PARKING_MIN_DC_WATTS: 350_000,
  // Plausibility caps for declared connector power. NDW carries garbage like
  // 7,360,000 W on a 230 V / 32 A AC post; above the cap we fall back to V×A.
  MAX_PLAUSIBLE_WATTS: 1_500_000,
  MAX_PLAUSIBLE_MCS_WATTS: 4_000_000,
} as const;

// Operators whose sites are dedicated heavy-duty / truck hubs.
const FREIGHT_OPERATOR_PATTERNS = [
  'milence',
  'watthub',
  'wattev',
  'einride',
  'heliox truck',
];

// Explicit truck naming on the location itself ("Truck only", "Truckpoint",
// "E-Truck", "vrachtwagen", ...). High precision in the NDW feed, but "heftruck"/
// "vorkheftruck" (forklift) and "pallettruck" must not match.
const TRUCK_NAME_RE = /truck|vracht|zwaar vervoer/i;
const FORKLIFT_RE = /(hef|vorkhef|pallet|steek)truck/gi;

function nameMentionsTruck(name: string): boolean {
  return TRUCK_NAME_RE.test(name.replace(FORKLIFT_RE, ''));
}

// Logistics-depot naming; only counts as freight when paired with serious DC power,
// so a 22 kW AC post at a transport company's visitor parking stays passenger.
const DEPOT_NAME_RE = /logisti|distributiecentr|transport/i;

// parking_type values that hint at freight/truck use.
const FREIGHT_PARKING_TYPES = new Set([
  'ALONG_MOTORWAY',
]);

const CCS_STANDARDS = new Set([
  'IEC_62196_T2_COMBO',
]);

function isMcsStandard(standard: string): boolean {
  const s = (standard || '').toUpperCase();
  return s.startsWith('MCS') || s.includes('MEGAWATT') || s === 'IEC_63379';
}

function normalize(s: string | undefined): string {
  return (s ?? '').toLowerCase().trim();
}

// Best-effort connector power in watts. Prefers the declared max_electric_power
// when plausible; otherwise derives from V×A (×3 for three-phase AC), which
// recovers power for the ~50% of NDW connectors that omit max_electric_power
// and neutralizes implausible declared values.
export function connectorPowerW(c: OCPIConnector): number {
  const declared = c.max_electric_power ?? 0;
  const cap = isMcsStandard(c.standard)
    ? THRESHOLDS.MAX_PLAUSIBLE_MCS_WATTS
    : THRESHOLDS.MAX_PLAUSIBLE_WATTS;
  if (declared > 0 && declared <= cap) return declared;
  const v = c.max_voltage ?? 0;
  const a = c.max_amperage ?? 0;
  if (v <= 0 || a <= 0) return 0;
  const phases = (c.power_type ?? '').toUpperCase() === 'AC_3_PHASE' ? 3 : 1;
  return v * a * phases;
}

export function classifyLocation(loc: OCPILocation): ClassificationMeta {
  let maxPowerW = 0;
  let maxDcPowerW = 0;
  let hasCCS = false;
  let hasMCS = false;
  let dcCount = 0;

  for (const evse of loc.evses ?? []) {
    for (const c of evse.connectors ?? []) {
      const power = connectorPowerW(c);
      if (power > maxPowerW) maxPowerW = power;
      const isDc = (c.power_type ?? '').toUpperCase() === 'DC';
      if (isDc) {
        dcCount++;
        if (power > maxDcPowerW) maxDcPowerW = power;
      }
      if (CCS_STANDARDS.has(c.standard)) hasCCS = true;
      if (isMcsStandard(c.standard)) hasMCS = true;
    }
  }

  const maxPowerKw = Math.round(maxPowerW / 1000);
  const isMegawatt = maxPowerW >= THRESHOLDS.MEGAWATT_WATTS || hasMCS;

  const operator = normalize(loc.operator?.name);
  const operatorIsFreight = FREIGHT_OPERATOR_PATTERNS.some((p) => operator.includes(p));

  const name = loc.name ?? '';
  const nameIsTruck = nameMentionsTruck(name);
  const nameIsDepot = DEPOT_NAME_RE.test(name) && maxDcPowerW >= THRESHOLDS.DEPOT_MIN_DC_WATTS;

  const parkingIsFreight =
    !!loc.parking_type &&
    FREIGHT_PARKING_TYPES.has(loc.parking_type) &&
    maxDcPowerW >= THRESHOLDS.PARKING_MIN_DC_WATTS;

  // Dedicated truck facility: an explicit signal beyond raw power.
  let freightReason: ClassificationMeta['freightReason'];
  if (operatorIsFreight) freightReason = 'operator';
  else if (nameIsTruck) freightReason = 'truck-name';
  else if (hasMCS) freightReason = 'mcs';
  else if (nameIsDepot) freightReason = 'depot-name';
  else if (parkingIsFreight) freightReason = 'motorway';

  const isDedicated = freightReason !== undefined;
  const isTruckCapableHpc = !isDedicated && maxDcPowerW >= THRESHOLDS.FREIGHT_DC_WATTS;
  if (isTruckCapableHpc) freightReason = 'power';

  const isFreight = isDedicated || isTruckCapableHpc;

  return {
    category: isFreight ? 'freight' : 'passenger',
    maxPowerKw,
    hasCCS,
    hasMCS,
    isMegawatt,
    dcCount,
    ...(isFreight ? { freightKind: isDedicated ? 'dedicated' : 'hpc', freightReason } : {}),
  };
}
