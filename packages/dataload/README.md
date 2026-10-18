# @asteby/metacore-dataload

Typed client, hooks and UI for the kernel's generic bulk-load engine (`metacore-kernel/dataload`): declarative profiles and per-organization overrides, **dry-run and diff**, idempotent asynchronous runs with progress and history, a **review queue** for rows the extract stage held, **chunked uploads** for big files, and the status of the **immutable sha256 media backup**.

No niche, source-platform or flavor logic lives here: everything specific (a mapping from some source, an org's ignored columns, review codes) is a declarative profile / override / extract document registered by the host.

## Contract

The kernel package has no HTTP layer; the host (ops / an addon) mounts a handler at `basePath` (default `/dataload`) wrapping `dataload.Runner`, `Ledger`, `ReviewStore`, `Manifest` and `MediaQueue`. Responses use the usual `{ success, data }` envelope; errors carry `{ message }` and an HTTP status.

| Method | Path | Kernel call | Returns |
| --- | --- | --- | --- |
| GET | `/profiles` | registered profiles | `StoredProfile[]` |
| POST | `/profiles` | save (validated by `Profile.Validate` / `Resolve`) | `StoredProfile` |
| POST | `/dry-run` | `Runner.DryRun` | `{ plan, run }` |
| POST | `/runs` | `Runner.Start` (returns at once) | `DataloadRun` |
| GET | `/runs?limit=` | `Ledger.List` | `DataloadRun[]` |
| GET | `/runs/:id` | `Runner.Status` | `DataloadRun` |
| GET | `/runs/:id/plan` | plan stored with the run | `DataloadPlan` |
| POST | `/runs/:id/cancel` | `Runner.Cancel` | `DataloadRun` |
| GET | `/reviews?entity=&state=&run_id=&code=&limit=` | `ReviewStore.List` | `ReviewEntry[]` |
| POST | `/reviews/decide` `{ decisions: ReviewDecision[] }` | `Runner.Decide` (all or nothing) | `ReviewEntry[]` |
| POST | `/reviews/apply` `{ entity }` | `Runner.ApplyApproved` | `DataloadRun` (`mode: apply_reviewed`) |
| POST | `/uploads` `{ name, size, contentType?, chunkSize? }` | host storage | `UploadSession` |
| GET | `/uploads/:id` | host storage | `UploadSession` (with `received` parts) |
| POST | `/uploads/:id/parts/:index` raw bytes | host storage | — |
| POST | `/uploads/:id/complete` `{ sha256? }` | host storage | `UploadSession` (with `sha256`) |
| POST | `/uploads/:id/abort` | host storage | — |
| GET | `/media/status?run_id=` | `MediaQueue.Stats` + manifest summary + dead jobs | `MediaBackupStatus` |
| GET | `/media/manifest` | `ExportManifest` | `ManifestEntry[]` |
| POST | `/media/verify` | `Backuper.VerifyAll` | `VerifyReport` |
| POST | `/media/retry` `{ run_id? }` | `MediaQueue.RetryFailed` | `{ requeued }` |

`dry-run` and `runs` take `{ profile: name | inline profile, overrides?, source }`, where `source` is either `{ format: 'csv'|'json'|'bundle', name, content, path? }` (inline text) or `{ format, name, uploadId, path? }` (a completed chunked upload); `runs` also takes `force` and `failOnInvalid`. An explicit `overrides: {}` means "no overrides" (omitting it lets the server use the ones stored with the profile). The organization and the actor always come from the session, never from the body. Tokens and passwords are never part of any payload.

**Reviews.** A decision carries the `hash` of the row the person saw; the server answers **409** when the row changed since (`ErrReviewStale`) or is closed (`ErrReviewClosed`), and the UI reloads the queue. Approved rows are written only by `/reviews/apply`.

**Chunked uploads.** The server chooses (or caps) `chunkSize` and answers which parts it already has, so an interrupted upload resumes without resending them. Each part is sent as `application/octet-stream` with `X-Content-Sha256` (hex) when the browser has WebCrypto, so the server can reject a corrupted part; parts can arrive again (idempotent by index). `complete` assembles the file and returns its sha256. The client never continues an upload whose `size` or `name` differ from the picked file (it discards it and starts a new one, so parts of two files are never mixed), and it refuses a `chunkSize` above 64 MB (each part is held in memory to hash it). The server should expire unfinished uploads. The row cap of the profile (`maxRows`) still applies when the file is read.

## Use

```tsx
import { createDataloadApi, DataloadLauncher, DataloadProvider } from '@asteby/metacore-dataload'

const api = createDataloadApi(axiosInstance) // or { basePath: '/api/dataload' }

<DataloadProvider locale='es-MX' capabilities={capsFromRole} notify={toast}>
  <DataloadLauncher api={api} defaultProfile='catalogo' onFinished={(run) => ...} />
</DataloadProvider>
```

A complete host page (roles to capabilities, review screen, settings screen, plugging i18next) is in [`example/dataload-page.tsx`](./example/dataload-page.tsx).

Components: `DataloadLauncher` (everything below in one flow), `PlanReview`, `RunProgressView`, `ReviewQueue`, `OverridesEditor`, `MediaBackupPanel`. Each accepts `t`, `locale`, `messages`, `capabilities` and `notify`, which win over `DataloadProvider`.

Hooks for custom screens: `useDataloadLauncher` (pick -> dry-run -> review -> execute state machine, with `setOverrides`), `useSourceFile` (inline or chunked, with `cancel` / `retry`), `useDataloadProfiles`, `useDataloadRuns`, `useDataloadRun` (polls until terminal), `useDataloadRunPlan`, `useDataloadReviews`, `useReviewActions` (decide, apply approved), `useMediaBackupStatus`, `useDataloadActions` (cancel, verify, retry media).

Pure helpers: `summarizePlan`, `filterRows`, `canApply`, `progressPercent`, `parseTime` (the kernel serializes unset times as `0001-01-01`), `mediaHealth`, `readSourceFile`, `uploadSourceFile`, `validateOverrides`, `resolveProfile`, `compactOverrides`, `resolveCapabilities`, `makeT`.

### Review queue

`ReviewQueue` lists the rows held for review (filter by state and reason code) in a table: row, identity, reasons (`revisar` / `info` with their code, field and detail from the extract document), what applying would do, and the state of the decision (who, when, comment). "Details" shows the field diff from the plan stored with the run that held the row (only if that plan still has the same version of the row) and the record that would be written. Select one or many, add a comment, approve or reject; "Apply approved (N)" writes them. With `hideWhenEmpty` it renders nothing while there is nothing to decide, or when the host has not mounted `/reviews` (404/405/501).

### Overrides editor

`OverridesEditor` edits one organization's overrides over a base profile: columns to ignore (exact or `prefix*`), extra headers per field, removed fields (never the identity), default values (typed by the field), and cleaning (replace the global rules, add rules per field, `drop_lines:<regex>`). Full field replacements and value translations are kept as they came. It validates as you type with the kernel's rules (`validateOverrides`: unknown or removed targets, unknown rules, invalid regexes, identity removal, another org's overrides), shows the resolved profile summary, runs a dry-run preview of the plan with the edited overrides when it has a `source`, and saves through `saveProfile`. The server validates again and is the authority (JS RegExp only approximates Go RE2).

### Permissions

The host passes what the person may do; the UI hides or disables accordingly (the server must enforce the same rules):

| Capability | Without it |
| --- | --- |
| `launch` | dry-run is still offered; "Apply" is disabled with an explanation |
| `cancel` | no "Cancel load" button |
| `approve` | the review queue is read-only (no selection, decisions or apply) |
| `retryMedia` | no "Retry failed" in the media panel |
| `verifyMedia` | no "Verify backup" |
| `editOverrides` | the overrides editor is read-only and cannot save |

Without `capabilities` everything is offered. Once the host passes an object, **any capability it leaves out is denied**, so a capability added in a later version never appears enabled by accident.

### i18n

Components never write user-facing text of their own: every string is a key. Built-in catalogs: `DATALOAD_MESSAGES_ES_MX` (default) and `DATALOAD_MESSAGES_EN_US`, picked by `locale` (`en*` -> en-US, anything else -> es-MX). Resolution order per key: `messages[key]` -> `t(key, catalogText)` -> catalog. A `t` that returns the key itself (a missing translation in most libraries) falls back to the catalog. To add a language, pass a full catalog typed as `DataloadMessages` in `messages`. Server messages (validation errors) are shown as the server sends them.

## UI

Built on `@asteby/metacore-ui` and the host's design tokens (`bg-card`, `text-muted-foreground`, status badges), so light/dark themes apply with no extra CSS. Single column on phones; diff rows are cards, and wide tables (review queue, fields of a profile) scroll inside a focusable region instead of the page. Fields have labels, focus is visible, tables have a caption and column/row headers, progress is `role=progressbar`, and upload progress, run state and review decisions are announced through `aria-live`.
