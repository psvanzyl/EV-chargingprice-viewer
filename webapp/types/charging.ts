// Types mirroring the static data files produced by data-pipeline.

export type ChargeLayer = "passenger" | "freight";
export type AggregateStatus = "AVAILABLE" | "CHARGING" | "UNAVAILABLE" | "UNKNOWN";
// 'dedicated' = explicit truck facility (operator/naam/MCS/depot/curated);
// 'hpc' = qualifies only on >=350 kW DC (truck-capable, not per se truck-toegankelijk).
export type FreightKind = "dedicated" | "hpc";

export interface Municipality {
  name: string;
  slug: string;
  province: string;
  population: number;
  code: string | null;
  passengerCount: number;
  freightCount: number;
}

export interface ChargeProperties {
  type: "charge";
  layer: ChargeLayer;
  locationId: string;
  name: string;
  address: string;
  city: string;
  operatorName: string;
  maxPowerKw: number;
  isMegawatt: boolean;
  status: AggregateStatus;
  source: string; // 'ndw' | 'curated' | 'eafo' | 'ocm'
  priceKwh?: number; // cheapest currently-applicable €/kWh at this location
  freightKind?: FreightKind;
  freightReason?: string;
}

export interface BoundaryProperties {
  type: "boundary";
  gemeente: string;
  code: string;
}

export type FeatureProperties = ChargeProperties | BoundaryProperties;

export interface ChargeFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: ChargeProperties;
}

export interface BoundaryFeature {
  type: "Feature";
  geometry: { type: "Polygon" | "MultiPolygon"; coordinates: unknown };
  properties: BoundaryProperties;
}

export type AnyFeature = ChargeFeature | BoundaryFeature;

export interface CropoutData {
  type: "FeatureCollection";
  metadata: {
    gemeente?: string;
    slug?: string;
    code?: string;
    generated_at: string;
    total_passenger?: number;
    total_freight?: number;
    layer?: ChargeLayer;
    total?: number;
    bounds?: [number, number, number, number];
    operators?: string[];
  };
  features: AnyFeature[];
}

// "With details" payload (per-gemeente bundle: locationId -> EnrichedLocation).
export interface EnrichedConnector {
  id: string;
  standard: string;
  format: string;
  power_type: string;
  max_voltage?: number;
  max_amperage?: number;
  max_electric_power?: number;
  tariff_ids?: string[];
  tariffs: EnrichedTariff[];
  priceKwh?: number; // resolved current €/kWh ENERGY price
  priceVat?: number; // VAT %, informational
  last_updated: string;
}

export interface EnrichedTariff {
  id: string;
  currency: string;
  elements: Array<{
    price_components?: Array<{ type: string; price: number; vat?: number; step_size?: number }>;
  }>;
}

export interface EnrichedEVSE {
  uid: string;
  evse_id: string;
  status: string;
  capabilities?: string[];
  physical_reference?: string;
  connectors: EnrichedConnector[];
  last_updated: string;
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
  layer: ChargeLayer;
  maxPowerKw: number;
  freightKind?: FreightKind;
  freightReason?: string;
  evses: EnrichedEVSE[];
}

export type DetailBundle = Record<string, EnrichedLocation>;

export interface Filters {
  showPassenger: boolean;
  showFreight: boolean;
  showBoundary: boolean;
  minPowerKw: number;
  colorByPrice: boolean; // color charge points by €/kWh instead of status
  dedicatedFreightOnly: boolean; // hide 'hpc' freight (power-only truck-capable sites)
}

export const DEFAULT_FILTERS: Filters = {
  showPassenger: true,
  showFreight: true,
  showBoundary: true,
  minPowerKw: 0,
  colorByPrice: false,
  dedicatedFreightOnly: false,
};
