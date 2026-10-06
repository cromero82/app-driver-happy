## Purpose

Panel en el Mac para pegar el texto de una captura, o cargar una de las cuatro pantallas de prueba, y ver la decisión. Sirve en `http://127.0.0.1:3000` con `npm start` dentro de `server/`. No llama a Google ni acepta la carrera.

## Requirements

### Requirement: Página local

`GET /` SHALL devolver la página del asistente. El proceso SHALL escuchar solo en `127.0.0.1`. El puerto por defecto SHALL ser 3000, o el valor de `PORT`.

#### Scenario: Arranque
- **WHEN** se ejecuta `npm start` en `server/` sin `PORT`
- **THEN** la página responde en `http://127.0.0.1:3000`

### Requirement: Capturas de prueba

`GET /api/fixtures` SHALL listar `indrive-uber`, `indrive-lista`, `didi-emergente` y `didi-lista`. `GET /api/fixtures/{id}` SHALL devolver el texto de esa fixture. Un id desconocido SHALL responder 404.

#### Scenario: Cargar la captura mixta
- **WHEN** el cliente pide `/api/fixtures/indrive-uber`
- **THEN** el texto incluye `Aceptar contrato de renta`

### Requirement: Analizar texto

`POST /api/analyze` con JSON `{ "text" }` SHALL responder el mismo resultado que el lector (`screen` y `offers`). Un texto vacío o que no sea JSON SHALL responder 400 y MUST NOT inventar una oferta.

#### Scenario: Hoja Uber
- **WHEN** se envía el texto de `indrive-uber`
- **THEN** la pantalla es `uber_sheet`, hay una oferta de 31039 y la decisión es `aceptar`

#### Scenario: Sin texto
- **WHEN** se envía `{ "text": "   " }`
- **THEN** la respuesta es 400

#### Scenario: Nombre visible en inDrive
- **WHEN** se envía el texto de `indrive-lista`
- **THEN** la primera oferta trae el usuario `Solecito` y el panel lo muestra como Usuario
- **AND** si la pantalla no trae nombre, el campo Usuario no aparece
