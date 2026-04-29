---
'@asteby/metacore-ui': minor
---

Promote shared app components into `@asteby/metacore-ui/shared`:

- `DatePicker` — a `react-day-picker`-backed popover field, brand-neutral.
- `ComingSoon` — translated placeholder for routes that aren't built yet. Translation keys: `coming_soon.default_title`, `coming_soon.default_description`, `coming_soon.access_soon`.
- `Search` — header search trigger button. Now decoupled from `useSearch`; consumers pass an `onOpen` callback (typically wired to `useSearch().setOpen(true)` from `@asteby/metacore-app-providers`).

`date-fns` is now an optional peer dependency (already pulled in transitively via `react-day-picker`; declaring it explicitly avoids module-resolution surprises in apps that shake out the transitive copy).

Existing `LongText`, `PasswordInput`, and `SelectDropdown` (already shipped under `./dialogs`) cover three of the components that were duplicated in `link/` and `ops/` — apps should drop their local copies and import from `@asteby/metacore-ui` instead.
