---
"@asteby/metacore-pwa": patch
---

`attachConnectionReporter` acepta una `AxiosInstance` tal cual: el cliente es genérico en la respuesta y el rechazo se tipa como en axios (`any`). Exporta el tipo `ConnectionReporterClient`.
