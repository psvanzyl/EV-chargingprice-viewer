// Locate the gemeente (by slug) whose polygon contains a point, using the
// analysis choropleth as the polygon source. Ray casting; holes respected.
import type { ChoroplethData } from "@/types/analysis";

function inRing(ring: number[][], lng: number, lat: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function inPolygon(coords: number[][][], lng: number, lat: number): boolean {
  if (!coords.length || !inRing(coords[0], lng, lat)) return false;
  for (let k = 1; k < coords.length; k++) {
    if (inRing(coords[k], lng, lat)) return false; // inside a hole
  }
  return true;
}

export function findGemeenteSlug(
  choropleth: ChoroplethData | null,
  lng: number,
  lat: number,
): string | null {
  if (!choropleth) return null;
  for (const f of choropleth.features) {
    const g = f.geometry;
    const hit =
      g.type === "Polygon"
        ? inPolygon(g.coordinates as number[][][], lng, lat)
        : g.type === "MultiPolygon"
          ? (g.coordinates as number[][][][]).some((p) => inPolygon(p, lng, lat))
          : false;
    if (hit) return f.properties.slug ?? null;
  }
  return null;
}
