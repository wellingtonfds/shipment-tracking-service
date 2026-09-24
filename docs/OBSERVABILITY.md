# Observabilidade

## Arquitetura de coleta

API e worker escrevem somente JSON em `stdout` com `nestjs-pino`. Em EKS, o add-on
`amazon-cloudwatch-observability` coleta esses logs e fornece o endpoint OTLP interno.
`src/main.ts` e `src/worker.ts` carregam OTel antes do Nest, inclusive em ESM. Não há
endpoint público `/metrics` e nenhum exporter é iniciado sem endpoint interno injetado.

Os campos comuns são `service`, `environment`, `component`, `event`, `traceId` e
`spanId`; logs HTTP também incluem `requestId`. Autorização, cookies, tokens, senhas,
chaves e segredos são redigidos como `[REDACTED]`.

`bullmq-otel` cria traces e contadores OTel para as filas principal e DLQ. A cada
minuto o worker publica `bullmq.backlog` com `waiting`, `delayed`, `failed` e
`backlog` (a soma). Eventos operacionais: `geocoder.circuit.opened` (uma vez por
abertura), `redis.error`, `tracking.dispatch.*`, `tracking.lock.*` e
`tracking.dlq.enqueued`.

O contrato assíncrono não muda: a API responde `202 Accepted`, o circuito segue
particionado pelo hash do endpoint do provedor e eventos tardios permanecem no
histórico.

## CloudWatch Logs Insights

Selecione `/aws/containerinsights/<cluster>/application`.

```text
fields @timestamp, event, component, traceId, spanId, requestId, queue, backlog
| filter event = "geocoder.circuit.opened"
| sort @timestamp desc
```

```text
fields @timestamp, queue, waiting, delayed, failed, backlog
| filter event = "bullmq.backlog"
| stats max(backlog) as maxBacklog by bin(5m), queue
| sort maxBacklog desc
```

```text
fields @timestamp, event, shipmentId, outboxId, error, traceId
| filter event like /tracking\.(dispatch\.failed|lock\.|dlq\.)/ or event = "redis.error"
| sort @timestamp desc
```

## Roteiro de diagnóstico

1. Correlacione API, dispatcher e worker por `traceId`.
2. Se o circuito abriu, valide provedor e cooldown antes de alterar configuração.
3. Se backlog cresce, compare `waiting`, `delayed` e `failed`; valide Redis e workers.
4. Para DLQ, use `outboxId` no histórico; não reenvie sem preservar idempotência.
