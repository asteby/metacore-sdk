---
"@asteby/metacore-runtime-react": patch
---

Renglones de formularios de acción: cuando la columna `total` es el precio unitario (`price`, `unit_price`…) y el renglón tiene cantidad pero ninguna columna de importe, la fila de total suma cantidad × precio − descuento de cada renglón y ya no los precios sueltos. En la OT de taller, cantidad 2 × 750 mostraba 750 en el total, aunque al guardar quedaba bien (1500). Si hay columna de importe (`subtotal`, `line_total`…), el comportamiento no cambia.
