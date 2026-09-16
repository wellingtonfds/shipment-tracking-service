# src-backend

Backend NestJS com fronteiras explícitas entre **domínio**, **aplicação** e **infraestrutura**. Regras de negócio independentes de framework HTTP, de ORM e de cliente HTTP externo. API 100% documentada com Swagger/OpenAPI. Prisma 7 + MSSQL 2022 (Docker).

- **Node:** 24.21.0 (LTS Krypton) — use `nvm use` (`.nvmrc`)
- **Stack:** NestJS 12, Prisma 7 (`@prisma/adapter-mssql`), MSSQL 2022, vitest, oxlint

## Documentação

| Documento | Conteúdo |
| --- | --- |
| [docs/PROJECT_DEFINITION.md](docs/PROJECT_DEFINITION.md) | Objetivo, stack, glossário, escopo |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Camadas, fluxo, estrutura, erros |
| [docs/DOMAIN_RULES.md](docs/DOMAIN_RULES.md) | Regras de fronteira e proibições por camada |
| [docs/API_CONVENTIONS.md](docs/API_CONVENTIONS.md) | Padrão REST, formato de erro, checklist Swagger |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | Setup passo a passo e scripts |

## Início rápido

```bash
nvm use                 # Node 24.21.0
docker compose up -d    # MSSQL 2022
npm ci                  # postinstall já roda prisma generate
cp .env.example .env    # preencher credenciais
npm run db:migrate
npm run start:dev
```

- API: `http://localhost:3000/api/v1`
- Swagger: `http://localhost:3000/docs`
- Health: `GET /api/v1/health`

## Qualidade

```bash
npm run lint
npm test          # unit + arquitetura (fronteiras)
npm run test:e2e  # HTTP real + banco
npm run build
```
