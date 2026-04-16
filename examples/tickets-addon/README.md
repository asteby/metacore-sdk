# Tickets & Pedidos

Reference addon exercising the full metacore contract: model definitions,
navigation, actions, capabilities, settings and a federated frontend.

## Capabilities

- `db:read users` — resolve assignee / reporter names.
- `event:emit ticket.*` — publish state-transition events.
- `http:fetch api.slack.com` — optional Slack notification on resolve.

## Actions

- `tickets.resolve` — closes an open / in-progress ticket.
- `tickets.reassign` — modal with assignee picker + optional note.

## Events emitted

`ticket.created`, `ticket.resolved`, `ticket.reassigned`.

## Screenshots

- `docs/screenshots/board.png` _(placeholder)_
- `docs/screenshots/detail.png` _(placeholder)_

## Build

```sh
./build.sh          # wraps `metacore build .`
```

Produces `tickets-<version>.tar.gz` ready to install via the host admin UI
or `metacore publish`.
