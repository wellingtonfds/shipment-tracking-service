# Definição de Negócio — Tracking (cargas e movimentações)

Definição funcional e de API do módulo de rastreamento, incluindo os contratos síncronos de leitura e a ingestão assíncrona de eventos.

> Modelo de dados, ER, índices e convenções: ver [DATABASE.md](./DATABASE.md) (fonte canônica).

## Glossário PT→EN

| PT (spec)                     | EN (código/API)                                         |
| ----------------------------- | ------------------------------------------------------- |
| Cliente                       | `Customer`                                              |
| Operador / Usuário do sistema | `User` (roles: `ADMINISTRATOR`, `OPERATOR`, `CUSTOMER`) |
| Viagem / Carga                | `Shipment`                                              |
| Código de carga               | `cargoCode` (path param / campo JSON: `cargoCode`)      |
| Histórico / Movimentação      | `ShipmentEvent`                                         |
| Registrar nova carga          | `POST /tracking`                                        |

Rotas e path/query params seguem português, como na spec de referência
(`codigoCarga`, `idCliente`, `idOperador`, `localizacao`, `entrega`, `historico`);
campos de corpo (body JSON), identificadores de código, banco e mensagens seguem inglês
(ex.: `cargoCode`, `Shipment`, `originCity`). Exceção documentada à regra English-only,
no mesmo espírito das rotas `/operadores` e `/clientes`.

## Fluxo de status (modelado no domínio, nunca em condicionais de controller)

```
CREATED ──▶ IN_TRANSIT ──▶ TRANSFERRED ──▶ DELIVERED
   │             ▲              │
   └─────────────┴──────────────┘   (voltas para trás proibidas)
```

- Transições permitidas: `CREATED → IN_TRANSIT`, `IN_TRANSIT → TRANSFERRED`, `TRANSFERRED → DELIVERED`. Volta ao estado anterior (`DELIVERED → IN_TRANSIT`, etc.) é inválida.
- Modelagem futura: máquina de estados em `src/domain/shipments/` (`canTransition(from, to)`), erro `SHIPMENT_INVALID_TRANSITION` para transição proibida.
- `DELIVERED` seta `deliveredAt` e é estado terminal (exceto cancelamento via `DELETE`).
- `estimatedDeliveryDate >= departureDate` (e coerente com `createdAt`) — validado no domínio (`SHIPMENT_INVALID_DATES`).
- `cargoCode` único: checagem semântica no use-case (`findByCargoCode` antes de criar) + `UNIQUE` no banco como rede; erro `SHIPMENT_CARGO_CODE_IN_USE` (não depender da exceção do banco).

## Perfil de acesso e scoping via token

| Perfil (`role`) | Escopo                                                                                                                        |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `ADMINISTRATOR` | Todos os clientes; acesso a `GET /history` global e operações manuais de histórico                                            |
| `OPERATOR`      | Vinculado ao seu cliente (`users.customerId` obrigatório); cria/gere cargas; **sem** acesso a `GET /history` global           |
| `CUSTOMER`      | **Exclusivamente as cargas do próprio `Customer`** — leitura (detalhe, histórico da própria carga); sem criação/update/delete |

Regra crítica: a restrição dos perfis `OPERATOR`/`CUSTOMER` **deriva do token e nunca de parâmetro
da requisição**. O principal autenticado (`userId, role, customerId`) é injetado pela
infra (guard JWT) no use-case:

- se `role = CUSTOMER` ou `OPERATOR`, o use-case **sobrescreve/ignora** qualquer `idCliente`
  recebido e força `where.customerId = principal.customerId`;
- na escrita, `OPERATOR` cria/gere **apenas cargas do próprio cliente** (`POST /tracking`
  usa `customerId` do token e `handledBy = self`); `CUSTOMER` é read-only (bloqueio por `@Roles`
  - checagem no use-case);
- lookup por `codigoCarga` fora do escopo retorna `SHIPMENT_NOT_FOUND` (404), sem vazar
  existência entre clientes.
  `CUSTOMER` sem vínculo no token → `CUSTOMER_SCOPE_MISSING`.

Vínculo usuário↔cliente: `users.customerId` obrigatório se `role ∈ {OPERATOR, CUSTOMER}`,
NULL apenas `ADMINISTRATOR` (validação de domínio, ver [DATABASE.md](./DATABASE.md)).

## Regra: usuário responsável obrigatório

Toda carga exige `handledBy` (usuário responsável), **inclusive cargas criadas por
integração**. Convenções:

- Não existe operador sem cliente: o handler de uma carga é o operador do próprio cliente da carga (cargas de integração usam o operador do cliente — sem usuário técnico global).
- `DELETE /operadores/{id}` com cargas vinculadas é bloqueado pelo FK (`NoAction`): operador sai de circulação via `active = false` (soft-deactivate), preservando a auditoria.

