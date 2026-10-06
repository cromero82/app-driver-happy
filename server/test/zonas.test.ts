import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { analyze, completeTrips } from "../src/analyze.ts";
import { geocodeAttempts } from "../src/google-routes.ts";
import { mapboxRouteLookup } from "../src/mapbox.ts";
import { evaluate } from "../src/decide.ts";
import type { Offer } from "../src/types.ts";
import {
  decideAgainstZones,
  loadOperationalZones,
  operationalFeatures,
  zonesOnRoute,
  type LineGeometry,
  type ZoneFeature,
} from "../src/zones.ts";

const line: LineGeometry = {
  type: "LineString",
  coordinates: [
    [-75.56, 6.29],
    [-75.54, 6.31],
  ],
};

function offer(patch: Partial<Offer> = {}): Offer {
  return {
    app: "didi",
    priceCop: 40000,
    pickupKm: 1,
    tripKm: 9,
    tripKmFromRoute: false,
    pickupMin: null,
    tripMin: null,
    origin: "Dg. 55, Puerta del Norte - Estación Niquía",
    destination: "Cra 71A # 98-101, 12 de Octubre",
    surge: null,
    stopsWithoutAddress: 0,
    distanceComplete: true,
    offerAge: null,
    counterOffersCop: [],
    passengerName: null,
    ...patch,
  };
}

function feature(
  properties: ZoneFeature["properties"],
  geometry: ZoneFeature["geometry"],
): ZoneFeature {
  return { type: "Feature", properties, geometry };
}

const redBox = feature(
  { nombre: "Cruce de prueba", modo: "operativa", activo: true, seguridad: "rojo" },
  {
    type: "Polygon",
    coordinates: [
      [
        [-75.555, 6.295],
        [-75.545, 6.295],
        [-75.545, 6.305],
        [-75.555, 6.305],
        [-75.555, 6.295],
      ],
    ],
  },
);

function judged(zones: ZoneFeature[]) {
  return decideAgainstZones(evaluate(offer()), zonesOnRoute(line, zones));
}

