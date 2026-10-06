import type { RouteLookup, TripRoute } from "./analyze.ts";
import {
  firstStreetNumber,
  foldPlace,
  geocodeAttempts,
  type GeocodeAttempt,
} from "./google-routes.ts";

interface LatLng {
  lat: number;
  lng: number;
}

interface MapboxFeature {
  center?: [number, number];
  place_name?: string;
  relevance?: number;
  place_type?: string[];
}

function kmFromMeters(meters: number): number {
  return Math.round(meters / 100) / 10;
}

function compact(value: string): string {
  return foldPlace(value).replace(/[\s.]/g, "");
}

function sameStreetNumber(wanted: string, got: string): boolean {
  const wantedDigits = wanted.match(/\d+/)?.[0];
  const gotDigits = got.match(/\d+/)?.[0];
  if (!wantedDigits || wantedDigits !== gotDigits) return false;
  const wantedLetters = wanted.replace(/\d+/g, "");
  const gotLetters = got.replace(/\d+/g, "");
  return !wantedLetters || !gotLetters || wantedLetters === gotLetters;
}

function acceptable(feature: MapboxFeature, attempt: GeocodeAttempt): boolean {
  if (!feature.center) return false;
  const name = feature.place_name ?? "";
  if (attempt.city && !foldPlace(name).includes(foldPlace(attempt.city))) return false;
  const types = feature.place_type ?? [];
  if (types.some((type) => type === "place" || type === "region" || type === "country")) return false;
  if (attempt.mustInclude?.length) {
    const folded = foldPlace(name);
    return attempt.mustInclude.every((token) => new RegExp(`(?<!\\d)${token}(?!\\d)`, "i").test(folded));
  }
  if (attempt.plate) return compact(name).includes(compact(attempt.plate));
  if (attempt.streetNumber) {
    const got = firstStreetNumber(name);
    if (got && !sameStreetNumber(attempt.streetNumber, got)) return false;
  }
  return true;
}

function fallbackAttempt(address: string): GeocodeAttempt | null {
  const attempts = geocodeAttempts(address);
  return (
    [...attempts].reverse().find((item) => item.neighborhood && item.streetNumber) ??
    attempts[0] ??
    null
  );
}

async function nominatimGeocode(
  address: string,
  fetchImpl: typeof fetch,
): Promise<LatLng | null> {
  const attempt = fallbackAttempt(address);
  if (!attempt) return null;
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", attempt.query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "5");
  url.searchParams.set("countrycodes", "co");
  const response = await fetchImpl(url, { headers: { "User-Agent": "app-driver-happy/local" } });
  if (!response.ok) return null;
  const parsed = (await response.json()) as
    | {
        lat?: string;
        lon?: string;
        display_name?: string;
        importance?: number;
        type?: string;
      }[]
    | { features?: unknown };
  const body = Array.isArray(parsed) ? parsed : [];
  const coarse = new Set(["country", "state", "city", "town", "administrative", "county"]);
  const hits: { score: number; point: LatLng }[] = [];
  for (const hit of body) {
    if (!hit.lat || !hit.lon || coarse.has(hit.type ?? "")) continue;
    const name = hit.display_name ?? "";
    if (attempt.city && !foldPlace(name).includes(foldPlace(attempt.city))) continue;
    if (attempt.neighborhood && !foldPlace(name).includes(foldPlace(attempt.neighborhood))) continue;
    if (attempt.streetNumber) {
      const got = firstStreetNumber(name);
      if (got && !sameStreetNumber(attempt.streetNumber, got)) continue;
    }
    hits.push({
      score: hit.importance ?? 0,
      point: { lng: Number(hit.lon), lat: Number(hit.lat) },
    });
  }
  if (hits.length === 0) return null;
  const top = Math.max(...hits.map((hit) => hit.score));
  const tied = hits.filter((hit) => hit.score === top);
  const middle = medianPoint(tied.map((hit) => hit.point));
  return tied.reduce((closest, hit) =>
    distance2(hit.point, middle) < distance2(closest, middle) ? hit.point : closest,
  tied[0].point);
}

function medianPoint(points: LatLng[]): LatLng {
  const mid = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[index - 1] + sorted[index]) / 2 : sorted[index];
  };
  return { lat: mid(points.map((point) => point.lat)), lng: mid(points.map((point) => point.lng)) };
}

function distance2(a: LatLng, b: LatLng): number {
  return (a.lat - b.lat) ** 2 + (a.lng - b.lng) ** 2;
}

