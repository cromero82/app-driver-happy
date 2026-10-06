import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { analyze } from "../src/analyze.ts";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

function read(name: string): string {
  return readFileSync(join(fixtures, name), "utf8");
}

describe("capturas", () => {
  it("prioriza la hoja Uber y descarta inDrive", () => {
    const result = analyze(read("indrive-uber.txt"));
    assert.equal(result.screen, "uber_sheet");
    assert.equal(result.offers.length, 1);
    const offer = result.offers[0];
    assert.equal(offer.offer.app, "uber");
    assert.equal(offer.offer.priceCop, 31039);
    assert.equal(offer.offer.pickupKm, 0.1);
    assert.equal(offer.offer.tripKm, 8);
    assert.match(offer.offer.origin ?? "", /Puerta del Norte/);
    assert.match(offer.offer.destination ?? "", /12 de Octubre/);
    assert.equal(offer.pricePerKm, 3832);
    assert.equal(offer.priceLabel, "optimo");
    assert.equal(offer.decision, "aceptar");
    assert.equal(offer.partial, false);
    const dumped = JSON.stringify(result);
    assert.doesNotMatch(dumped, /COL\$/);
    assert.doesNotMatch(dumped, /Yolanda/);
  });

  it("lee cuatro tarjetas inDrive y deja el viaje incompleto", () => {
    const result = analyze(read("indrive-lista.txt"));
    assert.equal(result.screen, "indrive_list");
    assert.equal(result.offers.length, 4);
    assert.deepEqual(
      result.offers.map((item) => item.offer.priceCop),
      [33300, 27500, 12000, 28400],
    );
    assert.deepEqual(
      result.offers.map((item) => item.offer.pickupKm),
      [3.3, 5.4, 6.7, 6.9],
    );
    assert.deepEqual(
      result.offers.map((item) => item.offer.passengerName),
      ["Solecito", "Sandra", "Hernando", "sara"],
    );
    for (const item of result.offers) {
      assert.equal(item.offer.tripKm, null);
      assert.equal(item.offer.distanceComplete, false);
      assert.equal(item.partial, true);
      assert.equal(item.decision, "parcial");
      assert.equal(item.pricePerKm, null);
      assert.equal(item.priceLabel, null);
      assert.notEqual(item.offer.origin, null);
      assert.notEqual(item.offer.destination, null);
    }
    assert.match(result.offers[0].offer.offerAge ?? "", /2 min/);
    assert.doesNotMatch(JSON.stringify(result), /Precio justo/);
    assert.doesNotMatch(JSON.stringify(result), /Solicitudes de viaje/);
  });

  it("lee el emergente DiDi y descarta el mapa", () => {
    const result = analyze(read("didi-emergente.txt"));
    assert.equal(result.screen, "didi_modal");
    assert.equal(result.offers.length, 1);
    const offer = result.offers[0];
    assert.equal(offer.offer.priceCop, 23300);
    assert.equal(offer.offer.surge, 1.2);
    assert.equal(offer.offer.pickupKm, 1.1);
    assert.equal(offer.offer.tripKm, 9.8);
    assert.match(offer.offer.origin ?? "", /Roldan/);
    assert.match(offer.offer.destination ?? "", /Popular/);
    assert.deepEqual(offer.offer.counterOffersCop, [23900, 24500, 25100]);
    assert.equal(offer.pricePerKm, 2138);
    assert.equal(offer.priceLabel, "justo");
    assert.equal(offer.decision, "aceptar");
    const places = `${offer.offer.origin} ${offer.offer.destination}`;
    assert.doesNotMatch(places, /Copacabana|PARIS|Guarne/);
  });

  it("lee la lista DiDi y marca incompleta la carrera con paradas", () => {
    const result = analyze(read("didi-lista.txt"));
    assert.equal(result.screen, "didi_list");
    assert.equal(result.offers.length, 2);
    assert.deepEqual(
      result.offers.map((item) => item.offer.priceCop),
      [17700, 22300],
    );

    const withStops = result.offers[0];
    assert.equal(withStops.offer.stopsWithoutAddress, 2);
    assert.equal(withStops.offer.distanceComplete, false);
    assert.equal(withStops.offer.surge, 1.3);
    assert.equal(withStops.partial, true);
    assert.equal(withStops.decision, "parcial");
    assert.equal(withStops.pricePerKm, null);
    assert.match(withStops.offer.origin ?? "", /Playa Rica/);
    assert.match(withStops.offer.destination ?? "", /Calle 29/);
    assert.deepEqual(withStops.offer.counterOffersCop, [18200, 18600, 19100]);

    const second = result.offers[1];
    assert.equal(second.offer.priceCop, 22300);
    assert.match(second.offer.destination ?? "", /12\.500 COP/);
    assert.match(second.offer.origin ?? "", /Flor Apartamentos/);
    assert.equal(second.offer.pickupKm, 2.9);
    assert.equal(second.offer.tripKm, 12.2);
    assert.equal(second.offer.distanceComplete, true);
    assert.equal(second.offer.surge, null);
    assert.equal(second.pricePerKm, 1477);
    assert.equal(second.priceLabel, "oferta");
    assert.equal(second.decision, "negociar");
    assert.equal(second.partial, false);
  });
});
