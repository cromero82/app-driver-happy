import type { RouteLookup } from "./analyze.ts";

const GEOCODE = "https://maps.googleapis.com/maps/api/geocode/json";
const COMPUTE_ROUTES = "https://routes.googleapis.com/directions/v2:computeRoutes";

interface LatLng {
  lat: number;
  lng: number;
}

const STREET = /calle|cl\.|cra\.?|carrera|av\.?|avenida|dg\.?|diagonal|transversal|circular/i;

const CITIES = [
  { fold: "la estrella", name: "La Estrella", proximity: "-75.6434,6.1577" },
  { fold: "medellin", name: "Medellín", proximity: "-75.5812,6.2442" },
  { fold: "sabaneta", name: "Sabaneta", proximity: "-75.6165,6.1512" },
  { fold: "envigado", name: "Envigado", proximity: "-75.5917,6.1699" },
  { fold: "itagui", name: "Itagüí", proximity: "-75.5991,6.1716" },
  { fold: "bello", name: "Bello", proximity: "-75.5559,6.3373" },
  { fold: "caldas", name: "Caldas", proximity: "-75.6356,6.0911" },
  { fold: "copacabana", name: "Copacabana", proximity: "-75.5086,6.3463" },
] as const;

export interface GeocodeAttempt {
  query: string;
  city: string | null;
  proximity: string;
  streetNumber: string | null;
  plate: string | null;
  neighborhood: string | null;
  mustInclude?: string[];
}

export function foldPlace(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

export function firstStreetNumber(value: string): string | null {
  const match = value.match(/(\d+)([a-zA-Z]*)/);
  if (!match) return null;
  return `${match[1]}${match[2] ?? ""}`.toLowerCase();
}

export function streetPlate(value: string): string | null {
  const match = value.match(/(\d+[a-zA-Z]*)\s*#\s*(\d+[a-zA-Z]*)\s*-\s*(\d+)/);
  if (!match) return null;
  return `${match[2].toLowerCase()}-${match[3]}`;
}

export function geocodeAttempts(address: string): GeocodeAttempt[] {
  const source = address.replace(/,?\s*entrada desde\b[^()]*/gi, " ").replace(/\s+/g, " ").trim();
  const groups = [...source.matchAll(/\(([^)]+)\)/g)].map((match) => match[1]);
  const outside = source
    .replace(/\s*\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^,|,$/g, "");
  const tokens = [...groups.flatMap((group) => group.split(",")), ...outside.split(",")]
    .map((token) => token.trim())
    .filter(Boolean);
  const city =
    CITIES.find((item) => tokens.some((token) => foldPlace(token) === item.fold)) ??
    CITIES.find((item) => foldPlace(source).includes(item.fold)) ??
    null;
  const outsideIsStreet = STREET.test(outside);
  const street = outsideIsStreet
    ? outside.replace(/,?\s*interior\s+\d+.*/i, "").trim()
    : (tokens.find((token) => STREET.test(token)) ?? null);
  const poi = !outsideIsStreet && outside
    ? outside
        .replace(new RegExp(city?.name ?? "$^", "i"), "")
        .replace(/[, ]+/g, " ")
        .trim()
    : null;
  const neighborhood =
    tokens.find((token) => {
      const folded = foldPlace(token);
      if (STREET.test(token) || folded === "antioquia") return false;
      if (city && folded === city.fold) return false;
      return true;
    }) ?? null;
  const attempts: GeocodeAttempt[] = [];
  const push = (parts: (string | null | undefined)[]) => {
    const body = parts.filter(Boolean).join(", ");
    if (!body) return;
    const query = /colombia/i.test(body) ? body : `${body}, Antioquia, Colombia`;
    if (attempts.some((item) => item.query === query)) return;
    attempts.push({
      query,
      city: city?.name ?? null,
      proximity: city?.proximity ?? "-75.5812,6.2442",
      streetNumber: street ? firstStreetNumber(street) : null,
      plate: street ? streetPlate(street) : null,
      neighborhood,
    });
  };
  const crossing = source.match(
    /\b(calle|cl\.?|cra\.?|carrera|av\.?|avenida|dg\.?|diagonal|transversal|circular)\s+(\d+[a-z]*)\s+con\s+(calle|cl\.?|cra\.?|carrera|av\.?|avenida|dg\.?|diagonal|transversal|circular)\s+(\d+[a-z]*)/i,
  );
  if (crossing) {
    const body = [`${crossing[1]} ${crossing[2]} y ${crossing[3]} ${crossing[4]}`, city?.name, "Antioquia"]
      .filter(Boolean)
      .join(", ");
    attempts.push({
      query: body,
      city: city?.name ?? null,
      proximity: city?.proximity ?? "-75.5812,6.2442",
      streetNumber: null,
      plate: null,
      neighborhood: null,
      mustInclude: [crossing[2].toLowerCase(), crossing[4].toLowerCase()],
    });
    return attempts;
  }
  if (street && city) push([street, city.name]);
  const extraNeighborhood =
    neighborhood && poi && !foldPlace(poi).includes(foldPlace(neighborhood)) ? neighborhood : null;
  if (poi && city) push([poi, extraNeighborhood, city.name]);
  if (neighborhood && city) push([neighborhood, city.name]);
  if (street && neighborhood && city) push([street, neighborhood, city.name]);
  if (attempts.length === 0) push([source]);
  return attempts;
}

export function geocodeQuery(address: string): string {
  const query = geocodeAttempts(address)[0]?.query ?? address;
  return query.replace(/, Colombia$/i, "");
}

export function addressInColombia(address: string): string {
  if (/colombia/i.test(address)) return address;
  const text = geocodeQuery(address);
  if (/colombia/i.test(text)) return text;
  if (/antioquia/i.test(text)) return `${text}, Colombia`;
  return `${text}, Antioquia, Colombia`;
}

function kmFromMeters(meters: number): number {
  return Math.round(meters / 100) / 10;
}

async function geocode(
  address: string,
  apiKey: string,
  fetchImpl: typeof fetch,
): Promise<LatLng | null> {
  const url = new URL(GEOCODE);
  url.searchParams.set("address", addressInColombia(address));
  url.searchParams.set("region", "co");
  url.searchParams.set("components", "country:CO");
  url.searchParams.set("key", apiKey);
  const response = await fetchImpl(url);
  if (!response.ok) return null;
  const body = (await response.json()) as {
    status?: string;
    results?: { geometry?: { location?: LatLng } }[];
  };
  const location = body.results?.[0]?.geometry?.location;
  if (body.status !== "OK" || location == null) return null;
  return location;
}

export function googleRouteLookup(apiKey: string, fetchImpl: typeof fetch = fetch): RouteLookup {
  return {
    async tripKm(origin, destination) {
      const from = await geocode(origin, apiKey, fetchImpl);
      const to = await geocode(destination, apiKey, fetchImpl);
      if (!from || !to) return null;
      const response = await fetchImpl(COMPUTE_ROUTES, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": "routes.distanceMeters",
        },
        body: JSON.stringify({
          origin: { location: { latLng: { latitude: from.lat, longitude: from.lng } } },
          destination: { location: { latLng: { latitude: to.lat, longitude: to.lng } } },
          travelMode: "DRIVE",
          routingPreference: "TRAFFIC_UNAWARE",
          regionCode: "CO",
          languageCode: "es",
        }),
      });
      if (!response.ok) return null;
      const body = (await response.json()) as { routes?: { distanceMeters?: number }[] };
      const meters = body.routes?.[0]?.distanceMeters;
      if (meters == null) return null;
      return kmFromMeters(meters);
    },
  };
}
