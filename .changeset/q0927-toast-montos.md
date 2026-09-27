---
"@asteby/metacore-notifications": patch
---

El realce de números en toasts y avisos ya no recorta montos: «MX$1,060.00» se mostraba «MX$1,06.00» porque «1,060» se leía como decimal con coma. Solo se abrevia un decimal sin ambigüedad (un separador, sin símbolo de moneda, fracción distinta de 3 dígitos) y ya no se anida el realce de enteros con unidad.
