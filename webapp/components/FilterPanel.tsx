"use client";

import type { Filters } from "@/types/charging";
import { LEGEND } from "@/lib/colors";
import InfoTip from "@/components/InfoTip";

interface FilterPanelProps {
  filters: Filters;
  onChange: (f: Filters) => void;
  passengerCount: number;
  freightCount: number;
}

const POWER_STEPS = [0, 50, 150, 350, 1000];

export default function FilterPanel({ filters, onChange, passengerCount, freightCount }: FilterPanelProps) {
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });

  return (
    <div className="bg-white rounded-lg shadow-sm p-4 space-y-4" data-tour="layers">
      <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-1">
        Kaartlagen
        <InfoTip title="Kaartlagen">
          Zet de twee laadpunt-lagen (personenauto / vracht) en de gemeente-/provinciegrenzen aan of uit, en
          filter op minimaal laadvermogen. De tellingen rechts tonen het aantal in de huidige weergave.
        </InfoTip>
      </h3>

      {/* Layer toggles */}
      <div className="space-y-2">
        <label className="flex items-center justify-between gap-2 cursor-pointer">
          <span className="flex items-center gap-2 text-sm text-gray-800">
            <input
              type="checkbox"
              checked={filters.showPassenger}
              onChange={(e) => set({ showPassenger: e.target.checked })}
              className="w-4 h-4 accent-blue-600"
            />
            <span className="w-3 h-3 rounded-full" style={{ background: LEGEND.available }} />
            Personenauto
          </span>
          <span className="text-xs text-gray-500 tabular-nums">{passengerCount.toLocaleString("nl-NL")}</span>
        </label>

        <label className="flex items-center justify-between gap-2 cursor-pointer">
          <span className="flex items-center gap-2 text-sm text-gray-800">
            <input
              type="checkbox"
              checked={filters.showFreight}
              onChange={(e) => set({ showFreight: e.target.checked })}
              className="w-4 h-4 accent-amber-500"
            />
            <span className="w-3 h-3 rounded-full" style={{ background: LEGEND.freight }} />
            Logistiek / vracht
          </span>
          <span className="text-xs text-gray-500 tabular-nums">{freightCount.toLocaleString("nl-NL")}</span>
        </label>

        {filters.showFreight && (
          <label className="flex items-center gap-2 cursor-pointer pl-6">
            <input
              type="checkbox"
              checked={filters.dedicatedFreightOnly}
              onChange={(e) => set({ dedicatedFreightOnly: e.target.checked })}
              className="w-4 h-4 accent-amber-600"
            />
            <span className="text-sm text-gray-800 flex items-center gap-1">
              Alleen dedicated truck-locaties
              <InfoTip title="Dedicated truck-locaties">
                Verbergt snelladers die alleen op vermogen (≥350 kW DC) als truck-capable gelden, zoals
                400 kW-lanen van personenauto-netwerken. Wat overblijft zijn locaties met een expliciet
                trucksignaal: exploitant (Milence, WattHub…), “truck” in de naam, MCS of een logistiek depot.
              </InfoTip>
            </span>
          </label>
        )}

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={filters.showBoundary}
            onChange={(e) => set({ showBoundary: e.target.checked })}
            className="w-4 h-4 accent-indigo-600"
          />
          <span className="w-3 h-3 rounded-sm border-2" style={{ borderColor: LEGEND.boundary }} />
          <span className="text-sm text-gray-800">Gemeente-/provinciegrens</span>
        </label>
      </div>

      {/* Power filter */}
      <div className="pt-2 border-t border-gray-100">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700 flex items-center gap-1">
            Min. vermogen
            <InfoTip title="Minimaal vermogen">
              Toon alleen laadpunten met een maximaal connectorvermogen ≥ de gekozen kW. Waar NDW geen
              vermogen publiceert wordt het afgeleid uit spanning × stroomsterkte; een klein restdeel blijft
              onbekend (0 kW) en verdwijnt bij een hoge drempel.
            </InfoTip>
          </span>
          <span className="text-xs text-gray-500">
            {filters.minPowerKw === 0 ? "alle" : `≥ ${filters.minPowerKw} kW`}
          </span>
        </div>
        <div className="flex gap-1">
          {POWER_STEPS.map((kw) => (
            <button
              key={kw}
              onClick={() => set({ minPowerKw: kw })}
              className={`flex-1 px-1 py-1.5 text-xs rounded transition ${
                filters.minPowerKw === kw
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {kw === 0 ? "Alle" : kw}
            </button>
          ))}
        </div>
      </div>

      {/* Price coloring */}
      <div className="pt-2 border-t border-gray-100">
        <label className="flex items-center justify-between gap-2 cursor-pointer">
          <span className="flex items-center gap-2 text-sm text-gray-800">
            <input
              type="checkbox"
              checked={filters.colorByPrice}
              onChange={(e) => set({ colorByPrice: e.target.checked })}
              className="w-4 h-4 accent-rose-600"
            />
            Kleur op prijs (€/kWh)
          </span>
          <InfoTip title="Kleur op prijs">
            Kleurt de laadpunten naar het actuele energietarief (€/kWh) uit de OCPI-tarieven van NDW — lichter
            is goedkoper, donkerder duurder. Punten zonder gepubliceerd tarief blijven grijs (NDW heeft voor
            ±50% geen prijs). De prijs is een momentopname uit de laatste data-update.
          </InfoTip>
        </label>
      </div>
    </div>
  );
}