async function geocode(
  address: string,
  token: string,
  fetchImpl: typeof fetch,
): Promise<LatLng | null> {
  let best: { score: number; point: LatLng } | null = null;
  for (const attempt of geocodeAttempts(address)) {
    const url = new URL(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(attempt.query)}.json`,
    );
    url.searchParams.set("access_token", token);
    url.searchParams.set("country", "co");
    url.searchParams.set("language", "es");
    url.searchParams.set("limit", "3");
    url.searchParams.set("proximity", attempt.proximity);
    const response = await fetchImpl(url);
    if (!response.ok) continue;
    const body = (await response.json()) as { features?: MapboxFeature[] };
    for (const feature of body.features ?? []) {
      if (!acceptable(feature, attempt) || !feature.center) continue;
      const score = (feature.relevance ?? 0) + (feature.place_type?.includes("address") ? 0.2 : 0);
      if (!best || score > best.score) {
        best = { score, point: { lng: feature.center[0], lat: feature.center[1] } };
      }
    }
    if (best && best.score >= 1.1) break;
  }
  return best?.point ?? (await suffixGeocode(address, token, fetchImpl)) ?? (await nominatimGeocode(address, fetchImpl));
}

function letterSuffix(streetNumber: string | null): { digits: number; letters: string } | null {
  const match = streetNumber?.match(/^(\d+)([a-z]+)$/);
  if (!match?.[2]) return null;
  return { digits: Number(match[1]), letters: match[2] };
}

function featureHasSuffix(name: string, digits: number, letters: string): boolean {
  for (const match of name.matchAll(/(\d+)\s*([a-zA-Z]+)/g)) {
    if (match[2].toLowerCase() !== letters) continue;
    if (Math.abs(Number(match[1]) - digits) <= 1) return true;
  }
  return false;
}

async function neighborhoodPoint(
  attempt: GeocodeAttempt,
  fetchImpl: typeof fetch,
): Promise<LatLng | null> {
  if (!attempt.neighborhood) return null;
  const [lng, lat] = attempt.proximity.split(",").map(Number);
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set(
    "q",
    [attempt.neighborhood, attempt.city, "Antioquia", "Colombia"].filter(Boolean).join(", "),
  );
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "3");
  url.searchParams.set("countrycodes", "co");
  url.searchParams.set("viewbox", `${lng - 0.15},${lat + 0.15},${lng + 0.15},${lat - 0.15}`);
  url.searchParams.set("bounded", "1");
  const response = await fetchImpl(url, { headers: { "User-Agent": "app-driver-happy/local" } });
  if (!response.ok) return null;
  const parsed = (await response.json()) as { lat?: string; lon?: string; type?: string; display_name?: string }[] | unknown;
  const hits = Array.isArray(parsed) ? parsed : [];
  const local = new Set(["neighbourhood", "neighborhood", "suburb", "quarter"]);
  const hit = hits.find((item) => {
    const name = item.display_name ?? "";
    if (!local.has(item.type ?? "")) return false;
    if (!foldPlace(name).includes(foldPlace(attempt.neighborhood ?? ""))) return false;
    return !attempt.city || foldPlace(name).includes(foldPlace(attempt.city));
  });
  if (!hit?.lat || !hit.lon) return null;
  return { lat: Number(hit.lat), lng: Number(hit.lon) };
}

async function suffixGeocode(
  address: string,
  token: string,
  fetchImpl: typeof fetch,
): Promise<LatLng | null> {
  const attempt = geocodeAttempts(address).find(
    (item) => letterSuffix(item.streetNumber) && item.neighborhood,
  );
  const suffix = letterSuffix(attempt?.streetNumber ?? null);
  if (!attempt || !suffix) return null;
  const anchor = await neighborhoodPoint(attempt, fetchImpl);
  if (!anchor) return null;
  const url = new URL(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${suffix.digits}${suffix.letters.toUpperCase()}.json`,
  );
  url.searchParams.set("access_token", token);
  url.searchParams.set("country", "co");
  url.searchParams.set("language", "es");
  url.searchParams.set("limit", "5");
  url.searchParams.set("proximity", `${anchor.lng},${anchor.lat}`);
  url.searchParams.set(
    "bbox",
    `${anchor.lng - 0.025},${anchor.lat - 0.025},${anchor.lng + 0.025},${anchor.lat + 0.025}`,
  );
  const response = await fetchImpl(url);
  if (!response.ok) return null;
  const body = (await response.json()) as { features?: MapboxFeature[] };
  const feature = (body.features ?? []).find((item) => {
    const name = item.place_name ?? "";
    if (!item.center || !featureHasSuffix(name, suffix.digits, suffix.letters)) return false;
    return !attempt.city || foldPlace(name).includes(foldPlace(attempt.city));
  });
  if (!feature?.center) return null;
  return { lng: feature.center[0], lat: feature.center[1] };
}

async function driving(
  from: LatLng,
  to: LatLng,
  token: string,
  fetchImpl: typeof fetch,
  geometry: boolean,
): Promise<TripRoute | null> {
  const path = `${from.lng},${from.lat};${to.lng},${to.lat}`;
  const url = new URL(`https://api.mapbox.com/directions/v5/mapbox/driving/${path}`);
  url.searchParams.set("access_token", token);
  url.searchParams.set("overview", geometry ? "full" : "false");
  if (geometry) url.searchParams.set("geometries", "geojson");
  const response = await fetchImpl(url);
  if (!response.ok) return null;
  const body = (await response.json()) as {
    routes?: { distance?: number; geometry?: { type?: string; coordinates?: [number, number][] } }[];
  };
  const route = body.routes?.[0];
  if (route?.distance == null) return null;
  const line = route.geometry;
  return {
    km: kmFromMeters(route.distance),
    line:
      line?.type === "LineString" && line.coordinates
        ? { type: "LineString", coordinates: line.coordinates }
        : { type: "LineString", coordinates: [] },
  };
}

export function mapboxRouteLookup(token: string, fetchImpl: typeof fetch = fetch): RouteLookup {
  return {
    async tripKm(origin, destination) {
      const from = await geocode(origin, token, fetchImpl);
      const to = await geocode(destination, token, fetchImpl);
      if (!from || !to) return null;
      const routed = await driving(from, to, token, fetchImpl, false);
      return routed?.km ?? null;
    },
    async tripRoute(origin, destination) {
      const from = await geocode(origin, token, fetchImpl);
      const to = await geocode(destination, token, fetchImpl);
      if (!from || !to) return null;
      const routed = await driving(from, to, token, fetchImpl, true);
      if (!routed || routed.line.coordinates.length < 2) return null;
      return routed;
    },
  };
}
