import { evaluate } from "./decide.ts";
import { classify, parseScreen } from "./parse.ts";
import { thresholds, type Thresholds } from "./thresholds.ts";
import type { Analysis } from "./types.ts";

export interface RouteLookup {
  tripKm(origin: string, destination: string): Promise<number | null>;
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
): Promise<Analysis> {
  if (!lookup) return result;
  for (const item of result.offers) {
    const offer = item.offer;
    if (offer.tripKm != null || offer.stopsWithoutAddress > 0) continue;
    if (!offer.origin || !offer.destination) continue;
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
  return {
    screen: result.screen,
    offers: result.offers.map((item) => evaluate(item.offer, config)),
  };
}

export { classify, parseScreen };
export { thresholds };
export type { Analysis, Evaluation, Offer, ScreenKind } from "./types.ts";
