import type { RouteLookup } from "./analyze.ts";
import { googleRouteLookup } from "./google-routes.ts";
import { mapboxRouteLookup } from "./mapbox.ts";
import { openRouteServiceLookup } from "./openrouteservice.ts";

export function routeLookupFromEnv(
  env: NodeJS.ProcessEnv,
  fetchImpl: typeof fetch = fetch,
): RouteLookup | undefined {
  const mapboxToken = env.MAPBOX_ACCESS_TOKEN;
  if (mapboxToken) return mapboxRouteLookup(mapboxToken, fetchImpl);
  const openRouteKey = env.OPENROUTESERVICE_API_KEY;
  if (openRouteKey) return openRouteServiceLookup(openRouteKey, fetchImpl);
  const googleKey = env.GOOGLE_MAPS_API_KEY;
  if (googleKey) return googleRouteLookup(googleKey, fetchImpl);
  return undefined;
}
