# Definição do Projeto — src-backend

## Objetivo

Backend REST para gestão de clientes e usuários, autenticação JWT, cadastro e rastreamento de cargas, consulta de histórico e geocodificação de endereços. Atualizações de status e localização são recebidas de forma assíncrona, com persistência durável, filas e processamento idempotente.

O projeto é construído sobre NestJS com **fronteiras explícitas** entre **domínio**, **aplicação** e **infraestrutura**. Regras de negócio permanecem independentes do framework HTTP, do ORM, do sistema de filas e de clientes HTTP externos. Toda API é documentada via Swagger/OpenAPI.

## Stack

| Categoria | Tecnologia | Versão |
| --- | --- | --- |
| Linguagem | TypeScript | 6.x |
| Runtime | Node.js (LTS Krypton, via nvm) | 24.21.0 |
| Framework HTTP | NestJS | 12.x |
| ORM | Prisma (driver adapter `@prisma/adapter-mssql`) | 7.10.0 |
| Banco de dados | Microsoft SQL Server (Docker) | 2022-latest |
| Filas e jobs | BullMQ | 5.x |
| Cache, locks e transporte das filas | Redis | 7-alpine |
| Cliente Redis | ioredis | 5.x |
| Painel de filas | Bull Board | 9.x |
| Geração da documentação | `@nestjs/swagger` | 12.x |
| Especificação da API | OpenAPI | 3.0 |
| Lint | oxlint (type-aware) | 1.83.x |
| Testes | vitest (unit + e2e) | 4.x |
| Gerenciador de pacotes | npm | 11.x |

## Glossário

- **Customer**: cliente proprietário das cargas e ao qual usuários dos perfis `OPERATOR` e `CUSTOMER` podem estar vinculados.
- **User**: usuário autenticável do sistema, com perfil `ADMINISTRATOR`, `OPERATOR` ou `CUSTOMER`.
- **Shipment**: carga rastreada, identificada por `cargoCode`, com origem, destino, responsável, datas e status atual.
- **ShipmentEvent**: ocorrência histórica de status ou localização de uma carga.
- **Domínio**: regras de negócio puras, entidades e repository ports; não depende de frameworks ou detalhes externos.
- **Aplicação**: casos de uso que orquestram o domínio e declaram ports para serviços externos sem entidade de domínio.
- **Port**: interface que define uma dependência de saída; repository ports vivem no domínio e ports de serviços externos vivem na aplicação.
- **Adapter**: implementação de uma port na infraestrutura, como um repositório Prisma ou um cliente de geocodificação com cache Redis.
- **Presenter**: classe de resposta HTTP com `@ApiProperty` que traduz o output da aplicação.
- **Outbox**: registro SQL durável criado junto com uma solicitação assíncrona antes de ela ser publicada no Redis.
- **Dispatcher**: processo que lê registros pendentes do outbox e publica jobs BullMQ com identificador determinístico.
- **Worker**: processo que consome jobs, serializa o trabalho por carga e persiste o resultado no histórico.
- **Idempotência**: garantia de que a repetição da mesma solicitação não cria uma segunda ocorrência; na atualização de localização, usa `Idempotency-Key` por carga.

## Regras de ouro (resumo — detalhes em [DOMAIN_RULES.md](./DOMAIN_RULES.md))

1. `src/domain` não importa nada de fora dele (Nest, Prisma, HTTP, validadores).
2. `src/application` só importa de `src/domain` e de si mesma.
3. `src/infrastructure` pode importar de tudo — é o único lugar que conhece detalhes externos.
4. Controllers são finos: validam, chamam 1 use-case, retornam presenter.
5. Nenhum endpoint vai a produção sem documentação Swagger completa.

## Escopo atual e limites

Estão implementados:

- CRUD de clientes e gestão de usuários, incluindo perfil do próprio usuário;
- autenticação JWT Bearer e autorização por perfil;
- criação, consulta, atualização, cancelamento e histórico de cargas;
- isolamento funcional das cargas pelo `Customer` associado ao principal autenticado;
- geocodificação na criação da carga e via `GET /tracking/geocode`, com cache e controles distribuídos no Redis;
- ingestão assíncrona de status e localização por outbox SQL, dispatcher, BullMQ, worker, retentativas e DLQ;
- idempotência da atualização de localização e serialização do processamento por carga;
- observação das filas pelo Bull Board no ambiente de desenvolvimento.

O isolamento por cliente é uma regra funcional de autorização, não uma plataforma genérica de multi-tenancy: os clientes compartilham a mesma aplicação, banco e schema. Contratos, regras e limites detalhados de tracking estão em [TRACKING_DEFINITION.md](./TRACKING_DEFINITION.md); modelo de dados e índices estão em [DATABASE.md](./DATABASE.md); configuração e operação local estão em [DEVELOPMENT.md](./DEVELOPMENT.md).

## Interfaces públicas

A API usa o prefixo `/api/v1`, autenticação Bearer nos endpoints protegidos e documentação Swagger em `/docs`. Entre as interfaces de tracking existentes estão `GET /tracking/geocode` e as atualizações assíncronas de status e localização, que respondem `202 Accepted` após a persistência da solicitação. A lista completa de endpoints, perfis de acesso e erros está em [TRACKING_DEFINITION.md](./TRACKING_DEFINITION.md) e as convenções de contrato estão em [API_CONVENTIONS.md](./API_CONVENTIONS.md).

## Como evoluir

1. Nova regra de negócio → entidade, value object ou serviço puro em `src/domain/<feature>`; se houver persistência de entidades, declare o repository port em `src/domain/<feature>/ports`.
2. Novo caso de uso → classe em `src/application/<feature>/use-cases`, sem imports de Nest; dependências de serviços externos sem entidade de domínio são ports da aplicação.
3. Nova integração → adapter em `src/infrastructure` que implemente a port correspondente; Prisma, Redis, BullMQ, configuração e clientes HTTP permanecem nessa camada.
4. Exposição HTTP → DTO, controller e presenter em `src/infrastructure/http`, com wiring por token string no módulo da feature e documentação Swagger completa.
5. Mudança de persistência → atualize `prisma/schema.prisma`, crie a migration e rode `prisma generate` após migrar, pois o Prisma 7 não gera o client automaticamente.
6. Novo fluxo assíncrono → preserve a gravação transacional no outbox, publicação pelo dispatcher e consumo idempotente pelo worker; documente retentativas, DLQ, concorrência e operação nos documentos especializados.

Consulte [ARCHITECTURE.md](./ARCHITECTURE.md) para estrutura e composition root, [DOMAIN_RULES.md](./DOMAIN_RULES.md) para fronteiras e [DEVELOPMENT.md](./DEVELOPMENT.md) para comandos e fluxo de trabalho.
