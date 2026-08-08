// Human-readable labels for OCPI connector/EVSE fields.
// Lifted from fleetsim's ChargingPointsMapDeck helpers.

const CONNECTOR_LABELS: Record<string, string> = {
  IEC_62196_T2: "Type 2",
  IEC_62196_T2_COMBO: "CCS (Type 2 Combo)",
  CHADEMO: "CHAdeMO",
  DOMESTIC_A: "Schuko",
  DOMESTIC_F: "Type F (Schuko)",
  DOMESTIC_G: "Type G (UK)",
  IEC_60309_2_single_16: "IEC 60309 (16A)",
  IEC_60309_2_three_16: "IEC 60309 3-fase (16A)",
  IEC_60309_2_three_32: "IEC 60309 3-fase (32A)",
  IEC_60309_2_three_64: "IEC 60309 3-fase (64A)",
  TESLA_S: "Tesla (Type 2)",
  IEC_63379: "MCS (Megawatt)",
};

export function formatConnectorStandard(standard: string): string {
  if (CONNECTOR_LABELS[standard]) return CONNECTOR_LABELS[standard];
  if (standard?.toUpperCase().startsWith("MCS")) return "MCS (Megawatt)";
  return standard;
}

const POWER_TYPE_LABELS: Record<string, string> = {
  AC_1_PHASE: "AC 1-fase",
  AC_3_PHASE: "AC 3-fase",
  DC: "DC",
};

export function formatPowerType(powerType: string): string {
  return POWER_TYPE_LABELS[powerType] || powerType;
}

export function statusColorClass(status: string): string {
  switch (status) {
    case "AVAILABLE":
      return "bg-green-500";
    case "CHARGING":
      return "bg-blue-500";
    case "BLOCKED":
      return "bg-orange-500";
    case "OUTOFORDER":
      return "bg-red-500";
    case "RESERVED":
      return "bg-purple-500";
    default:
      return "bg-gray-500";
  }
}

export function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    AVAILABLE: "Beschikbaar",
    CHARGING: "Bezet",
    BLOCKED: "Geblokkeerd",
    OUTOFORDER: "Buiten dienst",
    RESERVED: "Gereserveerd",
    UNKNOWN: "Onbekend",
  };
  return labels[status] || status;
}
