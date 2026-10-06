## Purpose

Cuando inDrive no trae el kilómetro del viaje, el servidor lo completa con una ruta en auto. La clave que manda es `MAPBOX_ACCESS_TOKEN`. Si no está, sigue `OPENROUTESERVICE_API_KEY` y después `GOOGLE_MAPS_API_KEY`. La clave no se envía al navegador. Sin clave, sin red o sin resultado, la decisión sigue parcial. La elevación queda fuera de este corte.

## Requirements

### Requirement: Completar el viaje que falta

Si la oferta no trae km de viaje, tiene origen y destino, y no tiene paradas sin dirección, el servidor SHALL pedir la ruta. Si responde, SHALL guardar ese km, marcarlo como ruta y SHALL recalcular precio por km. Si la pantalla ya trae el km de viaje, MUST NOT pedir la ruta. Si hay paradas sin dirección, MUST NOT pedir la ruta y la decisión SHALL seguir `parcial`.

#### Scenario: inDrive con ruta de 10 km
- **WHEN** la tarjeta de Solecito no trae km de viaje y la ruta responde 10 km
- **THEN** el viaje es 10 km marcado como ruta, el precio por km es 2504, la etiqueta es `justo` y la decisión es `aceptar`

#### Scenario: La ruta no responde
- **WHEN** inDrive no trae km de viaje y la ruta no devuelve distancia
- **THEN** la decisión permanece `parcial` y el km de viaje sigue vacío

#### Scenario: Uber ya trae el viaje
- **WHEN** la hoja Uber trae 8 km de viaje
- **THEN** no se consulta la ruta y el viaje sigue siendo 8 km de la pantalla

### Requirement: Llamada a Google

La geocodificación SHALL restringirse a Colombia y SHALL añadir `Antioquia, Colombia` si la dirección no lo dice. La ruta SHALL ser en auto con preferencia `TRAFFIC_UNAWARE` y SHALL pedir solo `routes.distanceMeters`. Los metros SHALL pasar a km con un decimal. MUST NOT pedirse tráfico en vivo.

#### Scenario: Dirección corta
- **WHEN** el origen es una dirección sin la palabra Colombia
- **THEN** la geocodificación incluye Antioquia, Colombia y `country:CO`

#### Scenario: Sin coordenadas
- **WHEN** la geocodificación no devuelve resultados
- **THEN** no se llama a la ruta y el km queda vacío

### Requirement: Mapbox

Si existe `MAPBOX_ACCESS_TOKEN`, el servidor SHALL geocodificar y pedir la ruta en `api.mapbox.com`, limitado a Colombia y en auto. SHALL preferir este token aunque también existan las claves de OpenRouteService o Google. El token MUST NOT ir en la página.

#### Scenario: Token de Mapbox presente
- **WHEN** están definidos `MAPBOX_ACCESS_TOKEN` y `OPENROUTESERVICE_API_KEY`
- **THEN** la ruta sale de Mapbox

#### Scenario: Placa con la vía renombrada
- **WHEN** el origen es `Cra. 48 # 14 - 135 (El Poblado)` y Mapbox responde `Avenida Industriales 14-135` en Medellín
- **THEN** esa placa cuenta como coordenada
- **AND** si `Calle 63ag` no aparece en Mapbox, la búsqueda sigue en el callejero abierto del barrio

### Requirement: OpenRouteService

Si existe `OPENROUTESERVICE_API_KEY`, el servidor SHALL geocodificar en `api.heigit.org` limitado a Colombia y SHALL pedir la ruta `driving-car`. Las coordenadas de la ruta SHALL ir en orden longitud, latitud. MUST NOT usar esa clave contra Google.

#### Scenario: Clave gratuita presente
- **WHEN** están definidas `OPENROUTESERVICE_API_KEY` y `GOOGLE_MAPS_API_KEY`
- **THEN** la ruta sale de OpenRouteService

#### Scenario: Dirección sin resultado
- **WHEN** OpenRouteService no devuelve coordenadas
- **THEN** no se pide la ruta y el km queda vacío

#### Scenario: Conjunto con la calle entre paréntesis
- **WHEN** el origen es `Urbanización Salento (Calle 7 Sur, El Poblado, Medellín, Antioquia)`
- **THEN** la geocodificación usa la calle y Medellín, no el nombre del conjunto
- **AND** un resultado cuyo nivel es solo el departamento no cuenta como coordenada

#### Scenario: La calle y el municipio mandan
- **WHEN** el origen es `Edificio San Luis (Calle 61 Sur, Alto Las Flores, Sabaneta, Antioquia)`
- **THEN** la búsqueda es `Calle 61 Sur` en Sabaneta, no un número 61 en Medellín
- **AND** `Entrada desde el Calle 10` no se usa como dirección de la Terminal del Sur

### Requirement: Clave solo en el servidor

Sin `OPENROUTESERVICE_API_KEY` ni `GOOGLE_MAPS_API_KEY`, el panel SHALL seguir mostrando el viaje vacío en inDrive. Ninguna clave MUST aparecer en la página ni en el JSON de la decisión.

#### Scenario: Arranque sin clave
- **WHEN** se ejecuta `npm start` sin esas dos variables
- **THEN** inDrive permanece `parcial` por falta del km de viaje
