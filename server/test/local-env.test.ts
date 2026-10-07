import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { loadLocalEnv } from "../src/local-env.ts";

describe("archivo local de claves", () => {
  it("carga la clave y no pisa una que ya esté en el entorno", () => {
    const dir = mkdtempSync(join(tmpdir(), "driver-env-"));
    const file = join(dir, ".env");
    writeFileSync(file, "GEMINI_API_KEY=desde-archivo\nMAPBOX_ACCESS_TOKEN=desde-archivo\n");
    const previous = process.env.MAPBOX_ACCESS_TOKEN;
    process.env.MAPBOX_ACCESS_TOKEN = "ya-en-consola";
    delete process.env.GEMINI_API_KEY;
    loadLocalEnv(file);
    assert.equal(process.env.GEMINI_API_KEY, "desde-archivo");
    assert.equal(process.env.MAPBOX_ACCESS_TOKEN, "ya-en-consola");
    if (previous == null) delete process.env.MAPBOX_ACCESS_TOKEN;
    else process.env.MAPBOX_ACCESS_TOKEN = previous;
    delete process.env.GEMINI_API_KEY;
  });
});
