## Purpose

Leer el texto de una captura y devolver las ofertas, sin mezclar apps ni inventar campos. Ciudad de referencia: Medellín. El código vive en `server/src/parse.ts`. Lo prueban las cuatro fixtures de `server/test/fixtures/`.

## Requirements

### Requirement: Prioridad de la hoja Uber

Si el texto contiene `Aceptar contrato de renta` o `COP/km est.`, la pantalla SHALL clasificarse como `uber_sheet`. SHALL devolverse una sola oferta Uber. Las tarjetas inDrive del fondo MUST NOT entrar en el resultado.

#### Scenario: inDrive de fondo y hoja Uber
- **WHEN** el texto trae tarjetas `COL$` y además `31.039 COP` con `Aceptar contrato de renta`
- **THEN** hay una oferta, app `uber`, precio 31039, recogida 0.1 km, viaje 8 km, origen con Puerta del Norte y destino con 12 de Octubre
- **AND** el resultado no incluye a Yolanda ni precios `COL$`

### Requirement: Lista inDrive

Si no hay ancla Uber y el texto tiene `COL$` y `Precio justo`, la pantalla SHALL clasificarse como `indrive_list`. Cada bloque que empieza en `~km` SHALL ser una tarjeta. `Precio justo` MUST NOT copiarse al campo Precio del asistente. El `~km` SHALL ser la recogida. El km del viaje SHALL quedar vacío. La línea `N seg` o `N min` bajo el nombre SHALL guardarse como edad de la oferta, no como tiempo de ruta.

#### Scenario: Cuatro tarjetas limpias
- **WHEN** el texto es la lista inDrive sin hoja de otra app
- **THEN** hay cuatro ofertas con precios 33300, 27500, 12000 y 28400, recogidas 3.3, 5.4, 6.7 y 6.9 km, y nombres Solecito, Sandra, Hernando y sara
- **AND** en las cuatro el viaje es nulo y la distancia queda incompleta

### Requirement: DiDi emergente sin mapa

Si no hay ancla Uber ni `Centro de solicitudes`, y el texto tiene `Pon Tu Precio`, la pantalla SHALL clasificarse como `didi_modal`. El texto anterior a `Pon Tu Precio` (mapa) MUST NOT usarse como origen ni destino.

#### Scenario: Mapa encima de la hoja
- **WHEN** el texto incluye Copacabana, PARIS y Guarne antes de `Pon Tu Precio`, y la hoja muestra `$23.300`
- **THEN** hay una oferta DiDi de 23300, recargo 1.2, recogida 1.1 km, viaje 9.8 km, contraofertas 23900, 24500 y 25100
- **AND** origen y destino no contienen Copacabana, PARIS ni Guarne

### Requirement: Lista DiDi

Si el texto contiene `Centro de solicitudes`, la pantalla SHALL clasificarse como `didi_list` aunque una tarjeta diga `Pon Tu Precio`. Cada tarjeta SHALL terminar en el botón `Aceptar`. El precio SHALL ser el `$` de la cabecera de esa tarjeta. Un monto dentro de la dirección MUST NOT ser el precio. `N parada(s)` sin direcciones de parada SHALL marcar la distancia incompleta. `No hay más solicitudes` MUST NOT ser una oferta.

#### Scenario: Paradas y monto dentro del destino
- **WHEN** la lista tiene `$17.700` con `2 parada(s)` y `$22.300` cuyo destino incluye `12.500 COP`
- **THEN** hay dos ofertas, 17700 y 22300
- **AND** la de 17700 tiene 2 paradas sin dirección, recargo 1.3 y distancia incompleta
- **AND** la de 22300 conserva `12.500 COP` solo dentro del destino, con recogida 2.9 km y viaje 12.2 km

### Requirement: Separadores de dinero y de kilómetros

Un monto (`COL$12,700`, `$23.300`, `31.039 COP`) SHALL interpretar el separador como miles y SHALL quedar en pesos enteros. Un número junto a `km` SHALL interpretar el separador como decimal.

#### Scenario: Los tres formatos de la captura
- **WHEN** aparecen `COL$12,700`, `$23.300` y `31.039 COP`
- **THEN** los valores son 12700, 23300 y 31039

### Requirement: Chrome que no es oferta

La barra de hora, `Ocupado`, `Libre`, `Establecer tarifas`, el aviso de otras tarifas, la pastilla `Uber`, las pestañas Solicitudes / Demanda / Desempeño / Cartera, `Rechazo permitido` y `No hay más solicitudes` MUST NOT convertirse en dirección, nombre ni precio.

#### Scenario: Pestañas de inDrive bajo la última tarjeta
- **WHEN** el texto de la lista inDrive termina en Solicitudes de viaje, Demanda, Desempeño y Cartera
- **THEN** ninguna oferta usa ese texto como destino ni como nombre
