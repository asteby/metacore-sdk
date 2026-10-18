# Respuestas reales de OPS (contrato)

Estos JSON los genera OPS con su handler real (`backend/handlers/dataload_contract_test.go`,
rama `feat/dataload-ops`), saneados (ids, fechas y huellas reemplazados por marcadores):

```
UPDATE_GOLDEN=1 OPS_CATALOG_PG_DSN=... go test ./handlers -run ContractGolden
cp backend/handlers/testdata/dataload-contract/*.json <sdk>/packages/dataload/src/__fixtures__/ops/
```

`src/contract.test.ts` los pasa por el cliente (`createDataloadApi`) y comprueba que
cada campo que usa la UI existe con el tipo y los valores que declara `types.ts`. En OPS
la misma prueba compara la forma con estos archivos: un cambio de contrato rompe en los
dos lados.
