import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { analyze } from "../src/analyze.ts";
import { judgeImage, judgeWithGemini } from "../src/gemini.ts";
import { decisionForIncline } from "../src/thresholds.ts";

const text = readFileSync(new URL("./fixtures/indrive-lista.txt", import.meta.url), "utf8");

describe("juicio Gemini", () => {
  it("muy alta no se acepta y alta se negocia", () => {
    assert.equal(decisionForIncline("aceptar", "muy_alta", null), "no");
    assert.equal(decisionForIncline("aceptar", "alta", null), "negociar");
    assert.equal(decisionForIncline("no", "alta", "rojo"), "no");
    assert.equal(decisionForIncline("aceptar", "plana", null), "aceptar");
  });

  it("conserva usuario, origen y destino y aplica el juicio", async () => {
    const body = [
      {
        indice: 0,
        recomendacion: "no",
        seguridad: "amarillo",
        sector: "La Gabriela, Bello",
        inclinacion: "media",
        precio_oferta: 9200,
        precio_justo: 26000,
        precio_extra: 30000,
        motivo: "Seguridad amarilla en La Gabriela",
      },
    ];
    const fetchImpl: typeof fetch = async (_url, init) => {
      const sent = JSON.parse(String(init?.body)) as { contents: { parts: { text: string }[] }[] };
      assert.match(sent.contents[0].parts[0].text, /Laureles/);
      assert.match(sent.contents[0].parts[0].text, /en zona prime/);
      assert.match(sent.contents[0].parts[0].text, /Solecito/);
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(body) }] } }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    const parsed = analyze(text);
    const judged = await judgeWithGemini(
      parsed,
      { mode: "en_zona_prime", home: "Sabaneta", contiguousZones: ["Laureles", "Poblado"], distantZones: [] },
      "clave",
      fetchImpl,
    );
    const item = judged.offers[0];
    assert.equal(item.offer.passengerName, parsed.offers[0].offer.passengerName);
    assert.equal(item.offer.origin, parsed.offers[0].offer.origin);
    assert.equal(item.offer.destination, parsed.offers[0].offer.destination);
    assert.equal(item.decision, "no");
    assert.equal(item.safety, "amarillo");
    assert.equal(item.sector, "La Gabriela, Bello");
    assert.equal(item.incline, "media");
    assert.deepEqual(item.suggested, { oferta: 9200, justo: 26000, extra: 30000 });
  });

  it("pide la imagen solo para la oferta sin destino", async () => {
    const screen = [
      "~1,1 km",
      "COL$12.800",
      "Precio justo",
      "yoliana",
      "Dg. 54 # 43A-20 (Ciudad Niquia)",
      "Parque Alto - Apartamentos (Carrera 66bb, El Paraiso, Bello, Antioquia)",
      "~1,2 km",
      "COL$12.000",
      "Deisy",
      "Dg. 67 # 47-8",
      "Cl 59bb 69-99",
    ].join("\n");
    const calls: { image: boolean; text: string }[] = [];
    const fetchImpl: typeof fetch = async (_url, init) => {
      const sent = JSON.parse(String(init?.body)) as {
        contents: { parts: { text?: string; inlineData?: { data: string } }[] }[];
      };
      const parts = sent.contents[0].parts;
      const text = parts.map((part) => part.text ?? "").join("\n");
      calls.push({ image: parts.some((part) => part.inlineData?.data === "foto"), text });
      const missing = text.includes("Deisy");
      const body = missing
        ? [{ indice: 1, destino: "Cl 59bb 69-99", recomendacion: "negociar", seguridad: "amarillo", sector: "Bello", inclinacion: "media", precio_oferta: 13000, precio_justo: 15000, precio_extra: 18000, motivo: "Destino leído de la imagen" }]
        : [{ indice: 0, recomendacion: "no", seguridad: "amarillo", sector: "El Paraíso", inclinacion: "alta", precio_oferta: 14000, precio_justo: 16000, precio_extra: 19000, motivo: "Fuera de zona prime" }];
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(body) }] } }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    const judged = await judgeWithGemini(
      analyze(screen),
      { mode: "saliendo", home: null, contiguousZones: ["Poblado"], distantZones: [] },
      "clave",
      fetchImpl,
      { mime: "image/jpeg", data: "foto" },
    );
    assert.equal(calls.length, 2);
    const ready = calls.find((call) => !call.image);
    const gap = calls.find((call) => call.image);
    assert.match(ready?.text ?? "", /"analizar-ocr":"no"/);
    assert.doesNotMatch(ready?.text ?? "", /Deisy/);
    assert.match(gap?.text ?? "", /"analizar-ocr":"si"/);
    assert.match(gap?.text ?? "", /Deisy/);
    assert.equal(judged.offers[0].offer.destination, "Parque Alto - Apartamentos (Carrera 66bb, El Paraiso, Bello, Antioquia)");
    assert.equal(judged.offers[1].offer.origin, "Dg. 67 # 47-8");
    assert.equal(judged.offers[1].offer.destination, "Cl 59bb 69-99");
    assert.equal(judged.offers[1].incline, "media");
  });

  it("en remoto adjunta la imagen y no transcribe antes", async () => {
    const fetchImpl: typeof fetch = async (_url, init) => {
      const sent = JSON.parse(String(init?.body)) as {
        contents: { parts: { text?: string; inlineData?: { data: string } }[] }[];
        generationConfig?: { temperature?: number; maxOutputTokens?: number; thinkingConfig?: { thinkingLevel?: string } };
      };
      const parts = sent.contents[0].parts;
      assert.equal(parts[0].inlineData?.data, "foto");
      assert.match(parts[1].text ?? "", /"ocr":"remoto"/);
      assert.equal(sent.generationConfig?.temperature, 0);
      assert.equal(sent.generationConfig?.maxOutputTokens, 900);
      assert.equal(sent.generationConfig?.thinkingConfig?.thinkingLevel, "minimal");
      const body = [{
        usuario: "Deisy",
        app: "indrive",
        origen: "Dg. 67 # 47-8",
        destino: "Cl 59bb 69-99",
        precio_pantalla: 12000,
        recogida_km: 1.2,
        recomendacion: "negociar",
        seguridad: "amarillo",
        sector: "Bello",
        inclinacion: "alta",
        precio_oferta: 13000,
        precio_justo: 15000,
        precio_extra: 18000,
        motivo: "Leído de la imagen",
      }];
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(body) }] } }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    const judged = await judgeImage(
      { mode: "saliendo", home: null, contiguousZones: ["Poblado"], distantZones: [] },
      "clave",
      { mime: "image/jpeg", data: "foto" },
      fetchImpl,
    );
    assert.equal(judged.offers.length, 1);
    assert.equal(judged.offers[0].offer.passengerName, "Deisy");
    assert.equal(judged.offers[0].offer.destination, "Cl 59bb 69-99");
    assert.equal(judged.offers[0].incline, "alta");
    assert.equal(judged.offers[0].decision, "negociar");
  });

  it("en compacto solo pide sector, seguridad e inclinación", async () => {
    const fetchImpl: typeof fetch = async (_url, init) => {
      const sent = JSON.parse(String(init?.body)) as {
        contents: { parts: { text?: string }[] }[];
        generationConfig?: { temperature?: number; maxOutputTokens?: number; thinkingConfig?: { thinkingLevel?: string } };
      };
      const prompt = sent.contents[0].parts[1].text ?? "";
      assert.match(prompt, /origen y destino son las dos direcciones/);
      assert.match(prompt, /seguridad e inclinacion son obligatorias/);
      assert.doesNotMatch(prompt, /Prime:/);
      assert.doesNotMatch(prompt, /precio_oferta/);
      assert.equal(sent.generationConfig?.maxOutputTokens, 1200);
      assert.equal(sent.generationConfig?.temperature, 0);
      assert.equal(sent.generationConfig?.thinkingConfig?.thinkingLevel, "minimal");
      const body = [{
        origen: "Dg. 67 # 47-8",
        destino: "Cl 59bb 69-99",
        sector: "Laureles",
        seguridad: "Amarillo (Ciudad Niquia)",
        inclinacion: "Media, subida corta",
        recomendacion: "aceptar",
        precio_oferta: 1000,
      }];
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(body) }] } }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    const judged = await judgeImage(
      { mode: "en_zona_prime", home: "Sabaneta", contiguousZones: ["Laureles"], distantZones: [] },
      "clave",
      { mime: "image/jpeg", data: "foto" },
      fetchImpl,
      true,
    );
    const item = judged.offers[0];
    assert.equal(item.offer.origin, "Dg. 67 # 47-8");
    assert.equal(item.offer.destination, "Cl 59bb 69-99");
    assert.equal(item.sector, "Laureles");
    assert.equal(item.safety, "amarillo");
    assert.equal(item.incline, "media");
    assert.equal(item.decision, "parcial");
    assert.equal(item.suggested, null);
    assert.deepEqual(item.reasons, []);
    assert.equal(item.offer.passengerName, null);
    assert.equal(item.priority, null);
  });

  it("en compacto con texto no manda zonas ni precios", async () => {
    const fetchImpl: typeof fetch = async (_url, init) => {
      const sent = JSON.parse(String(init?.body)) as {
        contents: { parts: { text?: string }[] }[];
        generationConfig?: { maxOutputTokens?: number };
      };
      const prompt = sent.contents[0].parts[0].text ?? "";
      assert.match(prompt, /No compares modo ni zona/);
      assert.doesNotMatch(prompt, /Prime:/);
      assert.doesNotMatch(prompt, /precio_oferta/);
      assert.match(prompt, /Salento/);
      assert.equal(sent.generationConfig?.maxOutputTokens, 400);
      const body = [{ indice: 0, sector: "Nazaret", seguridad: "amarillo", inclinacion: "alta" }];
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(body) }] } }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    const judged = await judgeWithGemini(
      analyze(text),
      { mode: "en_zona_prime", home: null, contiguousZones: ["Laureles"], distantZones: [] },
      "clave",
      fetchImpl,
      null,
      true,
    );
    assert.equal(judged.offers[0].sector, "Nazaret");
    assert.equal(judged.offers[0].incline, "alta");
    assert.equal(judged.offers[0].decision, "parcial");
    assert.equal(judged.offers[0].suggested, null);
  });

  it("si thinkingLevel minimal responde 400 reintenta en low", async () => {
    let calls = 0;
    const fetchImpl: typeof fetch = async (_url, init) => {
      calls += 1;
      const sent = JSON.parse(String(init?.body)) as {
        generationConfig?: { thinkingConfig?: { thinkingLevel?: string }; maxOutputTokens?: number };
      };
      if (sent.generationConfig?.thinkingConfig?.thinkingLevel === "minimal") {
        return new Response(JSON.stringify({ error: { message: "Thinking level MINIMAL is not supported for this model." } }), {
          status: 400,
          headers: { "content-type": "application/json" },
        });
      }
      assert.equal(sent.generationConfig?.thinkingConfig?.thinkingLevel, "low");
      assert.equal(sent.generationConfig?.maxOutputTokens, 900);
      const body = [{ usuario: "Deisy", recomendacion: "aceptar", inclinacion: "plana", sector: "Bello" }];
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(body) }] } }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    const judged = await judgeImage(
      { mode: "saliendo", home: null, contiguousZones: ["Poblado"], distantZones: [] },
      "clave",
      { mime: "image/jpeg", data: "foto" },
      fetchImpl,
    );
    assert.equal(calls, 2);
    assert.equal(judged.offers[0].decision, "aceptar");
    assert.equal(judged.offers[0].sector, "Bello");
  });
});
