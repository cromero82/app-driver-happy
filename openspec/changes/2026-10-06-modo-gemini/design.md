## Context

`main` y `google-ia` parten del mismo commit. A partir de ahí divergen. En `main` la seguridad sale de una geometría que cruza la ruta. En `google-ia` sale de Gemini.

## Goals

- Con `compacto` en false, el panel muestra decisión, seguridad, sector, inclinación, tres precios y motivo. Después corre `applyContext`.
- Con `compacto` en true, el panel muestra origen, destino, sector, seguridad e inclinación. No hay precios ni decisión de zona.
- `ocr` remoto manda la imagen en el prompt. `ocr` local transcribe y solo pide la imagen para el campo que falta.
- El panel cuenta el tiempo: uno en remoto, Extracción e IA en local.

## Decisions

- Rama de trabajo: `google-ia`. `main` no adopta este modo.
- Modelo: `gemini-3.8-flash`, luego `gemini-flash-latest`. Clave en `server/.env` como `GEMINI_API_KEY`. No se versiona. `npm start` la lee sola.
- JSON con temperatura 0. `thinkingLevel` `minimal`; si el modelo lo rechaza, `low`; si también lo rechaza, sin esa clave. Tope de salida: 900, 1200 en compacto con imagen, 400 en compacto con texto ya parseado.
- Seguridad e inclinación son obligatorias y se juzgan con los barrios. El sector es el del destino, o el de mayor riesgo. Si el valor no se reconoce, el panel dice `Sin evaluación`.
- Inclinación: muy alta, alta, media o plana. Muy alta decide no. Alta decide negociar. Eso no corre cuando `compacto` es true.
- En local, una dirección que el parser ya escribió no se reemplaza. Si el texto no arma ofertas, la imagen se lee igual que en remoto.
- Aceptar sigue siendo manual.

## Non-goals

Los de `proposal.md`.
