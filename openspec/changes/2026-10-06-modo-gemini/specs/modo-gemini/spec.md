## ADDED Requirements

### Requirement: Rama de la decisión

`main` SHALL conservar el motor determinístico: geocodificación, ruta y zonas en geometría. `google-ia` SHALL decidir con Gemini. MUST NOT portarse este modo a `main`.

#### Scenario: Sesión en google-ia
- **WHEN** se implementa el modo Gemini
- **THEN** los cambios quedan en `google-ia` y `main` sigue con el motor determinístico

### Requirement: Decisión de Gemini

Con `compacto` en false, Gemini SHALL devolver decisión, seguridad, sector, inclinación, tres precios (oferta, justo, extra) y motivo. La misma captura MUST NOT exigir la misma decisión en dos análisis. `muy_alta` SHALL decidir `no`. `alta` SHALL decidir `negociar` y MUST NOT decidir `no` por la inclinación sola. `media` y `plana` MUST NOT cambiar la decisión por sí solas. Después de Gemini, `applyContext` SHALL aplicar modo, zona prime y hora pico.

#### Scenario: Inclinación alta
- **WHEN** la inclinación es alta y ninguna otra regla decide `no`
- **THEN** la decisión es `negociar`

#### Scenario: Inclinación muy alta
- **WHEN** la inclinación es muy alta
- **THEN** la decisión es `no`

### Requirement: OCR local o remoto

`POST /api/analyze` SHALL aceptar `ocr` con valor `local` o `remoto`. Si el campo falta, el valor SHALL ser `remoto`. En remoto, la imagen SHALL ir en el mismo prompt y MUST NOT haber una transcripción previa. En local, el backend SHALL transcribir, parsear y partir las ofertas: las que ya tienen origen y destino van en un JSON con `analizar-ocr` en `no`, sin imagen; las que tienen un campo vacío van en otra petición con la imagen y SHALL completar solo ese campo. MUST NOT reemplazarse un origen o destino que el parser ya escribió. Si el texto local no produce ofertas y hay imagen, el backend SHALL leer la imagen como en remoto.

#### Scenario: Captura remota
- **WHEN** `ocr` es `remoto` y el cuerpo trae una imagen
- **THEN** hay una sola llamada a Gemini y el prompt incluye la imagen y `"ocr":"remoto"`

#### Scenario: Oferta local incompleta
- **WHEN** `ocr` es `local` y una oferta no tiene destino
- **THEN** esa oferta pide la imagen y el prompt trae `"analizar-ocr":"si"`
- **AND** una oferta que ya tiene las dos direcciones no va en esa petición

#### Scenario: Texto local sin ofertas
- **WHEN** `ocr` es `local`, el texto no arma ofertas y hay imagen
- **THEN** Gemini lee origen y destino desde la imagen

### Requirement: Modo compacto

`POST /api/analyze` SHALL aceptar `compacto` `true` o `false`. El valor por defecto SHALL ser `false`. Con `true`, Gemini SHALL devolver origen, destino, sector, seguridad e inclinación. MUST NOT comparar modo ni zona prime. MUST NOT evaluar precios. MUST NOT llamarse `applyContext` ni `decisionForIncline`. La decisión SHALL quedar `parcial` y los precios sugeridos SHALL quedar vacíos. El panel SHALL mostrar origen, destino, sector, seguridad e inclinación.

#### Scenario: Compacto con imagen
- **WHEN** `compacto` es `true` y hay una captura
- **THEN** cada tarjeta trae las dos direcciones, el sector, la seguridad y la inclinación
- **AND** no trae precios sugeridos ni una decisión de aceptar, negociar o no

#### Scenario: Compacto no aplica la zona
- **WHEN** `compacto` es `true` y el destino está fuera de la zona prime
- **THEN** la decisión sigue en `parcial`

### Requirement: Seguridad e inclinación

La inclinación SHALL ser `muy_alta`, `alta`, `media` o `plana`. La seguridad SHALL ser `rojo`, `amarillo` o `verde`. El prompt SHALL pedir ambos campos siempre, juzgados con los barrios de origen y destino. El sector SHALL ser el barrio del destino, o el de mayor riesgo entre los dos. Un valor que trae la palabra del color o de la inclinación SHALL aceptarse aunque venga con más texto. Si el campo falta o no se reconoce, el panel SHALL mostrar `Sin evaluación`.

#### Scenario: Color con barrio
- **WHEN** Gemini responde seguridad `Amarillo (Ciudad Niquia)` e inclinación `Media, subida corta`
- **THEN** el panel muestra Amarillo y Media

#### Scenario: Campo vacío
- **WHEN** Gemini no trae la seguridad o la inclinación
- **THEN** ese campo queda en `Sin evaluación`

### Requirement: Tiempos del panel

El panel SHALL mostrar un tiempo con un decimal para todo el proceso cuando `ocr` es `remoto`, o cuando solo se pulsa Analizar. Con `ocr` en `local` y una imagen, SHALL mostrar dos tiempos: Extracción, desde la lectura de la captura hasta el fin de la transcripción, e IA, durante la llamada a Gemini. Un análisis anidado MUST NOT reiniciar un reloj que ya corre.

#### Scenario: Imagen local
- **WHEN** el conductor carga una imagen con OCR local
- **THEN** al terminar se ven Extracción e IA, cada una con su duración

### Requirement: Llamada a Gemini

La clave SHALL estar solo en `server/.env` como `GEMINI_API_KEY`. MUST NOT ir en la página ni en el JSON. El modelo SHALL ser `gemini-3.8-flash` y, si no existe, `gemini-flash-latest`. El JSON SHALL usar temperatura 0. `thinkingLevel` SHALL empezar en `minimal`. Si el modelo rechaza ese nivel, SHALL reintentarse en `low` y, si también lo rechaza, sin `thinkingConfig`. `maxOutputTokens` SHALL ser 900 en el juicio completo, 1200 cuando compacto lee una imagen y 400 cuando compacto juzga texto ya parseado. Sin clave, MUST NOT completarse la decisión con Mapbox ni con `zonas.geojson`.

#### Scenario: Sin clave
- **WHEN** el backend no tiene `GEMINI_API_KEY`
- **THEN** la decisión no la toma el motor determinístico de `main`

#### Scenario: Nivel de razonamiento rechazado
- **WHEN** el modelo responde 400 porque `minimal` no está soportado
- **THEN** la misma llamada se repite con `thinkingLevel` `low`
