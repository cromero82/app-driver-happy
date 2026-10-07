## Context

`main` y `google-ia` parten del mismo commit. A partir de aquí divergen. En `main` la seguridad sale de una geometría que cruza la ruta. En `google-ia` sale de Gemini, igual que el proceso manual que ya usa el conductor.

## Goals

- Dejar el panel con los mismos campos: aceptar, distancia, seguridad, inclinación, precio y prioridad.
- Una sola llamada a Gemini por análisis, con el texto OCR y el contexto del conductor (modo, casa, zona prime, zona alejada).
- Si falta la clave, el panel dice que no hay evaluación. No rellena la decisión con Mapbox ni con `zonas.geojson`.

## Decisions

- Rama de trabajo: `google-ia`. `main` no se toca en esta sesión.
- Modelo: Gemini, API de Google. La clave va en `server/.env` como `GEMINI_API_KEY`. Ese archivo no se versiona. `npm start` lo lee solo.
- El resultado no es repetible. Dos análisis del mismo texto pueden diferir.
- Un campo que Gemini no trae queda vacío o en `Sin evaluación`. No se inventa verde, plana, ni un km.
- Inclinación: muy alta, alta, media o plana. Muy alta decide no. Alta decide negociar.
- Aceptar sigue siendo manual.

## Non-goals

Los de `proposal.md`.
