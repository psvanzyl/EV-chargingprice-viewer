"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import MunicipalitySelector from "@/components/MunicipalitySelector";
import AddressSearchInput from "@/components/AddressSearchInput";
import FilterPanel from "@/components/FilterPanel";
import StatsPanel from "@/components/StatsPanel";
import LocationDetailPanel from "@/components/LocationDetailPanel";
import LayerSwitcher from "@/components/LayerSwitcher";
import GemeenteScorecard from "@/components/GemeenteScorecard";
import AboutModal from "@/components/AboutModal";
import ShareModal from "@/components/ShareModal";
import GuidedTour, { type TourStep } from "@/components/GuidedTour";
import type { ChoroplethData, AreaProps } from "@/types/analysis";
import { findGemeenteSlug } from "@/lib/pointInGemeente";
import {
  Municipality,
  CropoutData,
  DetailBundle,
  ChargeFeature,
  BoundaryFeature,
  Filters,
  DEFAULT_FILTERS,
} from "@/types/charging";

const MapDeck = dynamic(() => import("@/components/MapDeck"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-gray-100">
      <p className="text-gray-500">Kaart laden…</p>
    </div>
  ),
});

const NL_BOUNDS: [number, number, number, number] = [3.31, 50.75, 7.21, 53.47];
const DEFAULT_SLUG = "utrecht";

