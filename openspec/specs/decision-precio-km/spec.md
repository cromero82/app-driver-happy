## Purpose

Decidir Aceptar, Negociar o resultado parcial solo con los kilómetros que vienen en la pantalla. No usa mapas. Umbrales de Medellín en `server/src/thresholds.ts`: negociar por debajo de 2000 COP/km; óptimo desde 3500; justo en medio. El código vive en `server/src/decide.ts`.

## Requirements

### Requirement: Precio por kilómetro

Si la recogida y el viaje están en kilómetros y no hay paradas sin dirección, el sistema SHALL calcular `precio / (recogida + viaje)`, redondeado al peso. SHALL etiquetar `oferta` si queda bajo 2000, `justo` desde 2000 y menor que 3500, y `optimo` desde 3500.

`oferta` SHALL decidir `negociar`. `justo` y `optimo` SHALL decidir `aceptar`.

#### Scenario: Uber por encima de 3500
- **WHEN** el precio es 31039 y los tramos son 0.1 km y 8 km
- **THEN** el precio por km es 3832, la etiqueta es `optimo` y la decisión es `aceptar`

#### Scenario: DiDi entre 2000 y 3500
- **WHEN** el precio es 23300 y los tramos son 1.1 km y 9.8 km
- **THEN** el precio por km es 2138, la etiqueta es `justo` y la decisión es `aceptar`

#### Scenario: DiDi por debajo de 2000
- **WHEN** el precio es 22300 y los tramos son 2.9 km y 12.2 km
- **THEN** el precio por km es 1477, la etiqueta es `oferta` y la decisión es `negociar`

### Requirement: Resultado parcial sin inventar

Si falta el km del viaje, falta el km de recogida, o hay paradas sin dirección, la decisión SHALL ser `parcial`. El precio por km y la etiqueta de precio SHALL quedar vacíos. MUST NOT estimarse el tramo que falta.

#### Scenario: inDrive sin km de viaje
- **WHEN** la tarjeta trae recogida y no trae km de viaje
- **THEN** la decisión es `parcial` y el precio por km es nulo

#### Scenario: DiDi con paradas sin dirección
- **WHEN** la tarjeta trae ambos kilómetros y `2 parada(s)` sin direcciones
- **THEN** la decisión es `parcial`, el precio por km es nulo y el motivo indica paradas sin dirección

### Requirement: Umbrales en configuración

Los cortes 2000 y 3500 y la ciudad `Medellin` SHALL leerse de `server/src/thresholds.ts`. Cambiar el criterio de Negociar MUST NOT exigir cambiar el lector de pantallas.

#### Scenario: Cortes de Medellín
- **WHEN** se evalúa una oferta con la configuración vigente
- **THEN** por debajo de 2000 COP/km la etiqueta es `oferta`, desde 3500 es `optimo`, y la ciudad de la config es `Medellin`
