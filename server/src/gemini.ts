import { canonicalIncline, contiguousPrimeZones, decisionForIncline } from "./thresholds.ts";
import type { Analysis, AppName, Decision, DriverMode, Evaluation, InclineLevel, Offer, SafetyLevel, ScreenKind } from "./types.ts";
import type { DriverContext } from "./modes.ts";

const models = ["gemini-3.8-flash", "gemini-flash-latest"];

export class GeminiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeminiError";
  }
}

interface RawJudgment {
  indice?: number;
  usuario?: string | null;
  app?: string | null;
  precio_pantalla?: number | string | null;
  recogida_km?: number | string | null;
  origen?: string | null;
  destino?: string | null;
  recomendacion?: string;
  seguridad?: string | null;
  sector?: string | null;
  inclinacion?: string | null;
  precio_oferta?: number | string | null;
  precio_justo?: number | string | null;
  precio_extra?: number | string | null;
  viaje_km?: number | string | null;
  recogida_min?: number | string | null;
  viaje_min?: number | string | null;
  motivo?: string | null;
}

export type JudgeView = "linea" | "reducida" | "completa";

export interface CaptureImage {
  mime: string;
  data: string;
}

function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

function decisionOf(value: string | undefined): Decision {
  const text = fold(value ?? "");
  if (text === "aceptar" || text === "si") return "aceptar";
  if (text === "negociar") return "negociar";
  if (text === "no") return "no";
  return "parcial";
}

function safetyOf(value: string | null | undefined): SafetyLevel | null {
  const text = fold(value ?? "");
  if (text.includes("rojo")) return "rojo";
  if (text.includes("amarillo")) return "amarillo";
  if (text.includes("verde")) return "verde";
  return null;
}

function inclineOf(value: string | null | undefined): InclineLevel | null {
  return canonicalIncline(value);
}

function cop(value: number | string | null | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value !== "string") return null;
  const digits = value.replace(/[^\d]/g, "");
  return digits ? Number(digits) : null;
}

function modeLabel(mode: DriverMode): string {
  if (mode === "en_zona_prime") return "en zona prime";
  if (mode === "retornando") return "retornando";
  return "saliendo";
}

function rules(context: DriverContext | null): string[] {
  const mode = context?.mode ?? "saliendo";
  const zones = (context?.contiguousZones ?? contiguousPrimeZones).join(", ");
  const distant = context?.distantZones.join(", ") || "ninguna";
  const home = context?.home || "sin definir";
  return [
    `Conductor Medellín. Modo: ${modeLabel(mode)}. Casa: ${home}.`,
    `Prime: ${zones}. Alejada: ${distant}.`,
    "Campos: usuario, origen, destino, app, precio_pantalla, recogida_km, recomendacion, seguridad, sector, inclinacion, precio_oferta, precio_justo, precio_extra, motivo.",
    "recomendacion: aceptar, negociar o no.",
    "seguridad: rojo, amarillo o verde. inclinacion: muy_alta, alta, media o plana. Siempre un valor, juzgado con los barrios de origen y destino.",
    "sector es el barrio del destino, o el de mayor riesgo entre los dos.",
    "Prime y destino fuera, o salto a zona alejada: recomendacion no. Rojo o muy_alta: recomendacion no. Alta: recomendacion negociar.",
    "motivo: máximo 8 palabras.",
    "Responde solo JSON.",
  ];
}

