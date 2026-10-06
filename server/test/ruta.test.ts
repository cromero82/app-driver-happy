import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Server } from "node:http";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { analyze, completeTrips, type RouteLookup } from "../src/analyze.ts";
import { createApp } from "../src/app.ts";
import { addressInColombia, geocodeQuery, googleRouteLookup } from "../src/google-routes.ts";
import { openRouteServiceLookup } from "../src/openrouteservice.ts";
import { mapboxRouteLookup } from "../src/mapbox.ts";
import { routeLookupFromEnv } from "../src/route-provider.ts";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const indrive = readFileSync(join(fixtures, "indrive-lista.txt"), "utf8");
const uber = readFileSync(join(fixtures, "indrive-uber.txt"), "utf8");
const didiLista = readFileSync(join(fixtures, "didi-lista.txt"), "utf8");

describe("km de viaje por ruta", () => {
  it("completa inDrive cuando la ruta responde", async () => {
    const result = await completeTrips(analyze(indrive), {
      async tripKm() {
        return 10;
      },
    });
    const first = result.offers[0];
    assert.equal(first.offer.passengerName, "Solecito");
    assert.equal(first.offer.tripKm, 10);
    assert.equal(first.offer.tripKmFromRoute, true);
    assert.equal(first.partial, false);
    assert.equal(first.pricePerKm, 2504);
    assert.equal(first.priceLabel, "justo");
    assert.equal(first.decision, "aceptar");
  });

  it("sigue parcial si la ruta no responde", async () => {
    const result = await completeTrips(analyze(indrive), {
      async tripKm() {
        return null;
      },
    });
    assert.equal(result.offers[0].partial, true);
    assert.equal(result.offers[0].offer.tripKm, null);
  });

  it("no pide ruta si el viaje ya está en pantalla o hay paradas sin dirección", async () => {
    let calls = 0;
    const lookup: RouteLookup = {
      async tripKm() {
        calls += 1;
        return 4;
      },
    };
    const uberResult = await completeTrips(analyze(uber), lookup);
    const didi = await completeTrips(analyze(didiLista), lookup);
    assert.equal(calls, 0);
    assert.equal(uberResult.offers[0].offer.tripKm, 8);
    assert.equal(uberResult.offers[0].offer.tripKmFromRoute, false);
    assert.equal(didi.offers[0].partial, true);
    assert.equal(didi.offers[1].offer.tripKm, 12.2);
  });

  it("el panel usa el km de la ruta", async () => {
    const server: Server = createApp({
      routes: {
        async tripKm() {
          return 10;
        },
      },
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/analyze`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: indrive }),
      });
      const body = (await response.json()) as {
        offers: { offer: { passengerName: string; tripKm: number; tripKmFromRoute: boolean }; decision: string }[];
      };
      assert.equal(body.offers[0].offer.passengerName, "Solecito");
      assert.equal(body.offers[0].offer.tripKm, 10);
      assert.equal(body.offers[0].offer.tripKmFromRoute, true);
      assert.equal(body.offers[0].decision, "aceptar");
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });
});

describe("cliente Google", () => {
  it("geocodifica en Colombia y pide la ruta sin tráfico", async () => {
    const calls: { url: string; body?: string; fieldMask?: string }[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      calls.push({
        url,
        body: init?.body ? String(init.body) : undefined,
        fieldMask: init?.headers ? new Headers(init.headers).get("X-Goog-FieldMask") ?? undefined : undefined,
      });
      if (url.includes("geocode")) {
        const encoded = new URL(url).searchParams.get("address") ?? "";
        const lat = encoded.includes("destino") ? 6.3 : 6.2;
        return Response.json({ status: "OK", results: [{ geometry: { location: { lat, lng: -75.57 } } }] });
      }
      return Response.json({ routes: [{ distanceMeters: 13300 }] });
    };

    const km = await googleRouteLookup("test-key", fetchImpl).tripKm("origen demo", "destino demo");
    assert.equal(km, 13.3);
    assert.equal(calls.length, 3);
    assert.match(calls[0].url, /address=origen\+demo%2C\+Antioquia%2C\+Colombia|address=origen\+demo,\+Antioquia,\+Colombia/);
    assert.match(calls[0].url, /country%3ACO|country:CO/);
    assert.equal(calls[0].url.includes("test-key"), true);
    const route = JSON.parse(calls[2].body ?? "{}") as { routingPreference: string };
    assert.equal(route.routingPreference, "TRAFFIC_UNAWARE");
    assert.equal(calls[2].fieldMask, "routes.distanceMeters");
  });

  it("no llama a la ruta si la dirección no geocodifica", async () => {
    let routes = 0;
    const fetchImpl: typeof fetch = async (input) => {
      if (String(input).includes("computeRoutes")) routes += 1;
      return Response.json({ status: "ZERO_RESULTS", results: [] });
    };
    const km = await googleRouteLookup("test-key", fetchImpl).tripKm("nada", "tampoco");
    assert.equal(km, null);
    assert.equal(routes, 0);
  });

  it("no duplica el país si la dirección ya dice Colombia", () => {
    assert.equal(addressInColombia("Centro, Medellín, Colombia"), "Centro, Medellín, Colombia");
  });

  it("geocodifica la calle del paréntesis y no el nombre del conjunto", () => {
    assert.equal(
      geocodeQuery("Urbanización Salento (Calle 7 Sur, El Poblado, Medellín, Antioquia)"),
      "Calle 7 Sur, Medellín, Antioquia",
    );
    assert.equal(
      geocodeQuery("Calle 63 # 127-27 (Nazaret, Medellín, Antioquia)"),
      "Calle 63 # 127-27, Medellín, Antioquia",
    );
    assert.equal(addressInColombia("Centro, Medellín, Colombia"), "Centro, Medellín, Colombia");
  });

  it("arma la búsqueda en el municipio y descarta la entrada de la terminal", () => {
    assert.equal(
      geocodeQuery("Edificio San Luis (Calle 61 Sur, Alto Las Flores, Sabaneta, Antioquia)"),
      "Calle 61 Sur, Sabaneta, Antioquia",
    );
    assert.equal(
      geocodeQuery(
        "Aquitodo Distribuidora (Sede Principal) (Calle 70 Sur, Sabaneta, Antioquia)",
      ),
      "Calle 70 Sur, Sabaneta, Antioquia",
    );
    const terminal = geocodeQuery(
      "Terminal Del Sur Medellín, Entrada desde el Calle 10 (Guayabal)",
    );
    assert.doesNotMatch(terminal, /entrada desde/i);
    assert.match(terminal, /Medellín/);
    assert.match(terminal, /Guayabal/);
  });
});

describe("OpenRouteService", () => {
  it("pide la ruta en carro con longitud y latitud", async () => {
    const calls: { url: string; body?: string }[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      calls.push({ url, body: init?.body ? String(init.body) : undefined });
      if (url.includes("pelias")) {
        const text = new URL(url).searchParams.get("text") ?? "";
        const lng = text.includes("destino") ? -75.56 : -75.58;
        return Response.json({ features: [{ geometry: { coordinates: [lng, 6.24] } }] });
      }
      return Response.json({ routes: [{ summary: { distance: 13300 } }] });
    };

    const km = await openRouteServiceLookup("ors-key", fetchImpl).tripKm("origen demo", "destino demo");
    assert.equal(km, 13.3);
    assert.match(calls[0].url, /api\.heigit\.org\/pelias/);
    assert.match(calls[0].url, /boundary.country=COL/);
    const route = JSON.parse(calls[2].body ?? "{}") as { coordinates: [number, number][] };
    assert.deepEqual(route.coordinates[0], [-75.58, 6.24]);
    assert.deepEqual(route.coordinates[1], [-75.56, 6.24]);
  });

  it("ignora un resultado que solo es el departamento", async () => {
    let directions = 0;
    const fetchImpl: typeof fetch = async (input) => {
      if (String(input).includes("directions")) directions += 1;
      return Response.json({
        features: [{ properties: { layer: "region" }, geometry: { coordinates: [-75.41, 6.62] } }],
      });
    };
    const km = await openRouteServiceLookup("ors-key", fetchImpl).tripKm(
      "Urbanización Salento (Calle 7 Sur, El Poblado, Medellín, Antioquia)",
      "Calle 63 # 127-27 (Nazaret, Medellín, Antioquia)",
    );
    assert.equal(km, null);
    assert.equal(directions, 0);
  });

  it("no llama a la ruta si no hay coordenadas", async () => {
    let directions = 0;
    const fetchImpl: typeof fetch = async (input) => {
      if (String(input).includes("directions")) directions += 1;
      return Response.json({ features: [] });
    };
    const km = await openRouteServiceLookup("ors-key", fetchImpl).tripKm("nada", "tampoco");
    assert.equal(km, null);
    assert.equal(directions, 0);
  });

  it("usa Mapbox y lo prefiere sobre OpenRouteService", async () => {
    const calls: { url: string; body?: string }[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      calls.push({ url });
      if (url.includes("geocoding")) {
        const lng = decodeURIComponent(url).includes("destino") ? -75.56 : -75.58;
        return Response.json({ features: [{ center: [lng, 6.24] }] });
      }
      return Response.json({ routes: [{ distance: 16500 }] });
    };
    const km = await mapboxRouteLookup("mapbox-token", fetchImpl).tripKm("origen demo", "destino demo");
    assert.equal(km, 16.5);
    assert.match(calls[0].url, /api\.mapbox\.com\/geocoding/);
    assert.match(calls[0].url, /country=co/);
    assert.equal(new URL(calls[0].url).searchParams.get("types"), null);
    assert.match(calls[2].url, /directions\/v5\/mapbox\/driving\//);
    assert.match(calls[2].url, /-75\.58,6\.24;-75\.56,6\.24/);

    const hosts: string[] = [];
    const lookup = routeLookupFromEnv(
      { MAPBOX_ACCESS_TOKEN: "mapbox", OPENROUTESERVICE_API_KEY: "ors" },
      async (input) => {
        hosts.push(new URL(String(input)).host);
        return Response.json({ features: [] });
      },
    );
    await lookup?.tripKm("a", "b");
    assert.equal(hosts[0], "api.mapbox.com");
  });

  it("acepta la placa 14-135 y ubica el sufijo 63ag en la calle vecina", async () => {
    let route = "";
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      const text = decodeURIComponent(url);
      if (url.includes("geocoding")) {
        if (text.includes("/63AG.json")) {
          return Response.json({
            features: [
              {
                center: [-75.608424, 6.284137],
                place_name: "Calle 64AG, Medellín, Antioquia, Colombia",
                relevance: 0.8,
                place_type: ["address"],
              },
            ],
          });
        }
        if (text.toLowerCase().includes("63ag")) return Response.json({ features: [] });
        return Response.json({
          features: [
            {
              center: [-75.576064, 6.21654],
              place_name: "Avenida Industriales 14-135, Medellín, Antioquia, Colombia",
              relevance: 1,
              place_type: ["address"],
            },
          ],
        });
      }
      if (url.includes("nominatim")) {
        return Response.json([
          {
            lat: "6.2756979",
            lon: "-75.6155480",
            display_name: "Santa Margarita, Medellín, Antioquia, Colombia",
            type: "neighbourhood",
          },
        ]);
      }
      route = url;
      return Response.json({ routes: [{ distance: 11500 }] });
    };
    const km = await mapboxRouteLookup("mapbox-token", fetchImpl).tripKm(
      "Cra. 48 # 14 - 135 (El Poblado)",
      "Mirador del Valle (Calle 63ag, Santa Margarita, Medellín, Antioquia)",
    );
    assert.equal(km, 11.5);
    assert.match(route, /-75\.608424,6\.284137/);
  });

  it("prefiere OpenRouteService aunque exista la clave de Google", async () => {
    const hosts: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      hosts.push(new URL(String(input)).host);
      return Response.json({ features: [] });
    };
    const lookup = routeLookupFromEnv(
      { OPENROUTESERVICE_API_KEY: "ors", GOOGLE_MAPS_API_KEY: "google" },
      fetchImpl,
    );
    await lookup?.tripKm("a", "b");
    assert.equal(hosts[0], "api.heigit.org");
  });
});
