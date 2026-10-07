## ADDED Requirements

### Requirement: Rama de la decisión

`main` SHALL conservar el motor determinístico: geocodificación, ruta y zonas en geometría. `google-ia` SHALL decidir con Gemini. El trabajo de la próxima sesión SHALL ocurrir solo en `google-ia`. MUST NOT portarse este modo a `main` en esa sesión.

#### Scenario: Sesión siguiente
- **WHEN** se implementa el modo Gemini
- **THEN** los cambios quedan en `google-ia` y `main` sigue con el motor determinístico

### Requirement: Decisión de Gemini

Gemini SHALL leer el texto de la captura y el contexto del conductor, y SHALL devolver los campos cortos del panel: decisión, distancia, seguridad, inclinación, precio y prioridad. La misma captura MUST NOT exigir la misma decisión en dos análisis. Un campo ausente en la respuesta SHALL quedar vacío o en `Sin evaluación`. MUST NOT inventarse un kilómetro, un verde ni una inclinación plana.

#### Scenario: Texto ya probado a mano
- **WHEN** el conductor pega una captura que hoy resuelve con Gemini
- **THEN** el panel muestra la decisión de Gemini en los campos cortos

#### Scenario: Respuesta incompleta
- **WHEN** Gemini no trae la seguridad o la inclinación
- **THEN** ese campo queda en `Sin evaluación`

### Requirement: Inclinación

La inclinación SHALL ser `muy_alta`, `alta`, `media` o `plana`. `muy_alta` SHALL decidir `no`. `alta` SHALL decidir `negociar` y MUST NOT decidir `no` por la inclinación sola. `media` y `plana` MUST NOT cambiar la decisión por sí solas.

#### Scenario: Inclinación muy alta
- **WHEN** la inclinación es muy alta y el precio permitiría aceptar
- **THEN** la decisión es `no`

#### Scenario: Inclinación alta
- **WHEN** la inclinación es alta y ninguna otra regla decide `no`
- **THEN** la decisión es `negociar`

### Requirement: Clave pendiente

La clave de la API de Google MUST NOT estar en la página ni en el JSON. Mientras la clave no exista, el panel SHALL decir que no hay evaluación. MUST NOT completarse esa decisión con Mapbox ni con `zonas.geojson`.

#### Scenario: Sin clave
- **WHEN** el backend no tiene la clave de Gemini
- **THEN** no hay decisión tomada por el motor determinístico
