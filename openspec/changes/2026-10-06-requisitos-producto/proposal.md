## Why

El corte vigente lee texto, calcula precio por km y muestra el panel local. El resto del requisito (modos, zonas, seguridad, pendiente, mapas, captura en Android y gastos) queda escrito sin presentarse como comportamiento ya cumplido.

## What Changes

- Change `2026-10-06-requisitos-producto` con la capacidad `asistente-conductor`.
- No modifica `lectura-ofertas` ni `decision-precio-km`.
- Esos requisitos se archivan a `specs/` solo cuando haya código y tests.

## Capabilities

### New Capabilities

- `asistente-conductor`: modos, zona prime, horas pico, seguridad, inclinación, Google en el backend, captura Android, vehículo y gastos. Aceptar sigue siendo manual. El panel local ya está en `specs/panel-local`.

### Modified Capabilities

- Ninguna.

## Impact

- El panel local vive en `server/` (`npm start`, http://127.0.0.1:3000).
- Este change no abre otro servicio.

## Non-goals

- Publicar en Play Store. La app Android se instala con APK.
- Aceptar la carrera desde esta app.
- Calcular seguridad o pendiente con un modelo generativo.
- Mostrar el mapa de Google al conductor.
- Gastos, combustible, modos y mapas dentro del corte que ya pasó los tests de lectura.