export default function Home() {
  const [municipalities, setMunicipalities] = useState<Municipality[]>([]);
  const [selectedMunicipality, setSelectedMunicipality] = useState<string>("");
  const [chargeFeatures, setChargeFeatures] = useState<ChargeFeature[]>([]);
  const [boundaryFeatures, setBoundaryFeatures] = useState<BoundaryFeature[]>([]);
  const [bounds, setBounds] = useState<[number, number, number, number] | null>(null);
  const [details, setDetails] = useState<DetailBundle>({});
  const [gemeenteName, setGemeenteName] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [selected, setSelected] = useState<ChargeFeature | null>(null);
  const [showAbout, setShowAbout] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [choropleth, setChoropleth] = useState<ChoroplethData | null>(null);
  const [analysisMetric, setAnalysisMetric] = useState<string | null>(null);
  const [selectedArea, setSelectedArea] = useState<AreaProps | null>(null);

  const isNational = selectedMunicipality === "nederland";

  // Load the analysis choropleth dataset once.
  useEffect(() => {
    fetch("/data/derived/gemeente-metrics.geojson")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: ChoroplethData | null) => d && setChoropleth(d))
      .catch(() => {});
  }, []);

  const metricMeta = useMemo(
    () => choropleth?.metadata.metrics.find((m) => m.key === analysisMetric) ?? null,
    [choropleth, analysisMetric],
  );
  const choroActive = isNational && !!analysisMetric;

  // Refs so the guided tour can read current data inside its step actions.
  const chargeFeaturesRef = useRef(chargeFeatures);
  const choroplethRef = useRef(choropleth);
  useEffect(() => {
    chargeFeaturesRef.current = chargeFeatures;
  }, [chargeFeatures]);
  useEffect(() => {
    choroplethRef.current = choropleth;
  }, [choropleth]);

  // Interactive guided tour: each step drives the app to a real example screen,
  // lets the existing zoom/fit behaviour kick in, and spotlights the relevant UI.
  const tourSteps: TourStep[] = useMemo(
    () => [
      {
        title: "Welkom bij Laadpalenviewer",
        body: (
          <>
            <p>Een korte rondleiding stuurt je langs alle onderdelen — de kaart beweegt mee.</p>
            <p className="text-gray-400">Later opnieuw te openen via de knop “Uitleg”.</p>
          </>
        ),
        action: () => {
          setSelected(null);
          setSelectedArea(null);
          setAnalysisMetric(null);
          setSelectedMunicipality("utrecht");
        },
      },
      {
        title: "Kies een gemeente",
        target: '[data-tour="municipality"]',
        body: <p>Selecteer hier een gemeente of zoek een adres. De kaart zoomt naar die gemeente en laadt alle details.</p>,
      },
      {
        title: "Twee kaartlagen + filters",
        target: '[data-tour="layers"]',
        body: (
          <p>
            Zet de lagen <strong>personenauto</strong> en <strong>logistiek/vracht</strong> aan/uit en filter op
            vermogen. De ⓘ-iconen geven overal extra uitleg.
          </p>
        ),
      },
      {
        title: "Kleuren = live status",
        target: '[data-tour="legend"]',
        body: (
          <p>
            Punten zijn gekleurd op OCPI-status uit de uurlijkse momentopname:
            <span className="text-green-600"> beschikbaar</span>,
            <span className="text-blue-600"> bezet</span>,
            <span className="text-red-600"> niet beschikbaar</span>.
          </p>
        ),
      },
      {
        title: "Detail van een laadpunt",
        target: '[data-tour="detail"]',
        action: () => {
          const f = chargeFeaturesRef.current.find((x) => x.properties.layer === "passenger") ?? chargeFeaturesRef.current[0];
          if (f) setSelected(f);
        },
        body: <p>We openden een voorbeeld-laadpunt: exploitant, connectoren (type &amp; kW) en tarieven — direct geladen.</p>,
      },
      {
        title: "Gebruik over de tijd",
        target: '[data-tour="usage"]',
        body: <p>Per uur het aandeel connectoren dat laadt (24u/7d/30d/1j), opgebouwd uit de uurlijkse snapshots.</p>,
      },
      {
        title: "Analyse per gemeente",
        target: '[data-tour="analyse"]',
        action: () => {
          setSelected(null);
          setSelectedMunicipality("nederland");
          setAnalysisMetric("siting_priority");
        },
        body: (
          <p>
            In de landelijke weergave kleurt elke indicator de gemeenten (choropleth). Hier:
            <strong> plaatsingsprioriteit</strong>. Onder de keuze staat steeds een uitleg.
          </p>
        ),
      },
      {
        title: "Gemeente-scorecard",
        target: '[data-tour="scorecard"]',
        action: () => {
          const fc = choroplethRef.current;
          const f =
            fc?.features.find((x) => x.properties.gemeente === "Utrecht") ?? fc?.features.find((x) => x.properties.chargers_total != null);
          if (f) setSelectedArea(f.properties as typeof selectedArea);
        },
        body: (
          <p>
            Klik een gemeente voor de scorecard: verwachte vraag (peer-model), tekort/overschot, live belasting en
            een netimpact-scenario met schuiven.
          </p>
        ),
      },
      {
        title: "Bronnen & methodologie",
        body: (
          <>
            <p>
              Bronnen: NDW DOT-NL, CBS, PDOK, Open Charge Map. Vermogen wordt aangenomen (NDW mist het meestal);
              congestie is gemodelleerd.
            </p>
            <p className="text-gray-400">Volledige uitleg staat onder “Over”.</p>
          </>
        ),
        action: () => {
          setSelectedArea(null);
        },
      },
    ],
    [],
  );

  // Load municipalities once.
  useEffect(() => {
    fetch("/municipalities.json")
      .then((r) => r.json())
      .then((data: Municipality[]) => {
        const sorted = data.sort((a, b) => {
          if (a.slug === "nederland") return 1;
          if (b.slug === "nederland") return -1;
          return a.name.localeCompare(b.name);
        });
        setMunicipalities(sorted);

        const params = new URLSearchParams(window.location.search);
        const raw = params.get("gemeente");
        const param = raw === "alle-gemeenten" ? "nederland" : raw;
        const last = localStorage.getItem("lastSelectedMunicipality");
        if (param && sorted.find((m) => m.slug === param)) setSelectedMunicipality(param);
        else if (last && sorted.find((m) => m.slug === last)) setSelectedMunicipality(last);
        else setSelectedMunicipality(sorted.find((m) => m.slug === DEFAULT_SLUG) ? DEFAULT_SLUG : sorted[0].slug);
      })
      .catch((e) => console.error("municipalities load failed", e));
  }, []);

  // Persist selection to URL + localStorage.
  useEffect(() => {
    if (!selectedMunicipality || municipalities.length === 0) return;
    localStorage.setItem("lastSelectedMunicipality", selectedMunicipality);
    const url = new URL(window.location.href);
    url.searchParams.set("gemeente", isNational ? "alle-gemeenten" : selectedMunicipality);
    window.history.replaceState({}, "", url.toString());
  }, [selectedMunicipality, municipalities, isNational]);

  // A locationId to re-select once the next gemeente load finishes (used by the
  // "jump to gemeente" action in the detail panel from the national view).
  const pendingSelectRef = useRef<string | null>(null);

  // Load data when municipality changes.
  useEffect(() => {
    if (!selectedMunicipality) return;
    let cancelled = false;
    setLoading(true);
    setSelected(null);

    const load = async () => {
      if (selectedMunicipality === "nederland") {
        const [pRes, fRes, provRes] = await Promise.all([
          fetch("/data/nederland-passenger.geojson"),
          fetch("/data/nederland-freight.geojson"),
          fetch("/data/provinces.geojson"),
        ]);
        const [p, f, prov] = (await Promise.all([pRes.json(), fRes.json(), provRes.json()])) as CropoutData[];
        if (cancelled) return;
        setChargeFeatures([
          ...(p.features as ChargeFeature[]),
          ...(f.features as ChargeFeature[]),
        ]);
        setBoundaryFeatures(prov.features as BoundaryFeature[]);
        setBounds(NL_BOUNDS);
        setDetails({});
        setGemeenteName("Nederland");
      } else {
        const [cropRes, detRes, statusRes] = await Promise.all([
          fetch(`/data/gemeenten/${selectedMunicipality}.geojson`),
          fetch(`/data/gemeenten/${selectedMunicipality}.details.json`),
          fetch(`/data/status/${selectedMunicipality}.json`),
        ]);
        const crop = (await cropRes.json()) as CropoutData;
        const bundle = (await detRes.json()) as DetailBundle;
        // Fresh hourly status (may not exist yet); overrides build-time status on the map.
        const freshStatus = statusRes.ok
          ? ((await statusRes.json()) as Record<string, ChargeFeature["properties"]["status"]>)
          : {};
        if (cancelled) return;
        const charges = (crop.features.filter((f) => f.properties.type === "charge") as ChargeFeature[]).map((f) => {
          const s = freshStatus[f.properties.locationId];
          return s ? { ...f, properties: { ...f.properties, status: s } } : f;
        });
        const boundaries = crop.features.filter((f) => f.properties.type === "boundary") as BoundaryFeature[];
        setChargeFeatures(charges);
        setBoundaryFeatures(boundaries);
        setBounds(crop.metadata.bounds ?? null);
        setDetails(bundle);
        setGemeenteName(crop.metadata.gemeente ?? selectedMunicipality);
        if (pendingSelectRef.current) {
          const again = charges.find((f) => f.properties.locationId === pendingSelectRef.current);
          pendingSelectRef.current = null;
          if (again) setSelected(again);
        }
      }
    };

    load()
      .catch((e) => console.error("data load failed", e))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [selectedMunicipality]);

  // Counts shown in the filter panel: same power/kind filtering as the map layers,
  // so "the counts reflect the current view" actually holds.
  const { passengerCount, freightCount } = useMemo(() => {
    let p = 0;
    let f = 0;
    for (const feat of chargeFeatures) {
      if (feat.properties.maxPowerKw < filters.minPowerKw) continue;
      if (feat.properties.layer === "freight") {
        if (filters.dedicatedFreightOnly && feat.properties.freightKind === "hpc") continue;
        f++;
      } else p++;
    }
    return { passengerCount: p, freightCount: f };
  }, [chargeFeatures, filters.minPowerKw, filters.dedicatedFreightOnly]);

  const selectedDetail = selected ? details[selected.properties.locationId] ?? null : null;

  // From the national view, jump into the gemeente containing the selected point
  // (found via the choropleth polygons) and re-open its detail panel there.
  const jumpToGemeente = useMemo(() => {
    if (!selected || selectedDetail || !isNational) return undefined;
    const [lng, lat] = selected.geometry.coordinates;
    const slug = findGemeenteSlug(choropleth, lng, lat);
    if (!slug) return undefined;
    const locationId = selected.properties.locationId;
    return () => {
      pendingSelectRef.current = locationId;
      setAnalysisMetric(null);
      setSelectedMunicipality(slug);
    };
  }, [selected, selectedDetail, isNational, choropleth]);

  const handleAddressSelected = (slug: string) => {
    setSelectedMunicipality(slug);
    setMobileSidebarOpen(false);
  };

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="bg-white shadow-sm z-20">
        <div className="px-3 py-2 md:px-4 md:py-3 flex items-center gap-2 md:gap-4">
          <h1 className="text-lg md:text-xl font-bold text-gray-900 flex-shrink-0">
            🔌 <span className="hidden sm:inline">Laadpalenviewer</span>
          </h1>
          <div className="flex-1 min-w-0 max-w-[200px] sm:max-w-xs md:max-w-md" data-tour="municipality">
            <MunicipalitySelector
              municipalities={municipalities}
              selected={selectedMunicipality}
              onChange={(slug) => {
                setSelectedMunicipality(slug);
                setMobileSidebarOpen(false);
              }}
            />
          </div>
          <div className="hidden md:block flex-1 max-w-md">
            <AddressSearchInput municipalities={municipalities} onAddressSelected={handleAddressSelected} />
          </div>
          {loading && (
            <div className="flex items-center gap-2 text-xs md:text-sm text-gray-500">
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="hidden sm:inline">Laden…</span>
            </div>
          )}
          <div className="hidden lg:flex gap-2 ml-auto">
            <button
              onClick={() => setShowTutorial(true)}
              className="px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition"
            >
              Uitleg
            </button>
            <button
              onClick={() => setShowShare(true)}
              className="px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition"
            >
              Delen
            </button>
            <button
              onClick={() => setShowAbout(true)}
              className="px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition"
            >
              Over
            </button>
          </div>
        </div>
      </header>

      {/* Main */}
      <div className="flex-1 flex overflow-hidden relative">
        {mobileSidebarOpen && (
          <div className="md:hidden fixed inset-0 bg-black/50 z-30" onClick={() => setMobileSidebarOpen(false)} />
        )}
        <aside
          className={`fixed md:relative inset-y-0 left-0 z-40 md:z-auto w-[85vw] max-w-[320px] md:w-80
            bg-gray-50 p-3 md:p-4 overflow-y-auto space-y-3 md:space-y-4
            transform transition-transform duration-300 ease-in-out
            ${mobileSidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"} shadow-xl md:shadow-none`}
        >
          <StatsPanel gemeente={gemeenteName} chargeFeatures={chargeFeatures} />
          {isNational && choropleth && (
            <LayerSwitcher
              metrics={choropleth.metadata.metrics}
              active={analysisMetric}
              onChange={(k) => {
                setAnalysisMetric(k);
                setSelectedArea(null);
              }}
            />
          )}
          <FilterPanel
            filters={filters}
            onChange={setFilters}
            passengerCount={passengerCount}
            freightCount={freightCount}
          />
          {isNational && (
            <p className="text-xs text-gray-500 px-1">
              Landelijk overzicht: alle laadpunten worden getoond zonder details. Kies een gemeente om
              details (laadpunten, connectoren, tarieven) te laden.
            </p>
          )}
        </aside>

        <main className="flex-1 relative">
          <MapDeck
            chargeFeatures={chargeFeatures}
            boundaryFeatures={boundaryFeatures}
            bounds={bounds}
            filters={choroActive ? { ...filters, showPassenger: false, showFreight: false } : filters}
            selectedLocationId={selected?.properties.locationId ?? null}
            onSelect={setSelected}
            choropleth={choroActive ? choropleth : null}
            analysisMetric={choroActive ? analysisMetric : null}
            metricMeta={metricMeta}
            onAreaSelect={(p) => setSelectedArea(p as AreaProps)}
          />

          {choroActive && selectedArea && (
            <GemeenteScorecard
              area={selectedArea}
              onClose={() => setSelectedArea(null)}
              onOpenGemeente={(slug) => {
                setSelectedArea(null);
                setAnalysisMetric(null);
                setSelectedMunicipality(slug);
              }}
            />
          )}

          <LocationDetailPanel
            selected={selected}
            detail={selectedDetail}
            loading={loading}
            slug={selectedMunicipality}
            onClose={() => setSelected(null)}
            onJumpToGemeente={jumpToGemeente}
          />

          {/* Mobile filter button */}
          <button
            onClick={() => setMobileSidebarOpen(true)}
            className="md:hidden fixed bottom-6 left-4 z-20 bg-blue-600 text-white px-4 py-3 rounded-full shadow-lg hover:bg-blue-700 transition text-sm font-medium"
          >
            Filters & stats
          </button>
        </main>
      </div>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 px-3 md:px-4 py-2">
        <div className="max-w-7xl mx-auto flex justify-between items-center text-xs text-gray-500">
          <button onClick={() => setShowAbout(true)} className="text-blue-600 hover:underline">
            Info over databronnen
          </button>
          <span>Bronnen: NDW OCPI · PDOK/CBS · Open Charge Map</span>
        </div>
      </footer>

      <AboutModal
        isOpen={showAbout}
        onClose={() => setShowAbout(false)}
        onStartTutorial={() => setShowTutorial(true)}
      />
      <GuidedTour open={showTutorial} steps={tourSteps} onClose={() => setShowTutorial(false)} />
      <ShareModal
        isOpen={showShare}
        onClose={() => setShowShare(false)}
        municipality={selectedMunicipality}
        municipalityName={municipalities.find((m) => m.slug === selectedMunicipality)?.name || selectedMunicipality}
      />
    </div>
  );
}
