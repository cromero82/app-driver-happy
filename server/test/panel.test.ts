import assert from "node:assert/strict";
import type { Server } from "node:http";
import { describe, it } from "node:test";
import { createApp } from "../src/app.ts";

async function withServer(run: (base: string) => Promise<void>): Promise<void> {
  const server: Server = createApp();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

describe("panel local", () => {
  it("sirve la página y analiza la captura mixta", async () => {
    await withServer(async (base) => {
      const page = await fetch(base + "/");
      assert.equal(page.status, 200);
      const html = await page.text();
      assert.match(html, /Asistente driver/);
      assert.match(html, /ruta/);
      assert.match(html, /En zona prime/);
      assert.match(html, /Sin evaluación/);
      assert.match(html, /Imagen \(prueba\)/);
      assert.match(html, /Remoto/);
      assert.match(html, /id="elapsed"/);
      assert.match(html, /id="clear"/);
      assert.match(html, /id="vista"/);
      assert.match(html, /Linea/);
      assert.match(html, /Reducida/);
      assert.match(html, /id="elapsed-ia"/);
      assert.match(html, /Extracción/);
      assert.match(html, /id="compacto"/);
      assert.doesNotMatch(html, /Zona roja/);

      const fixtures = await fetch(base + "/api/fixtures");
      const list = (await fixtures.json()) as { id: string; label: string }[];
      assert.deepEqual(
        list.map((item) => item.id),
        ["indrive-uber", "indrive-lista", "didi-emergente", "didi-lista"],
      );

      const loaded = await fetch(base + "/api/fixtures/indrive-uber");
      const fixture = (await loaded.json()) as { text: string };
      const analyzed = await fetch(base + "/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: fixture.text }),
      });
      const body = (await analyzed.json()) as {
        screen: string;
        offers: { offer: { priceCop: number }; decision: string }[];
      };
      assert.equal(analyzed.status, 200);
      assert.equal(body.screen, "uber_sheet");
      assert.equal(body.offers.length, 1);
      assert.equal(body.offers[0].offer.priceCop, 31039);
      assert.equal(body.offers[0].decision, "aceptar");

      const indrive = await fetch(base + "/api/fixtures/indrive-lista");
      const indriveText = (await indrive.json()) as { text: string };
      const listed = await fetch(base + "/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: indriveText.text }),
      });
      const cards = (await listed.json()) as { offers: { offer: { passengerName: string | null } }[] };
      assert.equal(cards.offers[0].offer.passengerName, "Solecito");
    });
  });

  it("transcribe una imagen de prueba", async () => {
    const fetchImpl: typeof fetch = async (_url, init) => {
      const sent = JSON.parse(String(init?.body)) as {
        contents: { parts: { text?: string; inlineData?: { mimeType: string } }[] }[];
      };
      assert.equal(sent.contents[0].parts[0].inlineData?.mimeType, "image/png");
      assert.match(sent.contents[0].parts[1].text ?? "", /Transcribe/);
      return new Response(
        JSON.stringify({ candidates: [{ content: { parts: [{ text: "COL$10.000\nPrecio justo" }] } }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };
    const server = createApp({ geminiApiKey: "clave", fetchImpl });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/ocr`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mime: "image/png", data: "a".repeat(32) }),
      });
      assert.equal(response.status, 200);
      const body = (await response.json()) as { text: string };
      assert.equal(body.text, "COL$10.000\nPrecio justo");
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
  });

  it("compacto no aplica la zona prime", async () => {
    const fetchImpl: typeof fetch = async (_url, init) => {
      const sent = JSON.parse(String(init?.body)) as { contents: { parts: { text?: string }[] }[] };
      const prompt = sent.contents[0].parts.map((part) => part.text ?? "").join("\n");
      assert.doesNotMatch(prompt, /Prime:/);
      const body = [{ indice: 0, sector: "Nazaret", seguridad: "amarillo", inclinacion: "alta" }];
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(body) }] } }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    const server = createApp({ geminiApiKey: "clave", fetchImpl });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    try {
      const loaded = await fetch(`http://127.0.0.1:${port}/api/fixtures/indrive-lista`);
      const fixture = (await loaded.json()) as { text: string };
      const response = await fetch(`http://127.0.0.1:${port}/api/analyze`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          text: fixture.text,
          compacto: true,
          context: { mode: "en_zona_prime", contiguousZones: ["Laureles"], distantZones: [] },
        }),
      });
      const body = (await response.json()) as {
        offers: { decision: string; sector: string | null; priority: string | null; suggested: unknown }[];
      };
      assert.equal(response.status, 200);
      assert.equal(body.offers[0].decision, "parcial");
      assert.equal(body.offers[0].sector, "Nazaret");
      assert.equal(body.offers[0].priority, null);
      assert.equal(body.offers[0].suggested, null);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
  });

  it("si el texto no trae ofertas lee origen y destino de la imagen", async () => {
    const fetchImpl: typeof fetch = async (_url, init) => {
      const sent = JSON.parse(String(init?.body)) as {
        contents: { parts: { text?: string; inlineData?: { data: string } }[] }[];
      };
      const parts = sent.contents[0].parts;
      assert.equal(parts[0].inlineData?.data, "a".repeat(32));
      assert.match(parts[1].text ?? "", /origen y destino son las dos direcciones/);
      const body = [{ origen: "Calle 10", destino: "Carrera 20", sector: "Belén", seguridad: "verde", inclinacion: "plana" }];
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(body) }] } }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    const server = createApp({ geminiApiKey: "clave", fetchImpl });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/analyze`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          text: "sin ofertas",
          ocr: "local",
          image: { mime: "image/png", data: "a".repeat(32) },
        }),
      });
      const body = (await response.json()) as { offers: { offer: { origin: string | null; destination: string | null } }[] };
      assert.equal(response.status, 200);
      assert.equal(body.offers[0].offer.origin, "Calle 10");
      assert.equal(body.offers[0].offer.destination, "Carrera 20");
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
  });

  it("rechaza un análisis sin texto", async () => {
    await withServer(async (base) => {
      const response = await fetch(base + "/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: "   " }),
      });
      assert.equal(response.status, 400);
    });
  });
});
