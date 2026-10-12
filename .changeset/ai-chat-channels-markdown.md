---
"@asteby/metacore-ai-chat": minor
---

Markdown + GFM seguro en las respuestas de IA (listas, tablas, código con copiar, links endurecidos, sin HTML crudo, streaming-friendly); inbox de canales inyectable (`channels: ChannelAdapter`, kinds `bot | agent | team`, no leídos en el FAB, último canal recordado); modo pantalla completa del widget (`defaultExpanded`, botón expandir, Escape escalonado, `fullscreenHref` / `onOpenFullscreen`, `hidden`); badge demo ahora lo marca el backend (`demo` en la respuesta) además del prop; `CopilotChat` acepta `title/subtitle/avatar/headerStart/headerEnd/onEscape`. Aditivo: sin `channels` el widget se comporta como antes.
