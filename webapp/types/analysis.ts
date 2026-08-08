// Types for the analysis (golden-dataset) layers.

export interface MetricMeta {
  key: string;
  label: string;
  unit: string;
  decimals: number;
  category?: string;
  desc?: string;
}

export type AreaProps = Record<string, string | number | null | undefined> & {
  code: string;
  gemeente: string;
  slug?: string;
};

export interface ChoroplethFeature {
  type: "Feature";
  geometry: { type: "Polygon" | "MultiPolygon"; coordinates: unknown };
  properties: {
    code: string;
    gemeente: string;
    slug?: string;
    [metric: string]: string | number | null | undefined;
  };
}

export interface ChoroplethData {
  type: "FeatureCollection";
  metadata: { metrics: MetricMeta[] };
  features: ChoroplethFeature[];
}
