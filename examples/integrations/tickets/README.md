# Tickets

Addon metacore portable (backend WASM + frontend federado + migrations) para tickets de soporte.

| Pieza | Detalle |
|---|---|
| model_definitions | tickets (title, description, status, priority, assignee_id, resolution_notes, tags jsonb) |
| actions.tickets[] | resolve (modal tickets.resolve), reassign (modal tickets.reassign) |
| tools[] | create_ticket, update_ticket |
| events | tickets.ticket.created, tickets.ticket.resolved, tickets.ticket.reassigned |
| backend | runtime=wasm, exports=resolve,reassign,create_ticket,update_ticket |
