import { createApp } from "./app.ts";
import { loadLocalEnv } from "./local-env.ts";
import { routeLookupFromEnv } from "./route-provider.ts";

loadLocalEnv();
const port = Number(process.env.PORT ?? 3000);
const routes = routeLookupFromEnv(process.env);
const server = createApp({ routes, geminiApiKey: process.env.GEMINI_API_KEY });
server.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EADDRINUSE") {
    console.error(`http://127.0.0.1:${port} ya está en uso. Ábrelo o cierra el proceso que lo ocupa.`);
    process.exit(1);
  }
  throw error;
});
server.listen(port, "127.0.0.1", () => {
  console.log(`http://127.0.0.1:${port}`);
  if (process.env.GEMINI_API_KEY) console.log("Gemini activo");
  if (process.env.MAPBOX_ACCESS_TOKEN) console.log("Rutas Mapbox activas");
  else if (process.env.OPENROUTESERVICE_API_KEY) console.log("Rutas OpenRouteService activas");
  else if (process.env.GOOGLE_MAPS_API_KEY) console.log("Rutas Google activas");
  else console.log("Sin MAPBOX_ACCESS_TOKEN: el km de viaje de inDrive queda parcial");
});
