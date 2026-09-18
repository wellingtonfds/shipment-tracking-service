# Convenções de API

## Geral

- Prefixo global: `/api/v1` (`API_PREFIX` no `.env`).
- Swagger UI: `http://localhost:3000/docs` — spec JSON: `/docs-json`.
- Todo endpoint responde JSON (`application/json`).

## Documentação obrigatória (nada vai a produção sem isto)

Todo controller deve ter:

1. `@ApiTags('NomeDoRecurso')` na classe.
2. `@ApiOperation({ summary, description })` em cada rota.
3. `@ApiResponse` para sucesso **e** para os erros possíveis, com `type` de presenter.

Todo DTO de request/response deve ter:

1. `@ApiProperty({ ... })` em **todas** as propriedades (com `example` e `description`).
2. Decorators de `class-validator` (o `ValidationPipe` global está com `whitelist`, `forbidNonWhitelisted` e `transform`).

## Formato de erro (padrão do GlobalExceptionFilter)

```json
{
  "statusCode": 422,
  "code": "MY_ERROR_CODE",
  "message": "Descrição legível",
  "path": "/api/v1/clientes/99",
  "timestamp": "2026-09-16T20:30:00.000Z"
}
```

| Origem | Status |
| --- | --- |
| `DomainError` | 422 (a menos que o filtro defina diferente) |
| `HttpException` do Nest (validação, not found, etc.) | status da exceção |
| Erro desconhecido | 500 `INTERNAL_ERROR` |

## Controllers

- Finos: validam entrada, chamam **um** use-case, mapeiam para presenter. Sem `if` de negócio.
- Nenhum acesso a Prisma/env em controllers.
- Versionamento: mudanças incompatíveis viram `/api/v2`, nunca quebram `/api/v1`.

## Checklist de novo endpoint

- [ ] `@ApiTags` + `@ApiOperation` + `@ApiResponse` (sucesso e erros)
- [ ] DTOs com `@ApiProperty` + `class-validator`
- [ ] Lógica em use-case (nada no controller)
- [ ] Erros de domínio com `DomainError` + `code`
- [ ] Teste e2e
