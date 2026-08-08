"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import {
  CropoutData,
  ChargeFeature,
  BoundaryFeature,
  DEFAULT_FILTERS,
} from "@/types/charging";

const MapDeck = dynamic(() => import("@/components/MapDeck"), { ssr: false });

const NL_BOUNDS: [number, number, number, number] = [3.31, 50.75, 7.21, 53.47];

function EmbedInner() {
  const params = useSearchParams();
  const raw = params.get("gemeente");
  const slug = raw === "alle-gemeenten" ? "nederland" : raw || "utrecht";

  const [chargeFeatures, setChargeFeatures] = useState<ChargeFeature[]>([]);
  const [boundaryFeatures, setBoundaryFeatures] = useState<BoundaryFeature[]>([]);
  const [bounds, setBounds] = useState<[number, number, number, number] | null>(null);
  const [selected, setSelected] = useState<ChargeFeature | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (slug === "nederland") {
        const [p, f] = (await Promise.all([
          fetch("/data/nederland-passenger.geojson").then((r) => r.json()),
          fetch("/data/nederland-freight.geojson").then((r) => r.json()),
        ])) as CropoutData[];
        if (cancelled) return;
        setChargeFeatures([...(p.features as ChargeFeature[]), ...(f.features as ChargeFeature[])]);
        setBounds(NL_BOUNDS);
      } else {
        const crop = (await fetch(`/data/gemeenten/${slug}.geojson`).then((r) => r.json())) as CropoutData;
        if (cancelled) return;
        setChargeFeatures(crop.features.filter((f) => f.properties.type === "charge") as ChargeFeature[]);
        setBoundaryFeatures(crop.features.filter((f) => f.properties.type === "boundary") as BoundaryFeature[]);
        setBounds(crop.metadata.bounds ?? null);
      }
    };
    load().catch((e) => console.error(e));
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return (
    <div className="h-screen w-screen">
      <MapDeck
        chargeFeatures={chargeFeatures}
        boundaryFeatures={boundaryFeatures}
        bounds={bounds}
        filters={DEFAULT_FILTERS}
        selectedLocationId={selected?.properties.locationId ?? null}
        onSelect={setSelected}
      />
    </div>
  );
}

export default function EmbedPage() {
  return (
    <Suspense fallback={<div className="h-screen w-screen flex items-center justify-center text-gray-500">Kaart laden…</div>}>
      <EmbedInner />
    </Suspense>
  );
}
