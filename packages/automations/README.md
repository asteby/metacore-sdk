# @asteby/metacore-automations

Screens and client for the kernel `automation` runtime: declarative
automations (cron with timezone, interval, one-shot reminders, domain events)
and dynamic tools, created by people or proposed by the agent.

- `createAutomationsApi(http)` — REST client for `automation.Handler`.
- `<AutomationsManager api={api} />` — list with status filters, detail with
  authorship («persona con el asistente»), confirm/discard proposals, pause/resume,
  dry-run preview, run history, and the editor.
- `<SpecEditor />` — form generated from the `automation/v1` JSON Schema and
  the tool catalog the backend serves (plus an advanced JSON mode). It can
  only compose registered tools: there is no HTTP, SQL or code step.
- `automationUIActionHandler(api)` — maps the `automations.*` actions of the
  agent's generative-UI cards (`@asteby/metacore-genui`) to the API.
