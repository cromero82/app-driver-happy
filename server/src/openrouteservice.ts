import type { RouteLookup } from "./analyze.ts";
import { addressInColombia } from "./google-routes.ts";

const GEOCODE = "https://api.heigit.org/pelias/v1/search";
const DIRECTIONS = "https://api.heigit.org/openrouteservice/v2/directions/driving-car";

interface LatLng {
  lat: number;
  lng: number;
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
  url.searchParams.set("text", addressInColombia(address));
  url.searchParams.set("boundary.country", "COL");
  url.searchParams.set("size", "1");
  url.searchParams.set("focus.point.lat", "6.2442");
  url.searchParams.set("focus.point.lon", "-75.5812");
  const response = await fetchImpl(url, { headers: { authorization: apiKey } });
  if (!response.ok) return null;
  const body = (await response.json()) as {
    features?: { geometry?: { coordinates?: [number, number] }; properties?: { layer?: string } }[];
  };
  const coarse = new Set(["region", "country", "county", "macroregion", "macrocounty", "dependency"]);
  const feature = body.features?.find((item) => !coarse.has(item.properties?.layer ?? ""));
  const coordinates = feature?.geometry?.coordinates;
  if (!coordinates) return null;
  return { lng: coordinates[0], lat: coordinates[1] };
}

export function openRouteServiceLookup(apiKey: string, fetchImpl: typeof fetch = fetch): RouteLookup {
  return {
    async tripKm(origin, destination) {
      const from = await geocode(origin, apiKey, fetchImpl);
      const to = await geocode(destination, apiKey, fetchImpl);
      if (!from || !to) return null;
      const response = await fetchImpl(DIRECTIONS, {
        method: "POST",
        headers: {
          authorization: apiKey,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          coordinates: [
            [from.lng, from.lat],
            [to.lng, to.lat],
          ],
        }),
      });
      if (!response.ok) return null;
      const body = (await response.json()) as { routes?: { summary?: { distance?: number } }[] };
      const meters = body.routes?.[0]?.summary?.distance;
      if (meters == null) return null;
      return kmFromMeters(meters);
    },
  };
}
