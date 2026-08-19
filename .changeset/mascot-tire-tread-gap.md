---
"@asteby/metacore-app-providers": patch
---

Fix a visible gap between the tire-tread ring and the tire body in the
`tire-red` mascot skin: the dashed tread circle sat at r=76 while the solid
body circle is r=63 — an 8-unit gap of bare background between them, making
the tread dashes look disconnected ("floating") from the wheel, especially
at small icon sizes. Tread radius reduced to r=69 so it sits flush against
the body, matching gear-lime's gear teeth (which already sit flush).
