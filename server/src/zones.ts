import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import along from "@turf/along";
import booleanIntersects from "@turf/boolean-intersects";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import buffer from "@turf/buffer";
import { lineString, point, polygon } from "@turf/helpers";
import length from "@turf/length";
import type { Evaluation, InclineLevel, SafetyLevel } from "./types.ts";

export interface LineGeometry {
  type: "LineString";
  coordinates: [number, number][];
}

interface ZoneProperties {
  nombre?: string;
  modo?: string;
  activo?: boolean;
  seguridad?: string;
  pendiente?: string;
  radioMetros?: number;
}

export interface ZoneFeature {
  type: "Feature";
  properties: ZoneProperties;
  geometry: { type: string; coordinates: unknown };
}

interface ZoneCollection {
  type: "FeatureCollection";
  features: ZoneFeature[];
}

export interface ZoneHit {
  nombre: string;
  seguridad: SafetyLevel | null;
  pendiente: InclineLevel | null;
  metros: number;
  porcentaje: number;
}

const slopes = new Set<InclineLevel>(["normal", "media", "alta", "muy_alta"]);
const safeties = new Set<SafetyLevel>(["rojo", "amarillo"]);
const zonesPath = join(dirname(fileURLToPath(import.meta.url)), "../data/zonas.geojson");

function positions(value: unknown): [number, number][] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const points: [number, number][] = [];
  for (const item of value) {
    if (!Array.isArray(item) || item.length < 2) return null;
    if (typeof item[0] !== "number" || typeof item[1] !== "number") return null;
    points.push([item[0], item[1]]);
  }
  return points;
}

function geometryOk(feature: ZoneFeature): boolean {
  const geometry = feature.geometry;
  if (!geometry) return false;
  if (geometry.type === "LineString") {
    const line = positions(geometry.coordinates);
    return line != null && line.length >= 2;
  }
  if (geometry.type === "Polygon") {
    const rings = geometry.coordinates;
    if (!Array.isArray(rings) || !Array.isArray(rings[0])) return false;
    const ring = positions(rings[0]);
    if (!ring || ring.length < 4) return false;
    const first = ring[0];
    const last = ring[ring.length - 1];
    return first[0] === last[0] && first[1] === last[1];
  }
  if (geometry.type === "Point") {
    const pair = geometry.coordinates;
    return (
      Array.isArray(pair) &&
      pair.length >= 2 &&
      typeof pair[0] === "number" &&
      typeof pair[1] === "number" &&
      typeof feature.properties.radioMetros === "number" &&
      feature.properties.radioMetros > 0
    );
  }
  return false;
}

export function operationalFeatures(collection: ZoneCollection): ZoneFeature[] {
  return collection.features.filter((feature) => {
    const props = feature.properties ?? {};
    if (props.activo !== true) return false;
    if (props.modo != null && props.modo !== "operativa") return false;
    if (!geometryOk(feature)) return false;
    const safety = safeties.has(props.seguridad as SafetyLevel);
    const slope = slopes.has(props.pendiente as InclineLevel);
    return safety || slope;
  });
}

export function loadOperationalZones(path = zonesPath): ZoneFeature[] {
  const collection = JSON.parse(readFileSync(path, "utf8")) as ZoneCollection;
  return operationalFeatures(collection);
}

export function hasOperationalZones(path = zonesPath): boolean {
  return loadOperationalZones(path).length > 0;
}

function areaOf(feature: ZoneFeature) {
  if (feature.geometry.type === "Polygon") {
    return polygon(feature.geometry.coordinates as [number, number][][]);
  }
  if (feature.geometry.type === "Point") {
    const radius = feature.properties.radioMetros;
    if (typeof radius !== "number" || radius <= 0) return null;
    const [lng, lat] = feature.geometry.coordinates as [number, number];
    const circle = buffer(point([lng, lat]), radius, { units: "meters", steps: 24 });
    return circle ?? null;
  }
  return null;
}

