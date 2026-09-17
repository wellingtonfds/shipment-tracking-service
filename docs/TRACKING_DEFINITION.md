# Definição de Negócio — Tracking (cargas e movimentações)

Definição funcional e de API do módulo de rastreamento. **Estado: documentação para
implementação futura** — nenhum endpoint deste módulo existe ainda no código.

> Modelo de dados, ER, índices e convenções: ver [DATABASE.md](./DATABASE.md) (fonte canônica).

## Glossário PT→EN

| PT (spec) | EN (código/API) |
| --- | --- |
| Cliente | `Customer` |
| Operador / Usuário do sistema | `User` (roles: `ADMINISTRATOR`, `OPERATOR`, `CUSTOMER`) |
| Viagem / Carga | `Shipment` |
| Código de carga | `cargoCode` (path param / campo JSON: `cargoCode`) |
| Histórico / Movimentação | `ShipmentEvent` |
| Registrar nova carga | `POST /tracking` |

Rotas e campos JSON seguem inglês (ex.: `/api/v1/shipments/{cargoCode}/history`), não a grafia PT da spec.

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

| Perfil (`role`) | Escopo |
| --- | --- |
| `ADMINISTRATOR` | Todos os clientes; acesso a `GET /history` global e operações manuais de histórico |
| `OPERATOR` | Todos os clientes; cria/gere cargas; **sem** acesso a `GET /history` global |
| `CUSTOMER` | **Exclusivamente as cargas do próprio `Customer`** — leitura (detalhe, histórico da própria carga); sem criação/update/delete |

Regra crítica: a restrição do perfil `CUSTOMER` **deriva do token e nunca de parâmetro
da requisição**. O principal autenticado (`userId, role, customerId`) é injetado pela
infra (guard JWT futuro) no use-case; se `role = CUSTOMER`, o use-case **sobrescreve/
ignora** qualquer `idCliente` recebido e força `where.customerId = principal.customerId`.
`CUSTOMER` sem vínculo no token → `CUSTOMER_SCOPE_MISSING`.

Vínculo usuário↔cliente: `users.customerId` obrigatório se `role = CUSTOMER`, NULL caso
contrário (validação de domínio, ver [DATABASE.md](./DATABASE.md)).

## Regra: usuário responsável obrigatório

Toda carga exige `handledBy` (usuário responsável), **inclusive cargas criadas por
integração**. Convenções:

- Integrações usam um usuário técnico dedicado (seed: `integration@system.local`, `role = OPERATOR`, sem vínculo a cliente). Evolução prevista: um usuário técnico por sistema externo.
- `DELETE /users/{id}` com cargas vinculadas é bloqueado pelo FK (`NoAction`): operador sai de circulação via `active = false` (soft-deactivate), preservando a auditoria.

## Concorrência (atualização de status)

Duas atualizações simultâneas da mesma carga não podem gerar histórico inconsistente
nem perder ocorrência. Estratégia:

1. **Transação única**: `prisma.$transaction` com (a) update condicional da carga e (b) insert do `ShipmentEvent` — atômico; falha em um, rollback nos dois.
2. **Controle otimista**: o update da carga leva `WHERE id = ? AND updatedAt = <lido antes>` (e `AND status = <lido antes>` para validar a transição). Nenhuma linha afetada → houve modificação concorrente → releer e reavaliar a transição contra o status atual (não contra o obsoleto).
3. Sem lock pessimista (sem `SELECT ... FOR UPDATE` via `$queryRaw`) nesta fase; revisar apenas se surgir contenção real.
4. A validação de transição (`canTransition`) roda **dentro** da transação, contra o status persistido, não contra o valor lido fora dela.

## Volumetria de referência e limites

