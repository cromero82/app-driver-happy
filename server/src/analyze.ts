import { evaluate } from "./decide.ts";
import { classify, parseScreen } from "./parse.ts";
import { thresholds, type Thresholds } from "./thresholds.ts";
import type { Analysis, Offer } from "./types.ts";
import {
  decideAgainstZones,
  loadOperationalZones,
  zonesOnRoute,
  type LineGeometry,
  type ZoneFeature,
} from "./zones.ts";

export interface TripRoute {
  km: number;
  line: LineGeometry;
}

export interface RouteLookup {
  tripKm(origin: string, destination: string): Promise<number | null>;
  tripRoute?(origin: string, destination: string): Promise<TripRoute | null>;
}

export function analyze(text: string, config: Thresholds = thresholds): Analysis {
  const screen = classify(text);
  const offers = parseScreen(text, screen).map((offer) => evaluate(offer, config));
  return { screen, offers };
}

export async function completeTrips(
  result: Analysis,
  lookup?: RouteLookup,
  config: Thresholds = thresholds,
  zones: ZoneFeature[] = loadOperationalZones(),
): Promise<Analysis> {
  const lines = new Map<Offer, LineGeometry>();
  if (lookup) {
    const useLine = zones.length > 0 && lookup.tripRoute != null;
    for (const item of result.offers) {
      const offer = item.offer;
      if (!offer.origin || !offer.destination) continue;
      if (useLine) {
        try {
          const routed = await lookup.tripRoute!(offer.origin, offer.destination);
          if (!routed) continue;
          lines.set(offer, routed.line);
          if (offer.tripKm == null && offer.stopsWithoutAddress === 0) {
            offer.tripKm = routed.km;
            offer.tripKmFromRoute = true;
            if (offer.pickupKm != null) offer.distanceComplete = true;
          }
        } catch {
          continue;
        }
        continue;
      }
      if (offer.tripKm != null || offer.stopsWithoutAddress > 0) continue;
      let km: number | null = null;
      try {
        km = await lookup.tripKm(offer.origin, offer.destination);
      } catch {
        km = null;
      }
      if (km == null) continue;
      offer.tripKm = km;
      offer.tripKmFromRoute = true;
      if (offer.pickupKm != null) offer.distanceComplete = true;
    }
  }
  return {
    screen: result.screen,
    offers: result.offers.map((item) => {
      const priced = evaluate(item.offer, config);
      const line = lines.get(item.offer);
      if (!line) return priced;
      return decideAgainstZones(priced, zonesOnRoute(line, zones));
    }),
  };
}

export { classify, parseScreen };
export { thresholds };
export type { Analysis, Evaluation, Offer, ScreenKind } from "./types.ts";
