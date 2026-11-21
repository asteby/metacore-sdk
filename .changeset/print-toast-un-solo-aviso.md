---
"@asteby/metacore-runtime-react": patch
---

`usePrintDocument`: el aviso «Preparando impresión…» se reemplaza en su lugar (mismo id de sonner) por el de éxito o el de error, en vez de descartarlo y abrir otro al instante. Con un error del servidor se veían los dos avisos encimados durante la animación y el de progreso parecía roto.
