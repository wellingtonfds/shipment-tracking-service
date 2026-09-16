# Regras de Fronteira (Domain Rules)

**Regra central: a regra de negócio não pode depender de framework HTTP, de ORM nem de cliente HTTP externo.**

## Regra obrigatória: English-only code

Todo código do projeto é escrito em **inglês**. PT-BR é permitido **apenas** em:

1. Prosa de `docs/` e `AGENTS.md`.
2. Dados (seed, massas de teste) e valores de `example`/dados exibidos (ex.: nomes no seed podem ser brasileiros).

Devem ser **sempre em inglês**:

| Artefato | Exemplo correto | Errado |
| --- | --- | --- |
| Entidades, interfaces, classes, funções, variáveis | `Customer`, `CustomerRepositoryPort` | `Cliente`, `ClienteRepositoryPort` |
| Arquivos e pastas de código | `customer.entity.ts`, `src/domain/customers/` | `cliente.entity.ts`, `src/domain/clientes/` |
| Tokens de DI | `CUSTOMER_REPOSITORY` | `CLIENTE_REPOSITORY` |
| `code` de `DomainError` (contrato HTTP) | `CUSTOMER_NOT_FOUND` | `CLIENTE_NOT_FOUND` |
| Mensagens de erro/log | `Customer 99 not found` | `Cliente 99 não encontrado` |
| Models/colunas Prisma e tabelas | `model Customer`, campo `name` | `model Cliente`, campo `nome` |
| Rotas e campos JSON da API | `GET /customers`, body `{ name, email, phone, address }` | `GET /clientes`, `{ nome, telefone, endereco }` |
| Textos Swagger (`summary`, `description`, `@ApiProperty`) | `'List all customers'` | `'Lista todos os clientes'` |

Como criar uma feature nova:

1. Definir o **glossário PT→EN** do recurso no PR (tabela acima serve de molde).
2. Aplicar o glossário em todas as camadas: domínio → aplicação → infra (rotas, banco, DTOs, mensagens).
3. A documentação em `docs/` é escrita em PT-BR, mas **caminhos e nomes de código citados nos docs seguem o inglês** (evita drift entre doc e código).

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

1. **Use-cases são classes puras** construídas via factory no módulo de infra — não usam `@Injectable`. DI por token string da feature (`application/<feature>/<feature>.tokens.ts`).
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
// src/application/health/use-cases/check-health.use-case.ts
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
// src/application/health/use-cases/bad.example.ts
import { Injectable } from '@nestjs/common'; // PROIBIDO

@Injectable() // acoplamento de framework na regra de negócio
export class CheckHealthUseCase { /* ... */ }
```

**Errado — ORM na aplicação:**

```ts
// src/application/clientes/use-cases/bad.example.ts
import { PrismaClient } from '../../generated/prisma/client.js'; // PROIBIDO
```
