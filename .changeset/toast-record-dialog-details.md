---
"@asteby/metacore-runtime-react": patch
---

DynamicRecordDialog now surfaces the server's real error cause (`details`) in the create/update/delete error toast via `toastServerError`, instead of showing only the generic headline ("Error creating record"). This is the modal the generic model CRUD page uses, so a failed create now shows the underlying Postgres/validation reason as the toast description.
