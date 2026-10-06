## Why

El corte vigente solo lee texto y calcula precio por km. El requisito del conductor (modos, zonas, seguridad, pendiente, mapas, captura en Android y panel) tiene que quedar escrito sin presentarse como comportamiento ya cumplido.

## What Changes

- Change `2026-10-06-requisitos-producto` con la capacidad `asistente-conductor`.
- No modifica `lectura-ofertas` ni `decision-precio-km`.
- Esos requisitos se archivan a `specs/` solo cuando haya código y tests.

## Capabilities

### New Capabilities

- `asistente-conductor`: modos, zona prime, horas pico, seguridad, inclinación, Google en el backend, captura Android, panel en el Mac, vehículo y gastos. Aceptar sigue siendo manual.

### Modified Capabilities

- Ninguna.

## Impact

- Aún no hay archivos de producto fuera de `server/` (lector y tests).
- No hay proceso HTTP ni URL.

## Non-goals

- Publicar en Play Store. La app Android se instala con APK.
- Aceptar la carrera desde esta app.
- Calcular seguridad o pendiente con un modelo generativo.
- Mostrar el mapa de Google al conductor.
- Gastos, combustible, modos y mapas dentro del corte que ya pasó los tests de lectura.
