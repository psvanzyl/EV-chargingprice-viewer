"use client";

import { X, ExternalLink, Clock, Zap, MapPin, Building2, Truck } from "lucide-react";
import type { ChargeFeature, EnrichedConnector, EnrichedLocation } from "@/types/charging";
import { formatConnectorStandard, formatPowerType, statusColorClass, statusLabel } from "@/lib/connectorLabels";
import UsageChart from "@/components/UsageChart";

const fmtPrice = (v: number) =>
  v.toLocaleString("nl-NL", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 3 });

// Prefer the price baked by the pipeline; fall back to a best-effort parse of the
// raw tariff (for data generated before the price field existed).
// Best-effort connector kW mirroring the pipeline: plausible declared power,
// else derived from V×A (×3 for three-phase AC). Filters out garbage values
// like 7,360,000 W on a 230 V/32 A AC post.
function connectorKw(c: EnrichedConnector): number | null {
  const declared = c.max_electric_power ?? 0;
  if (declared > 0 && declared <= 1_500_000) return declared / 1000;
  const v = c.max_voltage ?? 0;
  const a = c.max_amperage ?? 0;
  if (v <= 0 || a <= 0) return null;
  const phases = (c.power_type ?? "").toUpperCase() === "AC_3_PHASE" ? 3 : 1;
  return (v * a * phases) / 1000;
}

const FREIGHT_REASON_LABEL: Record<string, string> = {
  operator: "truck-exploitant",
  "truck-name": "“truck” in de naam",
  mcs: "MCS-aansluiting",
  "depot-name": "logistiek depot",
  motorway: "snelweglocatie ≥350 kW",
  power: "alleen op vermogen (≥350 kW DC)",
  curated: "handmatig toegevoegde hub",
};

function connectorPriceKwh(c: EnrichedConnector): number | null {
  if (typeof c.priceKwh === "number") return c.priceKwh;
  for (const t of c.tariffs ?? []) {
    for (const el of t.elements ?? []) {
      const energy = el.price_components?.find((pc) => pc.type === "ENERGY");
      if (energy && typeof energy.price === "number") return energy.price;
    }
  }
  return null;
}

interface Props {
  selected: ChargeFeature | null;
  detail: EnrichedLocation | null;
  loading: boolean;
  slug?: string; // gemeente slug for usage history (undefined / 'nederland' = no chart)
  onClose: () => void;
  onJumpToGemeente?: () => void;
}

