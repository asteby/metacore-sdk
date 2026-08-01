---
'@asteby/metacore-ui': minor
---

DatePicker: permitir fechas futuras y aceptar `disabled` / `className`

El componente tenía cableado `date > new Date()`, así que bloqueaba TODO el futuro y rompía cualquier campo de fecha prospectiva ("Fecha esperada" de una orden de compra, un vencimiento, una cita). El default pasa a ser solo la cota inferior de 1900; quien quiera un campo solo-pasado (cumpleaños) pasa su propio matcher vía `disabled`. `className` se aplica al botón del trigger para poder soltar el ancho fijo de 240px (p. ej. `w-full`).
