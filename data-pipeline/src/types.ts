// Shared types for the data pipeline.
// OCPI interfaces mirror the NDW open-data feed (adapted from fleetsim's import script).

export interface OCPICoordinates {
  latitude: string;
  longitude: string;
}

export interface OCPIConnector {
  id: string;
  standard: string;
  format: string;
  power_type: string;
  max_voltage?: number;
  max_amperage?: number;
  max_electric_power?: number; // watts
  tariff_ids?: string[];
  last_updated: string;
}

export interface OCPIEVSE {
  uid: string;
  evse_id: string;
  status: string;
  capabilities?: string[];
  connectors: OCPIConnector[];
  physical_reference?: string;
  floor_level?: string;
  coordinates?: OCPICoordinates;
  last_updated: string;
}

export interface OCPIParty {
  name: string;
  website?: string;
  logo?: { url: string };
}

export interface OCPILocation {
  country_code: string;
  party_id: string;
  id: string;
  publish: boolean;
  name?: string;
  address: string;
  city: string;
  postal_code?: string;
  state?: string;
  country: string;
  coordinates: OCPICoordinates;
  parking_type?: string;
  evses?: OCPIEVSE[];
  operator: OCPIParty;
  owner?: OCPIParty;
  suboperator?: OCPIParty;
  time_zone?: string;
  opening_times?: { twentyfourseven?: boolean };
  charging_when_closed?: boolean;
  last_updated: string;
}

export interface OCPIPriceComponent {
  type: string; // ENERGY | TIME | FLAT | PARKING_TIME | ...
  price: number;
  vat?: number;
  step_size?: number;
}

export interface OCPITariffRestrictions {
  start_time?: string | null; // HH:MM (local)
  end_time?: string | null;
  start_date?: string | null; // YYYY-MM-DD
  end_date?: string | null;
  min_kwh?: number | null;
  max_kwh?: number | null;
  min_power?: number | null; // kW
  max_power?: number | null;
  min_duration?: number | null;
  max_duration?: number | null;
  day_of_week?: string[] | null;
  reservation?: string | null;
}

export interface OCPITariffElement {
  price_components?: OCPIPriceComponent[];
  restrictions?: OCPITariffRestrictions;
}

export interface OCPITariff {
  id: string;
  country_code: string;
  party_id: string;
  currency: string;
  type?: string;
  min_price?: number;
  max_price?: number;
  elements: OCPITariffElement[];
  start_date_time?: string;
  end_date_time?: string;
  last_updated: string;
}

export type ChargeCategory = 'passenger' | 'freight';

// 'dedicated' = explicit truck facility (operator/name/MCS/curated);
// 'hpc' = only qualifies on raw DC power >= 350 kW (truck-capable, not necessarily truck-accessible).
export type FreightKind = 'dedicated' | 'hpc';
export type FreightReason = 'operator' | 'truck-name' | 'mcs' | 'depot-name' | 'motorway' | 'power' | 'curated';

// Classification metadata derived from a location's connectors.
export interface ClassificationMeta {
  category: ChargeCategory;
  maxPowerKw: number;
  hasCCS: boolean;
  hasMCS: boolean;
  isMegawatt: boolean;
  dcCount: number;
  freightKind?: FreightKind;
  freightReason?: FreightReason;
}

// Aggregate availability derived from a location's EVSE statuses (fleetsim-style).
export type AggregateStatus = 'AVAILABLE' | 'CHARGING' | 'UNAVAILABLE' | 'UNKNOWN';

// Lightweight, "without details" point as written into crop-out / national files.
export interface LightLocation {
  locationId: string; // sanitized, URL-safe id (shared with detail bundle key)
  ocpiId?: string;
  name: string;
  address?: string;
  city?: string;
  operatorName?: string;
  lat: number;
  lng: number;
  layer: ChargeCategory;
  maxPowerKw: number;
  isMegawatt: boolean;
  status: AggregateStatus;
  source: string; // 'ndw' | 'curated' | 'eafo' | 'ocm'
  sourceUrl?: string;
  priceKwh?: number; // cheapest currently-applicable €/kWh across this location's connectors
  freightKind?: FreightKind;
  freightReason?: FreightReason;
}

// Normalized external freight location (from sources/*).
export interface NormalizedFreightLocation {
  id: string;
  source: string;
  name: string;
  address?: string;
  city?: string;
  lat: number;
  lng: number;
  operatorName?: string;
  maxPowerKw: number;
  isMegawatt?: boolean;
  status?: AggregateStatus;
  sourceUrl?: string;
  priceKwh?: number;
  freightKind?: FreightKind;
  freightReason?: FreightReason;
}

// Full enriched location detail ("with details"), stored in per-gemeente bundles.
export interface EnrichedConnector extends OCPIConnector {
  tariffs: OCPITariff[];
  priceKwh?: number; // resolved current €/kWh ENERGY price
  priceVat?: number; // VAT %, informational
}
export interface EnrichedEVSE extends Omit<OCPIEVSE, 'connectors'> {
  connectors: EnrichedConnector[];
}
export interface EnrichedLocation {
  locationId: string;
  ocpiId: string;
  name: string;
  address: string;
  city: string;
  postalCode?: string;
  country: string;
  latitude: number;
  longitude: number;
  parkingType?: string;
  operatorName: string;
  operatorWebsite?: string;
  ownerName?: string;
  twentyFourSeven: boolean;
  lastUpdated: string;
  layer: ChargeCategory;
  maxPowerKw: number;
  freightKind?: FreightKind;
  freightReason?: FreightReason;
  evses: EnrichedEVSE[];
}