function compactPrompt(
  offers?: { indice: number; origen: string | null; destino: string | null }[],
  readImage = !offers,
): string {
  const lines = [
    readImage
      ? "Lee la captura. Una entrada por tarjeta, en orden de lectura."
      : "Una entrada por oferta, en el orden dado.",
    readImage
      ? "Campos: origen, destino, sector (el barrio), seguridad (rojo, amarillo o verde), inclinacion (muy_alta, alta, media o plana)."
      : "Solo tres campos: sector (el barrio), seguridad (rojo, amarillo o verde), inclinacion (muy_alta, alta, media o plana).",
    readImage
      ? "origen y destino son las dos direcciones de la tarjeta, copiadas de la imagen. No reemplaces una dirección que ya trae texto."
      : "",
    "sector es el barrio del destino, o el de mayor riesgo entre origen y destino.",
    "seguridad e inclinacion son obligatorias. Juzgalas con esos barrios, como en una lectura de la captura.",
    "No compares modo ni zona. No evalúes precios.",
    "Solo JSON.",
  ].filter(Boolean);
  if (offers) lines.push(JSON.stringify({ ofertas: offers }));
  return lines.join("\n");
}

function lineaPrompt(
  offers?: { indice: number; usuario: string | null; origen: string | null; destino: string | null }[],
  readImage = !offers,
): string {
  const lines = [
    readImage
      ? "Lee la captura. Una entrada por tarjeta, en orden de lectura."
      : "Una entrada por oferta, en el orden dado.",
    readImage
      ? "Solo estos campos: usuario, recomendacion (aceptar, negociar o no), seguridad (rojo, amarillo o verde), inclinacion (muy_alta, alta, media o plana), recogida_min, recogida_km, viaje_min, viaje_km, precio_pantalla."
      : "Solo estos campos: usuario, recomendacion (aceptar, negociar o no), seguridad (rojo, amarillo o verde), inclinacion (muy_alta, alta, media o plana), precio_pantalla.",
    "seguridad e inclinacion son obligatorias.",
    "Rojo o muy_alta: recomendacion no. Alta: recomendacion negociar.",
    "Si no hay nombre de pasajero, usuario null. No lo inventes.",
    "precio_pantalla es el precio escrito en la captura. Si no está, null.",
    readImage ? "recogida_min, recogida_km, viaje_min y viaje_km solo si están escritos. Si no están, null. No los calcules." : "",
    "No motivo. No copies las direcciones.",
    "Solo JSON.",
  ].filter(Boolean);
  if (offers) lines.push(JSON.stringify({ ofertas: offers }));
  return lines.join("\n");
}

function reducidaPrompt(
  offers?: {
    indice: number;
    usuario: string | null;
    origen: string | null;
    destino: string | null;
    precio_pantalla: number | null;
    recogida_km: number | null;
  }[],
  readImage = !offers,
): string {
  const lines = [
    readImage
      ? "Lee la captura. Una entrada por tarjeta, en orden de lectura."
      : "Una entrada por oferta, en el orden dado.",
    readImage
      ? "Campos: usuario, recomendacion (aceptar, negociar o no), seguridad (rojo, amarillo o verde), sector (el barrio), inclinacion (muy_alta, alta, media o plana), recogida_km, viaje_km, precio_oferta, precio_justo, precio_extra."
      : "Campos: usuario, recomendacion (aceptar, negociar o no), seguridad (rojo, amarillo o verde), sector (el barrio), inclinacion (muy_alta, alta, media o plana), precio_oferta, precio_justo, precio_extra.",
    "sector es el barrio del destino, o el de mayor riesgo entre origen y destino.",
    "seguridad e inclinacion son obligatorias.",
    "Rojo o muy_alta: recomendacion no. Alta: recomendacion negociar.",
    "No motivo. No copies las direcciones.",
    "Solo JSON.",
  ];
  if (offers) lines.push(JSON.stringify({ ofertas: offers }));
  return lines.join("\n");
}

function offerPayload(item: Analysis["offers"][number], index: number, gaps: ("origen" | "destino")[]) {
  return {
    indice: index,
    app: item.offer.app,
    usuario: item.offer.passengerName,
    origen: item.offer.origin,
    destino: item.offer.destination,
    falta: gaps,
    precio_pantalla: item.offer.priceCop,
    recogida_km: item.offer.pickupKm,
    viaje_km: item.offer.tripKm,
    recargo: item.offer.surge,
  };
}

