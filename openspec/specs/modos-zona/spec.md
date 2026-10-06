## Purpose

El panel aplica el modo del conductor, la zona prime, la seguridad configurada y la hora pico. La inclinación no se inventa: queda vacía hasta la elevación de la ruta.

## Requirements

### Requirement: Modo y zona prime

El conductor SHALL elegir `saliendo`, `en zona prime` o `retornando`. Las zonas juntas iniciales SHALL ser Poblado, Belén, Envigado, Itagüí y Sabaneta. SHALL existir una lista aparte de zona alejada. En `en zona prime`, si el destino queda fuera de esas listas, o la carrera salta de la zona junta a la alejada, la decisión SHALL ser `no`. En `saliendo`, un destino dentro de la zona prime SHALL marcar prioridad `Alta (Zona prime)`. En `retornando`, un destino que menciona la casa SHALL marcar `Alta (Retorno a casa)`.

#### Scenario: Destino fuera de la zona prime
- **WHEN** el modo es `en zona prime` y el destino es Nazaret
- **THEN** la decisión es `no` por zona

#### Scenario: Retorno a casa
- **WHEN** el modo es `retornando`, la casa es Sabaneta y el destino menciona Sabaneta
- **THEN** la prioridad es `Alta (Retorno a casa)`

### Requirement: Seguridad por geometría

La seguridad MUST NOT salir del nombre del barrio. Solo una zona con `activo` verdadero, modo `operativa` o sin modo, geometría válida y `seguridad` escrita SHALL poder cambiar la decisión. Si es un punto, MUST tener `radioMetros` mayor que cero. Rojo en la ruta de recogida a destino SHALL decidir `no`. Amarillo MUST NOT forzar `no`. Si no hay cruce, la seguridad SHALL mostrarse como `Sin evaluación`. MUST NOT mostrarse verde por ausencia de datos.

#### Scenario: Referencia que no opera
- **WHEN** el archivo trae La Candelaria como `referencia_no_operativa` y la ruta es Niquía a 12 de Octubre
- **THEN** la seguridad queda en `Sin evaluación` y la decisión de precio no cambia

#### Scenario: Polígono rojo
- **WHEN** una zona operativa y activa, roja, cruza la ruta
- **THEN** la seguridad es rojo y la decisión es `no`

#### Scenario: Carrera 29 con Calle 107
- **WHEN** el destino es Carrera 29 con Calle 107, Medellín, y la ruta entra en el punto operativo de Santo Domingo Savio
- **THEN** la seguridad es rojo, la decisión es `no` y el motivo es `Zona roja: Santo Domingo Savio`

### Requirement: Hora pico

De lunes a viernes, de 06:00 a 09:00 y de 17:00 a 20:00, hora de Bogotá, una decisión `aceptar` de inDrive o DiDi SHALL pasar a `negociar` si la pantalla no muestra recargo. Uber, o un factor ya visible, MUST NOT recibir un segundo endurecimiento. Fuera de ese horario la decisión de precio SHALL quedar igual.

#### Scenario: Recargo ya visible
- **WHEN** DiDi muestra un factor `1,3` a las 18:00 de un martes
- **THEN** la decisión no cambia por hora pico

### Requirement: Inclinación registrada

La inclinación MUST NOT inventarse por elevación ni por el nombre del barrio. Solo una zona operativa con `pendiente` escrita, cuya geometría cruza la ruta, SHALL fijarla. `alta` o `muy_alta` SHALL decidir `no`. Si no hay esa zona, la inclinación SHALL mostrarse como `Sin evaluación`.

#### Scenario: Sin pendiente medida
- **WHEN** ninguna zona operativa cruza la ruta
- **THEN** la inclinación queda en `Sin evaluación`
