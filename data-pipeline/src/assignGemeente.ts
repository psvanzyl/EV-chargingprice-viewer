// Assign each point to a gemeente via bbox pre-filter + point-in-polygon.
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point } from '@turf/helpers';
import type { Boundaries, BoundaryFeature } from './fetchBoundaries.js';

export interface Assignable {
  lat: number;
  lng: number;
}

export class GemeenteAssigner {
  private gemeenten: BoundaryFeature[];
  private bboxes: Map<string, [number, number, number, number]>;

  constructor(boundaries: Boundaries) {
    this.gemeenten = boundaries.gemeenten;
    this.bboxes = boundaries.gemeenteBboxes;
  }

  // Returns the gemeente statcode (e.g. "GM0344") or null if no polygon matches.
  assign(item: Assignable): string | null {
    const { lat, lng } = item;
    const pt = point([lng, lat]);
    for (const g of this.gemeenten) {
      const b = this.bboxes.get(g.properties.statcode);
      if (!b) continue;
      if (lng < b[0] || lng > b[2] || lat < b[1] || lat > b[3]) continue; // bbox reject
      if (booleanPointInPolygon(pt, g as any)) {
        return g.properties.statcode;
      }
    }
    return null;
  }

  // Like assign(), but falls back to the nearest gemeente (by bbox distance) for
  // points that miss every generalized polygon — reclaimed/industrial land such as
  // the Maasvlakte sits outside the simplified coastline. Returns null beyond ~15 km.
  assignWithFallback(item: Assignable): { code: string; fallback: boolean } | null {
    const exact = this.assign(item);
    if (exact) return { code: exact, fallback: false };
    const { lat, lng } = item;
    const cosLat = Math.cos((lat * Math.PI) / 180);
    let best: string | null = null;
    let bestD = Infinity;
    for (const g of this.gemeenten) {
      const b = this.bboxes.get(g.properties.statcode);
      if (!b) continue;
      const dx = (lng < b[0] ? b[0] - lng : lng > b[2] ? lng - b[2] : 0) * cosLat;
      const dy = lat < b[1] ? b[1] - lat : lat > b[3] ? lat - b[3] : 0;
      let d = Math.hypot(dx, dy);
      if (d === 0) {
        // Inside the bbox but outside the polygon: rank by distance to bbox centre,
        // scaled down so any bbox hit beats a near-miss on a neighbouring bbox.
        const cx = ((b[0] + b[2]) / 2 - lng) * cosLat;
        const cy = (b[1] + b[3]) / 2 - lat;
        d = Math.hypot(cx, cy) * 0.01;
      }
      if (d < bestD) {
        bestD = d;
        best = g.properties.statcode;
      }
    }
    return best && bestD <= 0.15 ? { code: best, fallback: true } : null;
  }
}
