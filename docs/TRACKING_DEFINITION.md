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

| Perfil (`role`) | Escopo |
| --- | --- |
| `ADMINISTRATOR` | Todos os clientes; acesso a `GET /history` global e operações manuais de histórico |
| `OPERATOR` | Vinculado ao seu cliente (`users.customerId` obrigatório); cria/gere cargas; **sem** acesso a `GET /history` global |
| `CUSTOMER` | **Exclusivamente as cargas do próprio `Customer`** — leitura (detalhe, histórico da própria carga); sem criação/update/delete |

Regra crítica: a restrição dos perfis `OPERATOR`/`CUSTOMER` **deriva do token e nunca de parâmetro
da requisição**. O principal autenticado (`userId, role, customerId`) é injetado pela
infra (guard JWT) no use-case:
- se `role = CUSTOMER` ou `OPERATOR`, o use-case **sobrescreve/ignora** qualquer `idCliente`
  recebido e força `where.customerId = principal.customerId`;
- na escrita, `OPERATOR` cria/gere **apenas cargas do próprio cliente** (`POST /tracking`
  usa `customerId` do token e `handledBy = self`); `CUSTOMER` é read-only (bloqueio por `@Roles`
  + checagem no use-case);
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

## Geolocalização (Nominatim / OSM — API OSS, adiada)
- Nesta fase, **sem chamada externa**: origem/destino/atual são CRUD básico (texto + coordenadas
  opcionais vindas da operação); `geocodedAt`/`geocodeProvider` ficam `NULL`.
- Futuro: origem/destino geocodificados **uma vez** na criação da carga; lat/long persistidos com `geocodedAt` + `geocodeProvider = "NOMINATIM"` (cache; nunca re-geocodificar `geocodedAt != NULL`).
- A localização atual **não é persistida na carga**: os endpoints de status/localização/entrega
  registram a localização apenas no `ShipmentEvent`; a localização atual é sempre a do último evento
  (`occurredAt DESC, id DESC`), sem chamada externa obrigatória.
- Policy Nominatim: máx. 1 req/s, `User-Agent` identificável, fallback textual quando a geocodificação falha (colunas nullable).
- Fronteira: port `GeocodePort` (aplicação) + adapter HTTP na infraestrutura. Domínio nunca faz fetch.

## Endpoints (gestão de usuários: implementados; restante: planned)

Prefixo global `/api/v1`. Controllers finos: validam → 1 use-case → presenter; tudo Swagger-documented (`@ApiTags`, `@ApiOperation`, `@ApiResponse`, DTOs com `@ApiProperty` + `class-validator`).

### Gestão de usuários — Operadores (implementado)

Rota mantida em português (`/operadores`, `/clientes`) por exigência da spec — exceção documentada à
regra English-only (identificadores de código seguem em inglês: `User`, `UsersController`, `Customer`).

| Método | Rota | Use-case | Notas |
| --- | --- | --- | --- |
| GET | `/operadores` | `ListUsersUseCase` | **ADMINISTRATOR**. Filtros `role`/`active` combináveis; paginação com teto (`limit` ≤ 100) |
| GET | `/operadores/{id}` | `GetUserUseCase` | **ADMINISTRATOR. Nunca pública.** 404 `USER_NOT_FOUND`; nunca retorna `passwordHash` |
| POST | `/operadores` | `CreateUserUseCase` | **ADMINISTRATOR**. Valida `role`/`customerId`; email único (`USER_EMAIL_IN_USE`); senha com hash scrypt |
| PUT | `/operadores/{id}` | `UpdateUserUseCase` | **ADMINISTRATOR**. Parcial; troca de `role` revalida o vínculo; senha re-hash |
| DELETE | `/operadores/{id}` | `DeleteUserUseCase` | **ADMINISTRATOR**. Soft-delete (`active = false`, 204) — FK `NoAction` impede remoção de quem tem cargas |
| GET | `/operadores/me` | `GetMyProfileUseCase` | Qualquer perfil autenticado. `id` deriva do token, nunca da requisição. Retorna `{ user, customer }` com o customer embutido quando o usuário tem `customerId` (perfis `OPERATOR`/`CUSTOMER`) |
| PUT | `/operadores/me` | `UpdateMyProfileUseCase` | Qualquer perfil autenticado. Só `name`/`email`/`password` (campos extras são rejeitados com 400). Retorna só o usuário, sem customer |

