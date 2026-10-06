import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { createApp } from "../src/app.ts";
import { evaluate } from "../src/decide.ts";
import { applyContext, type DriverContext } from "../src/modes.ts";
import type { Offer } from "../src/types.ts";

const peak = new Date("2026-10-06T18:00:00-05:00");
const afternoon = new Date("2026-10-06T15:00:00-05:00");
const sundayPeak = new Date("2026-10-04T18:00:00-05:00");

function offer(patch: Partial<Offer> = {}): Offer {
  return {
    app: "didi",
    priceCop: 30000,
    pickupKm: 1,
    tripKm: 9,
    tripKmFromRoute: false,
    pickupMin: null,
    tripMin: null,
    origin: "Calle 10, El Poblado, Medellín",
    destination: "Parque, Sabaneta, Antioquia",
    surge: null,
    stopsWithoutAddress: 0,
    distanceComplete: true,
    offerAge: null,
    counterOffersCop: [],
    passengerName: null,
    ...patch,
  };
}

function context(patch: Partial<DriverContext> = {}): DriverContext {
  return {
    mode: "saliendo",
    home: null,
    contiguousZones: ["Poblado", "Belén", "Envigado", "Itagüí", "Sabaneta"],
    distantZones: [],
    ...patch,
  };
}

function decide(patch: Partial<Offer>, driver: Partial<DriverContext>, now: Date) {
  const analysis = applyContext(
    { screen: "didi_modal", offers: [evaluate(offer(patch))] },
    context(driver),
    now,
  );
  return analysis.offers[0];
}

describe("modos y zona", () => {
  it("en zona prime rechaza un destino fuera del arreglo", () => {
    const item = decide(
      { destination: "Calle 63, Nazaret, Medellín" },
      { mode: "en_zona_prime" },
      afternoon,
    );
    assert.equal(item.decision, "no");
    assert.match(item.reasons.join(" "), /fuera de la zona prime/);
  });

  it("en zona prime acepta una carrera que se queda en Sabaneta", () => {
    const item = decide(
      {
        origin: "Alto Las Flores, Sabaneta",
        destination: "Calle 70 Sur, Sabaneta",
      },
      { mode: "en_zona_prime" },
      afternoon,
    );
    assert.equal(item.decision, "aceptar");
  });

  it("rechaza saltar de la zona junta a la alejada", () => {
    const item = decide(
      { destination: "Centro, Rionegro" },
      { mode: "en_zona_prime", distantZones: ["Rionegro"] },
      afternoon,
    );
    assert.equal(item.decision, "no");
    assert.match(item.reasons.join(" "), /sale de la zona/);
  });

  it("retornando marca prioridad alta hacia la casa", () => {
    const item = decide({}, { mode: "retornando", home: "Sabaneta" }, afternoon);
    assert.equal(item.priority, "Alta (Retorno a casa)");
    assert.equal(item.decision, "aceptar");
  });

  it("saliendo prioriza el destino en zona prime", () => {
    const item = decide({}, { mode: "saliendo" }, afternoon);
    assert.equal(item.priority, "Alta (Zona prime)");
  });
});

describe("seguridad y hora pico", () => {
  it("en hora pico negocia DiDi si no hay recargo visible", () => {
    const item = decide({}, {}, peak);
    assert.equal(item.decision, "negociar");
    assert.match(item.reasons.join(" "), /Hora pico/);
  });

  it("no endurece si el recargo ya viene en pantalla", () => {
    const item = decide({ surge: 1.3 }, {}, peak);
    assert.equal(item.decision, "aceptar");
  });

  it("no endurece Uber ni un domingo", () => {
    assert.equal(decide({ app: "uber" }, {}, peak).decision, "aceptar");
    assert.equal(decide({}, {}, sundayPeak).decision, "aceptar");
  });

  it("el panel aplica el modo sin inventar la inclinación", async () => {
    const server = createApp();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/analyze`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          text: readFileSync(new URL("./fixtures/didi-emergente.txt", import.meta.url), "utf8"),
          at: "2026-10-06T15:00:00-05:00",
          context: { mode: "en_zona_prime", home: "Belén" },
        }),
      });
      const body = (await response.json()) as {
        offers: { decision: string; incline: null; priority: string | null }[];
      };
      assert.equal(body.offers[0].decision, "no");
      assert.equal(body.offers[0].incline, null);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
  });
});
