import { contiguousPrimeZones, peakWindows } from "./thresholds.ts";
import type { Analysis, DriverMode, Evaluation } from "./types.ts";

export interface DriverContext {
  mode: DriverMode;
  home: string | null;
  contiguousZones: string[];
  distantZones: string[];
}

const weekdays = new Set([1, 2, 3, 4, 5]);
type ZoneKind = "contiguous" | "distant" | "outside" | "unknown";

function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function mentions(address: string | null, zone: string): boolean {
  const needle = fold(zone).trim();
  if (!address || !needle) return false;
  return new RegExp(`(^|[^a-z])${needle}([^a-z]|$)`).test(fold(address));
}

function zoneKind(address: string | null, context: DriverContext): ZoneKind {
  if (!address) return "unknown";
  const contiguous = context.contiguousZones.some((zone) => mentions(address, zone));
  const distant = context.distantZones.some((zone) => mentions(address, zone));
  if (contiguous) return "contiguous";
  if (distant) return "distant";
  return "outside";
}

function bogota(now: Date): { weekday: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Bogota",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const days: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const hour = Number(value("hour"));
  return {
    weekday: days[value("weekday")] ?? 0,
    minutes: (hour === 24 ? 0 : hour) * 60 + Number(value("minute")),
  };
}

export function isPeak(now: Date): boolean {
  const clock = bogota(now);
  if (!weekdays.has(clock.weekday)) return false;
  return peakWindows.some((window) => clock.minutes >= window.start && clock.minutes < window.end);
}

function refuse(item: Evaluation, reason: string): Evaluation {
  return {
    ...item,
    decision: "no",
    partial: false,
    reasons: item.reasons.includes(reason) ? item.reasons : [...item.reasons, reason],
  };
}

function applyZone(item: Evaluation, context: DriverContext): Evaluation {
  if (context.mode !== "en_zona_prime") return item;
  const origin = zoneKind(item.offer.origin, context);
  const destination = zoneKind(item.offer.destination, context);
  if (destination === "outside") return refuse(item, "Destino fuera de la zona prime");
  if (destination === "unknown") return item;
  if (origin === "outside") return refuse(item, "Origen fuera de la zona prime");
  if (origin !== "unknown" && origin !== destination) return refuse(item, "La carrera sale de la zona");
  return item;
}

function applyPeak(item: Evaluation, now: Date): Evaluation {
  if (item.decision !== "aceptar") return item;
  if (item.offer.app === "uber" || item.offer.surge != null) return item;
  if (!isPeak(now)) return item;
  return {
    ...item,
    decision: "negociar",
    reasons: [...item.reasons, "Hora pico sin recargo"],
  };
}

function applyPriority(item: Evaluation, context: DriverContext): Evaluation {
  if (context.mode === "retornando" && mentions(item.offer.destination, context.home ?? "")) {
    return { ...item, priority: "Alta (Retorno a casa)" };
  }
  if (context.mode === "saliendo") {
    const destination = zoneKind(item.offer.destination, context);
    if (destination === "contiguous" || destination === "distant") {
      return { ...item, priority: "Alta (Zona prime)" };
    }
  }
  return item;
}

export function applyContext(analysis: Analysis, context: DriverContext, now = new Date()): Analysis {
  return {
    ...analysis,
    offers: analysis.offers.map((item) =>
      applyPriority(applyPeak(applyZone(item, context), now), context),
    ),
  };
}

function zonesOf(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const zones = value.filter((item): item is string => typeof item === "string" && item.trim() !== "");
  return zones.length > 0 || value.length === 0 ? zones : fallback;
}

export function parseDriverContext(value: unknown): DriverContext | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as { mode?: unknown; home?: unknown; contiguousZones?: unknown; distantZones?: unknown };
  if (raw.mode !== "saliendo" && raw.mode !== "en_zona_prime" && raw.mode !== "retornando") return null;
  return {
    mode: raw.mode,
    home: typeof raw.home === "string" && raw.home.trim() ? raw.home.trim() : null,
    contiguousZones: zonesOf(raw.contiguousZones, contiguousPrimeZones),
    distantZones: zonesOf(raw.distantZones, []),
  };
}
