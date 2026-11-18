# ADR 0003 (SDK): reglas de arquitectura de la plataforma (norma verificable para kernel, SDK, Ops y addons)

- Estado: **propuesto** (solo documentación; sin código en este cambio).
- Fecha: 2026-11-18
- Alcance: kernel, SDK (`@asteby/metacore-*`, `packages/sdk`), Ops (shell y features) y todos los addons (`hub_fleet` incluido).
- Relacionados: ADR 0001 de este repo (genui como capa declarativa única), ADR 0002 de este repo (páginas declaradas en el manifiesto, `block@n`, `page@1`; **este ADR es su marco normativo**), kernel ADR 0004 (query batch v2, `q:caps`), y el plan de implementación `plan-paginas-declarativas.md` (base de las fases del ADR 0002).
- Origen: **regla de arquitectura dictada por el dueño del producto**. No es una preferencia de diseño ni un default recomendado: es una norma. Lo único abierto es *cómo se hace cumplir* (sección 6).
- Convención de evidencia: **[V]** observado en producción/código; **[P]** propuesto, aún no existe.

## 1. Contexto y motivación

La plataforma crece por addons y por industrias. Cada vez que el shell o el core "sabe" algo de un addon, de una vertical o de un tenant concreto, el costo se paga después: pantallas vacías, comportamientos que dependen del caché, parches al core por cada addon nuevo. Casos reales ya observados:

1. **Secciones hardcodeadas en el shell de Ops [V].** «Empresas y grupos» y «Resumen» están escritas a mano en el shell. Con una sola razón social salen **vacías**: el shell asume una estructura multi-empresa que el tenant no tiene. La entrada de menú existe aunque no haya nada que mostrar.
2. **Misma URL, dos vistas [V].** Según el estado del caché, la misma URL se ve como tabla o como kanban. La elección del renderer depende de un estado ajeno a la declaración.
3. **`view_type` por modelo, «último gana» [V].** El tipo de vista se guarda por modelo, no por página; cuando dos contribuciones lo fijan, gana la última en cargar. Es resolución por orden de ejecución, no por contrato (ver ADR 0002, sección 1.2).
4. **Razones sociales sin primitivo propio [V].** La entidad legal (razón social) se modela ad hoc en cada lugar que la necesita, con su propio vocabulario, en vez de ser un primitivo compartido expuesto en `ctx.org`.

Causa común: **el shell decide en código lo que debería decidir una declaración**, y las piezas se construyen sueltas en vez de componerse desde primitivos.

## 2. Decisión: las seis reglas

### Regla 1. Nada hardcodeado en el shell/core
Navegación, vistas, condiciones de visibilidad y vocabulario por industria **vienen de contribuciones declaradas** (manifiestos y registros), nunca de condicionales en el shell. Toda contribución que pueda no aplicar declara su condición con `when(ctx)` (código) o `visible_when` (manifiesto, serializable). El shell solo ensambla lo que los registros le entregan.

### Regla 2. Primitivos reutilizables encadenados
Todo se estructura como **primitivo → bloque → página → addon**. Cada nivel solo compone el nivel inferior. Si un patrón aparece **3 o más veces**, se **promueve a primitivo** en kernel/SDK en el mismo ciclo en que aparece la tercera copia (no después).

### Regla 3. Extensión por contratos versionados
Los addons extienden mediante **contratos versionados**: registro de renderers, bloques custom `block@n`, contribuciones declaradas y eventos. **Nunca** parchando el core, ni importando internos del shell, ni dependiendo del orden de carga. Un cambio incompatible sube la versión del contrato (`block@2`); no modifica `block@1`.

### Regla 4. Componentes, datos y eventos compartidos y tipados
Un solo bus de eventos tipado, un solo contexto de página (`page@1`) y un solo contexto de organización (`ctx.org`). Componentes y estructuras de datos compartidos viven en SDK/kernel con tipos; **cero duplicación** entre addons o entre Ops y addons. Los eventos se declaran (nombre, payload tipado, quién emite, quién consume).

