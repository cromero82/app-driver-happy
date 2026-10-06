
# asistenter driver
- este proyecto busca ayudar a un conductor de pasajeros a traves de apps como uber, indrive a filtrar viajes.
- se define una ciudad de origen: Medellin (Antioquia-Colombia), es la ciudad por defecto (podria cambiar en el futuro)
- debe tener los siguientes campos: 
  - aceptar:Si | No, 
  - distancia (en kms): ini - fin (significa, la distancia desde donde estoy hasta el punto de recogida y luego al destino de la carrera, ejemplo. 
  - distancia: 1.5 - 5 (significa 1.5 kms para recoger el pasajero y luego 5 km de recorrido)), 
  - seguridad: Rojo, Amarillo, Verde (Inseguro, Medio, OK), 
  - Inclinacion: Muy alto, Alto, media, Normal. Es decir durante el recorrido (ir al punto de origen y llevar al punto de destino) se encuentren trayectos con lomas o pendientes con muy alto, alto, medio o bajo grado de inclinacion.
  - Precio: Oferta, Justo, Optimo.

## campos o datos adicionales
- prioridad: significa que un servicio tiene mayor prioridad (sobre otros). con siguiente formato: alta (motivo), ejemplo: Alta (Retorno a casa)
- casa: es la direccion o zona donde queda mi casa
- zona prime: es la direccion o zona donde quedan las mejores carreras, el objetivo es establecerme alli para obtener carreras con mas ganancias. especialmente es una zona contigua de la cual no quiero salir. la zona prime suele ser de 2 tipos: zonas conjuntas o zona alejada. 
- retorno: estoy interesado en volver a casa. si estoy lejos de casa, la idea es darle prioridad (prioridad alta) a ese servicio ya que es conveniente volver a casa con cupo (servicio)
- campo: ubicacion actual. debe por gps acceder a la ubicacion actual. 
- campo vehiculo: es el vehiculo, modelo, marca, con las especificacines de motor, cilindrada, la idea es usarlo para calcular coheficiente o valor promedio de consumo de combustible, campo: km/galon. tratare de registrar fecha de tanqueo, valor. y agregar algun campo para detterminar en un dia, cuanto ingreso y cuanto gaste de combustible. 
- campo otros egresos: tipo refrigerio, campo mantenimiento: "cambio de llantas", "cambio de aceite" y otro campo egresos fijos (o algo similiar), lavado, polichado, etc.

## Modos
- existen los siguientes modos o status:
  - saliendo: significa que estoy en casa (o cerca) y hay un servicio cercano a la zona (zona prime)
  - en zona prime: significa que solo aceptare carreras que esten en zona prime, ejemplo: poblado, belen, envigado, itagui, sabaneta (generar estos valores por defecto), solo me movere en esa area, el campo de zonas primes pueden ser un arreglo de ubicaciones, barrios o localidades donde un segundo item es una zona prime que no es contigua.
  - retornando: significa que sin importar el sitio donde me encuentre, requiero una carrera algo cercana al sitio donde vivo. 

## aspectos para toma de desiciones
- si seguridad es: Rojo o grado de inclinacion es: Alta, entonces, campo: aceptar: No.
- aceptar: Negociar. si el precio por km es bajo. entonces debe aparecer esa opcion.
- horas pico. en horas pico se debe endurecer el campo: aceptar > (negociar) para apps que no dan un recargo por hora pico (ejemplo Uber si lo hace, no hay problema, pero apps como didi e indrive no lo hacen)

## Funcionamiento de la app
- como el proceso de ofrecer y aceptar un servicio es rapido (se oferta el servicio para todos los carros abonados a la app) y el primero que acepta se queda con el servicio, se requiere:
  - velocidad en el analisis de la informacion (ia o servicio que calcule lo anterior)
  - si se requiere pagar ia, ojala optimizar que lo haga rapido y que no cueste tanto al mes.
  - la app requiere gps (acceso) para sus funciones
  - puede ser una app web (inicialmente), planeo usar una app que al conectar el celular (android inicialmente) muestre lo que este en pantalla en el escritorio del laptop (mac os) y la app que estaria ejecutandose en una zona secundaria de la pantalla: tendria un boton "capturar" | "analizar", el cual tomaria una captura, se la enviaria a la app (aqui el tema de la integracion con servicio parar extraer la data, estas capturas son: listados de indrive, la captura de uber, o la captura de Didi) alli se extrae direccion de origen y destino, y la oferta y el nombre de referencia del usuario, luego esta informacion se envia a la ia o servicio que me evaluae esto y asi ya sea por ia o por logica de calculo, dar el resultado (campos del asistente. aceptar, distancia, inclinacion...precio)
- la aplicacin deberia ir guardando trayectos, y sacar campos como: distancia recorrido, si confirmo carreras en ella, ir guardando ganancias.

## implementacion.
- la idea es implementarlo: mobil + laptop conectados, y en una segunda version, dejarlo como una app en el celular (hibrida o alguna forma de instalarlo en el mobil) no pretendo subirlo a la store (generar apk y ejecutar con permisos de desarrollador o algo similar)
- hagamos el analisis de servicios requeridos, mensualidades para que la respuesta sea lo mas rapida posible y luego como afectaria si utilizo servicios gratuitos (pero de optimo tiempo de respuesta)
