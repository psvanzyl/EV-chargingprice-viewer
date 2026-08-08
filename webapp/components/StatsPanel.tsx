"use client";

import { useMemo } from "react";
import type { ChargeFeature } from "@/types/charging";
import { LEGEND } from "@/lib/colors";
import InfoTip from "@/components/InfoTip";

interface StatsPanelProps {
  gemeente: string;
  chargeFeatures: ChargeFeature[];
}

export default function StatsPanel({ gemeente, chargeFeatures }: StatsPanelProps) {
  const stats = useMemo(() => {
    let passenger = 0;
    let freight = 0;
    let freightDedicated = 0;
    let megawatt = 0;
    let available = 0;
    let charging = 0;
    let unavailable = 0;
    const operators = new Map<string, number>();
    for (const f of chargeFeatures) {
      const p = f.properties;
      if (p.layer === "freight") {
        freight++;
        if (p.freightKind !== "hpc") freightDedicated++;
        if (p.isMegawatt) megawatt++;
      } else {
        passenger++;
        // Status tallies match the map, which only colors passenger points by status.
        if (p.status === "AVAILABLE") available++;
        else if (p.status === "CHARGING") charging++;
        else if (p.status === "UNAVAILABLE") unavailable++;
      }
      if (p.operatorName) operators.set(p.operatorName, (operators.get(p.operatorName) ?? 0) + 1);
    }
    const topOperators = [...operators.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    return { passenger, freight, freightDedicated, megawatt, available, charging, unavailable, topOperators };
  }, [chargeFeatures]);

  return (
    <div className="bg-white rounded-lg shadow-sm p-4 space-y-3">
      <h3 className="text-sm font-semibold text-gray-900 truncate">{gemeente}</h3>

      <div className="grid grid-cols-2 gap-2">
        <div className="bg-blue-50 rounded-lg p-2">
          <div className="text-xl font-bold text-blue-700 tabular-nums">
            {stats.passenger.toLocaleString("nl-NL")}
          </div>
          <div className="text-xs text-blue-900">Personenauto</div>
        </div>
        <div className="bg-amber-50 rounded-lg p-2">
          <div className="text-xl font-bold text-amber-700 tabular-nums">
            {stats.freight.toLocaleString("nl-NL")}
          </div>
          <div className="text-xs text-amber-900 flex items-center gap-1">
            Logistiek / vracht
            <InfoTip title="Logistiek / vracht">
              Truck-laadlocaties: <strong>dedicated</strong> voorzieningen (truck-exploitant zoals
              Milence/WattHub, “truck” in de naam, MCS-aansluiting, of een logistiek depot met ≥150 kW DC)
              plus <strong>truck-capable</strong> snelladers met ≥350 kW DC die niet aantoonbaar op trucks
              zijn ingericht.
            </InfoTip>
          </div>
        </div>
      </div>

      {stats.freight > 0 && (
        <div className="text-xs text-amber-800 bg-amber-50 rounded px-2 py-1">
          {stats.freightDedicated} dedicated · {stats.freight - stats.freightDedicated} truck-capable ≥350 kW
        </div>
      )}
      {stats.megawatt > 0 && (
        <div className="text-xs text-orange-700 bg-orange-50 rounded px-2 py-1">
          waarvan {stats.megawatt} megawatt-locatie{stats.megawatt !== 1 ? "s" : ""}
        </div>
      )}

      {/* OCPI status breakdown */}
      <div>
        <div className="text-xs font-medium text-gray-600 mb-1 flex items-center gap-1">
          Status personenauto (OCPI-momentopname)
          <InfoTip title="OCPI-status">
            Beschikbaar/bezet/niet-beschikbaar komt uit de OCPI-status in de laatste uurlijkse momentopname van
            de NDW-data — een snapshot, geen continue realtime stream. “Bezet” = connector aan het laden.
            Telt alleen personenauto-punten; bij truckpunten zit de status in de ringkleur op de kaart.
          </InfoTip>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
          <StatusChip color={LEGEND.available} label="Beschikbaar" value={stats.available} />
          <StatusChip color={LEGEND.charging} label="Bezet" value={stats.charging} />
          <StatusChip color={LEGEND.unavailable} label="Niet besch." value={stats.unavailable} />
        </div>
      </div>

      {stats.topOperators.length > 0 && (
        <div>
          <div className="text-xs font-medium text-gray-600 mb-1">Grootste exploitanten</div>
          <ul className="space-y-1">
            {stats.topOperators.map(([name, count]) => (
              <li key={name} className="flex items-center justify-between text-xs text-gray-700">
                <span className="truncate pr-2">{name}</span>
                <span className="text-gray-400 tabular-nums">{count.toLocaleString("nl-NL")}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function StatusChip({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <span className="flex items-center gap-1 text-gray-700">
      <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
      {label}
      <span className="text-gray-400 tabular-nums">{value.toLocaleString("nl-NL")}</span>
    </span>
  );
}
