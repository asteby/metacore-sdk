# Logos de marcas de vehículo

59 logos (`<slug>.webp`, 128×128, logo contenido con aire uniforme y fondo transparente).

- **Origen:** carpeta `backend/storage/app/public/car_brand_logos` de 7leguas-v2 (commit `a887c5d8`, «logos de carros»). Eran PNG de 115×100. Aquí se recortaron, se centraron en caja cuadrada y se pasaron a WebP.
- **Uso:** son marcas registradas de sus dueños. Sirven solo para identificar con qué vehículo es compatible un producto (uso nominativo). No se alteran ni se usan como marca propia.
- **En la tienda:**
  - Copia los logos con `asteby-vehicle-makes public/vehicle-makes`, en `prebuild` y `predev`.
  - Píntalos con `<VehicleMakeLogo make="Nissan" />` de `@asteby/storefront-react/fitment`.
  - El componente pone cada logo sobre una placa clara en ambos temas, porque buena parte de los logos son negros. Si una marca no tiene logo, muestra sus iniciales.
- **Agregar una marca:**
  1. Pon el archivo `<slug>.webp` normalizado en esta carpeta.
  2. Corre `node scripts/build-vehicle-makes.mjs`.
  3. Si hace falta, agrega un alias en `src/fitment/vehicle-make.ts`.
