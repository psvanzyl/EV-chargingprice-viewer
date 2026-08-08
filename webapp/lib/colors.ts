// Color palettes for the deck.gl layers and legend.
import type { AggregateStatus } from "@/types/charging";

export type RGBA = [number, number, number, number];

// Passenger points: colored by OCPI status (fleetsim-style).
export const STATUS_AVAILABLE: RGBA = [34, 197, 94, 210]; // green-500
export const STATUS_CHARGING: RGBA = [59, 130, 246, 210]; // blue-500
export const STATUS_UNAVAILABLE: RGBA = [239, 68, 68, 210]; // red-500
export const STATUS_UNKNOWN: RGBA = [107, 114, 128, 200]; // gray-500

// Freight points: amber/orange; megawatt = red-orange; truck-capable HPC = light amber.
export const FREIGHT: RGBA = [245, 158, 11, 235]; // amber-500
export const FREIGHT_MEGAWATT: RGBA = [234, 88, 12, 245]; // orange-600
export const FREIGHT_HPC: RGBA = [252, 211, 77, 220]; // amber-300

export const BOUNDARY_LINE: RGBA = [79, 70, 229, 200]; // indigo-600

export function statusColor(status: AggregateStatus): RGBA {
  switch (status) {
    case "AVAILABLE":
      return STATUS_AVAILABLE;
    case "CHARGING":
      return STATUS_CHARGING;
    case "UNAVAILABLE":
      return STATUS_UNAVAILABLE;
    default:
      return STATUS_UNKNOWN;
  }
}

export function freightColor(isMegawatt: boolean, kind?: string): RGBA {
  if (isMegawatt) return FREIGHT_MEGAWATT;
  return kind === "hpc" ? FREIGHT_HPC : FREIGHT;
}

// Hex equivalents for legend / UI swatches.
export const LEGEND = {
  available: "#22c55e",
  charging: "#3b82f6",
  unavailable: "#ef4444",
  unknown: "#6b7280",
  freight: "#f59e0b",
  freightMegawatt: "#ea580c",
  freightHpc: "#fcd34d",
  boundary: "#4f46e5",
};
