---
'@asteby/metacore-starter-config': minor
'create-metacore-addon': patch
---

Federation CI budgets: `metacoreFederationBudgetPlugin` + `assertFederationDistBudgets` mirror hub publish ceilings (512 KiB remoteEntry / 4 MiB frontend). `metacoreFederationShared` now asserts mandatory singletons (and the published `.js` again includes `@tanstack/react-query`). New addons scaffold with the budget plugin wired.
