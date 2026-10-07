import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { analyze, completeTrips, type RouteLookup } from "./analyze.ts";
import { GeminiError, judgeImage, judgeWithGemini, transcribeImage, type CaptureImage } from "./gemini.ts";
import { adbRunner, capturePhone, macSeesPhone, PhoneError, type PhoneRunner } from "./phone.ts";
import { applyContext, parseDriverContext } from "./modes.ts";
import type { Analysis } from "./types.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export const fixtures = [
  { id: "indrive-uber", file: "indrive-uber.txt", label: "inDrive + Uber" },
  { id: "indrive-lista", file: "indrive-lista.txt", label: "inDrive" },
  { id: "didi-emergente", file: "didi-emergente.txt", label: "DiDi emergente" },
  { id: "didi-lista", file: "didi-lista.txt", label: "DiDi lista" },
] as const;

function send(res: ServerResponse, status: number, body: string | Buffer, type: string): void {
  res.writeHead(status, { "content-type": type });
  res.end(body);
}

function json(res: ServerResponse, status: number, body: unknown): void {
  send(res, status, JSON.stringify(body), "application/json; charset=utf-8");
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function captureImage(value: { mime?: unknown; data?: unknown } | undefined): CaptureImage | null {
  const mime = typeof value?.mime === "string" ? value.mime : "";
  const data = typeof value?.data === "string" ? value.data : "";
  if (!mime.startsWith("image/") || data.length < 16) return null;
  return { mime, data };
}

export function createApp(options?: {
  routes?: RouteLookup;
  geminiApiKey?: string;
  fetchImpl?: typeof fetch;
  phone?: PhoneRunner;
}) {
  const indexHtml = readFileSync(join(root, "public/index.html"));
  const fixturesDir = join(root, "test/fixtures");

  return createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (req.method === "GET" && url.pathname === "/") {
      send(res, 200, indexHtml, "text/html; charset=utf-8");
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/fixtures") {
      json(res, 200, fixtures.map(({ id, label }) => ({ id, label })));
      return;
    }
    if (req.method === "GET" && url.pathname.startsWith("/api/fixtures/")) {
      const id = decodeURIComponent(url.pathname.slice("/api/fixtures/".length));
      const found = fixtures.find((item) => item.id === id);
      if (!found) {
        json(res, 404, { error: "No existe esa captura" });
        return;
      }
      json(res, 200, { id, text: readFileSync(join(fixturesDir, found.file), "utf8") });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/phone") {
      try {
        json(res, 200, await capturePhone(options?.phone ?? adbRunner(), options?.phone ? undefined : macSeesPhone));
      } catch (error) {
        const message = error instanceof PhoneError ? error.message : "No se pudo capturar el teléfono";
        json(res, 502, { error: message });
      }
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/ocr") {
      let payload: { mime?: unknown; data?: unknown };
      try {
        payload = JSON.parse(await readBody(req)) as { mime?: unknown; data?: unknown };
      } catch {
        json(res, 400, { error: "JSON inválido" });
        return;
      }
      const mime = typeof payload.mime === "string" ? payload.mime : "";
      const data = typeof payload.data === "string" ? payload.data : "";
      if (!mime.startsWith("image/") || data.length < 16 || data.length > 12_000_000) {
        json(res, 400, { error: "La imagen no sirve" });
        return;
      }
      if (!options?.geminiApiKey) {
        json(res, 502, { error: "Falta GEMINI_API_KEY" });
        return;
      }
      try {
        const text = await transcribeImage(options.geminiApiKey, mime, data, options.fetchImpl);
        if (!text) {
          json(res, 502, { error: "La imagen no produjo texto" });
          return;
        }
        json(res, 200, { text });
      } catch (error) {
        const message = error instanceof GeminiError ? error.message : "Gemini no respondió";
        json(res, 502, { error: message });
      }
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/analyze") {
      let payload: {
        text?: unknown;
        context?: unknown;
        at?: unknown;
        ocr?: unknown;
        compacto?: unknown;
        vista?: unknown;
        image?: { mime?: unknown; data?: unknown };
      };
      try {
        payload = JSON.parse(await readBody(req)) as typeof payload;
      } catch {
        json(res, 400, { error: "JSON inválido" });
        return;
      }
      const image = captureImage(payload.image);
      const remote = payload.ocr !== "local";
      const compact = payload.compacto === true;
      const vista = payload.vista === "linea" || payload.vista === "reducida" ? payload.vista : "completa";
      const text = typeof payload.text === "string" ? payload.text : "";
      if (text.trim() === "" && !(remote && image)) {
        json(res, 400, { error: "Falta el texto" });
        return;
      }
      const context = parseDriverContext(payload.context);
      let analysis: Analysis;
      try {
        const parsed = analyze(text);
        if (image && options?.geminiApiKey && (remote || parsed.offers.length === 0)) {
          analysis = await judgeImage(context, options.geminiApiKey, image, options.fetchImpl, compact, vista);
        } else if (options?.geminiApiKey) {
          analysis = await judgeWithGemini(parsed, context, options.geminiApiKey, options.fetchImpl, image, compact, vista);
        } else {
          analysis = await completeTrips(parsed, options?.routes);
        }
      } catch (error) {
        const message = error instanceof GeminiError ? error.message : "Gemini no respondió";
        json(res, 502, { error: message });
        return;
      }
      if (context && !compact) {
        const now = typeof payload.at === "string" ? new Date(payload.at) : new Date();
        analysis = applyContext(analysis, context, Number.isNaN(now.getTime()) ? new Date() : now);
      }
      json(res, 200, analysis);
      return;
    }
    json(res, 404, { error: "No existe" });
  });
}
