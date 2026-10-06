export type ScreenKind =
  | "uber_sheet"
  | "indrive_list"
  | "didi_list"
  | "didi_modal"
  | "unknown";

export type AppName = "uber" | "indrive" | "didi";

export type PriceLabel = "oferta" | "justo" | "optimo";

export type Decision = "aceptar" | "no" | "negociar" | "parcial";

export interface Offer {
  app: AppName;
  priceCop: number;
  pickupKm: number | null;
  tripKm: number | null;
  tripKmFromRoute: boolean;
  pickupMin: number | null;
  tripMin: number | null;
  origin: string | null;
  destination: string | null;
  surge: number | null;
  stopsWithoutAddress: number;
  distanceComplete: boolean;
  offerAge: string | null;
  counterOffersCop: number[];
  passengerName: string | null;
}

export interface Evaluation {
  offer: Offer;
  pricePerKm: number | null;
  priceLabel: PriceLabel | null;
  decision: Decision;
  partial: boolean;
  reasons: string[];
}

export interface Analysis {
  screen: ScreenKind;
  offers: Evaluation[];
}