Os números de referência (1.200 clientes, 45k cargas ativas, 120k atualizações/dia,
150–200 rps de leitura, retenção de 5 anos) e as decisões que eles impõem —
particionamento mensal de `shipment_events`, PK composta, política de retenção —
estão em [DATABASE.md](./DATABASE.md#volumetria-de-referência-e-limites)
(seções "Volumetria" e "Particionamento"). Regras derivadas para os endpoints
futuros: `GET /historico` sempre com janela temporal e teto de paginação.

## Geolocalização (Nominatim / OSM — API OSS)
- Origem/destino geocodificados **uma vez** na criação da carga; lat/long persistidos com `geocodedAt` + `geocodeProvider = "NOMINATIM"` (cache; nunca re-geocodificar `geocodedAt != NULL`).
- `current*` é atualizado pelos endpoints de status/localização (texto e/ou coordenadas vindas da operação), sem chamada externa obrigatória.
- Policy Nominatim: máx. 1 req/s, `User-Agent` identificável, fallback textual quando a geocodificação falha (colunas nullable).
- Fronteira: port `GeocodePort` (aplicação) + adapter HTTP na infraestrutura. Domínio nunca faz fetch.

## Endpoints (planned — não implementados)

Prefixo global `/api/v1`. Controllers finos: validam → 1 use-case → presenter; tudo Swagger-documented (`@ApiTags`, `@ApiOperation`, `@ApiResponse`, DTOs com `@ApiProperty` + `class-validator`).

### Gestão de usuários (ex-"Operadores")

| Método | Rota | Uso-case futuro | Notas |
| --- | --- | --- | --- |
| GET | `/users` | `ListUsersUseCase` | filtro por `role`/`active` |
| GET | `/users/{id}` | `GetUserUseCase` | 404 `USER_NOT_FOUND` |
| POST | `/users` | `CreateUserUseCase` | valida regra `role`/`customerId`; email único (`USER_EMAIL_IN_USE`) |
| PUT | `/users/{id}` | `UpdateUserUseCase` | troca de `role` revalida vínculo |
| DELETE | `/users/{id}` | `DeleteUserUseCase` | bloqueado se houver cargas → sugerir `active = false` |

### Rastreamento

| Método | Rota | Uso-case futuro | Notas |
| --- | --- | --- | --- |
| POST | `/tracking` | `CreateShipmentUseCase` | geocodifica origem/destino (Nominatim), valida datas + cargoCode único |
| GET | `/tracking` | `ListShipmentsUseCase` | filtros `status`, `idCliente`, `idOperador` combináveis; ordenação + paginação com teto de `limit`; scoping `CUSTOMER` via token |
| GET | `/tracking/{cargoCode}` | `GetShipmentUseCase` | detalhes completos + status atual |
| PUT | `/tracking/{cargoCode}/status` | `UpdateShipmentStatusUseCase` | transação: update da carga + `ShipmentEvent` (ver Concorrência) |
| PUT | `/tracking/{cargoCode}/localizacao` | `UpdateShipmentLocationUseCase` | só `current*`; também gera evento de movimentação |
| PUT | `/tracking/{cargoCode}/entrega` | `MarkShipmentDeliveredUseCase` | seta `DELIVERED` + `deliveredAt` + evento final |
| DELETE | `/tracking/{cargoCode}` | `CancelShipmentUseCase` | cancelamento; `Cascade` apaga histórico |

### Histórico

| Método | Rota | Uso-case futuro | Notas |
| --- | --- | --- | --- |
| GET | `/tracking/{cargoCode}/historico` | `GetShipmentHistoryUseCase` | cronológica inversa (índice `(shipmentId, occurredAt DESC)`) |
| GET | `/historico` | `ListShipmentEventsUseCase` | **restrito a `ADMINISTRATOR`** |
| POST | `/historico/{cargoCode}` | `AddShipmentEventUseCase` | ocorrência manual (uso interno/admin), `occurredAt` retroativa permitida |
| GET | `/tracking/status/{status}` | `ListShipmentsByStatusUseCase` | atalho de filtro |

### Mapeamento de erros (DomainError → HTTP)

| `code` | HTTP | Situação |
| --- | --- | --- |
| `SHIPMENT_NOT_FOUND` | 404 | carga inexistente para qualquer operação |
| `SHIPMENT_CARGO_CODE_IN_USE` | 409 | criação duplicada (checagem semântica) |
| `SHIPMENT_INVALID_TRANSITION` | 422 | transição de status proibida |
| `SHIPMENT_INVALID_DATES` | 422 | `estimatedDeliveryDate < departureDate` |
| `SHIPMENT_HANDLER_REQUIRED` / `SHIPMENT_HANDLER_INACTIVE` | 422 | responsável ausente/inativo |
| `USER_NOT_FOUND`, `USER_EMAIL_IN_USE`, `USER_CUSTOMER_LINK_INVALID` | 404/409/422 | gestão de usuários |
| `CUSTOMER_SCOPE_MISSING` | 403 | principal `CUSTOMER` sem vínculo |
| status inválido (não está na lista) | 422 | normalização UPPER + validação no domínio |