function gapsOf(item: Analysis["offers"][number]): ("origen" | "destino")[] {
  const gaps: ("origen" | "destino")[] = [];
  if (!item.offer.origin) gaps.push("origen");
  if (!item.offer.destination) gaps.push("destino");
  return gaps;
}

function prompt(analysis: Analysis, context: DriverContext | null, indexes: number[], ocr: boolean): string {
  const offers = indexes.map((index) => offerPayload(analysis.offers[index], index, gapsOf(analysis.offers[index])));
  const lines = rules(context);
  if (!ocr) {
    lines.push("Estas ofertas ya tienen origen y destino. No los cambies ni mires una imagen.");
  } else {
    lines.push(
      "Estas ofertas tienen un campo vacío. La imagen es la captura. Completa solo los campos listados en falta, el que está bajo ese usuario.",
      "origen y destino son las direcciones de esa tarjeta en la imagen.",
      "No reemplaces un origen o destino que ya trae texto. Con la dirección completa, juzga también la inclinación.",
    );
  }
  lines.push(JSON.stringify({ ocr: "local", "analizar-ocr": ocr ? "si" : "no", ofertas: offers }));
  return lines.join("\n");
}

function judgments(text: string): RawJudgment[] {
  const cleaned = text.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  const data = JSON.parse(cleaned) as unknown;
  if (Array.isArray(data)) return data as RawJudgment[];
  if (data && typeof data === "object" && Array.isArray((data as { ofertas?: unknown }).ofertas)) {
    return (data as { ofertas: RawJudgment[] }).ofertas;
  }
  if (data && typeof data === "object") return [data as RawJudgment];
  return [];
}

function generationConfig(asJson: boolean, maxOutputTokens: number, thinking: string | null): Record<string, unknown> {
  if (!asJson) return { temperature: 0.2 };
  const config: Record<string, unknown> = {
    responseMimeType: "application/json",
    temperature: 0,
    maxOutputTokens,
  };
  if (thinking) config.thinkingConfig = { thinkingLevel: thinking };
  return config;
}

async function generate(
  apiKey: string,
  parts: { text?: string; inlineData?: { mimeType: string; data: string } }[],
  fetchImpl: typeof fetch,
  asJson: boolean,
  maxOutputTokens = 900,
): Promise<string> {
  let sawMissingModel = false;
  for (const model of models) {
    const ask = (thinking: string | null) =>
      fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
          generationConfig: generationConfig(asJson, maxOutputTokens, thinking),
        }),
      });
    const levels: (string | null)[] = asJson ? ["minimal", "low", null] : [null];
    let response: Response | null = null;
    let body: {
      error?: { message?: string; status?: string };
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    } = {};
    for (const level of levels) {
      response = await ask(level);
      body = (await response.json()) as typeof body;
      const message = body.error?.message ?? "";
      if (response.status === 400 && level && /thinking level/i.test(message)) continue;
      break;
    }
    if (!response) throw new GeminiError("Gemini no respondió");
    if (response.status === 404) {
      sawMissingModel = true;
      continue;
    }
    if (!response.ok) {
      const message = body.error?.message ?? "";
      if (/API key not valid|API_KEY_INVALID/i.test(message)) {
        throw new GeminiError("Google rechazó GEMINI_API_KEY. Revisa server/.env");
      }
      throw new GeminiError("Gemini no respondió");
    }
    const answer = body.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
    if (!answer) throw new GeminiError("Gemini no respondió");
    return answer;
  }
  throw new GeminiError(sawMissingModel ? "Gemini no respondió" : "Gemini no respondió");
}

