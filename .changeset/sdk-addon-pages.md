---
"@asteby/metacore-sdk": minor
---

Páginas federadas (`frontend.pages[]`): nuevo subpath `@asteby/metacore-sdk/page` con `AddonPageProps`, `definePage`, `resolvePageModule` y los helpers de ruteo del host (`effectivePageLayout`, `pageMountPath`, `resolveAddonUrl`, `findPage`, `PAGE_SHARES`, `pageBudgetKB`) que reflejan las reglas del kernel. Contrato del host para remotes: `HostApi` (cliente autenticado que nunca expone el token), `HostApiError`, `HostOrg`, `HostUser`, `HostBranch`, `Breadcrumb`, `PageChrome`; `AddonHostContext` gana `org`, `branch`, `locale` e `installedAddons`. SRI para la ruta de Module Federation: `ensureRemoteIntegrity` (modulepreload con `integrity` y verificación por WebCrypto), `computeIntegrity`, `RemoteIntegrityError`. Los tipos de páginas y vistas declarativas (`FrontendPage`, `NavView`, `MapView`, `TimelineView`, `CalendarView`, `ChartView`, `SplitView`, `ModelDetail`, `DetailPanel`…) se regeneran del kernel v0.210.0.
