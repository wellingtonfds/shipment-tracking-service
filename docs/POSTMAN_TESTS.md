# Collections Postman — Customers e Tracking

As collections [`Customers`](../postman/Customers.postman_collection.json) e [`Tracking`](../postman/Tracking.postman_collection.json) executam isoladamente. A ordem interna dos requests importa. Elas cobrem os efeitos visíveis pela API; cenários que inspecionam Prisma, Redis, BullMQ e geocoder simulado permanecem nos testes E2E.

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

Use um segundo terminal para rodar Newman. O seed fornece o administrador, dois operadores de clientes diferentes e uma carga de outro cliente usada no teste de isolamento. A API precisa estar com `TRACKING_QUEUE_ENABLED=true` e `TRACKING_WORKER_ROLE=true` para o histórico assíncrono ser processado. O runner lê `PORT` e `API_PREFIX` do `.env` e monta `baseUrl` com `127.0.0.1`.

```bash
npm run postman:customers
npm run postman:tracking
npm run postman:all
```

Também é possível importar cada JSON no Postman e executar pelo Collection Runner. Defina as variáveis de ambiente abaixo no Postman. Newman as recebe automaticamente do runner npm.

| Variável | Valor padrão do runner | Uso |
| --- | --- | --- |
| `baseUrl` | `http://127.0.0.1:3000/api/v1` | URL da API; deriva de `PORT` e `API_PREFIX` |
| `adminEmail` | `admin@logistica.com` | Administrador do seed |
| `operatorEmail` | `sergio.nogueira@logistica.com` | Operador do primeiro cliente |
| `otherOperatorEmail` | `tania.mendes@logistica.com` | Operador de outro cliente |
| `seedPassword` | `Senha123!` | Senha local do seed |

Para outro seed, use `POSTMAN_ADMIN_EMAIL`, `POSTMAN_OPERATOR_EMAIL`, `POSTMAN_OTHER_OPERATOR_EMAIL` e `POSTMAN_SEED_PASSWORD` no ambiente do shell ou `.env`. Não versione credenciais reais. Tokens, IDs e dados gerados são variáveis **de collection**, portanto não transitam entre Customers e Tracking.

## Dados e cobertura

O script de criação de Customers resolve `{{$randomFullName}}`, `{{$randomEmail}}`, `{{$randomPhoneNumber}}` e `{{$randomStreetAddress}}` uma vez por execução e reutiliza o email na prova de duplicidade. Tracking resolve `{{$randomCity}}` e `{{$randomInt}}` uma vez para compor as cidades e os códigos da carga. As datas são calculadas a partir da hora da execução, evitando dados vencidos.

Customers verifica login, acesso anônimo e de operador negados, lista, criação, detalhe, email duplicado, validação, atualização e remoção. Tracking verifica criação e código duplicado, datas e corpo inválidos, normalização de status, transição inválida, histórico, filtros combinados, ordenação, paginação, consulta por status e isolamento entre clientes em leitura e atualização.

As verificações de histórico repetem a leitura até o worker registrar a ocorrência, com limite de 15 segundos. O cenário de concorrência envia duas atualizações de status para uma carga nova ao mesmo tempo. Respostas `202` são contadas e cada atualização aceita deve aparecer exatamente uma vez no histórico. Uma transição rejeitada com `409` ou `422` não gera ocorrência.

As collections removem as cargas e o cliente que criam. Em caso de interrupção antes dos últimos requests, use o código/ID mostrados no resultado do Newman para removê-los com o token apropriado, ou limpe os dados de desenvolvimento por seu procedimento local. O seed e suas cargas não são removidos.

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