function applyCompact(item: Analysis["offers"][number], found: RawJudgment | undefined): Analysis["offers"][number] {
  return {
    ...item,
    offer: {
      ...item.offer,
      origin: item.offer.origin ?? (found?.origen?.trim() || null),
      destination: item.offer.destination ?? (found?.destino?.trim() || null),
    },
    decision: "parcial",
    partial: true,
    safety: found ? safetyOf(found.seguridad) : null,
    incline: found ? inclineOf(found.inclinacion) : null,
    sector: found?.sector?.trim() || null,
    suggested: null,
    priority: null,
    reasons: [],
  };
}

function applyShort(
  item: Analysis["offers"][number],
  found: RawJudgment | undefined,
  vista: "linea" | "reducida",
): Analysis["offers"][number] {
  const safety = found ? safetyOf(found.seguridad) : null;
  const incline = found ? inclineOf(found.inclinacion) : null;
  const decision = decisionForIncline(decisionOf(found?.recomendacion), incline, safety);
  return {
    ...item,
    offer: {
      ...item.offer,
      passengerName: vista === "linea" ? item.offer.passengerName : item.offer.passengerName ?? (found?.usuario?.trim() || null),
      priceCop: item.offer.priceCop > 0 ? item.offer.priceCop : (cop(found?.precio_pantalla) ?? 0),
      pickupKm: item.offer.pickupKm ?? kmOf(found?.recogida_km),
      tripKm: item.offer.tripKmFromRoute ? item.offer.tripKm : (item.offer.tripKm ?? kmOf(found?.viaje_km)),
      pickupMin: item.offer.pickupMin ?? minOf(found?.recogida_min),
      tripMin: item.offer.tripMin ?? minOf(found?.viaje_min),
    },
    decision,
    partial: decision === "parcial",
    safety,
    incline,
    sector: found?.sector?.trim() || null,
    suggested:
      vista === "reducida"
        ? { oferta: cop(found?.precio_oferta), justo: cop(found?.precio_justo), extra: cop(found?.precio_extra) }
        : null,
    priority: null,
    reasons: [],
  };
}

function applyJudgment(item: Analysis["offers"][number], found: RawJudgment | undefined): Analysis["offers"][number] {
  if (!found) {
    return { ...item, decision: "parcial", partial: true, reasons: [...item.reasons, "Gemini no juzgó esta oferta"] };
  }
  const safety = safetyOf(found.seguridad);
  const incline = inclineOf(found.inclinacion);
  const decision = decisionForIncline(decisionOf(found.recomendacion), incline, safety);
  const motivo = found.motivo?.trim() || null;
  const origin = item.offer.origin ?? found.origen?.trim() ?? null;
  const destination = item.offer.destination ?? found.destino?.trim() ?? null;
  return {
    ...item,
    offer: { ...item.offer, origin, destination },
    decision,
    partial: decision === "parcial",
    safety,
    incline,
    sector: found.sector?.trim() || null,
    suggested: {
      oferta: cop(found.precio_oferta),
      justo: cop(found.precio_justo),
      extra: cop(found.precio_extra),
    },
    reasons: motivo ? [motivo] : item.reasons,
  };
}

