import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createApp } from "../src/app.ts";
import { capturePhone, PhoneError, type PhoneRunner } from "../src/phone.ts";

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

function runner(listing: string, shot: Buffer = png): PhoneRunner {
  return {
    text: async () => listing,
    buffer: async () => shot,
  };
}

describe("teléfono", () => {
  it("toma la pantalla del equipo listo", async () => {
    const shot = await capturePhone(runner("List of devices attached\nABC123\tdevice\n"));
    assert.equal(shot.mime, "image/png");
    assert.equal(shot.data, png.toString("base64"));
  });

  it("pide aceptar la depuración si el teléfono no autorizó", async () => {
    await assert.rejects(
      () => capturePhone(runner("List of devices attached\nABC123\tunauthorized\n")),
      (error: unknown) => error instanceof PhoneError && error.message.includes("depuración"),
    );
  });

  it("avisa si no hay teléfono", async () => {
    await assert.rejects(
      () => capturePhone(runner("List of devices attached\n"), async () => false),
      (error: unknown) => error instanceof PhoneError && error.message.includes("No hay un teléfono"),
    );
  });

  it("si el Mac ve el teléfono pide la depuración USB", async () => {
    await assert.rejects(
      () => capturePhone(runner("List of devices attached\n"), async () => true),
      (error: unknown) => error instanceof PhoneError && error.message.includes("depuración USB"),
    );
  });

  it("el panel devuelve la captura", async () => {
    const server = createApp({
      phone: runner("List of devices attached\nABC123\tdevice\n"),
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    try {
      const page = await fetch(`http://127.0.0.1:${port}/`);
      assert.match(await page.text(), /Teléfono/);
      const response = await fetch(`http://127.0.0.1:${port}/api/phone`, { method: "POST" });
      const body = (await response.json()) as { mime: string; data: string };
      assert.equal(response.status, 200);
      assert.equal(body.mime, "image/png");
      assert.equal(body.data, png.toString("base64"));
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
  });
});
