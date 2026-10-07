## 1. Sesión en google-ia

- [x] 1.1 Confirmar que la sesión está en `google-ia` y no edita `main`.
- [x] 1.2 Llamar a Gemini con el texto OCR y el contexto del conductor.
- [x] 1.3 Mostrar en el panel los campos cortos que Gemini devuelva.
- [x] 1.4 Sin clave, mostrar que no hay evaluación y no usar el motor de `main`.
- [x] 1.5 Dejar la clave solo en el backend, en `server/.env`.

## 2. OCR y compacto

- [x] 2.1 `ocr` `local` o `remoto`, por defecto `remoto`. En remoto la imagen va en el prompt.
- [x] 2.2 En local, las ofertas completas no vuelven a la imagen. La imagen completa solo el campo vacío.
- [x] 2.3 `compacto` `true` o `false`, por defecto `false`. En true no hay modo, zona ni precios.
- [x] 2.4 En compacto la tarjeta muestra origen, destino, sector, seguridad e inclinación.
- [x] 2.5 Seguridad e inclinación son obligatorias. El sector sale del destino o del barrio de mayor riesgo.
- [x] 2.6 Un tiempo en remoto. En local, Extracción e IA.
- [x] 2.7 `thinkingLevel` `minimal`, y `low` si el modelo lo rechaza.
