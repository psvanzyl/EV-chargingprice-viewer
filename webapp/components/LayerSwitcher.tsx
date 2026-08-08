"use client";

import { useMemo } from "react";
import type { MetricMeta } from "@/types/analysis";
import InfoTip from "@/components/InfoTip";

interface Props {
  metrics: MetricMeta[];
  active: string | null;
  onChange: (key: string | null) => void;
}

export default function LayerSwitcher({ metrics, active, onChange }: Props) {
  const groups = useMemo(() => {
    const m = new Map<string, MetricMeta[]>();
    for (const metric of metrics) {
      const cat = metric.category ?? "Overig";
      if (!m.has(cat)) m.set(cat, []);
      m.get(cat)!.push(metric);
    }
    return [...m.entries()];
  }, [metrics]);

  const activeMeta = metrics.find((m) => m.key === active);

  return (
    <div className="bg-white rounded-lg shadow-sm p-4 space-y-2" data-tour="analyse">
      <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-1">
        Analyse (per gemeente)
        <InfoTip title="Analyse-laag">
          Toont een indicator als kleurvlak (choropleth) over alle gemeenten. Donker = hoge waarde. Klik een
          gemeente voor de scorecard met onderliggende cijfers en berekeningen. Alleen beschikbaar in de
          “Nederland (totaal)”-weergave.
        </InfoTip>
      </h3>
      <p className="text-xs text-gray-500">Kies een indicator. Klik een gemeente voor de scorecard.</p>
      <select
        value={active ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="w-full text-sm border border-gray-300 rounded-lg px-2 py-2 bg-white"
      >
        <option value="">Geen (laadpunten tonen)</option>
        {groups.map(([cat, items]) => (
          <optgroup key={cat} label={cat}>
            {items.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      {activeMeta?.desc && (
        <p className="text-xs text-gray-600 bg-gray-50 rounded p-2 leading-relaxed">{activeMeta.desc}</p>
      )}
    </div>
  );
}
