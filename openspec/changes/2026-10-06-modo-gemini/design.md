## Context

`main` y `google-ia` parten del mismo commit. A partir de aquí divergen. En `main` la seguridad sale de una geometría que cruza la ruta. En `google-ia` sale de Gemini, igual que el proceso manual que ya usa el conductor.

## Goals

- Dejar el panel con los mismos campos: aceptar, distancia, seguridad, inclinación, precio y prioridad.
- Una sola llamada a Gemini por análisis, con el texto OCR y el contexto del conductor (modo, casa, zona prime, zona alejada).
- Si falta la clave, el panel dice que no hay evaluación. No rellena la decisión con Mapbox ni con `zonas.geojson`.

## Decisions

- Rama de trabajo: `google-ia`. `main` no se toca en esta sesión.
- Modelo: Gemini, API de Google. La variable de entorno se define al implementar, cuando la clave exista.
- El resultado no es repetible. Dos análisis del mismo texto pueden diferir.
- Un campo que Gemini no trae queda vacío o en `Sin evaluación`. No se inventa verde, normal, ni un km.
- Aceptar sigue siendo manual.

## Non-goals

Los de `proposal.md`.