describe("zonas por geometría", () => {
  it("el archivo investigado deja operando solo Santo Domingo Savio", () => {
    const collection = JSON.parse(readFileSync(new URL("../data/zonas.geojson", import.meta.url), "utf8"));
    const active = operationalFeatures(collection);
    assert.deepEqual(
      active.map((item) => item.properties.nombre),
      ["Santo Domingo Savio"],
    );
    assert.equal(loadOperationalZones().length, 1);
  });

  it("Niquía a 12 de Octubre queda sin evaluación con las referencias", async () => {
    let geometry = 0;
    const text = [
      "~2,0 km",
      "COL$25.000",
      "Precio justo",
      "Dg. 55, Puerta del Norte - Estación Niquía",
      "Cra 71A # 98-101, 12 de Octubre",
    ].join("\n");
    const result = await completeTrips(analyze(text), {
      async tripKm() {
        return 12;
      },
      async tripRoute() {
        geometry += 1;
        return { km: 12, line };
      },
    });
    assert.equal(geometry, 1);
    assert.equal(result.offers[0].offer.tripKm, 12);
    assert.equal(result.offers[0].safety, null);
    assert.equal(result.offers[0].incline, null);
    assert.equal(result.offers[0].decision, "negociar");
  });

  it("Carrera 29 con Calle 107 cruza Santo Domingo y rechaza", () => {
    const attempt = geocodeAttempts("Carrera 29 con Calle 107, Medellín, Antioquia")[0];
    assert.equal(attempt.query, "Carrera 29 y Calle 107, Medellín, Antioquia");
    const school = geocodeAttempts("Institucion Educativa Comercial Antonio Roldan Betancur, Bello")[0];
    assert.equal(
      school.query,
      "Institucion Educativa Comercial Antonio Roldan Betancur, Bello, Antioquia, Colombia",
    );
    assert.deepEqual(attempt.mustInclude, ["29", "107"]);
    const through: LineGeometry = {
      type: "LineString",
      coordinates: [
        [-75.57, 6.25],
        [-75.541638, 6.294727],
      ],
    };
    const hits = zonesOnRoute(through, loadOperationalZones());
    assert.equal(hits[0]?.nombre, "Santo Domingo Savio");
    const item = decideAgainstZones(evaluate(offer()), hits);
    assert.equal(item.safety, "rojo");
    assert.equal(item.decision, "no");
    assert.equal(item.reasons.at(-1), "Zona roja: Santo Domingo Savio");
  });

  it("un polígono rojo operativo rechaza la ruta que lo cruza", () => {
    const item = judged([redBox]);
    assert.equal(item.safety, "rojo");
    assert.equal(item.decision, "no");
    assert.equal(item.reasons.at(-1), "Zona roja: Cruce de prueba");
    assert.ok((item && zonesOnRoute(line, [redBox])[0].metros) > 0);
  });

  it("una referencia que cruza la línea no cambia la decisión", () => {
    const reference = feature(
      {
        nombre: "La Candelaria - referencia estadística",
        modo: "referencia_no_operativa",
        seguridad: "rojo",
        radioMetros: 5000,
        activo: true,
      },
      { type: "Point", coordinates: [-75.55, 6.3] },
    );
    const active = operationalFeatures({ type: "FeatureCollection", features: [reference] });
    assert.equal(active.length, 0);
    const kept = decideAgainstZones(evaluate(offer()), zonesOnRoute(line, active));
    assert.equal(kept.decision, "aceptar");
    assert.equal(kept.safety, null);
  });

  it("la pendiente alta rechaza y la amarilla no", () => {
    const slope = judged([
      feature(
        { nombre: "Subida", modo: "operativa", activo: true, pendiente: "alta" },
        { type: "LineString", coordinates: [[-75.56, 6.3], [-75.54, 6.3]] },
      ),
    ]);
    assert.equal(slope.incline, "alta");
    assert.equal(slope.decision, "no");
    assert.equal(slope.reasons.at(-1), "Pendiente alta: Subida");

    const yellow = judged([
      feature(
        { nombre: "Precaución", modo: "operativa", activo: true, seguridad: "amarillo" },
        redBox.geometry,
      ),
    ]);
    assert.equal(yellow.safety, "amarillo");
    assert.equal(yellow.decision, "aceptar");
  });

  it("ignora una zona lejos, un punto sin radio y una plantilla apagada", () => {
    const far = feature(
      { nombre: "Lejos", modo: "operativa", activo: true, seguridad: "rojo" },
      {
        type: "Polygon",
        coordinates: [
          [
            [-75.9, 6.9],
            [-75.89, 6.9],
            [-75.89, 6.91],
            [-75.9, 6.91],
            [-75.9, 6.9],
          ],
        ],
      },
    );
    const noRadius = feature(
      { nombre: "Centroide", modo: "operativa", activo: true, seguridad: "rojo" },
      { type: "Point", coordinates: [-75.55, 6.3] },
    );
    const off = feature(
      { nombre: "Plantilla", modo: "operativa", activo: false, seguridad: "rojo", radioMetros: 5000 },
      { type: "Point", coordinates: [-75.55, 6.3] },
    );
    const outside = feature(
      { nombre: "Fuera", modo: "operativa", activo: true, seguridad: "rojo", radioMetros: 50 },
      { type: "Point", coordinates: [-75.7, 6.1] },
    );
    const inside = feature(
      { nombre: "Adentro", modo: "operativa", activo: true, seguridad: "rojo", radioMetros: 400 },
      { type: "Point", coordinates: [-75.55, 6.3] },
    );
    const ignored = operationalFeatures({
      type: "FeatureCollection",
      features: [far, noRadius, off, outside],
    });
    assert.deepEqual(
      ignored.map((item) => item.properties.nombre),
      ["Lejos", "Fuera"],
    );
    assert.equal(judged(ignored).safety, null);
    assert.equal(judged([inside]).decision, "no");
  });

  it("Mapbox pide la línea GeoJSON solo en la ruta completa", async () => {
    const calls: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      calls.push(url);
      if (url.includes("geocoding")) {
        return Response.json({
          features: [{ center: [-75.55, 6.3], place_name: "Medellín", relevance: 1, place_type: ["address"] }],
        });
      }
      return Response.json({
        routes: [{ distance: 10000, geometry: { type: "LineString", coordinates: line.coordinates } }],
      });
    };
    const lookup = mapboxRouteLookup("token", fetchImpl);
    await lookup.tripKm("origen demo", "destino demo");
    assert.equal(new URL(calls[2]).searchParams.get("overview"), "false");
    assert.equal(new URL(calls[2]).searchParams.get("geometries"), null);
    const routed = await lookup.tripRoute!("origen demo", "destino demo");
    assert.equal(routed?.km, 10);
    assert.equal(new URL(calls[5]).searchParams.get("overview"), "full");
    assert.equal(new URL(calls[5]).searchParams.get("geometries"), "geojson");
  });
});
