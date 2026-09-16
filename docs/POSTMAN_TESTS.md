# Testes de API no Postman — Collection de Clientes

Collection: [`postman/Clientes.postman_collection.json`](../postman/Clientes.postman_collection.json)

Cobre o CRUD completo (`GET` listar/detalhar, `POST` criar, `PUT` atualizar, `DELETE` remover) **mais dois cenários de erro** (404 inexistente, 409 email duplicado), com asserções automáticas em cada request.

## 1. Importar a collection

1. Abra o Postman → **Import** → arraste o arquivo `postman/Clientes.postman_collection.json` (ou **File → Import**).
2. A collection vem com uma variável de ambiente da própria collection:
   - `baseUrl` — default `http://localhost:3000/api/v1` (troque se o app rodar em outra porta/host).
   - `clienteId` / `emailGerado` — preenchidos automaticamente pelos scripts de teste do `POST` (não edite à mão).

## 2. Subir a API

```bash
docker compose up -d      # MSSQL
npm run db:migrate        # aplica migrations + gera client
npm run db:seed           # massa inicial (15 clientes)
npm run start:dev         # http://localhost:3000/api/v1
```

## 3. Dados realistas com o Faker (variáveis dinâmicas)

Os bodies dos requests usam as **variáveis dinâmicas nativas do Postman** (Faker embutido, sem extensão e sem script). Cada execução gera valores novos e plausíveis:

| Campo | Variável | Exemplo gerado |
| --- | --- | --- |
| nome | `{{$randomFullName}}` | `Marcus Viana Rezende` |
| email | `{{$randomEmail}}` | `marcus.rezende@example.net` |
| telefone | `{{$randomPhoneNumber}}` | `(27) 98123-4567` |
| endereço | `{{$randomStreetAddress}}` | `2759 Crossroad, apto 12` |

Exemplo do body do `Criar cliente`:

```json
{
  "nome": "{{$randomFullName}}",
  "email": "{{$randomEmail}}",
  "telefone": "{{$randomPhoneNumber}}",
  "endereco": "{{$randomStreetAddress}}"
}
```

Isso é essencial para o fluxo: o `POST` cria um cliente **diferente a cada run** e os requests seguintes (detalhar/atualizar/remover) operam sobre o `id` que ele criou.

## 4. Scripts de teste (aba `Tests`)

Cada request tem asserções no script `Tests`. Visão geral:

| Request | Asserções principais |
| --- | --- |
| Listar clientes | 200; tempo < 1000ms; `data` é array; `meta` de paginação; chaves `id/nome/email/telefone/endereco/createdAt/updatedAt` |
| Criar cliente | 201; tempo < 1000ms; `id` numérico; email contém `@`; salva `clienteId` e `emailGerado` em variáveis de collection |
| Detalhar cliente | 200; `id` e `email` iguais aos criados |
| Atualizar cliente | 200; email não foi alterado; `updatedAt >= createdAt` |
| Remover cliente | 204 sem corpo; refaz o `GET` via `pm.sendRequest` e espera 404 |
| Detalhar inexistente | 404 com `code: CLIENTE_NOT_FOUND` |
| Criar email duplicado | 409 com `code: CLIENTE_EMAIL_IN_USE` |

Exemplo de script (salvando o id para os próximos requests):

```js
pm.test('cliente criado com id', () => pm.expect(pm.response.json().id).to.be.a('number'));
pm.collectionVariables.set('clienteId', pm.response.json().id);
```

## 5. Rodar com o Collection Runner

1. Selecione a collection → **Run** (Collection Runner).
2. Deixe marcado **"Save responses"** e a ordem padrão dos requests.
3. Clique **Run Clientes**.

A ordem importa porque há estado compartilhado:

```
Listar → Criar → Detalhar → Atualizar → Remover → (erros) Detalhar 404 → Duplicado 409
```

- `Detalhar/Atualizar/Remover` dependem do `{{clienteId}}` criado no `POST`.
- Os dois cenários de erro dependem de `{{emailGerado}}` (o "duplicado" reusa o email do POST desta execução — por isso ele é 409 garantido).

Resultado esperado: **7/7 requests verdes**.

## 6. Alternativa: Newman (CLI)

```bash
npm install -g newman
newman run postman/Clientes.postman_collection.json \
  -e postman/environment.json \   # opcional: baseUrl customizado
  --reporters cli,junit
```

Ou direto apontando o env inline:

```bash
newman run postman/Clientes.postman_collection.json --global-var baseUrl=http://localhost:3000/api/v1
```

Útil para CI — mesma ordem e mesmas asserções do Runner.

## 7. Swagger

A spec OpenAPI viva (mesma forma dos DTOs desta collection) fica em `http://localhost:3000/docs` (spec JSON: `/docs-json`) — dá para importar `docs-json` no Postman como alternativa à collection versionada.
