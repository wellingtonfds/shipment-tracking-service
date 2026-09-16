# Arquitetura

## Diagrama de camadas

```
                 ┌────────────────────────────────────────────┐
                 │              src/infrastructure            │
                 │  NestJS, Prisma, Express, Swagger, Docker  │
                 │  controllers → presenters, adapters, DI    │
                 └──────────────┬─────────────────────────────┘
                                │ implementa ports / chama use-cases
                 ┌──────────────▼─────────────────────────────┐
                  │              src/application               │
                  │  casos de uso, orquestração, ports de saída │
                  │  (sem entidade de domínio, ex. health)      │
                 └──────────────┬─────────────────────────────┘
                                │ usa entidades / regras puras
                 ┌──────────────▼─────────────────────────────┐
                 │                  src/domain                │
                 │  entidades, value objects, erros, regras   │
                 │  ZERO dependências externas                │
                 └────────────────────────────────────────────┘
```

**Direção de dependência: sempre para dentro.** `infrastructure → application → domain`. Nunca o contrário.

## Fluxo de uma request (exemplo: GET /api/v1/health)

```
main.ts (Swagger, ValidationPipe, prefixo)
  → HealthModule                 (infrastructure/http/health — módulo da feature)
      → HealthController         (infrastructure/http/health)
          → CheckHealthUseCase   (application/health/use-cases — injetado por token)
              → HealthCheckPort  (application/health — interface)
  → PrismaHealthCheckAdapter     (infrastructure/database/health — IMPLEMENTA a port)
      → PrismaService            (infrastructure/database — driver adapter mssql)
  → HealthPresenter              (infrastructure/http/health — @ApiProperty)
```

## Organização por feature

Dentro de cada camada, os arquivos são agrupados por **recurso de negócio** (`customers/`, `health/`), não por tipo técnico no primeiro nível. Convenções:

- `src/domain/<feature>/` — entidade, `errors/` do recurso (erros de negócio mapeados para HTTP) e `ports/` do recurso (port de repositório). Exceção: erros de validação ficam junto da entidade (ex.: `InvalidCustomerError` em `customer.entity.ts`).
- `src/application/<feature>/` — `<feature>.tokens.ts` (DI) e `use-cases/`. Port de saída **sem entidade de domínio** (ex.: `HealthCheckPort`) vive aqui, em `application/<feature>/`.
- `src/infrastructure/database/<feature>/` — adapters Prisma; `src/infrastructure/http/<feature>/` — module, controller, `dtos/` e presenter.
- `shared/` (em qualquer camada) — código transversal a features: `DomainError` base, filtro global, `ErrorPresenter`.
- Sem barrel `index.ts`: imports sempre por caminho direto (evita ciclos e mantém a direção de dependência visível).
- Imports relativos usam extensão `.js` (`from './customer.entity.js'`) — exigência de `"type": "module"` + `moduleResolution: nodenext`. Nunca importar sem extensão.
- Nova feature = replicar esse padrão + registrar o module no `HttpModule`.

## Composition root

`src/app.module.ts` é o único ponto de montagem. Cada feature tem seu **módulo de infraestrutura** (`HealthModule`, `CustomersModule`) que registra o controller e faz o wiring dos use-cases, injetados por **tokens string** da própria feature (`src/application/<feature>/<feature>.tokens.ts`) — assim a camada de aplicação não conhece o framework de DI. O `HttpModule` apenas agrega os módulos por feature e registra o filtro global.

## Estrutura de diretórios

```
src/
  main.ts                    # bootstrap HTTP, Swagger, pipes globais
  app.module.ts              # composition root
  application/               # pastas por feature; código transversal em shared/
    customers/
      customer.tokens.ts     # tokens de DI da feature
      use-cases/             # regras de orquestração (classes puras) + specs
    health/
      health-check.port.ts
      health.tokens.ts
      use-cases/
  domain/                    # pastas por feature; base em shared/
    shared/
      errors/                # DomainError base (código + mensagem)
    customers/
      customer.entity.ts
      errors/                # erros específicos do recurso
      ports/                 # repositórios do recurso
  infrastructure/            # pastas por feature; código compartilhado em shared/
    config/                  # @nestjs/config (configuration.ts mapeia PORT, API_PREFIX, NODE_ENV)
    database/
      database.module.ts     # @Global: PrismaService
      prisma.service.ts
      customers/             # adapters que implementam ports da feature
      health/
    http/
      http.module.ts         # agregador: importa os módulos por feature, mantém APP_FILTER
      shared/
        filters/             # GlobalExceptionFilter (DomainError → HTTP)
        presenters/          # ErrorPresenter (forma do erro na spec)
      health/
        health.module.ts     # controller + wiring de providers da feature
        health.controller.ts
        health.presenter.ts
      customers/
        customers.module.ts
        customers.controller.ts
        dtos/                # DTOs de request (@ApiProperty + class-validator)
        customer.presenter.ts
  generated/                 # prisma client (gitignored)
```

## Erros

- `DomainError` (src/domain/shared/errors) — base abstrata com `code`. A infraestrutura (GlobalExceptionFilter) decide como traduzir para HTTP (422 por padrão).
- Camadas internas **nunca** importam `HttpException` do Nest.

## Banco de dados

- MSSQL 2022 em Docker (`docker-compose.yml`), healthcheck com `sqlcmd`.
- Prisma 7 usa **driver adapter** (`@prisma/adapter-mssql`): `PrismaClient` recebe `new PrismaMssql(DATABASE_URL)`.
- `PrismaService` conecta no `onModuleInit` e desconecta no `onModuleDestroy`.
- MSSQL não tem `enum` nativo — validar em domínio, persistir como `String`.

## Testes

Runner: **Vitest** (`vitest.config.ts`; o e2e usa `vitest.config.e2e.ts` separado e precisa do banco no ar). Lint: **oxlint** type-aware (`npm run lint`).

| Tipo | O que cobre | Onde |
| --- | --- | --- |
| Unit | use-cases com ports falsas (sem Nest) | `src/**/*.spec.ts` |
| Arquitetura | proibição de imports que cruzam fronteiras | `test/architecture.spec.ts` |
| E2E | request HTTP real contra AppModule | `test/*.e2e-spec.ts` |

## Swagger

Gerado em runtime (`/docs`, spec em `/docs-json`) a partir dos decorators. `DocumentBuilder` centralizado em `src/main.ts`.
