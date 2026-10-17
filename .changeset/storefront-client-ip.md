---
"@asteby/storefront": minor
---

Reenvía la IP del comprador en las llamadas del servidor: opción `clientIp` del cliente, `client.withClientIp(ip)` y `{ clientIp }` por llamada. Se manda como `X-Storefront-Client-IP`, solo con tokens `sk_`/`pt_` (nunca con `pk_`) y descarta valores que no sean una sola IP. OPS la usa únicamente en tokens emitidos con `opts:trust_client_ip`: el cupo de tasa y el límite de códigos OTP pasan a contarse por comprador y no por el servidor SSR. Se exportan `normalizeClientIp` y `CLIENT_IP_HEADER`.
