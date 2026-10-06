import { createApp } from "./app.ts";

const port = Number(process.env.PORT ?? 3000);
const server = createApp();
server.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EADDRINUSE") {
    console.error(`http://127.0.0.1:${port} ya está en uso. Ábrelo o cierra el proceso que lo ocupa.`);
    process.exit(1);
  }
  throw error;
});
server.listen(port, "127.0.0.1", () => {
  console.log(`http://127.0.0.1:${port}`);
});
