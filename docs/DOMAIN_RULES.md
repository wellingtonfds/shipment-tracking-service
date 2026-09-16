# Regras de Fronteira (Domain Rules)

**Regra central: a regra de negócio não pode depender de framework HTTP, de ORM nem de cliente HTTP externo.**

## O que é proibido por camada

### `src/domain` — puro

| Proibido | Motivo |
| --- | --- |
| `@nestjs/*` (decorators, HttpException, pipes) | regra de negócio independe de HTTP |
| `@prisma/*`, `src/generated/*` | independe de ORM |
| `axios`, `fetch`, `undici`, clientes HTTP | independe de rede |
| `class-validator`, `class-transformer`, `@nestjs/swagger` | independe de validação/serialização de HTTP |
| Qualquer arquivo de `src/infrastructure` ou `src/application` | dependência aponta para dentro |

### `src/application` — orquestração

| Proibido | Permitido |
| --- | --- |
| `@nestjs/*` | imports de `src/domain` e de si mesma |
| `@prisma/*`, `src/generated/*` | imports de libs utilitárias puras (date-fns, zod, etc.) |
| `axios`, `fetch` | |
| imports de `src/infrastructure` | |

### `src/infrastructure` — tudo permitido

Único lugar com `@Controller`, `@Injectable` de Prisma, `HttpService`, acesso a `process.env` sensível.

## Consequências práticas

1. **Use-cases são classes puras** construídas via factory no módulo de infra — não usam `@Injectable`. DI por token string (`application/ports/tokens.ts`).
2. **Ports definem o contrato**: a aplicação declara interfaces (`HealthCheckPort`); a infraestrutura implementa (`PrismaHealthCheckAdapter`). O domínio declara interfaces de repositório; a infra implementa com Prisma.
3. **Tradução nas bordas**: model Prisma ↔ entidade de domínio acontece somente em `infrastructure/database/repositories/`. DTO HTTP ↔ output da aplicação acontece somente em presenters.
4. **Erros**: camadas internas lançam `DomainError` (com `code`); a infra traduz para status HTTP. Nunca `throw new HttpException(...)` dentro de use-case.
5. **Env vars**: `process.env` é leitura de infraestrutura. O que a aplicação precisa deve entrar por construtor/parâmetro.

## Como verificar

```bash
npm test          # inclui test/architecture.spec.ts
```

O teste de arquitetura escaneia os arquivos de `src/domain` e `src/application` e falha se encontrar:
- `@nestjs/`, `@prisma/`, `axios`, `fetch`, `generated/prisma` no **domínio**;
- o mesmo conjunto + `infrastructure/` na **aplicação**.

## Exemplos

**Correto — use-case puro:**

```ts
// src/application/use-cases/check-health.use-case.ts
import { HealthCheckPort, HealthReport } from '../ports/health-check.port.js';

export class CheckHealthUseCase {
  constructor(private readonly healthCheck: HealthCheckPort) {}
  async execute(): Promise<HealthReport> { /* ... */ }
}
```

**Correto — adapter na infra:**

```ts
// src/infrastructure/database/prisma-health-check.adapter.ts
@Injectable()
export class PrismaHealthCheckAdapter implements HealthCheckPort {
  constructor(private readonly prisma: PrismaService) {}
  async snapshot(): Promise<DatabaseHealthSnapshot> { /* prisma.$queryRaw`SELECT 1` */ }
}
```

**Errado — Nest dentro da aplicação:**

```ts
// src/application/use-cases/bad.example.ts
import { Injectable } from '@nestjs/common'; // PROIBIDO

@Injectable() // acoplamento de framework na regra de negócio
export class CheckHealthUseCase { /* ... */ }
```

**Errado — ORM na aplicação:**

```ts
// src/application/use-cases/bad.example.ts
import { PrismaClient } from '../../generated/prisma/client.js'; // PROIBIDO
```
