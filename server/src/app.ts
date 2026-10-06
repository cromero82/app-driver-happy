import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { analyze, completeTrips, type RouteLookup } from "./analyze.ts";
import { applyContext, parseDriverContext } from "./modes.ts";

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

export function createApp(options?: { routes?: RouteLookup }) {
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
    if (req.method === "POST" && url.pathname === "/api/analyze") {
      let payload: { text?: unknown; context?: unknown; at?: unknown };
      try {
        payload = JSON.parse(await readBody(req)) as { text?: unknown; context?: unknown; at?: unknown };
      } catch {
        json(res, 400, { error: "JSON inválido" });
        return;
      }
      if (typeof payload.text !== "string" || payload.text.trim() === "") {
        json(res, 400, { error: "Falta el texto" });
        return;
      }
      let analysis = await completeTrips(analyze(payload.text), options?.routes);
      const context = parseDriverContext(payload.context);
      if (context) {
        const now = typeof payload.at === "string" ? new Date(payload.at) : new Date();
        analysis = applyContext(analysis, context, Number.isNaN(now.getTime()) ? new Date() : now);
      }
      json(res, 200, analysis);
      return;
    }
    json(res, 404, { error: "No existe" });
  });
}
