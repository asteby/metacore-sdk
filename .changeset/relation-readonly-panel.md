---
'@asteby/metacore-runtime-react': minor
---

DynamicRelation/DynamicRelations: honor a `readonly` flag on the kernel relation metadata (`RelationMeta.readonly`, camelCase alias `readOnly`). When a relation is read-only the panel forces canCreate/canEdit/canDelete = false regardless of the perms the host passes, hiding the "Agregar" (Plus) button and the per-row edit (Pencil) / delete (Trash2) controls. Backwards compatible: when the flag is absent/false the panel keeps deriving its controls from the host props.
