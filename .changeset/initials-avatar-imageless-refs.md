---
'@asteby/metacore-ui': minor
'@asteby/metacore-runtime-react': minor
---

feat(ui): InitialsAvatar — deterministic initials fallback for imageless references

New shared `InitialsAvatar` primitive: when a reference/option has no image it now
shows 1–2 uppercase initials on a background color derived deterministically from
the name (stable per name via the existing `optionColor` hash → curated palette),
instead of an empty placeholder box.

Wired into the three surfaces through ONE component so they never diverge: the
relation picker (`OptionThumb`/`OptionLead`), the dynamic-table relation cell
(`RelationCell`), and the read-only detail dialog. Existing image, icon, and color
rendering is unchanged; the avatar is purely the imageless fallback. Respects the
existing sizes (24px table, 22px detail, the picker's).
