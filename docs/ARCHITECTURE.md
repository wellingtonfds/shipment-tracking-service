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
                 │  casos de uso, ports de saída, orquestração │
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
  → HealthController            (infrastructure/http/controllers)
      → CheckHealthUseCase      (application/use-cases — injetado por token)
          → HealthCheckPort     (application/ports — interface)
  → PrismaHealthCheckAdapter    (infrastructure/database — IMPLEMENTA a port)
      → PrismaService           (infrastructure/database — driver adapter mssql)
  → HealthPresenter             (infrastructure/http/presenters — @ApiProperty)
```

## Composition root

`src/app.module.ts` é o único ponto de montagem. O wiring de use-cases vive no módulo de infraestrutura que os consome (`HttpModule`), injetado por **tokens string** (`src/application/ports/tokens.ts`) — assim a camada de aplicação não conhece o framework de DI.

## Estrutura de diretórios

```
src/
  main.ts                    # bootstrap HTTP, Swagger, pipes globais
  app.module.ts              # composition root
  application/
    ports/                   # contratos + tokens de DI
    use-cases/               # regras de orquestração (classes puras)
  domain/
    errors/                  # DomainError base (código + mensagem)
    entities/                # (vazio no bootstrap — entidades futuras)
    value-objects/           # (vazio no bootstrap)
    ports/                   # ports do domínio (repositórios futuros)
  infrastructure/
    config/                  # @nestjs/config
    database/                # PrismaService + adapters (implementam ports)
    http/
      controllers/           # finos: 1 use-case por endpoint
      presenters/            # DTOs de resposta com @ApiProperty
      filters/               # GlobalExceptionFilter (DomainError → HTTP)
  generated/                 # prisma client (gitignored)
```

## Erros

- `DomainError` (src/domain/errors) — base abstrata com `code`. A infraestrutura (GlobalExceptionFilter) decide como traduzir para HTTP (422 por padrão).
- Camadas internas **nunca** importam `HttpException` do Nest.

## Banco de dados

- MSSQL 2022 em Docker (`docker-compose.yml`), healthcheck com `sqlcmd`.
- Prisma 7 usa **driver adapter** (`@prisma/adapter-mssql`): `PrismaClient` recebe `new PrismaMssql(DATABASE_URL)`.
- `PrismaService` conecta no `onModuleInit` e desconecta no `onModuleDestroy`.
- MSSQL não tem `enum` nativo — validar em domínio, persistir como `String`.

## Testes

| Tipo | O que cobre | Onde |
| --- | --- | --- |
| Unit | use-cases com ports falsas (sem Nest) | `src/**/*.spec.ts` |
| Arquitetura | proibição de imports que cruzam fronteiras | `test/architecture.spec.ts` |
| E2E | request HTTP real contra AppModule | `test/*.e2e-spec.ts` |

## Swagger

Gerado em runtime (`/docs`, spec em `/docs-json`) a partir dos decorators. `DocumentBuilder` centralizado em `src/main.ts`.