### Regla 5. Una pieza solo existe si funciona y tiene contenido para ese tenant
Una entrada de menú sin función, o que sale vacía para el tenant, es un **defecto de diseño**, no un bug de datos. Cada contribución declara **en una línea** qué hace y su condición de visibilidad, y **tiene pruebas** (como mínimo: visible cuando aplica, ausente cuando no).

### Regla 6. Multiindustria
El core no asume ninguna vertical (retail/MX, gobierno, salud, manufactura…). Vocabulario ("cliente", "paciente", "ciudadano", "orden"), niveles jerárquicos y entidades son **configurables** por tenant/industria vía contribuciones, no constantes del core.

## 3. Consecuencias

Positivas:
- Casos como «Empresas y grupos» vacío desaparecen por construcción: sin datos o sin condición, la entrada no se contribuye.
- Un addon nuevo o una vertical nueva no requiere tocar el shell.
- La resolución es determinista: misma URL ⇒ mismo renderer, independiente del caché o del orden de carga.
- Menos duplicación; la revisión de PRs es más mecánica (checklist, sección 4).

Costos:
- Hay que construir y mantener registros, manifiestos y contratos versionados antes de entregar la pantalla "rápida".
- Migrar lo existente (nav y secciones del shell de Ops, `view_type` por modelo) es trabajo explícito; se hace por fases según el ADR 0002 y el plan de páginas declarativas.
- Más disciplina de versionado: cada contrato público requiere compatibilidad y pruebas.
- Promover a primitivo en la tercera repetición puede exigir refactorizar las dos primeras copias; se acepta.

Excepciones: no hay excepciones por addon o por cliente. Un caso que "no cabe" en los contratos es una solicitud para ampliar el contrato (nueva versión), no para saltárselo.

## 4. Checklist de revisión (se aplica a cada PR; revisor humano o agente)

Cada ítem se responde Sí/No/N-A con evidencia (archivo o prueba). Un resultado que viole la regla bloquea el merge, salvo que el mismo PR amplíe el contrato.

1. **Shell limpio.** ¿Hay condicionales por addon, tenant o industria (`if addon === ...`, `if industry === ...`) en el shell/core? Debe ser No.
2. **Nav y vistas declaradas.** ¿Toda entrada de nav, ruta o vista nueva viene de un manifiesto/registro y no de una lista escrita en el shell?
3. **Condición explícita.** ¿Toda contribución que puede no aplicar declara `when(ctx)` / `visible_when`?
4. **No vacía.** ¿La contribución tiene contenido y función para un tenant mínimo (p. ej. una sola razón social, sin datos)? ¿Se oculta si no?
5. **Una línea.** ¿La contribución declara en una línea qué hace y cuándo aparece (campo `description`)?
6. **Primitivos.** ¿El patrón que se introduce ya existe como primitivo/bloque? ¿Aparece por 3.ª vez y no se promovió?
7. **Cadena de composición.** ¿Respeta primitivo → bloque → página → addon, sin saltarse niveles ni importar internos de un nivel superior?
8. **Contrato versionado.** ¿Se extiende vía registro de renderers, `block@n`, contribución o evento versionado, sin parchar el core? ¿Un cambio incompatible sube la versión?
9. **Eventos.** ¿Qué evento comparte o consume? ¿Está declarado y tipado en el bus compartido, y no es un evento ad hoc ni un acoplamiento directo?
10. **Contexto compartido.** ¿Lee de `ctx.org` / `page@1` en vez de recalcular o duplicar estado (razón social, tenant, filtros)?
11. **Determinismo.** ¿La misma URL/declaración produce siempre el mismo renderer, sin depender de caché, "último gana" u orden de carga?
12. **Pruebas.** ¿Hay pruebas del contrato (visible/oculta, renderer resuelto, payload del evento) y no solo del componente?
13. **Multiindustria.** ¿Hay vocabulario o supuestos de una vertical (MX, retail, etc.) literales en el core o en componentes compartidos? Debe ser No.