### Autenticação (implementado)

| Método | Rota | Use-case | Notas |
| --- | --- | --- | --- |
| POST | `/auth/login` | `LoginUseCase` | **Pública.** Retorna `{ token }`; erro genérico `INVALID_CREDENTIALS` (401) sem vazar existência do email; inativos não autenticam |

Segurança: JWT (Bearer) assinado com `JWT_SECRET` (`JWT_EXPIRES_IN`, default `8h`).
`AuthGuard` global valida o token e anexa o principal `{ userId, role, customerId }`;
`RolesGuard` global aplica `@Roles(...)`. `@Public()` só em `/auth/login`, `/health` e
`/customers` (legado desta fase). Senhas com scrypt (`node:crypto`, salt aleatório,
comparação em tempo constante).

### Rastreamento (implementado)

| Método | Rota | Use-case | Notas |
| --- | --- | --- | --- |
| POST | `/tracking` | `CreateShipmentUseCase` | valida datas + cargoCode único; OPERATOR usa escopo do token (`handledBy = self`), ADMINISTRATOR informa `customerId`+`handledById`; cria evento inicial `CREATED` na mesma transação |
| GET | `/tracking` | `ListShipmentsUseCase` | filtros `status`, `idCliente`, `idOperador`, janelas de embarque/entrega, combináveis; ordenação + paginação com teto de `limit`; scoping via token |
| GET | `/tracking/{codigoCarga}` | `GetShipmentUseCase` | detalhes completos + status atual |
| PUT | `/tracking/{codigoCarga}/status` | `UpdateShipmentStatusUseCase` | transação: update de status da carga + `ShipmentEvent` com a localização (ver Concorrência) |
| PUT | `/tracking/{codigoCarga}/localizacao` | `UpdateShipmentLocationUseCase` | registra apenas um evento de movimentação (append, sem tocar na carga) |
| PUT | `/tracking/{codigoCarga}/entrega` | `MarkShipmentDeliveredUseCase` | seta `DELIVERED` + `deliveredAt` + evento final (de qualquer status não-terminal) |
| DELETE | `/tracking/{codigoCarga}` | `CancelShipmentUseCase` | remoção física; `Cascade` apaga histórico |

### Histórico (implementado)

| Método | Rota | Use-case | Notas |
| --- | --- | --- | --- |
| GET | `/tracking/{codigoCarga}/historico` | `GetShipmentHistoryUseCase` | cronológica inversa (índice `(shipmentId, occurredAt DESC)`) |
| GET | `/historico` | `ListShipmentEventsUseCase` | **restrito a `ADMINISTRATOR`**; exige janela temporal + paginação com teto |
| POST | `/historico/{codigoCarga}` | `AddShipmentEventUseCase` | ocorrência manual (uso interno/admin), `occurredAt` retroativa permitida; só histórico, sem mover a carga |
| GET | `/tracking/status/{status}` | `ListShipmentsByStatusUseCase` | atalho de filtro |

### Mapeamento de erros (DomainError → HTTP)

| `code` | HTTP | Situação |
| --- | --- | --- |
| `SHIPMENT_NOT_FOUND` | 404 | carga inexistente (ou fora do escopo do token) para qualquer operação |
| `SHIPMENT_CARGO_CODE_IN_USE` | 409 | criação duplicada (checagem semântica) |
| `SHIPMENT_CONFLICT` | 409 | contenção otimista não resolvida após retries — cliente deve repetir a operação |
| `SHIPMENT_INVALID_TRANSITION` | 422 | transição de status proibida |
| `SHIPMENT_INVALID_DATES` | 422 | `estimatedDeliveryDate < departureDate` |
| `SHIPMENT_HANDLER_REQUIRED` / `SHIPMENT_HANDLER_INACTIVE` | 422 | responsável ausente/inativo |
| `USER_NOT_FOUND`, `USER_EMAIL_IN_USE`, `USER_CUSTOMER_LINK_INVALID` | 404/409/422 | gestão de usuários |
| `CUSTOMER_SCOPE_MISSING` | 403 | principal `CUSTOMER` sem vínculo |
| status inválido (não está na lista) | 422 | normalização UPPER + validação no domínio |
