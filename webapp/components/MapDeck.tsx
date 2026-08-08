"use client";

import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import Map, { NavigationControl, MapRef, Popup } from "react-map-gl/maplibre";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { ScatterplotLayer, GeoJsonLayer } from "@deck.gl/layers";
import type { PickingInfo } from "@deck.gl/core";
import "maplibre-gl/dist/maplibre-gl.css";
import type { ChargeFeature, BoundaryFeature, Filters } from "@/types/charging";
import type { ChoroplethData, MetricMeta } from "@/types/analysis";
import { statusColor, freightColor, BOUNDARY_LINE, LEGEND, type RGBA } from "@/lib/colors";
import { rampColor, rampCss, robustDomain, NODATA } from "@/lib/ramp";

interface MapDeckProps {
  chargeFeatures: ChargeFeature[];
  boundaryFeatures: BoundaryFeature[];
  bounds: [number, number, number, number] | null;
  filters: Filters;
  selectedLocationId: string | null;
  onSelect: (feature: ChargeFeature | null) => void;
  choropleth?: ChoroplethData | null;
  analysisMetric?: string | null;
  metricMeta?: MetricMeta | null;
  onAreaSelect?: (props: Record<string, unknown>) => void;
}

interface AreaHover {
  gemeente: string;
  value: number | null;
  lng: number;
  lat: number;
}

const NL_BOUNDS: [[number, number], [number, number]] = [
  [3.31, 50.75],
  [7.21, 53.47],
];

const cursorStyle = (hovering: boolean) => `
  .maplibregl-map, .maplibregl-canvas-container, .maplibregl-canvas {
    cursor: ${hovering ? "pointer" : "default"} !important;
  }
`;

