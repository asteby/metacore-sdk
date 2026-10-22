# @asteby/metacore-setup-wizard

Generic step wizard plus the pieces to verify a domain's DNS. Reusable by any
addon: a step is `{ id, title, run, poll?, render? }`.

```bash
pnpm add @asteby/metacore-setup-wizard lucide-react
```

```css
@source "../node_modules/@asteby/metacore-setup-wizard/dist/**/*.{js,mjs}";
```

| Export | Purpose |
| --- | --- |
| `StepWizard` / `useStepWizard` | Steps with status `pending / running / ok / error`, diagnostics, retry, resume (`persistKey` + `persistence`), auto-advance. |
| `pollUntil` / `usePolling` | Polling with constant, backoff-array or function intervals, max attempts, abort, pause while the tab is hidden. |
| `LiveStatusBadge` | `idle / checking / ok / error / missing / wrong_value / propagating`. |
| `DnsRecordRow` | Type, name, value with copy, per-record status, found value and diagnostic. |
| `DomainSetupWizard` | Method (copy/paste or automatic) -> live per-record verification -> done. |
| `SetupWizardProvider` | `locale` (`es`, `en`) and `labels` overrides. |

A step with `poll` re-runs `run` while it answers `{ status: 'pending' }`
and ends as `ok`, `error`, or `error` with `exhaustedMessage` when attempts run out.

```tsx
<DomainSetupWizard
  domain="acme.com"
  records={[{ id: 'spf', type: 'TXT', name: 'acme.com', value: 'v=spf1 ...', purpose: 'SPF' }]}
  checkRecords={async (domain, signal) => api.checkDns(domain, { signal })} // { [id]: { status, found?, diagnostic? } }
  methods={[{ id: 'cloudflare', title: 'Cloudflare', onApply: ({ domain }) => api.applyCloudflare(domain) }]}
  pollInterval={[3000, 6000, 12000, 30000]}
  persistKey="onboarding"
  onComplete={() => navigate('/mail')}
/>
```

## Decisión pendiente: dos implementaciones paralelas (I10)

Existe un asistente por pasos en este paquete (`StepWizard` / `useStepWizard`)
y otro en `@asteby/metacore-runtime-react` (`setup`). Hoy conviven con
máquinas de estado, persistencia y etiquetas separadas. Unificarlas (una sola
fuente en SDK, la otra como adaptador) queda como decisión pendiente del
equipo; este PR no la resuelve. Hasta decidir, no copies funciones entre ambas.

## Notas de seguridad / operación

- Los pasos dinámicos (`steps`/`methods` que llegan tras el montaje) se
  sincronizan solos; los pasos nuevos arrancan en `pending`.
- `createLocalWizardPersistence` guarda estado en localStorage: usa un prefijo
  por usuario/tenant y límpialo al cerrar sesión.
