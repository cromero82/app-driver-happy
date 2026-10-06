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
