---
'@asteby/metacore-runtime-react': minor
---

DynamicKanban: per-lane configuration gear (⚙). Every board lane — declared
stages (Backlog, Done…) included, not just custom ones — now carries a subtle
gear next to the search/filter/⚡ header icons that opens a "Configurar etapa"
dialog to rename the lane, recolor it, and attach extra CONDITIONS (a
field/operator/value builder reusing the same eq/neq/contains/in component as
custom stages).

- Declared lanes persist through a new `/stage-overrides` endpoint
  (`useStageOverrides`), with a "Restablecer etapa" action that drops the
  override; custom real stages persist through their existing `/custom-stages`
  CRUD (which now also accepts `filters`). The gear unifies both behind one UI.
- A lane that carries conditions queries its data — and counts its header —
  with the stage scope PLUS those conditions (serialized like smart-lane
  filters), and shows a filter indicator + tooltip listing them. Cards can still
  be dragged into the lane (the drop only sets the stage value).
- Non-intrusive: when `/stage-overrides` is absent the gear simply doesn't
  render on declared lanes. All copy goes through `t('dynamic.stage_config.*')`
  with Spanish defaults.

New exports: `useStageOverrides`, `StageConfigDialog`, `StageConditionBuilder`,
`cardMatchesStageFilters`, and their types. `StageMeta` gains optional
`overridden` and `filters`.
