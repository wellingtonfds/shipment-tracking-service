# AGENTS.md — src-backend

Instruções para qualquer agente de código trabalhando neste repositório. Este arquivo é um **índice**: a fonte de verdade está em `docs/`. Se uma regra aqui precisa de mais que 3 linhas, ela deve viver em `docs/` e este arquivo só aponta para ela.

## Contexto rápido

- Stack: Node 24.21.0 (via nvm, `.nvmrc`) · NestJS 12 · Prisma 7 (`@prisma/adapter-mssql`) · MSSQL 2022 (Docker) · npm
- Setup e comandos: [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)
- Fronteiras do projeto: **domínio**, **aplicação** e **infraestrutura** com dependência sempre para dentro (`infrastructure → application → domain`).

## Índice de documentação (leia antes de modificar código)

| Tema | Documento |
| --- | --- |
| Objetivo, stack, glossário, escopo, "como evoluir" | [docs/PROJECT_DEFINITION.md](docs/PROJECT_DEFINITION.md) |
| Camadas, fluxo de request, composition root, estrutura de diretórios, erros, banco, testes, Swagger | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| Fronteiras por camada (proibições), consequências práticas, exemplos certo/errado | [docs/DOMAIN_RULES.md](docs/DOMAIN_RULES.md) |
| Convenções REST, documentação Swagger obrigatória, formato de erro, checklist de endpoint | [docs/API_CONVENTIONS.md](docs/API_CONVENTIONS.md) |
| Setup passo a passo, scripts, dicas MSSQL, fluxo de trabalho | [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) |
| Modelo de dados canônico (ER, índices, convenções) | [docs/DATABASE.md](docs/DATABASE.md) |
| Definição de negócio do tracking (endpoints futuros, regras) | [docs/TRACKING_DEFINITION.md](docs/TRACKING_DEFINITION.md) |
| Collection Postman de Customers: import, Faker dinâmico, Runner, Newman | [docs/POSTMAN_TESTS.md](docs/POSTMAN_TESTS.md) |
| Graphify (uso obrigatório, update pós-pull/pós-modificação) | [docs/GRAPHIFY.md](docs/GRAPHIFY.md) |

## Regras inegociáveis (resumo — detalhes nos docs acima)

1. `src/domain` é puro: sem `@nestjs/*`, `@prisma/*`, clientes HTTP, validadores ou imports de outras camadas.
2. `src/application` importa apenas de `src/domain` e de si mesma; use-cases não usam `@Injectable` — DI por token string da feature (`src/application/<feature>/<feature>.tokens.ts`).
3. `src/infrastructure` é o único lugar com Nest, Prisma, `process.env` sensível e controllers; controllers são finos (validam → 1 use-case → presenter).
4. Todo endpoint documenta Swagger: `@ApiTags`, `@ApiOperation`, `@ApiResponse` (sucesso + erros) e DTOs com `@ApiProperty` + `class-validator`. Ver [docs/API_CONVENTIONS.md](docs/API_CONVENTIONS.md).
5. Erros de camadas internas lançam `DomainError` (com `code`); nunca `HttpException` fora da infraestrutura.
6. **Código sempre em inglês** (identificadores, pastas, tokens, error codes, models Prisma, rotas/campos JSON, mensagens de erro/log e textos Swagger). PT-BR só em prosa de `docs/` e dados. Obrigatório definir o glossário PT→EN da feature no PR. Ver [docs/DOMAIN_RULES.md](docs/DOMAIN_RULES.md#regra-obrigatória-english-only-code).
7. Prisma 7: `migrate dev` **não** gera o client automaticamente — rode `prisma generate` após qualquer mudança de schema (o `postinstall` também gera).
8. Graphify é obrigatório: consulte o grafo (`graphify query/path/explain` ≡ `/graphify query/path/explain`) antes de explorar o código; atualize após `git pull` (build se `graphify-out/graph.json` não existir, senão `--update`) e após qualquer modificação de código. Ver [docs/GRAPHIFY.md](docs/GRAPHIFY.md).

## Verificação antes de concluir qualquer tarefa

```bash
npm run lint
npm test          # inclui test/architecture.spec.ts (fronteiras)
npm run test:e2e  # precisa do banco no ar (docker compose up -d)
npm run build
```
