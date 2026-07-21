---
'@asteby/metacore-runtime-react': minor
---

Las opciones del picker de referencias SIEMPRE llevan lead visual. El gate
`optionsHaveVisual` suprimía el avatar de toda la lista cuando ninguna opción
traía imagen/icono/color — un select de almacenes quedaba como texto pelado
mientras el de productos (una opción con foto) mostraba avatares. Ahora cada
opción renderiza su `OptionLead`, que cae a la inicial neutra cuando no hay
imagen, en el dropdown y en el trigger.
