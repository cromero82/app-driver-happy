import { thresholds, type Thresholds } from "./thresholds.ts";
import type { Evaluation, Offer } from "./types.ts";

function roundKm(pickupKm: number, tripKm: number): number {
  return Math.round((pickupKm + tripKm) * 10) / 10;
}

export function evaluate(offer: Offer, config: Thresholds = thresholds): Evaluation {
  const reasons: string[] = [];
  if (offer.pickupKm == null) reasons.push("Falta la distancia de recogida");
  if (offer.tripKm == null) reasons.push("Falta la distancia del viaje");
  if (offer.stopsWithoutAddress > 0) reasons.push("Hay paradas sin dirección");

  if (reasons.length > 0 || !offer.distanceComplete) {
    if (reasons.length === 0) reasons.push("Distancia incompleta");
    return {
      offer,
      pricePerKm: null,
      priceLabel: null,
      decision: "parcial",
      partial: true,
      reasons,
    };
  }

  const pricePerKm = Math.round(offer.priceCop / roundKm(offer.pickupKm!, offer.tripKm!));
  if (pricePerKm < config.negociarBelowCopPerKm) {
    return {
      offer,
      pricePerKm,
      priceLabel: "oferta",
      decision: "negociar",
      partial: false,
      reasons: ["Precio por km bajo"],
    };
  }
  if (pricePerKm >= config.optimoMinCopPerKm) {
    return {
      offer,
      pricePerKm,
      priceLabel: "optimo",
      decision: "aceptar",
      partial: false,
      reasons: [],
    };
  }
  return {
    offer,
    pricePerKm,
    priceLabel: "justo",
    decision: "aceptar",
    partial: false,
    reasons: [],
  };
}