export async function judgeWithGemini(
  analysis: Analysis,
  context: DriverContext | null,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
  image?: CaptureImage | null,
  compact = false,
  vista: JudgeView = "completa",
): Promise<Analysis> {
  if (analysis.offers.length === 0) return analysis;
  if (vista === "linea" || vista === "reducida") {
    const promptText = vista === "linea"
      ? lineaPrompt(analysis.offers.map((item, index) => ({
          indice: index,
          usuario: item.offer.passengerName,
          origen: item.offer.origin,
          destino: item.offer.destination,
        })))
      : reducidaPrompt(analysis.offers.map((item, index) => ({
          indice: index,
          usuario: item.offer.passengerName,
          origen: item.offer.origin,
          destino: item.offer.destination,
          precio_pantalla: item.offer.priceCop,
          recogida_km: item.offer.pickupKm,
        })));
    const text = await generate(apiKey, [{ text: promptText }], fetchImpl, true, vista === "linea" ? 500 : 650);
    const raw = judgments(text);
    return {
      ...analysis,
      offers: analysis.offers.map((item, index) => {
        const found = raw.find((row) => row.indice === index) ?? raw[index];
        return applyShort(item, found, vista);
      }),
    };
  }
  if (compact) {
    const offers = analysis.offers.map((item, index) => ({
      indice: index,
      origen: item.offer.origin,
      destino: item.offer.destination,
    }));
    const parts: { text?: string; inlineData?: { mimeType: string; data: string } }[] = [];
    const hasImage = Boolean(image?.data && image.mime.startsWith("image/"));
    if (hasImage && image) {
      parts.push({ inlineData: { mimeType: image.mime, data: image.data } });
    }
    parts.push({ text: compactPrompt(offers, hasImage) });
    const text = await generate(apiKey, parts, fetchImpl, true, hasImage ? 1200 : 400);
    const raw = judgments(text);
    return {
      ...analysis,
      offers: analysis.offers.map((item, index) => {
        const found = raw.find((row) => row.indice === index) ?? raw[index];
        return applyCompact(item, found);
      }),
    };
  }
  const ready: number[] = [];
  const missing: number[] = [];
  analysis.offers.forEach((item, index) => {
    if (item.offer.origin && item.offer.destination) ready.push(index);
    else missing.push(index);
  });
  const jobs: Promise<{ indexes: number[]; raw: RawJudgment[] }>[] = [];
  if (ready.length > 0) {
    jobs.push(
      generate(apiKey, [{ text: prompt(analysis, context, ready, false) }], fetchImpl, true).then((text) => ({
        indexes: ready,
        raw: judgments(text),
      })),
    );
  }
  if (missing.length > 0) {
    const parts: { text?: string; inlineData?: { mimeType: string; data: string } }[] = [];
    if (image?.data && image.mime.startsWith("image/")) {
      parts.push({ inlineData: { mimeType: image.mime, data: image.data } });
    }
    parts.push({ text: prompt(analysis, context, missing, Boolean(image?.data)) });
    jobs.push(
      generate(apiKey, parts, fetchImpl, true).then((text) => ({
        indexes: missing,
        raw: judgments(text),
      })),
    );
  }
  const batches = await Promise.all(jobs);
  const byIndex = new Map<number, RawJudgment>();
  for (const batch of batches) {
    batch.indexes.forEach((index, position) => {
      const found = batch.raw.find((row) => row.indice === index) ?? batch.raw[position];
      if (found) byIndex.set(index, found);
    });
  }
  return {
    ...analysis,
    offers: analysis.offers.map((item, index) => applyJudgment(item, byIndex.get(index))),
  };
}

function appName(value: string | null | undefined): AppName {
  const text = fold(value ?? "");
  if (text === "uber" || text === "didi") return text;
  return "indrive";
}

function kmOf(value: number | string | null | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function minOf(value: number | string | null | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value !== "string") return null;
  const match = value.match(/\d+/);
  return match ? Number(match[0]) : null;
}

function screenOf(offers: Evaluation[]): ScreenKind {
  const app = offers[0]?.offer.app;
  if (app === "uber") return "uber_sheet";
  if (app === "didi") return "didi_list";
  if (app === "indrive") return "indrive_list";
  return "unknown";
}

function remotePrompt(context: DriverContext | null): string {
  return [
    ...rules(context),
    "Lee la captura. Un objeto por tarjeta.",
    "ocr es remoto: la imagen adjunta es la captura. Léela tú.",
    "origen y destino son las dos direcciones de esa tarjeta, copiadas de la imagen.",
    "Una entrada del array por cada servicio visible.",
    JSON.stringify({ ocr: "remoto" }),
  ].join("\n");
}