export default function LocationDetailPanel({ selected, detail, loading, slug, onClose, onJumpToGemeente }: Props) {
  if (!selected) return null;
  const p = selected.properties;
  const isFreight = p.layer === "freight";

  return (
    <div
      data-tour="detail"
      className="absolute top-4 right-14 w-96 max-w-[calc(100vw-5rem)] max-h-[calc(100%-2rem)] bg-white rounded-lg shadow-lg overflow-hidden flex flex-col z-10"
    >
      <div className="p-4 border-b bg-gray-50 flex-shrink-0">
        <div className="flex justify-between items-start">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs text-white ${
                  isFreight ? "bg-amber-500" : "bg-blue-500"
                }`}
              >
                {isFreight ? <Truck className="h-3 w-3" /> : <Zap className="h-3 w-3" />}
                {isFreight ? (p.freightKind === "hpc" ? "Truck-capable" : "Truck") : "Personenauto"}
              </span>
              {p.isMegawatt && (
                <span className="px-1.5 py-0.5 rounded text-xs text-white bg-orange-600">Megawatt</span>
              )}
            </div>
            {isFreight && p.freightReason && FREIGHT_REASON_LABEL[p.freightReason] && (
              <div className="text-xs text-amber-700 mt-1">
                Classificatie: {FREIGHT_REASON_LABEL[p.freightReason]}
              </div>
            )}
            <h3 className="font-semibold text-lg truncate mt-1">{p.name}</h3>
            {p.address && (
              <div className="flex items-center gap-1 text-sm text-gray-600 mt-1">
                <MapPin className="h-3 w-3 flex-shrink-0" />
                <span className="truncate">
                  {p.address}
                  {p.city ? `, ${p.city}` : ""}
                </span>
              </div>
            )}
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded ml-2 flex-shrink-0">
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="overflow-y-auto flex-1 p-4 space-y-4">
        {/* Operator */}
        <div className="space-y-2">
          <h4 className="font-medium text-sm text-gray-700 flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Exploitant
          </h4>
          <div className="bg-gray-50 rounded p-3 text-sm">
            <div className="font-medium">{p.operatorName || "Onbekend"}</div>
            {detail?.operatorWebsite && (
              <a
                href={detail.operatorWebsite}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline flex items-center gap-1 text-xs mt-1"
              >
                {detail.operatorWebsite}
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
            <div className="text-xs text-gray-500 mt-1">Bron: {p.source.toUpperCase()}</div>
          </div>
        </div>

        {/* Usage over time (gemeente view only; per-gemeente snapshot history) */}
        {slug && slug !== "nederland" && <UsageChart slug={slug} locationId={p.locationId} />}

        {loading && (
          <div className="text-sm text-gray-500 italic flex items-center gap-2">
            <span className="animate-spin h-4 w-4 border-2 border-gray-300 border-t-gray-600 rounded-full" />
            Details laden…
          </div>
        )}

        {!loading && detail && (
          <>
            {/* General */}
            <div className="space-y-2">
              <h4 className="font-medium text-sm text-gray-700 flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Gegevens
              </h4>
              <div className="bg-gray-50 rounded p-3 text-sm space-y-1">
                <Row label="24/7 toegang">
                  <span className={detail.twentyFourSeven ? "text-green-600" : "text-gray-500"}>
                    {detail.twentyFourSeven ? "Ja" : "Nee"}
                  </span>
                </Row>
                {detail.maxPowerKw > 0 && <Row label="Max. vermogen">{detail.maxPowerKw} kW</Row>}
                {detail.parkingType && (
                  <Row label="Parkeren">{detail.parkingType.replace(/_/g, " ")}</Row>
                )}
                <Row label="OCPI ID">
                  <span className="font-mono text-xs">{detail.ocpiId}</span>
                </Row>
                <Row label="Bijgewerkt">
                  <span className="text-xs">{new Date(detail.lastUpdated).toLocaleString("nl-NL")}</span>
                </Row>
              </div>
            </div>

            {/* EVSEs */}
            {detail.evses.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium text-sm text-gray-700 flex items-center gap-2">
                  <Zap className="h-4 w-4" />
                  Laadpunten ({detail.evses.length})
                </h4>
                <div className="space-y-3">
                  {detail.evses.map((evse) => (
                    <div key={evse.uid} className="bg-gray-50 rounded p-3 text-sm">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-mono text-xs">{evse.evse_id}</span>
                        <span className={`px-2 py-0.5 rounded text-xs text-white ${statusColorClass(evse.status)}`}>
                          {statusLabel(evse.status)}
                        </span>
                      </div>
                      {evse.connectors.length > 0 && (
                        <div className="mt-1 pt-2 border-t border-gray-200 space-y-2">
                          {evse.connectors.map((c) => (
                            <div key={c.id} className="text-xs space-y-1">
                              <div className="flex justify-between">
                                <span className="font-medium">{formatConnectorStandard(c.standard)}</span>
                                <span className="text-gray-500">{c.format}</span>
                              </div>
                              <div className="flex justify-between text-gray-600">
                                <span>{formatPowerType(c.power_type)}</span>
                                {(() => {
                                  const kw = connectorKw(c);
                                  return kw ? <span className="font-medium">{kw.toFixed(1)} kW</span> : null;
                                })()}
                              </div>
                              {(() => {
                                const price = connectorPriceKwh(c);
                                if (price === null) return null;
                                return (
                                  <div className="text-gray-500">
                                    Tarief: <span className="font-medium text-gray-700">{fmtPrice(price)}</span> / kWh
                                    {typeof c.priceVat === "number" ? ` (excl. ${c.priceVat}% btw)` : ""}
                                  </div>
                                );
                              })()}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {!loading && !detail && (
          <div className="text-sm text-gray-500 italic space-y-3">
            <p>
              Geen gedetailleerde informatie geladen voor deze locatie
              {p.maxPowerKw > 0 ? ` (max. ${p.maxPowerKw} kW).` : "."}
            </p>
            {onJumpToGemeente && (
              <button
                onClick={onJumpToGemeente}
                className="px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition not-italic"
              >
                Ga naar deze gemeente voor details
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-gray-600">{label}:</span>
      <span className="text-right">{children}</span>
    </div>
  );
}
