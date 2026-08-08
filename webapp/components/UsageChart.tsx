"use client";

import { useEffect, useMemo, useState } from "react";
import InfoTip from "@/components/InfoTip";

// Per-day snapshot file shape (data/snapshots/<slug>/<date>.json)
interface DayFile {
  date: string;
  tz: string;
  locations: Record<string, { n: number; occ: (number | null)[] }>;
}
// Daily-averages file shape (data/snapshots/<slug>/daily.json)
type DailyFile = Record<string, Record<string, number>>;

type Range = "24h" | "7d" | "30d" | "1y";
const RANGES: { key: Range; label: string }[] = [
  { key: "24h", label: "24u" },
  { key: "7d", label: "7d" },
  { key: "30d", label: "30d" },
  { key: "1y", label: "1j" },
];

interface Point {
  label: string; // x tooltip label
  short: string; // x-axis tick
  v: number | null; // occupancy %
}

// Europe/Amsterdam local date (YYYY-MM-DD), `offset` days ago.
function localDate(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() - offsetDays);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url);
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;
  }
}

export default function UsageChart({ slug, locationId }: { slug: string; locationId: string }) {
  const [range, setRange] = useState<Range>("24h");
  const [points, setPoints] = useState<Point[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setPoints(null);
    setHover(null);

    const build = async (): Promise<Point[]> => {
      if (range === "1y") {
        const daily = await getJson<DailyFile>(`/data/snapshots/${slug}/daily.json`);
        const series = daily?.[locationId] ?? {};
        const dates = Object.keys(series).sort();
        return dates.map((d) => ({ label: d, short: d.slice(5), v: series[d] }));
      }
      const days = range === "24h" ? 1 : range === "7d" ? 7 : 30;
      const dates: string[] = [];
      for (let i = days - 1; i >= 0; i--) dates.push(localDate(i));
      const files = await Promise.all(dates.map((d) => getJson<DayFile>(`/data/snapshots/${slug}/${d}.json`)));
      const out: Point[] = [];
      files.forEach((f, di) => {
        const occ = f?.locations?.[locationId]?.occ ?? Array(24).fill(null);
        for (let h = 0; h < 24; h++) {
          out.push({
            label: `${dates[di]} ${String(h).padStart(2, "0")}:00`,
            short: range === "24h" ? `${h}u` : h === 12 ? dates[di].slice(5) : "",
            v: occ[h] ?? null,
          });
        }
      });
      return out;
    };

    build()
      .then((p) => {
        if (!cancelled) setPoints(p);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [slug, locationId, range]);

  const stats = useMemo(() => {
    if (!points) return null;
    const vals = points.map((p) => p.v).filter((v): v is number => v !== null);
    if (vals.length === 0) return { avg: null, hasData: false };
    return { avg: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length), hasData: true };
  }, [points]);

  // Build SVG polyline segments (break on nulls).
  const segments = useMemo(() => {
    if (!points || points.length === 0) return [];
    const n = points.length;
    const segs: string[] = [];
    let cur: string[] = [];
    points.forEach((p, i) => {
      if (p.v === null) {
        if (cur.length) segs.push(cur.join(" "));
        cur = [];
        return;
      }
      const x = n === 1 ? 50 : (i / (n - 1)) * 100;
      const y = 100 - Math.min(100, Math.max(0, p.v));
      cur.push(`${x.toFixed(2)},${y.toFixed(2)}`);
    });
    if (cur.length) segs.push(cur.join(" "));
    return segs;
  }, [points]);

  return (
    <div className="space-y-2" data-tour="usage">
      <div className="flex items-center justify-between">
        <h4 className="font-medium text-sm text-gray-700 flex items-center gap-1">
          Gebruik over de tijd
          <InfoTip title="Gebruik over de tijd">
            Per uur: het aandeel connectoren van deze locatie met OCPI-status “laden” (% in gebruik). Opgebouwd
            uit de uurlijkse NDW-snapshots; 24u/7d/30d tonen uurwaarden, 1j toont daggemiddelden. De historie
            groeit naarmate de app langer draait.
          </InfoTip>
        </h4>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              className={`px-1.5 py-0.5 text-[11px] rounded ${
                range === r.key ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="h-28 bg-gray-100 rounded animate-pulse" />
      ) : !stats?.hasData ? (
        <p className="text-xs text-gray-400">Nog geen gebruiksdata voor deze locatie.</p>
      ) : (
        <div className="bg-gray-50 rounded p-2">
          <div className="flex">
            <div className="flex flex-col justify-between h-28 pr-1 text-[9px] text-gray-400 text-right">
              <span>100%</span>
              <span>50%</span>
              <span>0%</span>
            </div>
            <div
              className="relative flex-1 h-28"
              onMouseLeave={() => setHover(null)}
              onMouseMove={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const ratio = (e.clientX - rect.left) / rect.width;
                const idx = Math.round(ratio * ((points?.length ?? 1) - 1));
                setHover(Math.max(0, Math.min((points?.length ?? 1) - 1, idx)));
              }}
            >
              {/* grid */}
              {[0, 50, 100].map((g) => (
                <div key={g} className="absolute left-0 right-0 border-t border-gray-200" style={{ top: `${g}%` }} />
              ))}
              {/* average line */}
              {stats.avg !== null && (
                <div
                  className="absolute left-0 right-0 border-t border-dashed border-blue-400/70"
                  style={{ top: `${100 - stats.avg}%` }}
                >
                  <span className="absolute right-0 -top-3 text-[9px] text-blue-500 bg-gray-50 px-0.5">
                    gem. {stats.avg}%
                  </span>
                </div>
              )}
              <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                {segments.map((pts, i) =>
                  pts.includes(" ") ? (
                    <polyline key={i} points={pts} fill="none" stroke="#2563eb" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
                  ) : (
                    <circle key={i} cx={pts.split(",")[0]} cy={pts.split(",")[1]} r="1.5" fill="#2563eb" vectorEffect="non-scaling-stroke" />
                  ),
                )}
              </svg>
              {/* hover marker */}
              {hover !== null && points && points[hover]?.v !== null && (
                <div
                  className="absolute z-10 -translate-x-1/2 -translate-y-full bg-gray-800 text-white text-[9px] px-1 py-0.5 rounded whitespace-nowrap pointer-events-none"
                  style={{
                    left: `${points.length === 1 ? 50 : (hover / (points.length - 1)) * 100}%`,
                    top: `${100 - (points[hover].v as number)}%`,
                  }}
                >
                  {points[hover].label} — {points[hover].v}%
                </div>
              )}
            </div>
          </div>
          {/* x-axis ticks */}
          <div className="flex justify-between mt-1 pl-6 text-[8px] text-gray-400">
            {points &&
              points
                .map((p, i) => ({ p, i }))
                .filter(({ p }) => p.short)
                .filter((_, idx, arr) => arr.length <= 12 || idx % Math.ceil(arr.length / 12) === 0)
                .map(({ p, i }) => <span key={i}>{p.short}</span>)}
          </div>
          <p className="text-[10px] text-gray-400 mt-1">% connectoren in gebruik (laden), OCPI-momentopname per uur.</p>
        </div>
      )}
    </div>
  );
}
