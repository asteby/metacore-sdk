# Agenda (schedules)

Addon metacore portable (backend WASM + frontend federado + migrations) para agenda de citas y eventos.

| Pieza | Detalle |
|---|---|
| model_definitions | schedule_events (contact_id, title, starts_at, ends_at, status, location, category) |
| actions.schedule_events[] | confirm, reschedule, cancel (modals schedules.*) |
| tools[] | create_event, list_events |
| events | schedules.event.created/.confirmed/.rescheduled/.cancelled |
| backend | runtime=wasm, exports=confirm,reschedule,cancel,create_event,list_events |