## 5. Anti-patrones (con ejemplo)

| Anti-patrón | Ejemplo | Corrección |
|---|---|---|
| Nav hardcodeada en el shell | Sección «Empresas y grupos» escrita en el sidebar de Ops; vacía con una sola razón social | El registro contribuye la entrada con `visible_when` sobre `ctx.org` (p. ej. más de una razón social) |
| Condicional por addon en el core | `if (addon === 'hub_fleet') showFleetTab()` en el shell | Contribución declarada de `hub_fleet` a un slot, con su `when(ctx)` |
| «Último gana» | `view_type` del modelo sobrescrito por la última contribución | El renderer se resuelve por la página declarada, un solo dueño por URL |
| Estado oculto decide la vista | Tabla o kanban según caché para la misma URL | La vista forma parte de la declaración de la página; el caché no la decide |
| Patrón copiado 3+ veces | Tres addons con su propia tarjeta de razón social | Primitivo compartido de razón social en kernel/SDK, expuesto en `ctx.org` |
| Parchar el core | Addon que monkey-patchea el renderer de tabla | Registrar un renderer en el registro, o un bloque `block@n` |
| Evento ad hoc | `window.dispatchEvent` con nombre y payload libres para avisar un cambio | Evento declarado y tipado en el bus compartido |
| Vocabulario fijo de una vertical | Etiqueta literal «RFC» o «Cliente» en el core | Vocabulario configurable por industria vía contribución |
| Entrada sin función | Item de menú «Resumen» sin contenido para el tenant | No se contribuye si no aplica (regla 5) |

## 6. Cómo se hace cumplir

La checklist es el control humano. Estos son los controles automáticos **propuestos** [P]; cada uno se implementa en su propio PR y no bloquea este ADR:

1. **Test de integridad de nav (CI).** Para un conjunto de tenants de prueba (una sola razón social, sin datos, multi-empresa, distintas industrias), construye el nav desde los registros y falla si una entrada no tiene ruta resoluble, `description` de una línea o contenido para ese tenant.
2. **Lint de claves hardcodeadas.** Regla ESLint/grep de CI en el shell y el core que prohíbe literales de ids de addon, industria o rutas de nav (`'hub_fleet'`, `'retail'`, listas de items de menú) fuera de manifiestos y fixtures de prueba.
3. **Test «misma URL ⇒ mismo renderer».** Resuelve cada ruta declarada con y sin caché, y en distinto orden de carga de contribuciones; falla si el renderer difiere.
4. **Validación de contribuciones al publicar.** El hub/`parseManifest` rechaza contribuciones sin `description`, sin condición cuando aplica, o sin versión de contrato.
5. **Detector de repetición.** Informe periódico (jscpd o similar) que marca patrones de 3+ apariciones como candidatos a primitivo.
6. **Eventos tipados.** Los tipos del bus son la única fuente; el lint prohíbe `dispatchEvent` y emisores ad hoc para eventos de plataforma.
7. **Plantilla de PR.** La checklist de la sección 4 se incluye en la plantilla de PR de kernel, SDK, Ops y `create-addon`; el agente revisor la aplica y cita evidencia por ítem.

Migración: lo existente que viole estas reglas (nav y secciones del shell de Ops, `view_type` por modelo) se registra como deuda y se corrige por las fases del ADR 0002. Los controles 1 a 3 arrancan en modo aviso y pasan a bloqueantes cuando la deuda llegue a cero.

## 7. Decisiones abiertas

- Umbral de "3 repeticiones": ¿cuenta entre addons, dentro de un addon, o ambos? (Propuesta: ambos.)
- Nombre y esquema exacto del campo de una línea (`description` u otro) en el manifiesto `v3`.
- Fecha a partir de la cual los controles 1 a 3 pasan de aviso a bloqueantes.
