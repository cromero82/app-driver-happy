import type { Decision, InclineLevel, SafetyLevel } from "./types.ts";

export function canonicalIncline(value: string | null | undefined): InclineLevel | null {
  const text = (value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_");
  if (text.includes("muy_alta")) return "muy_alta";
  if (/(^|[^a-z])alta([^a-z]|$)/.test(text)) return "alta";
  if (text.includes("media")) return "media";
  if (text.includes("plana") || text.includes("baja") || text.includes("normal")) return "plana";
  return null;
}

export function decisionForIncline(
  decision: Decision,
  incline: InclineLevel | null,
  safety: SafetyLevel | null,
): Decision {
  if (safety === "rojo" || incline === "muy_alta") return "no";
  if (incline === "alta" && decision !== "no") return "negociar";
  return decision;
}

export interface Thresholds {
  city: string;
  negociarBelowCopPerKm: number;
  optimoMinCopPerKm: number;
}

export const contiguousPrimeZones = ["Itagüí", "Sabaneta", "Poblado", "Laureles", "Belén", "Envigado"];

/** Minutos desde medianoche, hora de Bogotá. El fin no entra. */
export const peakWindows = [
  { start: 6 * 60, end: 9 * 60 },
  { start: 17 * 60, end: 20 * 60 },
];

export const nightWindow = { start: 19 * 60, end: 5 * 60 };

/** COP por km (recogida + viaje). Justo queda entre los dos cortes. */
export const thresholds: Thresholds = {
  city: "Medellin",
  negociarBelowCopPerKm: 2000,
  optimoMinCopPerKm: 3500,
};