export default function MapDeck({
  chargeFeatures,
  boundaryFeatures,
  bounds,
  filters,
  selectedLocationId,
  onSelect,
  choropleth,
  analysisMetric,
  metricMeta,
  onAreaSelect,
}: MapDeckProps) {
  const mapRef = useRef<MapRef>(null);
  const [deckOverlay, setDeckOverlay] = useState<MapboxOverlay | null>(null);
  const [hovered, setHovered] = useState<ChargeFeature | null>(null);
  const [areaHover, setAreaHover] = useState<AreaHover | null>(null);

  const choroActive = !!(choropleth && analysisMetric);
  const metricDomain = useMemo<[number, number] | null>(() => {
    if (!choroActive) return null;
    const vals = choropleth!.features
      .map((f) => f.properties[analysisMetric!])
      .filter((v): v is number => typeof v === "number");
    return robustDomain(vals);
  }, [choropleth, analysisMetric, choroActive]);

  // Price coloring (mutually exclusive with the choropleth).
  const priceActive = filters.colorByPrice && !choroActive;
  const priceDomain = useMemo<[number, number] | null>(() => {
    if (!priceActive) return null;
    const vals = chargeFeatures
      .map((f) => f.properties.priceKwh)
      .filter((v): v is number => typeof v === "number");
    return vals.length ? robustDomain(vals) : null;
  }, [priceActive, chargeFeatures]);

  const priceColor = useCallback(
    (price: number | undefined): RGBA => {
      if (typeof price !== "number" || !priceDomain) return NODATA as RGBA;
      const [lo, hi] = priceDomain;
      return rampColor(hi > lo ? (price - lo) / (hi - lo) : 0.5);
    },
    [priceDomain],
  );

  const fmtPrice = (v: number) =>
    v.toLocaleString("nl-NL", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 3 });

  const fmt = (v: number) => {
    const d = metricMeta?.decimals ?? 1;
    return v.toLocaleString("nl-NL", { minimumFractionDigits: d, maximumFractionDigits: d });
  };

  useEffect(() => {
    const overlay = new MapboxOverlay({ interleaved: true, layers: [] });
    setDeckOverlay(overlay);
    return () => overlay.finalize();
  }, []);

  // Split + power-filter the charge features once.
  const { passenger, freight } = useMemo(() => {
    const p: ChargeFeature[] = [];
    const f: ChargeFeature[] = [];
    for (const feat of chargeFeatures) {
      if (feat.properties.maxPowerKw < filters.minPowerKw) continue;
      if (feat.properties.layer === "freight") {
        if (filters.dedicatedFreightOnly && feat.properties.freightKind === "hpc") continue;
        f.push(feat);
      } else p.push(feat);
    }
    return { passenger: p, freight: f };
  }, [chargeFeatures, filters.minPowerKw, filters.dedicatedFreightOnly]);

  const handleHover = useCallback((info: PickingInfo<ChargeFeature>) => {
    setHovered(info.object ?? null);
  }, []);

  const handleClick = useCallback(
    (info: PickingInfo<ChargeFeature>) => {
      if (info.object) onSelect(info.object);
    },
    [onSelect],
  );

  const layers = useMemo(() => {
    const result: unknown[] = [];

    // Choropleth (analysis) underneath everything else.
    if (choroActive && metricDomain) {
      const [lo, hi] = metricDomain;
      result.push(
        new GeoJsonLayer({
          id: "choropleth",
          data: choropleth as never,
          stroked: true,
          filled: true,
          getFillColor: (f: { properties: Record<string, unknown> }) => {
            const v = f.properties[analysisMetric!];
            if (typeof v !== "number") return NODATA as RGBA;
            return rampColor(hi > lo ? (v - lo) / (hi - lo) : 0.5);
          },
          getLineColor: [255, 255, 255, 180] as RGBA,
          lineWidthMinPixels: 0.5,
          pickable: true,
          onClick: (info: PickingInfo) => {
            const o = info.object as { properties?: Record<string, unknown> } | null;
            if (o?.properties && onAreaSelect) onAreaSelect(o.properties);
          },
          onHover: (info: PickingInfo) => {
            const o = info.object as { properties?: Record<string, unknown> } | null;
            if (o?.properties && info.coordinate) {
              const v = o.properties[analysisMetric!];
              setAreaHover({
                gemeente: String(o.properties.gemeente ?? ""),
                value: typeof v === "number" ? v : null,
                lng: info.coordinate[0],
                lat: info.coordinate[1],
              });
            } else {
              setAreaHover(null);
            }
          },
          updateTriggers: { getFillColor: [analysisMetric, lo, hi] },
        }),
      );
    }

    if (filters.showBoundary && boundaryFeatures.length) {
      result.push(
        new GeoJsonLayer({
          id: "boundaries",
          data: { type: "FeatureCollection", features: boundaryFeatures } as never,
          stroked: true,
          filled: false,
          getLineColor: BOUNDARY_LINE as RGBA,
          getLineWidth: 2,
          lineWidthMinPixels: 1.5,
          lineWidthMaxPixels: 3,
          pickable: false,
        }),
      );
    }

    const scatterCommon = {
      pickable: true,
      stroked: true,
      filled: true,
      radiusUnits: "pixels" as const,
      lineWidthMinPixels: 0.5,
      getLineColor: [255, 255, 255, 230] as RGBA,
      getLineWidth: 1,
      onHover: handleHover,
      onClick: handleClick,
      getPosition: (d: ChargeFeature) => d.geometry.coordinates,
    };

    if (filters.showPassenger) {
      result.push(
        new ScatterplotLayer<ChargeFeature>({
          ...scatterCommon,
          id: "passenger",
          data: passenger,
          radiusMinPixels: 3,
          radiusMaxPixels: 10,
          getRadius: (d) => (d.properties.locationId === selectedLocationId ? 11 : 5),
          getFillColor: (d) => (priceActive ? priceColor(d.properties.priceKwh) : statusColor(d.properties.status)),
          updateTriggers: { getRadius: [selectedLocationId], getFillColor: [priceActive, priceDomain] },
        }),
      );
    }

    if (filters.showFreight) {
      result.push(
        new ScatterplotLayer<ChargeFeature>({
          ...scatterCommon,
          id: "freight",
          data: freight,
          radiusMinPixels: 5,
          radiusMaxPixels: 16,
          getRadius: (d) =>
            d.properties.locationId === selectedLocationId
              ? 16
              : d.properties.isMegawatt
                ? 11
                : d.properties.freightKind === "hpc"
                  ? 6
                  : 8,
          getFillColor: (d) =>
            priceActive ? priceColor(d.properties.priceKwh) : freightColor(d.properties.isMegawatt, d.properties.freightKind),
          // Ring encodes live OCPI status (freight fill stays amber for identity).
          getLineColor: (d) =>
            d.properties.status === "UNKNOWN"
              ? ([255, 255, 255, 230] as RGBA)
              : (statusColor(d.properties.status).slice(0, 3).concat(255) as RGBA),
          getLineWidth: (d) => (d.properties.isMegawatt ? 2.5 : 1.5),
          updateTriggers: { getRadius: [selectedLocationId], getFillColor: [priceActive, priceDomain] },
        }),
      );
    }

    return result;
  }, [
    passenger,
    freight,
    boundaryFeatures,
    filters.showPassenger,
    filters.showFreight,
    filters.showBoundary,
    selectedLocationId,
    handleHover,
    handleClick,
    choroActive,
    choropleth,
    analysisMetric,
    metricDomain,
    priceActive,
    priceColor,
    priceDomain,
    onAreaSelect,
  ]);

  useEffect(() => {
    if (deckOverlay) deckOverlay.setProps({ layers: layers as never });
  }, [deckOverlay, layers]);

  // Fit to bounds whenever they change (municipality selection).
  useEffect(() => {
    if (bounds && mapRef.current) {
      mapRef.current.fitBounds(
        [
          [bounds[0], bounds[1]],
          [bounds[2], bounds[3]],
        ],
        { padding: 40, duration: 800 },
      );
    }
  }, [bounds]);

  const onMapLoad = useCallback(() => {
    if (mapRef.current && deckOverlay) {
      mapRef.current.getMap().addControl(deckOverlay as never);
    }
  }, [deckOverlay]);

  return (
    <div className="h-full w-full relative">
      <style>{cursorStyle(!!hovered || !!areaHover)}</style>
      <Map
        ref={mapRef}
        initialViewState={{ longitude: 5.2913, latitude: 52.1326, zoom: 7 }}
        style={{ width: "100%", height: "100%" }}
        mapStyle="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
        maxBounds={NL_BOUNDS}
        onLoad={onMapLoad}
      >
        <NavigationControl position="top-right" />
        {hovered && (
          <Popup
            longitude={hovered.geometry.coordinates[0]}
            latitude={hovered.geometry.coordinates[1]}
            closeButton={false}
            closeOnClick={false}
            anchor="bottom"
            offset={12}
          >
            <div className="p-2 max-w-xs">
              <div className="font-semibold text-sm text-gray-900">{hovered.properties.name}</div>
              {hovered.properties.city && (
                <div className="text-xs text-gray-600">{hovered.properties.city}</div>
              )}
              {hovered.properties.operatorName && (
                <div className="text-xs text-gray-500 italic">{hovered.properties.operatorName}</div>
              )}
              <div className="text-xs mt-1 flex items-center gap-2">
                <span
                  className="inline-block px-1.5 py-0.5 rounded text-white"
                  style={{
                    background:
                      hovered.properties.layer === "freight"
                        ? hovered.properties.isMegawatt
                          ? LEGEND.freightMegawatt
                          : hovered.properties.freightKind === "hpc"
                            ? LEGEND.freightHpc
                            : LEGEND.freight
                        : LEGEND[
                            (
                              {
                                AVAILABLE: "available",
                                CHARGING: "charging",
                                UNAVAILABLE: "unavailable",
                                UNKNOWN: "unknown",
                              } as const
                            )[hovered.properties.status] ?? "unknown"
                          ],
                  }}
                >
                  {hovered.properties.layer === "freight"
                    ? hovered.properties.freightKind === "hpc"
                      ? "Truck-capable ≥350 kW"
                      : "Truck"
                    : "Personenauto"}
                </span>
                {hovered.properties.maxPowerKw > 0 && <span>{hovered.properties.maxPowerKw} kW</span>}
              </div>
              {typeof hovered.properties.priceKwh === "number" && (
                <div className="text-xs mt-1 text-gray-700">
                  Tarief: <span className="font-medium">{fmtPrice(hovered.properties.priceKwh)}</span> / kWh
                </div>
              )}
              <div className="text-xs text-blue-600 mt-1">Klik voor details</div>
            </div>
          </Popup>
        )}

        {/* Choropleth area hover */}
        {choroActive && areaHover && (
          <Popup
            longitude={areaHover.lng}
            latitude={areaHover.lat}
            closeButton={false}
            closeOnClick={false}
            anchor="bottom"
            offset={8}
          >
            <div className="p-2">
              <div className="font-semibold text-sm text-gray-900">{areaHover.gemeente}</div>
              <div className="text-xs text-gray-600">
                {metricMeta?.label}:{" "}
                <span className="font-medium">
                  {areaHover.value === null ? "geen data" : `${fmt(areaHover.value)}${metricMeta?.unit ? " " + metricMeta.unit : ""}`}
                </span>
              </div>
            </div>
          </Popup>
        )}
      </Map>

      {/* Choropleth legend */}
      {choroActive && metricDomain && (
        <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur-sm rounded-lg p-3 shadow-md text-xs">
          <div className="font-semibold mb-1">{metricMeta?.label}</div>
          <div
            className="h-2 w-40 rounded"
            style={{ background: `linear-gradient(to right, ${rampCss(0)}, ${rampCss(0.25)}, ${rampCss(0.5)}, ${rampCss(0.75)}, ${rampCss(1)})` }}
          />
          <div className="flex justify-between w-40 text-gray-500 mt-0.5">
            <span>{fmt(metricDomain[0])}</span>
            <span>{fmt(metricDomain[1])}{metricMeta?.unit ? ` ${metricMeta.unit}` : ""}</span>
          </div>
          <div className="flex items-center gap-1 mt-1 text-gray-400">
            <span className="w-3 h-3 rounded-sm" style={{ background: "rgb(226,232,240)" }} />
            geen data
          </div>
        </div>
      )}

      {/* Price legend */}
      {priceActive && priceDomain && (
        <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur-sm rounded-lg p-3 shadow-md text-xs">
          <div className="font-semibold mb-1">Tarief (€/kWh)</div>
          <div
            className="h-2 w-40 rounded"
            style={{ background: `linear-gradient(to right, ${rampCss(0)}, ${rampCss(0.25)}, ${rampCss(0.5)}, ${rampCss(0.75)}, ${rampCss(1)})` }}
          />
          <div className="flex justify-between w-40 text-gray-500 mt-0.5">
            <span>{fmtPrice(priceDomain[0])}</span>
            <span>{fmtPrice(priceDomain[1])}</span>
          </div>
          <div className="flex items-center gap-1 mt-1 text-gray-400">
            <span className="w-3 h-3 rounded-sm" style={{ background: "rgb(226,232,240)" }} />
            geen tarief
          </div>
        </div>
      )}

      {/* Marker legend */}
      {!choroActive && !priceActive && (
      <div data-tour="legend" className="absolute bottom-4 left-4 bg-white/90 backdrop-blur-sm rounded-lg p-3 shadow-md text-xs">
        <div className="font-semibold mb-1">Personenauto (status)</div>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full" style={{ background: LEGEND.available }} />
            <span>Beschikbaar</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full" style={{ background: LEGEND.charging }} />
            <span>Bezet (laden)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full" style={{ background: LEGEND.unavailable }} />
            <span>Niet beschikbaar</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full" style={{ background: LEGEND.unknown }} />
            <span>Onbekend</span>
          </div>
        </div>
        <div className="font-semibold mt-2 mb-1">Logistiek / vracht</div>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full" style={{ background: LEGEND.freight }} />
            <span>Dedicated truck-locatie</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full" style={{ background: LEGEND.freightHpc }} />
            <span>Truck-capable ≥350 kW</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full" style={{ background: LEGEND.freightMegawatt }} />
            <span>Megawatt charging (MCS)</span>
          </div>
          <div className="text-gray-400">rand = status (groen/blauw/rood)</div>
        </div>
      </div>
      )}
    </div>
  );
}
