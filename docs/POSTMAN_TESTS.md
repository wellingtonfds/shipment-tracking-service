# Testes de API no Postman — Collection de Customers

Collection: [`postman/Customers.postman_collection.json`](../postman/Customers.postman_collection.json)

Cobre o CRUD completo de `customers` (`GET` listar/detalhar, `POST` criar, `PUT` atualizar, `DELETE` remover). Rotas e campos em inglês (`/customers`, `name/phone/address`) — ver regra English-only em `docs/DOMAIN_RULES.md`. **mais dois cenários de erro** (404 inexistente, 409 email duplicado), com asserções automáticas em cada request.

## 1. Importar a collection

1. Abra o Postman → **Import** → arraste o arquivo `postman/Customers.postman_collection.json` (ou **File → Import**).
2. A collection vem com uma variável de ambiente da própria collection:
   - `baseUrl` — default `http://localhost:3000/api/v1` (troque se o app rodar em outra porta/host).
   - `customerId` / `generatedEmail` — preenchidos automaticamente pelos scripts de teste do `POST` (não edite à mão).

## 2. Subir a API

```bash
docker compose up -d      # MSSQL
npm run db:migrate        # aplica migrations + gera client
npm run db:seed           # massa inicial (15 customers)
npm run start:dev         # http://localhost:3000/api/v1
```

## 3. Dados realistas com o Faker (variáveis dinâmicas)

Os bodies dos requests usam as **variáveis dinâmicas nativas do Postman** (Faker embutido, sem extensão e sem script). Cada execução gera valores novos e plausíveis:

| Campo | Variável | Exemplo gerado |
| --- | --- | --- |
| name | `{{$randomFullName}}` | `Marcus Viana Rezende` |
| email | `{{$randomEmail}}` | `marcus.rezende@example.net` |
| phone | `{{$randomPhoneNumber}}` | `(27) 98123-4567` |
| address | `{{$randomStreetAddress}}` | `2759 Crossroad, apto 12` |

Exemplo do body do `Create customer`:

```json
{
  "name": "{{$randomFullName}}",
  "email": "{{$randomEmail}}",
  "phone": "{{$randomPhoneNumber}}",
  "address": "{{$randomStreetAddress}}"
}
```

Isso é essencial para o fluxo: o `POST` cria um customer **diferente a cada run** e os requests seguintes (detalhar/atualizar/remover) operam sobre o `id` que ele criou.

## 4. Scripts de teste (aba `Tests`)

Cada request tem asserções no script `Tests`. Visão geral:

| Request | Asserções principais |
| --- | --- |
| List customers | 200; tempo < 1000ms; `data` é array; `meta` de paginação; chaves `id/name/email/phone/address/createdAt/updatedAt` |
| Create customer | 201; tempo < 1000ms; `id` numérico; email contém `@`; salva `customerId` e `generatedEmail` em variáveis de collection |
| Get customer | 200; `id` e `email` iguais aos criados |
| Update customer | 200; email não foi alterado; `updatedAt >= createdAt` |
| Delete customer | 204 sem corpo; refaz o `GET` via `pm.sendRequest` e espera 404 |
| Get missing | 404 com `code: CUSTOMER_NOT_FOUND` |
| Duplicate email | 409 com `code: CUSTOMER_EMAIL_IN_USE` |

Exemplo de script (salvando o id para os próximos requests):

```js
pm.test('customer created with id', () => pm.expect(pm.response.json().id).to.be.a('number'));
pm.collectionVariables.set('customerId', pm.response.json().id);
```

## 5. Rodar com o Collection Runner

1. Selecione a collection → **Run** (Collection Runner).
2. Deixe marcado **"Save responses"** e a ordem padrão dos requests.
3. Clique **Run Customers**.

A ordem importa porque há estado compartilhado:

```
Listar → Criar → Detalhar → Atualizar → Remover → (erros) Detalhar 404 → Duplicado 409
```

- `Get/Update/Delete` dependem do `{{customerId}}` criado no `POST`.
- Os dois cenários de erro dependem de `{{generatedEmail}}` (o "duplicado" reusa o email do POST desta execução — por isso ele é 409 garantido).

Resultado esperado: **7/7 requests verdes**.

## 6. Alternativa: Newman (CLI)

```bash
npm install -g newman
newman run postman/Customers.postman_collection.json \
  -e postman/environment.json \   # opcional: baseUrl customizado
  --reporters cli,junit
```

Ou direto apontando o env inline:

```bash
newman run postman/Customers.postman_collection.json --global-var baseUrl=http://localhost:3000/api/v1
```

Útil para CI — mesma ordem e mesmas asserções do Runner.

## 7. Swagger

A spec OpenAPI viva (mesma forma dos DTOs desta collection) fica em `http://localhost:3000/docs` (spec JSON: `/docs-json`) — dá para importar `docs-json` no Postman como alternativa à collection versionada.
