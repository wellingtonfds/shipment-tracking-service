# Guia de Desenvolvimento

## Pré-requisitos

- nvm
- Docker

## Setup

```bash
nvm use                 # usa o Node do .nvmrc (24.21.0)
nvm install             # (primeira vez, se a versão ainda não existir)

docker compose up -d    # MSSQL 2022 na porta 1433 e Redis na porta 6380
npm ci
cp .env.example .env    # preencha DATABASE_URL/MSSQL_SA_PASSWORD

npx prisma migrate dev  # aplica migrations (no Prisma 7 NAO gera o client)
npm run db:generate     # prisma generate (o postinstall do npm ci tambem gera)
npm run start:dev       # API, worker e painel Bull Board
```

## Scripts

| Comando                | O que faz                                                                                                                                                                          |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run start:dev`    | dev com watch                                                                                                                                                                      |
| `npm run build`        | compila para `dist/`                                                                                                                                                               |
| `npm run start:prod`   | roda `dist/main.js`                                                                                                                                                                |
| `npm run start:worker` | inicia o processo de consumo da fila de tracking                                                                                                                                   |
| `npm test`             | testes unit + arquitetura                                                                                                                                                          |
| `npm run test:ci`      | testes unit + arquitetura com relatórios JUnit e cobertura                                                                                                                         |
| `npm run test:e2e`     | testes e2e (precisa de SQL Server e Redis no ar)                                                                                                                                   |
| `npm run lint`         | oxlint type-aware                                                                                                                                                                  |
| `npm run db:migrate`   | `prisma migrate dev` + `prisma generate`                                                                                                                                           |
| `npm run db:generate`  | `prisma generate` (recria `src/generated/prisma`)                                                                                                                                  |
| `npm run db:seed`      | popula o banco com massa fixa/idempotente: customers (15), users (14: 2 admin, 6 operadores vinculados, 6 portal CUSTOMER), shipments (12) e shipment_events (histórico por carga) |
| `npm run db:partition` | idempotente: cria fronteiras mensais vazias de `shipment_events` até cobrir 24 meses futuros (ver docs/DATABASE.md)                                                                |

## Autenticação (dev)

- `.env` precisa de `JWT_SECRET` (gerar com `openssl rand -base64 32`) e `JWT_EXPIRES_IN` (ex.: `8h`; ver `.env.example`).
- Login: `POST /api/v1/auth/login` com `{ email, password }` → `{ token }`. Usar como `Authorization: Bearer <token>`.
- Senha padrão de **desenvolvimento** de todos os usuários do seed: `Senha123!` (ex.: `admin@logistica.com`). O seed só define a senha no `create`; nunca commitar senha real.
- Rotas `/operadores/*` exigem `role = ADMINISTRATOR`, exceto `/operadores/me` (qualquer perfil autenticado).

## Dicas MSSQL

- Senha do `sa` precisa de maiúscula, minúscula, dígito e símbolo (>= 8 chars), senão o container reinicia em loop.
- Conexão local usa `encrypt=true;trustServerCertificate=true` (certificado autoassinado do container).
- Sem `enum` nativo: usar `String` no schema e validar no domínio.

## Processamento assíncrono de tracking

O recebimento de status e localização grava o evento bruto e o outbox em uma transação SQL. O dispatcher da API publica jobs com o identificador do outbox no BullMQ; com as flags do `.env.example`, `npm run start:dev` também consome a fila no mesmo processo. `npm run start:worker` continua disponível para executar o consumidor separadamente.

Para inspecionar e gerenciar as filas localmente, inicie a aplicação com `npm run start:dev` e acesse `http://127.0.0.1:3000/api/v1/admin/queues`. O painel lista as filas principal e DLQ, incluindo jobs e estados, e permite ações de gerenciamento do BullMQ. Ele fica disponível sem autenticação apenas em desenvolvimento e rejeita conexões remotas. Em produção, a rota retorna `404`.

Configure `TRACKING_QUEUE_ENABLED=true`, `REDIS_HOST`, `REDIS_PORT` e, em produção, `REDIS_TLS=true` e `REDIS_PASSWORD`. O worker também usa `TRACKING_WORKER_ROLE=true`; processos de API usam `TRACKING_WORKER_ROLE=false` quando o consumo roda separado.

Por padrão, o worker usa `https://nominatim.openstreetmap.org/search`, compatível com a resposta de busca do Nominatim. `GEOCODER_URL` permite sobrescrever esse endpoint e seu valor vazio desabilita a geocodificação. Configure `GEOCODER_USER_AGENT`, mantenha `GEOCODE_RATE_LIMIT=1` para a instância pública e use `GEOCODER_API_KEY` somente para provedores que a exijam. Também estão disponíveis `GEOCODER_CACHE_TTL_SECONDS`, `GEOCODER_CIRCUIT_FAILURES` e `GEOCODER_CIRCUIT_COOLDOWN_MS`. A indisponibilidade do provedor mantém o texto da localização. Jobs tentam novamente com backoff exponencial e jitter durante até 24 horas; depois seguem para a fila DLQ, com replay limitado por `DLQ_REPLAY_INTERVAL_MS`.

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

## Integração contínua

O workflow `.github/workflows/ci.yml` roda em pull requests e pushes para `main`:

- lint com oxlint type-aware;
- testes unitários e de arquitetura com relatório JUnit e cobertura;
- build da imagem Docker após lint e testes passarem.

Os relatórios JUnit e de cobertura ficam disponíveis como artefatos da execução por 14 dias. A imagem é apenas validada no CI e não é publicada em registry.

## Pull requests e releases

O workflow `.github/workflows/pr-title.yml` valida títulos de pull requests destinados a `main` segundo Conventional Commits. Use o formato `<type>[optional scope][!]: <description>`, por exemplo:

- `feat: add shipment export`
- `fix(tracking): handle missing event`
- `refactor!: replace authentication contract`

Os tipos aceitos são `build`, `chore`, `ci`, `docs`, `feat`, `fix`, `perf`, `refactor`, `revert`, `style` e `test`. O check **Validate PR title** deve ser configurado como obrigatório na proteção da branch `main`. Para que o título validado seja a mensagem analisada no release, use squash merge com a opção do GitHub para usar o título do pull request como mensagem padrão.

Após lint, testes e build Docker concluírem com sucesso em um push para `main`, o job de release executa o Semantic Release. Ele cria tags no formato `vX.Y.Z`, uma GitHub Release com notas automáticas e não publica pacotes npm nem imagens Docker.

| Título/commit                                                                   | Incremento  |
| ------------------------------------------------------------------------------- | ----------- |
| `feat`                                                                          | minor       |
| `fix`, `perf`, `revert`                                                         | patch       |
| qualquer tipo com `!` ou `BREAKING CHANGE`                                      | major       |
| `build`, `chore`, `ci`, `docs`, `refactor`, `style`, `test` sem breaking change | sem release |

Como não há tags anteriores, a primeira release publicável será `v1.0.0`. A versão em `package.json` e `package-lock.json` não é atualizada automaticamente; tags e GitHub Releases são a fonte oficial de versão.
