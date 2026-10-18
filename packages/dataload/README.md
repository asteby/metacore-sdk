# @asteby/metacore-dataload

Typed client, hooks and launcher UI for the kernel's generic bulk-load engine (`metacore-kernel/dataload`): declarative profiles, **dry-run and diff**, idempotent asynchronous runs with progress and history, and the status of the **immutable sha256 media backup**.

No niche, source-platform or flavor logic lives here: everything specific (a WooCommerce mapping, an org's ignored columns) is a declarative profile / override registered by the host.

## Contract

The kernel package has no HTTP layer; the host (ops / an addon) mounts a handler at `basePath` (default `/dataload`) wrapping `dataload.Runner`, `Ledger`, `Manifest` and `MediaQueue`. Responses use the usual `{ success, data }` envelope.

| Method | Path | Kernel call | Returns |
| --- | --- | --- | --- |
| GET | `/profiles` | registered profiles | `StoredProfile[]` |
| POST | `/profiles` | save (validated by `Profile.Validate`) | `StoredProfile` |
| POST | `/dry-run` | `Runner.DryRun` | `{ plan, run }` |
| POST | `/runs` | `Runner.Start` (returns at once) | `DataloadRun` |
| GET | `/runs?limit=` | `Ledger.List` | `DataloadRun[]` |
| GET | `/runs/:id` | `Runner.Status` | `DataloadRun` |
| GET | `/runs/:id/plan` | plan stored with the run | `DataloadPlan` |
| POST | `/runs/:id/cancel` | `Runner.Cancel` | `DataloadRun` |
| GET | `/media/status?run_id=` | `MediaQueue.Stats` + manifest summary + dead jobs | `MediaBackupStatus` |
| GET | `/media/manifest` | `ExportManifest` | `ManifestEntry[]` |
| POST | `/media/verify` | `Backuper.VerifyAll` | `VerifyReport` |
| POST | `/media/retry` `{ run_id? }` | `MediaQueue.RetryFailed` | `{ requeued }` |

`dry-run` and `runs` take `{ profile: name | inline profile, overrides?, source: { format: 'csv'|'json'|'bundle', name, content, path? } }`; `runs` also takes `force` and `failOnInvalid`. The organization always comes from the session, never from the body. Tokens and passwords are never part of any payload.

## Use

```tsx
import { createDataloadApi, DataloadLauncher } from '@asteby/metacore-dataload'

const api = createDataloadApi(axiosInstance) // or { basePath: '/api/dataload' }

<DataloadLauncher api={api} notify={toast} t={t} locale='es-MX' onFinished={(run) => ...} />
```

Hooks for custom screens: `useDataloadLauncher` (pick -> dry-run -> review -> execute state machine), `useDataloadProfiles`, `useDataloadRuns`, `useDataloadRun` (polls until terminal), `useDataloadRunPlan`, `useMediaBackupStatus`, `useDataloadActions` (cancel, verify, retry media). Smaller pieces: `PlanReview`, `RunProgressView`, `MediaBackupPanel`.

Pure helpers: `summarizePlan`, `filterRows`, `canApply`, `progressPercent`, `parseTime` (the kernel serializes unset times as `0001-01-01`), `mediaHealth`, `readSourceFile`.

## UI

Built on `@asteby/metacore-ui` and the host's design tokens (`bg-card`, `text-muted-foreground`, status badges), so light/dark themes apply with no extra CSS. Single column on phones; diff rows are cards, not wide tables. Fields have labels, progress is `role=progressbar`, and run state is announced through `aria-live`.

All texts have Spanish defaults (`DATALOAD_MESSAGES_ES`) and can be overridden through `t(key, fallback)`.
