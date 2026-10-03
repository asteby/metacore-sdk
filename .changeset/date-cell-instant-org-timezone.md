---
"@asteby/metacore-runtime-react": patch
---

fix(runtime-react): una columna con `display: date` que guarda un INSTANTE (timestamptz, p. ej. `invoice_date`) se pinta en la zona horaria de la organización y no en UTC (PIT-025). Con zona de la org, `formatDateCell` fijaba a UTC toda celda de día, así que una factura de la tarde del 29-sep en México (30-sep 00:41Z) aparecía como «30 de septiembre». Solo `YYYY-MM-DD` o medianoche UTC exacta (`isCalendarDayValue`) se siguen tratando como día de calendario.
