// Merge + dedupe freight locations from multiple sources by rounded coordinates.
import type { NormalizedFreightLocation } from '../types.js';

// ~11 m grid. Tunable: higher precision = less merging.
const COORD_PRECISION = 4;

// Higher number = higher priority (kept on collision).
const SOURCE_PRIORITY: Record<string, number> = {
  curated: 100,
  ndw: 80,
  eafo: 60,
  ocm: 40,
};

function priority(source: string): number {
  return SOURCE_PRIORITY[source] ?? 0;
}

function key(loc: NormalizedFreightLocation): string {
  return `${loc.lat.toFixed(COORD_PRECISION)},${loc.lng.toFixed(COORD_PRECISION)}`;
}

export function mergeFreight(
  groups: NormalizedFreightLocation[][],
): NormalizedFreightLocation[] {
  const byCoord = new Map<string, NormalizedFreightLocation>();

  for (const group of groups) {
    for (const loc of group) {
      const k = key(loc);
      const existing = byCoord.get(k);
      if (!existing) {
        byCoord.set(k, { ...loc });
        continue;
      }
      // Merge: keep the higher-priority record, take max power, prefer richer fields.
      const winner = priority(loc.source) > priority(existing.source) ? loc : existing;
      const other = winner === loc ? existing : loc;
      const pickStatus =
        winner.status && winner.status !== 'UNKNOWN' ? winner.status : other.status ?? winner.status;
      const dedicated = winner.freightKind === 'dedicated' || other.freightKind === 'dedicated';
      byCoord.set(k, {
        ...winner,
        maxPowerKw: Math.max(winner.maxPowerKw, other.maxPowerKw),
        isMegawatt: winner.isMegawatt || other.isMegawatt,
        operatorName: winner.operatorName || other.operatorName,
        address: winner.address || other.address,
        city: winner.city || other.city,
        status: pickStatus,
        sourceUrl: winner.sourceUrl || other.sourceUrl,
        priceKwh: winner.priceKwh ?? other.priceKwh,
        freightKind: dedicated ? 'dedicated' : winner.freightKind ?? other.freightKind,
        freightReason:
          (winner.freightKind === 'dedicated' ? winner.freightReason : undefined) ??
          (other.freightKind === 'dedicated' ? other.freightReason : undefined) ??
          winner.freightReason ??
          other.freightReason,
      });
    }
  }

  return [...byCoord.values()];
}
