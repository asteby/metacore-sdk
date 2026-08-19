---
"@asteby/metacore-app-providers": patch
---

Fix the `tire-red` mascot skin (Llantonio): `screen`/`screenCenter` were pale
gray instead of dark, so the face rendered washed-out next to the red accent
ring instead of a dark screen with glowing expressions (matching `gear-lime`'s
pattern). `screenTone` corrected to `'dark'` to match.
