---
"@asteby/metacore-runtime-react": patch
---

El botón de escaneo por cámara en el form declarativo (auto-CRUD) ahora aparece
siempre que el campo declara `scan`, igual que el POS, en vez de esconderse
cuando el navegador no expone `BarcodeDetector`. En escritorio el usuario veía
el icono en el POS pero no al crear un producto (CÓDIGO/SKU) ni en el renglón de
compra; ahora es consistente. El BarcodeScanner ya degrada con un mensaje cuando
no hay soporte de cámara.
