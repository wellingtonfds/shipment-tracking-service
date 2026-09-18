# Guia de Desenvolvimento

## Pré-requisitos

- nvm
- Docker

## Setup

```bash
nvm use                 # usa o Node do .nvmrc (24.21.0)
nvm install             # (primeira vez, se a versão ainda não existir)

docker compose up -d    # MSSQL 2022 na porta 1433 (aguarde healthcheck)
npm ci
cp .env.example .env    # preencha DATABASE_URL/MSSQL_SA_PASSWORD

npx prisma migrate dev  # aplica migrations (no Prisma 7 NAO gera o client)
npm run db:generate     # prisma generate (o postinstall do npm ci tambem gera)
npm run start:dev       # http://localhost:3000/api/v1 — Swagger em /docs
```

## Scripts

| Comando | O que faz |
| --- | --- |
| `npm run start:dev` | dev com watch |
| `npm run build` | compila para `dist/` |
| `npm run start:prod` | roda `dist/main.js` |
| `npm test` | testes unit + arquitetura |
| `npm run test:e2e` | testes e2e (precisa do banco no ar) |
| `npm run lint` | oxlint type-aware |
| `npm run db:migrate` | `prisma migrate dev` + `prisma generate` |
| `npm run db:generate` | `prisma generate` (recria `src/generated/prisma`) |
| `npm run db:seed` | popula o banco com massa fixa/idempotente: customers (15), users (14: 2 admin, 6 operadores vinculados, 6 portal CUSTOMER), shipments (12) e shipment_events (histórico por carga) |
| `npm run db:partition` | idempotente: cria fronteiras mensais vazias de `shipment_events` até cobrir 24 meses futuros (ver docs/DATABASE.md) |

## Autenticação (dev)

- `.env` precisa de `JWT_SECRET` (gerar com `openssl rand -base64 32`) e `JWT_EXPIRES_IN` (ex.: `8h`; ver `.env.example`).
- Login: `POST /api/v1/auth/login` com `{ email, password }` → `{ token }`. Usar como `Authorization: Bearer <token>`.
- Senha padrão de **desenvolvimento** de todos os usuários do seed: `Senha123!` (ex.: `admin@logistica.com`). O seed só define a senha no `create`; nunca commitar senha real.
- Rotas `/operadores/*` exigem `role = ADMINISTRATOR`, exceto `/operadores/me` (qualquer perfil autenticado).

## Dicas MSSQL

- Senha do `sa` precisa de maiúscula, minúscula, dígito e símbolo (>= 8 chars), senão o container reinicia em loop.
- Conexão local usa `encrypt=true;trustServerCertificate=true` (certificado autoassinado do container).
- Sem `enum` nativo: usar `String` no schema e validar no domínio.

## Client gerado

- `src/generated/prisma` (output do generator `prisma-client`) é **artefato de build**: fica no `.gitignore` e é recriado por `npm ci` (postinstall) ou `npm run db:generate`. Nunca versionar.

## Verificações de fronteira

```bash
npm test   # test/architecture.spec.ts falha se domain/application importarem framework/ORM/infra
```

## Fluxo de trabalho sugerido

1. Escrever a regra (domínio/aplicação) + teste unitário.
2. Criar/alterar model no `prisma/schema.prisma` → `npm run db:migrate -- --name <nome>` (já roda `prisma generate`).
3. Implementar adapter/port na infraestrutura.
4. Controller + presenter + Swagger.
5. Teste e2e.
6. `npm run lint && npm test && npm run build` antes do PR.