## Concorrência (atualização de status)

Duas atualizações simultâneas da mesma carga não podem gerar histórico inconsistente
nem perder ocorrência. O recebimento valida e cria o evento bruto no outbox dentro de uma transação serializável; transições já aceitas e ainda pendentes também participam da validação. O BullMQ recebe o UUID do outbox como ID determinístico. O worker serializa o processamento com lock Redis por carga, renova o lock e reclama o outbox por update condicional dentro da transação que grava o evento e atualiza o status. Uma entrega duplicada não cria um segundo evento. Se `occurredAt` precede o evento mais recente, o histórico é mantido e o estado atual não retrocede.

## Volumetria de referência e limites

Os números de referência (1.200 clientes, 45k cargas ativas, 120k atualizações/dia,
150–200 rps de leitura, retenção de 5 anos) e as decisões que eles impõem —
particionamento mensal de `shipment_events`, PK composta, política de retenção —
estão em [DATABASE.md](./DATABASE.md#volumetria-de-referência-e-limites)
(seções "Volumetria" e "Particionamento"). Regras derivadas para os endpoints
futuros: `GET /historico` sempre com janela temporal e teto de paginação.

## Geolocalização

Coordenadas fornecidas na solicitação são preservadas. Quando faltam e `GEOCODER_URL` está
configurado, o worker consulta o provedor configurado, cacheia o resultado no Redis e aplica
rate limit distribuído no Redis. O formato de resposta é compatível com a busca do Nominatim
(array com `lat`/`lon`); `GEOCODER_USER_AGENT` identifica a aplicação e `GEOCODER_API_KEY`
opcional é enviado como Bearer. O circuit breaker e o timeout evitam bloquear a fila; em falha,
a ocorrência continua com texto e sem coordenadas. Nenhum cliente HTTP é importado pelo domínio.

## Endpoints (gestão de usuários: implementados; restante: planned)

Prefixo global `/api/v1`. Controllers finos: validam → 1 use-case → presenter; tudo Swagger-documented (`@ApiTags`, `@ApiOperation`, `@ApiResponse`, DTOs com `@ApiProperty` + `class-validator`).

### Gestão de usuários — Operadores (implementado)

Rota mantida em português (`/operadores`, `/clientes`) por exigência da spec — exceção documentada à
regra English-only (identificadores de código seguem em inglês: `User`, `UsersController`, `Customer`).

| Método | Rota               | Use-case                 | Notas                                                                                                                                                                                         |
| ------ | ------------------ | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/operadores`      | `ListUsersUseCase`       | **ADMINISTRATOR**. Filtros `role`/`active` combináveis; paginação com teto (`limit` ≤ 100)                                                                                                    |
| GET    | `/operadores/{id}` | `GetUserUseCase`         | **ADMINISTRATOR. Nunca pública.** 404 `USER_NOT_FOUND`; nunca retorna `passwordHash`                                                                                                          |
| POST   | `/operadores`      | `CreateUserUseCase`      | **ADMINISTRATOR**. Valida `role`/`customerId`; email único (`USER_EMAIL_IN_USE`); senha com hash scrypt                                                                                       |
| PUT    | `/operadores/{id}` | `UpdateUserUseCase`      | **ADMINISTRATOR**. Parcial; troca de `role` revalida o vínculo; senha re-hash                                                                                                                 |
| DELETE | `/operadores/{id}` | `DeleteUserUseCase`      | **ADMINISTRATOR**. Soft-delete (`active = false`, 204) — FK `NoAction` impede remoção de quem tem cargas                                                                                      |
| GET    | `/operadores/me`   | `GetMyProfileUseCase`    | Qualquer perfil autenticado. `id` deriva do token, nunca da requisição. Retorna `{ user, customer }` com o customer embutido quando o usuário tem `customerId` (perfis `OPERATOR`/`CUSTOMER`) |
| PUT    | `/operadores/me`   | `UpdateMyProfileUseCase` | Qualquer perfil autenticado. Só `name`/`email`/`password` (campos extras são rejeitados com 400). Retorna só o usuário, sem customer                                                          |

### Autenticação (implementado)

| Método | Rota          | Use-case       | Notas                                                                                                                              |
| ------ | ------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/auth/login` | `LoginUseCase` | **Pública.** Retorna `{ token }`; erro genérico `INVALID_CREDENTIALS` (401) sem vazar existência do email; inativos não autenticam |

Segurança: JWT (Bearer) assinado com `JWT_SECRET` (`JWT_EXPIRES_IN`, default `8h`).
`AuthGuard` global valida o token e anexa o principal `{ userId, role, customerId }`;
`RolesGuard` global aplica `@Roles(...)`. `@Public()` só em `/auth/login`, `/health` e
`/customers` (legado desta fase). Senhas com scrypt (`node:crypto`, salt aleatório,
comparação em tempo constante).

### Rastreamento (implementado)

| Método | Rota                                  | Use-case                        | Notas                                                                                                                                                                                 |
| ------ | ------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/tracking`                           | `CreateShipmentUseCase`         | valida datas + cargoCode único; OPERATOR usa escopo do token (`handledBy = self`), ADMINISTRATOR informa `customerId`+`handledById`; cria evento inicial `CREATED` na mesma transação |
| GET    | `/tracking`                           | `ListShipmentsUseCase`          | filtros `status`, `idCliente`, `idOperador`, janelas de embarque/entrega, combináveis; ordenação + paginação com teto de `limit`; scoping via token                                   |
| GET    | `/tracking/{codigoCarga}`             | `GetShipmentUseCase`            | detalhes completos + status atual                                                                                                                                                     |
| PUT    | `/tracking/{codigoCarga}/status`      | `UpdateShipmentStatusUseCase`   | responde 202 após gravar evento bruto e outbox na mesma transação SQL; worker aplica status e histórico                                                                               |
| PUT    | `/tracking/{codigoCarga}/localizacao` | `UpdateShipmentLocationUseCase` | exige `Idempotency-Key`; responde 202 após gravar evento bruto e outbox na mesma transação SQL                                                                                        |
| PUT    | `/tracking/{codigoCarga}/entrega`     | `MarkShipmentDeliveredUseCase`  | seta `DELIVERED` + `deliveredAt` + evento final (de qualquer status não-terminal)                                                                                                     |
| DELETE | `/tracking/{codigoCarga}`             | `CancelShipmentUseCase`         | remoção física; `Cascade` apaga histórico                                                                                                                                             |

### Histórico (implementado)

| Método | Rota                                | Use-case                       | Notas                                                                                                     |
| ------ | ----------------------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------- |
| GET    | `/tracking/{codigoCarga}/historico` | `GetShipmentHistoryUseCase`    | cronológica inversa (índice `(shipmentId, occurredAt DESC)`)                                              |
| GET    | `/historico`                        | `ListShipmentEventsUseCase`    | **restrito a `ADMINISTRATOR`**; exige janela temporal + paginação com teto                                |
| POST   | `/historico/{codigoCarga}`          | `AddShipmentEventUseCase`      | ocorrência manual (uso interno/admin), `occurredAt` retroativa permitida; só histórico, sem mover a carga |
| GET    | `/tracking/status/{status}`         | `ListShipmentsByStatusUseCase` | atalho de filtro                                                                                          |

Os jobs BullMQ usam o ID UUID do outbox como chave determinística. A aplicação despacha registros pendentes do SQL, então indisponibilidade do Redis não perde solicitações aceitas. A chave de idempotência é única por carga, compara o conteúdo da solicitação e expira após cinco anos; conteúdo diferente com a mesma chave responde 409. Jobs são serializados por carga com lock Redis, usam tentativas exponenciais com jitter por até 24 horas e depois ficam na DLQ para replay periódico com taxa limitada. Coordenadas explícitas dispensam geocodificação; sem provedor ou em falha, a localização textual permanece disponível.

`occurredAt` é opcional nos dois endpoints; quando omitido, usa a hora UTC de recebimento. Eventos retroativos entram no histórico, mas não substituem o status atual definido por evento mais recente; ocorrências empatadas são ordenadas pelo ID crescente do evento.

### Mapeamento de erros (DomainError → HTTP)

| `code`                                                              | HTTP        | Situação                                                                        |
| ------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------- |
| `SHIPMENT_NOT_FOUND`                                                | 404         | carga inexistente (ou fora do escopo do token) para qualquer operação           |
| `SHIPMENT_CARGO_CODE_IN_USE`                                        | 409         | criação duplicada (checagem semântica)                                          |
| `SHIPMENT_CONFLICT`                                                 | 409         | contenção otimista não resolvida após retries — cliente deve repetir a operação |
| `SHIPMENT_INVALID_TRANSITION`                                       | 422         | transição de status proibida                                                    |
| `SHIPMENT_INVALID_DATES`                                            | 422         | `estimatedDeliveryDate < departureDate`                                         |
| `SHIPMENT_HANDLER_REQUIRED` / `SHIPMENT_HANDLER_INACTIVE`           | 422         | responsável ausente/inativo                                                     |
| `USER_NOT_FOUND`, `USER_EMAIL_IN_USE`, `USER_CUSTOMER_LINK_INVALID` | 404/409/422 | gestão de usuários                                                              |
| `CUSTOMER_SCOPE_MISSING`                                            | 403         | principal `CUSTOMER` sem vínculo                                                |
| status inválido (não está na lista)                                 | 422         | normalização UPPER + validação no domínio                                       |
