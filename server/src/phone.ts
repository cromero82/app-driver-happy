import { spawn } from "node:child_process";

export class PhoneError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PhoneError";
  }
}

export interface PhoneRunner {
  text(args: string[]): Promise<string>;
  buffer(args: string[]): Promise<Buffer>;
}

export function adbRunner(command = "adb"): PhoneRunner {
  return {
    text: (args) => run(command, args).then((body) => body.toString("utf8")),
    buffer: (args) => run(command, args),
  };
}

function run(command: string, args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    const out: Buffer[] = [];
    const timer = setTimeout(() => {
      child.kill();
      reject(new PhoneError("El teléfono no respondió."));
    }, 8000);
    child.stdout.on("data", (chunk: Buffer) => out.push(chunk));
    child.on("error", (error: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      reject(error.code === "ENOENT" ? new PhoneError("Falta adb. Instala android-platform-tools.") : new PhoneError("No se pudo capturar el teléfono."));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) reject(new PhoneError("No se pudo capturar el teléfono."));
      else resolve(Buffer.concat(out));
    });
  });
}

function readySerials(listing: string): { serials: string[]; unauthorized: boolean } {
  const serials: string[] = [];
  let unauthorized = false;
  for (const line of listing.split("\n").slice(1)) {
    const [serial, state] = line.trim().split(/\s+/);
    if (!serial || !state) continue;
    if (state === "device") serials.push(serial);
    if (state === "unauthorized") unauthorized = true;
  }
  return { serials, unauthorized };
}

export async function macSeesPhone(): Promise<boolean> {
  const listing = await run("ioreg", ["-p", "IOUSB", "-w0"]).then((body) => body.toString("utf8")).catch(() => "");
  return /moto |samsung|pixel|huawei|xiaomi|redmi|oneplus|oppo|vivo|realme|nokia|android/i.test(listing);
}

export async function capturePhone(
  runner: PhoneRunner = adbRunner(),
  usbAttached?: () => Promise<boolean>,
): Promise<{ mime: "image/png"; data: string }> {
  const { serials, unauthorized } = readySerials(await runner.text(["devices"]));
  if (serials.length === 0 && unauthorized) throw new PhoneError("Acepta la depuración USB en el teléfono.");
  if (serials.length === 0) {
    const plugged = usbAttached ? await usbAttached() : false;
    throw new PhoneError(
      plugged
        ? "El Mac ve el teléfono, pero falta la depuración USB. Actívala y, en la notificación de carga, elige Transferencia de archivos."
        : "No hay un teléfono conectado.",
    );
  }
  const png = await runner.buffer(["-s", serials[0], "exec-out", "screencap", "-p"]);
  if (png.length < 8 || png[0] !== 0x89 || png.length > 9_000_000) throw new PhoneError("La captura del teléfono no sirve.");
  return { mime: "image/png", data: png.toString("base64") };
}
