## Why

El motor de `main` (geocodificación, ruta y `zonas.geojson`) no sostuvo la decisión en capturas reales. El mismo trabajo, hecho a mano con Gemini, sí. La rama `google-ia` pasa a ese modo. `main` se queda con el motor determinístico.

## What Changes

- La próxima sesión trabaja solo en `google-ia`.
- Gemini lee el OCR y devuelve los campos cortos del panel.
- La clave de la API de Google todavía no está comprada. Hasta que exista, esta rama no vuelve al motor de `main` para completar la decisión.
- `main` no adopta este modo.

## Capabilities

### New Capabilities

- `modo-gemini`: decisión no determinística a partir del texto de la captura.

### Modified Capabilities

- Ninguna en `openspec/specs/`. Esas specs describen `main`.

## Impact

- Rama `google-ia`. El panel sigue en `server/` (`npm start`, http://127.0.0.1:3000).
- La clave vive en el backend. No va a la página ni al JSON.

## Non-goals

- Publicar en Play Store.
- Aceptar la carrera desde esta app.
- Mezclar este modo con `main`.
- Exigir la misma decisión dos veces para el mismo texto.
