---
'@asteby/metacore-agent-workspace': minor
---

Chat del asistente: al recargar el historial, los avisos de turno fallido guardados (`metadata.turn_error`) vuelven como burbuja de error con «Reintentar» (reenvía la pregunta previa) en lugar de texto plano; nuevo `abyTurnErrorFromMeta`. `pollAbyAssistantReply` ya no sondea el historial ~5 min con la red caída: se detiene si el navegador está sin conexión o tras `maxNetworkFailures` (3) fallos consecutivos sin respuesta HTTP (`AbyNetworkDownError`), y un aviso `turn_error` encontrado al sondear se reporta como error clasificado (`AbyHistoryTurnError`) en vez de como respuesta.
