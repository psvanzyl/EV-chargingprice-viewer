"use client";

import { useState } from "react";
import { X, ArrowRight } from "lucide-react";
import type { AreaProps } from "@/types/analysis";
import InfoTip from "@/components/InfoTip";

interface Props {
  area: AreaProps | null;
  onClose: () => void;
  onOpenGemeente?: (slug: string) => void;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const fmt = (v: number | null, d = 0) =>
  v === null ? "–" : v.toLocaleString("nl-NL", { minimumFractionDigits: d, maximumFractionDigits: d });

function Bar({ pct, color }: { pct: number | null; color: string }) {
  return (
    <div className="h-1.5 bg-gray-100 rounded overflow-hidden">
      <div className="h-full rounded" style={{ width: `${pct ?? 0}%`, background: color }} />
    </div>
  );
}

function Row({ label, value, pct, color = "#3b82f6" }: { label: string; value: string; pct?: number | null; color?: string }) {
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-sm">
        <span className="text-gray-600">{label}</span>
        <span className="font-medium text-gray-900">{value}</span>
      </div>
      {pct !== undefined && <Bar pct={pct} color={color} />}
    </div>
  );
}

export default function GemeenteScorecard({ area, onClose, onOpenGemeente }: Props) {
  const [growth, setGrowth] = useState(50); // % EV growth
  const [smart, setSmart] = useState(20); // % peak reduction via smart charging
  if (!area) return null;

  const basePeak = num(area.est_peak_load_kw) ?? 0; // = potential peak (planning)
  const projected = basePeak * (1 + growth / 100) * (1 - smart / 100);
  const inw = num(area.inwoners) ?? 0;
  const projPer1000 = inw ? (projected / inw) * 1000 : null;
  const livePeak = num(area.live_peak_load_kw);
  const occNow = num(area.occupancy_now);
  const evse = num(area.evse_total);
  const chargingNow = num(area.charging_now);

  const gap = num(area.supply_gap);
  const slug = typeof area.slug === "string" ? area.slug : null;

  return (
    <div
      data-tour="scorecard"
      className="absolute top-4 right-14 w-96 max-w-[calc(100vw-5rem)] max-h-[calc(100%-2rem)] bg-white rounded-lg shadow-lg overflow-hidden flex flex-col z-10"
    >
      <div className="p-4 border-b bg-gray-50 flex justify-between items-start">
        <div>
          <h3 className="font-semibold text-lg">{area.gemeente}</h3>
          <p className="text-xs text-gray-500">Gemeente-scorecard (laadinfra)</p>
        </div>
        <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="overflow-y-auto flex-1 p-4 space-y-4">
        {/* Aanbod */}
        <section className="space-y-2">
          <h4 className="text-sm font-medium text-gray-700">Aanbod</h4>
          <Row label="Laadlocaties (personen)" value={fmt(num(area.chargers_passenger))} />
          <Row label="Vracht-laadpunten" value={fmt(num(area.chargers_freight))} />
          {evse !== null && <Row label="Laadpunten (sockets/EVSEs)" value={fmt(evse)} />}
          <Row label="Per 1.000 inwoners" value={fmt(num(area.chargers_per_1000_inw), 1)} pct={num(area.supply_pct)} color="#22c55e" />
          <Row label="Gem. bezetting" value={num(area.avg_occupancy) === null ? "–" : `${fmt(num(area.avg_occupancy), 1)}%`} pct={num(area.occupancy_pct)} color="#3b82f6" />
        </section>

        {/* Prijs */}
        {num(area.price_kwh_median) !== null && (
          <section className="space-y-2 pt-2 border-t border-gray-100">
            <h4 className="text-sm font-medium text-gray-700 flex items-center gap-1">
              Tarief (€/kWh)
              <InfoTip title="Tarief (€/kWh)">
                Mediaan van het actuele energietarief uit de OCPI-tarieven (NDW), over laadlocaties met een
                gepubliceerde prijs. De balk toont de relatieve percentielrang (hoger = duurder dan andere
                gemeenten). ±50% van de connectoren publiceert géén tarief; dit is een momentopname uit de
                laatste data-update.
              </InfoTip>
            </h4>
            <Row
              label="Mediaan tarief"
              value={`€ ${fmt(num(area.price_kwh_median), 3)}`}
              pct={num(area.price_pct)}
              color="#f43f5e"
            />
            {num(area.price_kwh_mean) !== null && (
              <Row label="Gemiddeld tarief" value={`€ ${fmt(num(area.price_kwh_mean), 3)}`} />
            )}
            <p className="text-[10px] text-gray-400">
              Op basis van {fmt(num(area.price_kwh_n))} laadlocaties met gepubliceerd tarief.
            </p>
          </section>
        )}

        {/* Live load now */}
        {livePeak !== null && (
          <section className="space-y-1 pt-2 border-t border-gray-100">
            <h4 className="text-sm font-medium text-gray-700 flex items-center gap-1">
              Belasting nu (live)
              <InfoTip title="Belasting nu (live)">
                = aantal laadpunten dat op dit moment laadt (uit de uurlijkse OCPI-snapshot) × ~11 kW per
                laadpunt. Het vermogen is aangenomen omdat NDW het voor ±90% van de connectoren niet publiceert.
                Dit is een live momentopname, geen gemeten kW.
              </InfoTip>
            </h4>
            <div className="bg-green-50 rounded p-2">
              <div className="flex justify-between text-sm">
                <span className="text-green-900">Geschatte belasting nu</span>
                <span className="font-semibold text-green-900">{fmt(livePeak)} kW</span>
              </div>
              <div className="text-xs text-green-700">
                {chargingNow !== null ? `${fmt(chargingNow)} laadpunten aan het laden` : ""}
                {occNow !== null ? ` · ${fmt(occNow, 1)}% bezet nu` : ""}
              </div>
            </div>
            <p className="text-[10px] text-gray-400">
              Live uit OCPI-status (uurlijkse snapshot) × {`~11 kW per laadpunt`} — vermogen aangenomen,
              want NDW publiceert het voor ±90% van de connectoren niet.
            </p>
          </section>
        )}

        {/* Vraag & plaatsing */}
        <section className="space-y-2 pt-2 border-t border-gray-100">
          <h4 className="text-sm font-medium text-gray-700 flex items-center gap-1">
            Vraag &amp; plaatsing
            <InfoTip title="Vraag & plaatsing (peer-model)">
              Een random-forest voorspelt het “verwachte” aantal laadpunten uit demografie (inwoners,
              huishoudens, auto&apos;s, inkomen, stedelijkheid, adresdichtheid). Werkelijk − verwacht =
              tekort/overschot; de plaatsingsprioriteit (0-100) weegt relatief + absoluut tekort en bezetting.
            </InfoTip>
          </h4>
          <Row label="Verwacht (peer-model)" value={fmt(num(area.expected_chargers))} />
          <Row
            label="Tekort / overschot"
            value={gap === null ? "–" : `${gap > 0 ? "+" : ""}${fmt(gap)}`}
          />
          <div className={`text-xs rounded px-2 py-1 ${gap !== null && gap < 0 ? "bg-amber-50 text-amber-800" : "bg-green-50 text-green-800"}`}>
            {gap !== null && gap < 0
              ? `Ondergemiddeld aanbod t.o.v. vergelijkbare gemeenten — plaatsingsprioriteit ${fmt(num(area.siting_priority))}/100.`
              : "Aanbod op of boven verwachting voor vergelijkbare gemeenten."}
          </div>
        </section>

        {/* Netimpact scenario */}
        <section className="space-y-2 pt-2 border-t border-gray-100">
          <h4 className="text-sm font-medium text-gray-700 flex items-center gap-1">
            Netimpact (scenario)
            <InfoTip title="Netimpact-scenario">
              Potentiële piek = alle laadpunten (EVSE&apos;s) × ~11 kW × 30% gelijktijdigheid. De schuiven
              herschalen dit met EV-groei (meer laden) en slim laden (piekreductie):
              piek × (1+groei) × (1−reductie). Gemodelleerd — er is geen netcapaciteit (DSO) ingelezen.
            </InfoTip>
          </h4>
          <Row label="Potentiële piek (planning)" value={`${fmt(basePeak)} kW`} />
          <div>
            <div className="flex justify-between text-xs text-gray-600">
              <span>EV-groei</span>
              <span>+{growth}%</span>
            </div>
            <input type="range" min={0} max={200} value={growth} onChange={(e) => setGrowth(+e.target.value)} className="w-full accent-blue-600" />
          </div>
          <div>
            <div className="flex justify-between text-xs text-gray-600">
              <span>Slim laden (piekreductie)</span>
              <span>−{smart}%</span>
            </div>
            <input type="range" min={0} max={50} value={smart} onChange={(e) => setSmart(+e.target.value)} className="w-full accent-green-600" />
          </div>
          <div className="bg-blue-50 rounded p-2 text-sm">
            <div className="flex justify-between">
              <span className="text-blue-900">Projectie piekbelasting</span>
              <span className="font-semibold text-blue-900">{fmt(projected)} kW</span>
            </div>
            {projPer1000 !== null && (
              <div className="flex justify-between text-xs text-blue-700">
                <span>per 1.000 inwoners</span>
                <span>{fmt(projPer1000, 1)} kW</span>
              </div>
            )}
          </div>
          <p className="text-[10px] text-gray-400">
            Potentiële piek = alle laadpunten × ~11 kW × 30% gelijktijdigheid. Gemodelleerd
            (geen DSO-capaciteit ingelezen); congestie-index is relatief.
          </p>
        </section>

        {slug && onOpenGemeente && (
          <button
            onClick={() => onOpenGemeente(slug)}
            className="w-full flex items-center justify-center gap-1 px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
          >
            Open {area.gemeente} op de kaart <ArrowRight className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
