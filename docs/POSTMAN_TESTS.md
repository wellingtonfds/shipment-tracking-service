# Collection Postman — Customers e Tracking

A [collection por caso de uso](../postman/UseCases.postman_collection.json) usa o [ambiente de desenvolvimento](../postman/Development.postman_environment.json). Cada pasta de caso de uso pode ser executada sozinha. A pasta `Authentication` cobre login e consulta de perfil; `Customers` contém criação, lista, detalhe, atualização e exclusão; `Tracking` contém criação, lista, detalhe, atualização de localização/entrega, atualização de status, histórico, filtros e exclusão. A ordem dos requests **dentro de cada pasta** importa.

## Preparo

```bash
nvm use
npm ci
cp .env.example .env  # na primeira execução: configure MSSQL_SA_PASSWORD, DATABASE_URL e JWT_SECRET
docker compose up -d
npm run db:migrate
npm run db:seed
npm run start:dev
```

Use outro terminal para executar a collection. Instale Newman separadamente (por exemplo, `npm install --global newman`) ou use o aplicativo Postman. A API precisa estar com `TRACKING_QUEUE_ENABLED=true` e `TRACKING_WORKER_ROLE=true` para processar o histórico assíncrono.

```bash
newman run postman/UseCases.postman_collection.json -e postman/Development.postman_environment.json
newman run postman/UseCases.postman_collection.json -e postman/Development.postman_environment.json --folder "Tracking - History"
```

Também é possível importar os dois JSONs no Postman e executar a collection inteira ou uma pasta no Collection Runner. Se a API usar outra porta ou prefixo, altere `baseUrl` no ambiente. Os nomes das pastas são únicos para que `--folder` selecione exatamente um caso de uso.

## Variáveis e dados

O ambiente versionado contém apenas `baseUrl`, os emails e a senha do **seed de desenvolvimento**. Substitua esses valores localmente para outro seed e nunca versione credenciais reais. Tokens, IDs, códigos e dados gerados ficam nas variáveis da collection. Cada pasta autentica os papéis necessários, cria os dados usados pelo caso de uso e os remove ao final. A pasta de autenticação só consulta dados do seed.

Os scripts usam Faker (`$randomFullName`, `$randomEmail`, `$randomPhoneNumber`, `$randomStreetAddress`, `$randomCity`, `$randomInt`) para gerar valores uma vez por cenário. As datas são calculadas a partir da execução. As verificações cobrem autorização, validação, duplicidade, paginação, filtros, isolamento entre clientes, idempotência de localização, entrega, transição de status e atualizações simultâneas. As leituras de histórico aguardam até 15 segundos para o worker registrar os eventos antes de afirmar o resultado. Os testes que inspecionam Prisma, Redis, BullMQ e geocoder simulado permanecem no E2E.

Se a execução for interrompida antes da limpeza, remova os dados temporários pelo código/ID exibido no resultado do Newman ou pelo seu procedimento local de limpeza de desenvolvimento. Dados do seed não são removidos.

## Glossário PT→EN

| Português | Código e API |
| --- | --- |
| Cliente | `Customer`, rota `/clientes` |
| Carga | `Shipment`, rota `/tracking` |
| Código de carga | `cargoCode`, parâmetro `codigoCarga` |
| Operador | `User` com role `OPERATOR`, rota `/operadores` |
| Histórico / ocorrência | `ShipmentEvent`, rota `/historico` |
| Status | `status` |
| Data de embarque | `departureDate`, filtro `embarqueDe`/`embarqueAte` |
| Previsão de entrega | `estimatedDeliveryDate`, filtro `entregaDe`/`entregaAte` |
