## Context

Conductor en Medellín. Las ofertas duran segundos. Uber, inDrive y DiDi no comparten API con el conductor: la entrada es una captura. El lector vigente clasifica `uber_sheet`, `indrive_list`, `didi_list` y `didi_modal`.

## Goals

- Guardar el requisito completo sin mezclarlo con lo que `npm test` ya cubre.
- Dejar la captura y el panel para un corte posterior.
- Mantener las reglas de negocio en TypeScript, editables sin recompilar Android.

## Decisions

- Kotlin solo en el teléfono: `MediaProjection`, barra que se oculta antes de la foto, GPS y OCR.
- TypeScript en el Mac para reglas, Google y el panel.
- Geocoding, Routes y Elevation se llaman desde el backend. Una clave de API restringida. El APK no la lleva.
- La ruta sin tráfico entra en el cupo Essentials. Pedir tráfico cambia de categoría.
- inDrive no trae el km del viaje: se calcula con las dos direcciones. Hasta entonces el resultado sigue parcial.
- Si DiDi muestra `1,2x` o `x1,3`, ese recargo ya está en el precio y no se vuelve a endurecer por hora pico.
- Seguridad por zonas que configura el conductor (rojo, amarillo, verde, y por horario). Pendiente por elevación de la ruta, en los dos tramos (GPS a recogida, y recogida a destino).
- Rojo, o inclinación alta, decide No. El conductor acepta a mano en la app de la carrera.

## Non-goals

Los de `proposal.md`. Este diseño no abre un puerto ni entrega una URL.
