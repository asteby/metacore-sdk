---
"@asteby/metacore-agent-workspace": minor
---

abyGuidance emite `ops:aby-guide-stopped` ({ guideId, stepIndex }) cuando el usuario descarta un tour en curso, para que el host registre un tour saltado. El fin de tour ya emitía `ops:aby-guide-completed`.
