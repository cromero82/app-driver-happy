## ADDED Requirements

### Requirement: Ciudad y campos del asistente

La ciudad por defecto SHALL ser Medellín. Cada oferta evaluada SHALL poder mostrar aceptar (`aceptar`, `no`, `negociar` o `parcial`), distancia recogida y viaje, seguridad (rojo, amarillo, verde), inclinación (muy alta, alta, media, normal), precio (`oferta`, `justo`, `optimo`) y prioridad con motivo, por ejemplo `Alta (Retorno a casa)`.

#### Scenario: Campos pedidos en el requisito
- **WHEN** se consulta el contrato del asistente
- **THEN** esos campos están definidos y la ciudad base es Medellín

### Requirement: Modos y zona prime

El conductor SHALL poder estar en `saliendo`, `en zona prime` o `retornando`. En zona prime SHALL aceptarse solo carreras dentro del arreglo de zonas. SHALL existir zona contigua y zona alejada. Los valores iniciales SHALL ser Poblado, Belén, Envigado, Itagüí y Sabaneta. `retornando` SHALL subir la prioridad de una carrera hacia la casa. `saliendo` SHALL favorecer un servicio cerca de la zona prime cuando el conductor está en casa o cerca.

#### Scenario: Modo en zona prime
- **WHEN** el modo es `en zona prime` y el destino queda fuera del arreglo
- **THEN** esa carrera no se acepta por zona

#### Scenario: Retorno a casa
- **WHEN** el modo es `retornando` y el destino queda hacia la casa
- **THEN** la prioridad es alta e indica retorno a casa

### Requirement: Seguridad e inclinación

Seguridad roja, o inclinación alta o muy alta, SHALL decidir `no`. La seguridad SHALL salir de zonas configuradas por el conductor, con nivel distinto de día y de noche, y SHALL presentarse como configuración, no como garantía. La inclinación SHALL calcularse con la elevación de la ruta en los dos tramos. En `main`, MUST NOT usarse un modelo generativo para seguridad ni para pendiente. En `google-ia`, Gemini SHALL decidir; ese contrato está en `openspec/changes/2026-10-06-modo-gemini/`.

#### Scenario: Zona roja
- **WHEN** la zona configurada es roja
- **THEN** la decisión es `no`

### Requirement: Hora pico

Si la pantalla no muestra recargo y el reloj está en hora pico, la decisión SHALL endurecerse hacia `negociar`. Si el factor ya está visible (`1,2x`, `x1,3` u otro), MUST NOT aplicarse un segundo endurecimiento.

#### Scenario: Recargo ya visible
- **WHEN** DiDi muestra `x1,3` en hora pico
- **THEN** no se aplica otro ajuste de hora pico encima de ese factor

### Requirement: Elevación en el backend

La inclinación SHALL calcularse con la elevación de la ruta en el servidor. El APK MUST NOT incluir la clave de Google. MUST NOT pedirse al conductor que inicie sesión con Google. Si no hay red, MUST NOT inventarse la pendiente.

#### Scenario: Sin red
- **WHEN** no hay respuesta de elevación
- **THEN** no se inventa la inclinación

### Requirement: Captura en Android

La captura SHALL usar `MediaProjection` con permiso explícito del conductor. La barra de esta app SHALL ocultarse, SHALL esperarse un frame, y después SHALL tomarse la imagen. El conductor SHALL aceptar o rechazar en Uber, inDrive o DiDi. Esta app MUST NOT aceptar la carrera. La instalación prevista SHALL ser APK, sin Play Store.

#### Scenario: Barra propia visible
- **WHEN** el conductor pulsa capturar y la barra de botones está en pantalla
- **THEN** la barra se oculta antes de la imagen y no entra al OCR

### Requirement: Vehículo y gastos

El vehículo SHALL guardar marca, modelo y cilindrada para un coeficiente km/galón. SHALL poder registrarse tanqueo (fecha y valor), ingreso del día frente a combustible, refrigerio, mantenimiento (llantas, aceite) y egresos fijos (lavado, polichado). El historial SHALL guardar trayecto, distancia, carrera confirmada a mano y ganancia.

#### Scenario: Confirmación de la carrera
- **WHEN** el conductor no confirma la carrera en el asistente
- **THEN** no se suma como ganancia realizada
