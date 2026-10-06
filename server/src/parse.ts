import { isStandalonePrice, parseCop, parseKm } from "./money.ts";
import type { AppName, Offer, ScreenKind } from "./types.ts";

const LEG =
  /^(?:A\s+|Viaje:\s*)?\(?\s*(\d+)\s*min\s*\(?\s*(\d+(?:[.,]\d+)?)\s*km\)?\s*(.*)$/i;

interface Leg {
  min: number;
  km: number;
  address: string;
}

function linesOf(text: string): string[] {
  return text
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function matchLeg(line: string): Leg | null {
  const match = line.match(LEG);
  if (!match) return null;
  const km = parseKm(match[2]);
  if (km == null) return null;
  return { min: Number(match[1]), km, address: match[3].trim() };
}

export function classify(text: string): ScreenKind {
  if (/aceptar contrato de renta/i.test(text) || /cop\/km est/i.test(text)) {
    return "uber_sheet";
  }
  if (/centro de solicitudes/i.test(text)) return "didi_list";
  if (/pon tu precio/i.test(text)) return "didi_modal";
  if (/COL\$/i.test(text) && /precio justo/i.test(text)) return "indrive_list";
  return "unknown";
}

export function parseScreen(text: string, screen: ScreenKind): Offer[] {
  switch (screen) {
    case "uber_sheet":
      return parseUber(text);
    case "didi_list":
      return parseDidi(text, "list");
    case "didi_modal":
      return parseDidi(text, "modal");
    case "indrive_list":
      return parseInDrive(text);
    default:
      return [];
  }
}

function emptyOffer(app: AppName, priceCop: number): Offer {
  return {
    app,
    priceCop,
    pickupKm: null,
    tripKm: null,
    tripKmFromRoute: false,
    pickupMin: null,
    tripMin: null,
    origin: null,
    destination: null,
    surge: null,
    stopsWithoutAddress: 0,
    distanceComplete: false,
    offerAge: null,
    counterOffersCop: [],
    passengerName: null,
  };
}

function parseUber(text: string): Offer[] {
  const priceMatch = text.match(/(\d{1,3}(?:[.,]\d{3})+)\s*COP(?!\/)/i);
  if (!priceMatch) return [];
  const priceCop = parseCop(priceMatch[1]);
  if (priceCop == null) return [];

  const lines = linesOf(text);
  const pickupAt = lines.findIndex((line) => /^A\s+\d+\s*min/i.test(line));
  const tripAt = lines.findIndex((line) => /^Viaje:/i.test(line));
  const pickup = pickupAt >= 0 ? matchLeg(lines[pickupAt]) : null;
  const trip = tripAt >= 0 ? matchLeg(lines[tripAt]) : null;
  const origin = addressAfter(lines, pickupAt, pickup);
  const destination = addressAfter(lines, tripAt, trip);
  const offer = emptyOffer("uber", priceCop);
  offer.pickupKm = pickup?.km ?? null;
  offer.tripKm = trip?.km ?? null;
  offer.pickupMin = pickup?.min ?? null;
  offer.tripMin = trip?.min ?? null;
  offer.origin = origin;
  offer.destination = destination;
  offer.distanceComplete =
    offer.pickupKm != null &&
    offer.tripKm != null &&
    origin != null &&
    destination != null;
  return [offer];
}

function addressAfter(lines: string[], index: number, leg: Leg | null): string | null {
  if (index < 0 || !leg) return null;
  if (leg.address) return leg.address;
  const next = lines[index + 1];
  if (!next || matchLeg(next)) return null;
  return next;
}

function parseDidi(text: string, mode: "list" | "modal"): Offer[] {
  let body = text;
  if (mode === "modal") {
    const start = text.search(/pon tu precio/i);
    if (start >= 0) body = text.slice(start);
  }
  const cards = splitDidiCards(linesOf(body));
  return cards
    .map(parseDidiCard)
    .filter((offer): offer is Offer => offer != null);
}

function isDidiChrome(line: string): boolean {
  return (
    /^\d{1,2}:\d{2}$/.test(line) ||
    /^(centro de solicitudes|elige una renta|km al encuentro|rechazo permitido)$/i.test(line) ||
    /^no hay más solicitudes$/i.test(line) ||
    /^no hay mas solicitudes$/i.test(line)
  );
}

function splitDidiCards(lines: string[]): string[][] {
  const cards: string[][] = [];
  let current: string[] = [];
  let afterAccept = false;

  const push = () => {
    if (current.length > 0) cards.push(current);
    current = [];
  };

  for (const line of lines) {
    if (isDidiChrome(line)) continue;
    if (/^aceptar\b/i.test(line)) {
      afterAccept = true;
      continue;
    }
    if (afterAccept) {
      if (isStandalonePrice(line)) {
        current.push(`COUNTER:${line}`);
        continue;
      }
      push();
      afterAccept = false;
    }
    current.push(line);
  }
  push();
  return cards;
}

function isSurgeLine(line: string): boolean {
  return /^(?:x\s*\d+(?:[.,]\d+)?|\d+(?:[.,]\d+)?\s*x)$/i.test(line);
}

function isStopLine(line: string): boolean {
  return /^\d+\s*parada\(s\)$/i.test(line);
}

function isNoise(line: string): boolean {
  return (
    isSurgeLine(line) ||
    isStopLine(line) ||
    isStandalonePrice(line) ||
    /^(pon tu precio|al precio de express|express nuevo|nuevo|efectivo|nequi|bancolombia|viaje\+)$/i.test(
      line,
    ) ||
    /pon tu precio/i.test(line) ||
    /tarifa de servicio/i.test(line) ||
    /arrendamientos/i.test(line) ||
    /tarjeta bancaria/i.test(line) ||
    /^\d+[.,]\d+$/.test(line) ||
    /^\+?\d+$/.test(line) ||
    /^\d+\s*puntos$/i.test(line)
  );
}

function parseSurge(text: string): number | null {
  const prefixed = text.match(/(?:^|\s)x\s*(\d+(?:[.,]\d+)?)(?!\s*km)/im);
  if (prefixed) return Number(prefixed[1].replace(",", "."));
  const suffixed = text.match(/(?:^|\s)(\d+(?:[.,]\d+)?)\s*x\b/im);
  if (suffixed) return Number(suffixed[1].replace(",", "."));
  return null;
}

function parseStops(lines: string[]): number {
  for (const line of lines) {
    const match = line.match(/^(\d+)\s*parada\(s\)$/i);
    if (match) return Number(match[1]);
  }
  return 0;
}

function collectLegs(lines: string[]): Leg[] {
  const legs: Leg[] = [];
  for (let i = 0; i < lines.length; i++) {
    const leg = matchLeg(lines[i]);
    if (!leg) continue;
    let address = leg.address;
    if (!address) {
      const next = lines[i + 1];
      if (next && !matchLeg(next) && !isNoise(next)) {
        address = next;
        i++;
      }
    }
    while (lines[i + 1] && isAddressWrap(lines[i + 1])) {
      address = `${address} ${lines[i + 1]}`.trim();
      i++;
    }
    legs.push({ ...leg, address });
  }
  return legs;
}

function isAddressWrap(line: string): boolean {
  if (matchLeg(line) || isNoise(line)) return false;
  return /[A-Za-zÁÉÍÓÚáéíóúñÑ]/.test(line);
}

function parseDidiCard(rawLines: string[]): Offer | null {
  const counterOffersCop: number[] = [];
  const lines: string[] = [];
  for (const line of rawLines) {
    if (line.startsWith("COUNTER:")) {
      const value = parseCop(line.slice("COUNTER:".length));
      if (value != null) counterOffersCop.push(value);
    } else {
      lines.push(line);
    }
  }
  const priceLine = lines.find(isStandalonePrice);
  if (!priceLine) return null;
  const priceCop = parseCop(priceLine);
  if (priceCop == null) return null;

  const legs = collectLegs(lines);
  const pickup = legs[0];
  const trip = legs[1];
  const stopsWithoutAddress = parseStops(lines);
  const offer = emptyOffer("didi", priceCop);
  offer.pickupKm = pickup?.km ?? null;
  offer.tripKm = trip?.km ?? null;
  offer.pickupMin = pickup?.min ?? null;
  offer.tripMin = trip?.min ?? null;
  offer.origin = pickup?.address || null;
  offer.destination = trip?.address || null;
  offer.surge = parseSurge(lines.join("\n"));
  offer.stopsWithoutAddress = stopsWithoutAddress;
  offer.counterOffersCop = counterOffersCop;
  offer.distanceComplete =
    stopsWithoutAddress === 0 &&
    offer.pickupKm != null &&
    offer.tripKm != null &&
    Boolean(offer.origin) &&
    Boolean(offer.destination);
  return offer;
}

function isInDriveChrome(line: string): boolean {
  return (
    /^\d{1,2}:\d{2}$/.test(line) ||
    /^(ocupado|libre|establecer tarifas|uber|solicitudes de viaje|demanda|desempeño|cartera)$/i.test(
      line,
    ) ||
    /activa otras tarifas/i.test(line)
  );
}

function isInDriveAddress(line: string): boolean {
  return /#|calle|cra\.?|carrera|av\.?|avenida|dg\.?|diagonal|cl\.|urbanizaci|instituci|edificio|terminal|mirador|apartamento|comuna/i.test(
    line,
  );
}

function isPersonName(line: string): boolean {
  return (
    /^[A-Za-zÁÉÍÓÚáéíóúñÑ][A-Za-zÁÉÍÓÚáéíóúñÑ .']{1,40}$/.test(line) &&
    !isInDriveAddress(line)
  );
}

function isOfferAge(line: string): boolean {
  return /^\d+\s*(?:seg\.?|min\.?)$/i.test(line);
}

function parseInDrive(text: string): Offer[] {
  const lines = linesOf(text).filter((line) => !isInDriveChrome(line));
  const cards: string[][] = [];
  let current: string[] | null = null;
  for (const line of lines) {
    if (/^~\s*\d/.test(line)) {
      if (current) cards.push(current);
      current = [line];
    } else if (current) {
      current.push(line);
    }
  }
  if (current) cards.push(current);
  return cards
    .map(finishInDrive)
    .filter((offer): offer is Offer => offer != null);
}

function finishInDrive(lines: string[]): Offer | null {
  const pickupMatch = lines[0]?.match(/^~\s*(\d+(?:[.,]\d+)?)\s*km/i);
  const pickupKm = pickupMatch ? parseKm(pickupMatch[1]) : null;
  const priceLine = lines.find((line) => /COL\$/i.test(line));
  const priceCop = priceLine ? parseCop(priceLine) : null;
  if (pickupKm == null || priceCop == null) return null;

  const addresses: string[] = [];
  let passengerName: string | null = null;
  let offerAge: string | null = null;
  for (const line of lines.slice(1)) {
    if (/COL\$/i.test(line) || /^precio justo$/i.test(line)) continue;
    if (/^(nequi|bancolombia|viaje\+)$/i.test(line)) continue;
    if (/^\d+[.,]\d+$/.test(line) || /^\(\d+\)$/.test(line)) continue;
    if (isOfferAge(line)) {
      offerAge = line.replace(/\.$/, "");
      continue;
    }
    if (isInDriveAddress(line)) {
      addresses.push(line);
      continue;
    }
    if (!passengerName && isPersonName(line)) passengerName = line;
  }

  const offer = emptyOffer("indrive", priceCop);
  offer.pickupKm = pickupKm;
  offer.origin = addresses[0] ?? null;
  offer.destination = addresses[1] ?? null;
  offer.offerAge = offerAge;
  offer.passengerName = passengerName;
  offer.distanceComplete = false;
  return offer;
}