function evaluationFromImage(row: RawJudgment, compact: boolean, vista: JudgeView = "completa"): Evaluation {
  if (vista === "linea" || vista === "reducida") {
    const safety = safetyOf(row.seguridad);
    const incline = inclineOf(row.inclinacion);
    const decision = decisionForIncline(decisionOf(row.recomendacion), incline, safety);
    const offer: Offer = {
      app: appName(row.app),
      priceCop: vista === "linea" ? (cop(row.precio_pantalla) ?? 0) : 0,
      pickupKm: vista === "linea" || vista === "reducida" ? kmOf(row.recogida_km) : null,
      tripKm: vista === "linea" || vista === "reducida" ? kmOf(row.viaje_km) : null,
      tripKmFromRoute: false,
      pickupMin: minOf(row.recogida_min),
      tripMin: minOf(row.viaje_min),
      origin: null,
      destination: null,
      surge: null,
      stopsWithoutAddress: 0,
      distanceComplete: false,
      offerAge: null,
      counterOffersCop: [],
      passengerName: row.usuario?.trim() || null,
    };
    return {
      offer,
      pricePerKm: null,
      priceLabel: null,
      decision,
      partial: decision === "parcial",
      reasons: [],
      safety,
      incline,
      priority: null,
      sector: row.sector?.trim() || null,
      suggested:
        vista === "reducida"
          ? { oferta: cop(row.precio_oferta), justo: cop(row.precio_justo), extra: cop(row.precio_extra) }
          : null,
    };
  }
  const offer: Offer = {
    app: compact ? "indrive" : appName(row.app),
    priceCop: compact ? 0 : (cop(row.precio_pantalla) ?? 0),
    pickupKm: compact ? null : kmOf(row.recogida_km),
    tripKm: null,
    tripKmFromRoute: false,
    pickupMin: null,
    tripMin: null,
    origin: row.origen?.trim() || null,
    destination: row.destino?.trim() || null,
    surge: null,
    stopsWithoutAddress: 0,
    distanceComplete: false,
    offerAge: null,
    counterOffersCop: [],
    passengerName: compact ? null : row.usuario?.trim() || null,
  };
  const safety = safetyOf(row.seguridad);
  const incline = inclineOf(row.inclinacion);
  const decision = compact ? "parcial" : decisionForIncline(decisionOf(row.recomendacion), incline, safety);
  return {
    offer,
    pricePerKm: null,
    priceLabel: null,
    decision,
    partial: decision === "parcial",
    reasons: compact || !row.motivo?.trim() ? [] : [row.motivo.trim()],
    safety,
    incline,
    priority: null,
    sector: row.sector?.trim() || null,
    suggested: compact
      ? null
      : {
          oferta: cop(row.precio_oferta),
          justo: cop(row.precio_justo),
          extra: cop(row.precio_extra),
        },
  };
}

export async function judgeImage(
  context: DriverContext | null,
  apiKey: string,
  image: CaptureImage,
  fetchImpl: typeof fetch = fetch,
  compact = false,
  vista: JudgeView = "completa",
): Promise<Analysis> {
  const short = vista === "linea" || vista === "reducida";
  const text = await generate(
    apiKey,
    [
      { inlineData: { mimeType: image.mime, data: image.data } },
      { text: short ? (vista === "linea" ? lineaPrompt() : reducidaPrompt()) : compact ? compactPrompt() : remotePrompt(context) },
    ],
    fetchImpl,
    true,
    short ? (vista === "linea" ? 800 : 800) : compact ? 1200 : 900,
  );
  const offers = judgments(text).map((row) => evaluationFromImage(row, compact, vista));
  return { screen: screenOf(offers), offers };
}

export async function transcribeImage(
  apiKey: string,
  mime: string,
  data: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const text = await generate(
    apiKey,
    [
      { inlineData: { mimeType: mime, data } },
      {
        text: "Transcribe el texto visible de esta captura, línea por línea, en el orden de lectura. No juzgues la carrera. No inventes líneas. Responde solo el texto.",
      },
    ],
    fetchImpl,
    false,
  );
  return text.trim();
}