function metersInside(line: LineGeometry, area: { type: string; geometry?: { type?: string } }): { meters: number; porcentaje: number } {
  if (area.geometry?.type !== "Polygon" && area.geometry?.type !== "MultiPolygon") {
    return { meters: 0, porcentaje: 0 };
  }
  const route = lineString(line.coordinates);
  const totalKm = length(route, { units: "kilometers" });
  const total = totalKm * 1000;
  if (total === 0) return { meters: 0, porcentaje: 0 };
  const step = 0.025;
  let samples = 0;
  let inside = 0;
  for (let distance = 0; distance <= totalKm; distance += step) {
    samples += 1;
    if (booleanPointInPolygon(along(route, distance, { units: "kilometers" }), area as never)) inside += 1;
  }
  const meters = Math.round((inside / samples) * total);
  return { meters, porcentaje: Math.round((meters / total) * 1000) / 10 };
}

export function zonesOnRoute(line: LineGeometry, zones: ZoneFeature[]): ZoneHit[] {
  const route = lineString(line.coordinates);
  const hits: ZoneHit[] = [];
  for (const zone of zones) {
    const props = zone.properties;
    const area = areaOf(zone);
    const target = area ?? (zone.geometry.type === "LineString" ? lineString(zone.geometry.coordinates as [number, number][]) : null);
    if (!target || !booleanIntersects(route, target)) continue;
    const measured = area ? metersInside(line, area) : { meters: 0, porcentaje: 0 };
    hits.push({
      nombre: props.nombre?.trim() || "Zona",
      seguridad: safeties.has(props.seguridad as SafetyLevel) ? (props.seguridad as SafetyLevel) : null,
      pendiente: slopes.has(props.pendiente as InclineLevel) ? (props.pendiente as InclineLevel) : null,
      metros: measured.meters,
      porcentaje: measured.porcentaje,
    });
  }
  return hits;
}

function rankSlope(level: InclineLevel | null): number {
  if (level === "muy_alta") return 4;
  if (level === "alta") return 3;
  if (level === "media") return 2;
  if (level === "normal") return 1;
  return 0;
}

function motive(hits: ZoneHit[]): string | null {
  const red = hits.find((hit) => hit.seguridad === "rojo");
  const slope = hits
    .filter((hit) => hit.pendiente === "alta" || hit.pendiente === "muy_alta")
    .sort((a, b) => rankSlope(b.pendiente) - rankSlope(a.pendiente))[0];
  if (red && slope) {
    const grade = slope.pendiente === "muy_alta" ? "muy alta" : "alta";
    if (red.nombre === slope.nombre) return `Zona roja y pendiente ${grade}: ${red.nombre}`;
    return `Zona roja: ${red.nombre} y pendiente ${grade}: ${slope.nombre}`;
  }
  if (red) return `Zona roja: ${red.nombre}`;
  if (slope) {
    const grade = slope.pendiente === "muy_alta" ? "muy alta" : "alta";
    return `Pendiente ${grade}: ${slope.nombre}`;
  }
  return null;
}

export function decideAgainstZones(item: Evaluation, hits: ZoneHit[]): Evaluation {
  if (hits.length === 0) return item;
  const safety = hits.some((hit) => hit.seguridad === "rojo")
    ? "rojo"
    : hits.some((hit) => hit.seguridad === "amarillo")
      ? "amarillo"
      : item.safety;
  const incline = hits.reduce<InclineLevel | null>((worst, hit) => {
    return rankSlope(hit.pendiente) > rankSlope(worst) ? hit.pendiente : worst;
  }, item.incline);
  const reason = motive(hits);
  const blocks = safety === "rojo" || incline === "alta" || incline === "muy_alta";
  return {
    ...item,
    safety,
    incline,
    decision: blocks ? "no" : item.decision,
    partial: blocks ? false : item.partial,
    reasons: reason && !item.reasons.includes(reason) ? [...item.reasons, reason] : item.reasons,
  };
}
