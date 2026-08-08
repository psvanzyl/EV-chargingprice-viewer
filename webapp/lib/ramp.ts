// Sequential color ramp (YlOrRd-ish) for choropleths.
export type RGBA = [number, number, number, number];

const STOPS: [number, number, number][] = [
  [255, 255, 204],
  [254, 217, 118],
  [253, 141, 60],
  [240, 59, 32],
  [189, 0, 38],
];

export const NODATA: RGBA = [226, 232, 240, 120]; // slate-200, translucent

export function rampColor(t: number, alpha = 200): RGBA {
  const x = Math.min(1, Math.max(0, t));
  const seg = x * (STOPS.length - 1);
  const i = Math.min(STOPS.length - 2, Math.floor(seg));
  const f = seg - i;
  const a = STOPS[i];
  const b = STOPS[i + 1];
  return [
    Math.round(a[0] + (b[0] - a[0]) * f),
    Math.round(a[1] + (b[1] - a[1]) * f),
    Math.round(a[2] + (b[2] - a[2]) * f),
    alpha,
  ];
}

export function rampCss(t: number): string {
  const [r, g, b] = rampColor(t, 255);
  return `rgb(${r},${g},${b})`;
}

// Robust domain [p5, p95] over numeric values.
export function robustDomain(values: number[]): [number, number] {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return [0, 1];
  const at = (p: number) => v[Math.min(v.length - 1, Math.max(0, Math.floor(p * (v.length - 1))))];
  const lo = at(0.05);
  const hi = at(0.95);
  return hi > lo ? [lo, hi] : [v[0], v[v.length - 1] || v[0] + 1];
}
