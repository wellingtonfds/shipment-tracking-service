# Definição do Projeto — src-backend

## Objetivo

Backend REST construído sobre NestJS com **fronteiras explícitas** entre **domínio**, **aplicação** e **infraestrutura**. Toda regra de negócio é independente de framework HTTP, de ORM e de cliente HTTP externo. Toda API é documentada via Swagger/OpenAPI.

## Stack

| Camada | Tecnologia | Versão |
| --- | --- | --- |
| Runtime | Node.js (LTS Krypton, via nvm) | 24.21.0 |
| Framework HTTP | NestJS | 12.x |
| ORM | Prisma (driver adapter `@prisma/adapter-mssql`) | 7.10.0 |
| Banco de dados | Microsoft SQL Server (Docker) | 2022-latest |
| Documentação | Swagger/OpenAPI (`@nestjs/swagger`) | 3.0 |
| Lint | oxlint (type-aware) | 1.83 |
| Testes | vitest (unit + e2e) | 4.x |
| Gerenciador de pacotes | npm | 11.x |

## Glossário

- **Domínio**: regras de negócio puras. Nenhuma dependência externa.
- **Aplicação**: casos de uso que orquestram o domínio via ports.
- **Port**: interface (contrato) que define o que a aplicação precisa; implementada pela infraestrutura.
- **Adapter**: implementação concreta de uma port na infraestrutura (ex.: `PrismaHealthCheckAdapter`).
- **Presenter**: classe de resposta HTTP com `@ApiProperty`, traduz o output da aplicação.

## Regras de ouro (resumo — detalhes em DOMAIN_RULES.md)

1. `src/domain` não importa nada de fora dele (Nest, Prisma, HTTP, validadores).
2. `src/application` só importa de `src/domain` e de si mesma.
3. `src/infrastructure` pode importar de tudo — é o único lugar que conhece detalhes.
4. Controllers são finos: validam, chamam 1 use-case, retornam presenter.
5. Nenhum endpoint vai a produção sem documentação Swagger completa.

## Fora de escopo (fase inicial)

- Autenticação/autorização (planned: bearer JWT).
- Multi-tenancy.
- Cache distribuído.
- Mensageria/filas.

## Como evoluir

1. Nova regra de negócio → entidade/value object em `src/domain` + port se precisar de I/O.
2. Novo caso de uso → classe em `src/application/use-cases`, sem imports de Nest.
3. Exposição HTTP → controller + presenter em `src/infrastructure/http`, wiring no `HttpModule`.
4. Persistência → model no `prisma/schema.prisma` + repository que implementa port do domínio. Após migrar, rode `prisma generate` (`npm run db:migrate` já encadeia).
