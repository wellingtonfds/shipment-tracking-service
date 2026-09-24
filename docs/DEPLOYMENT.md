# Deployment da aplicação

Este documento é a fonte de verdade da entrega do backend. O repositório da aplicação controla somente a imagem imutável, o `ConfigMap` não secreto, a ativação das réplicas e os HPAs. Namespace, Deployments completos, containers, Service, `TargetGroupBinding`, ServiceAccount, segredos, probes, recursos e segurança pertencem ao repositório de infraestrutura.

## Action composta

A action [`.github/actions/deploy/action.yml`](../.github/actions/deploy/action.yml) está disponível para um workflow futuro, mas nenhum workflow deste repositório a chama. Portanto, ela permanece inerte nesta entrega: não acessa AWS ou EKS, não publica imagens e não altera ambiente algum por conta própria.

O chamador deverá autenticar na AWS, obter credenciais do cluster para o `kubectl` e fornecer uma imagem por digest. A action executa, nesta ordem:

1. valida entradas e o contrato da baseline;
2. cria ou atualiza o `ConfigMap`;
3. atualiza a imagem da API e do worker;
4. aplica os dois HPAs e ativa os Deployments no mínimo configurado;
5. acompanha os dois rollouts.

### Entradas

| Entrada                                       | Obrigatória | Default                    | Finalidade                                          |
| --------------------------------------------- | ----------- | -------------------------- | --------------------------------------------------- |
| `image`                                       | sim         | —                          | Uma imagem no formato `repositorio@sha256:<digest>` |
| `config-map-data`                             | sim         | —                          | Dados não secretos no formato `CHAVE=valor`         |
| `namespace`                                   | não         | `tracking`                 | Namespace da baseline                               |
| `config-map-name`                             | não         | `tracking-runtime-config`  | ConfigMap gerenciado pela action                    |
| `api-deployment` / `api-container`            | não         | `tracking-api`             | Contrato da API                                     |
| `worker-deployment` / `worker-container`      | não         | `tracking-worker`          | Contrato do worker                                  |
| `service-name`                                | não         | `tracking-api`             | Service validado antes do deploy                    |
| `target-group-binding-name`                   | não         | `tracking-api`             | Associação ao target group validada antes do deploy |
| `service-account-name`                        | não         | `tracking-backend`         | Identidade de pod validada antes do deploy          |
| `secret-provider-class-name`                  | não         | `tracking-backend-secrets` | Integração de segredos validada antes do deploy     |
| `api-min-replicas` / `api-max-replicas`       | não         | `2` / `6`                  | Limites do HPA da API                               |
| `api-cpu-target`                              | não         | `60`                       | Utilização média de CPU da API                      |
| `worker-min-replicas` / `worker-max-replicas` | não         | `2` / `8`                  | Limites do HPA do worker                            |
| `worker-cpu-target`                           | não         | `65`                       | Utilização média de CPU do worker                   |
| `rollout-timeout`                             | não         | `5m`                       | Limite para cada `kubectl rollout status`           |

A action produz `previous-api-image`, `previous-worker-image` e `deployed-image`. Os dois primeiros permitem registrar a versão anterior e executar rollback explícito.

## ConfigMap não secreto

`config-map-data` aceita comentários, linhas vazias e somente estas chaves:

```dotenv
NODE_ENV=production
JWT_EXPIRES_IN=8h
REDIS_HOST=tracking.example.cache.amazonaws.com
TRACKING_QUEUE_NAME=tracking-events
TRACKING_DEAD_QUEUE_NAME=tracking-events-dlq
TRACKING_WORKER_CONCURRENCY=8
TRACKING_BACKOFF_MAX_MS=3600000
DLQ_REPLAY_INTERVAL_MS=86400000
OUTBOX_POLL_INTERVAL_MS=1000
OUTBOX_REDIS_RECONCILE_MS=60000
TRACKING_LOCK_TTL_MS=120000
TRACKING_RETRY_WINDOW_MS=86400000
GEOCODER_URL=https://nominatim.openstreetmap.org/search
GEOCODER_USER_AGENT=shipment-tracking/1.0 (contato@example.com)
GEOCODE_RATE_LIMIT=1
GEOCODER_CACHE_TTL_SECONDS=2592000
GEOCODER_CIRCUIT_FAILURES=5
GEOCODER_CIRCUIT_COOLDOWN_MS=30000
GEOCODER_TIMEOUT_MS=3000
```

`REDIS_HOST` é obrigatório porque a baseline habilita a fila. As demais chaves usam os defaults da aplicação quando omitidas.

`DATABASE_URL`, `JWT_SECRET`, `REDIS_PASSWORD` e `GEOCODER_API_KEY` nunca entram no ConfigMap. A infraestrutura os sincroniza do Secrets Manager para `tracking-backend-secrets`. `PORT`, `API_PREFIX`, papéis do dispatcher/worker e TLS do Redis também não são configuráveis pela action, pois fazem parte da baseline dos pods.

## Imagem, réplicas e HPA

A API e o worker usam a mesma imagem imutável, mas comandos diferentes definidos pela infraestrutura. Tags mutáveis são rejeitadas. A action atualiza apenas os containers esperados e falha antes de qualquer mutação se os nomes ou recursos da baseline não existirem.

Os HPAs usam `autoscaling/v2`, métrica de CPU, subida de até dois pods por minuto e estabilização de cinco minutos na redução. Como um HPA de CPU não reativa um Deployment em zero, a action escala cada target para seu mínimo logo após aplicar o HPA. Depois disso, o autoscaler assume a quantidade de pods.

## Rollback

Reexecute a action usando o digest anterior registrado em `previous-api-image` e `previous-worker-image`. A baseline exige que ambos usem a mesma imagem; se as saídas divergirem, investigue antes de escolher o digest. O rollback repete a atualização do ConfigMap e dos HPAs, então use os mesmos dados e parâmetros da entrega anterior.

Em uma intervenção manual autorizada, o equivalente para cada workload é:

```bash
kubectl -n tracking set image deployment/tracking-api \
  tracking-api=REPOSITORIO@sha256:DIGEST_ANTERIOR
kubectl -n tracking set image deployment/tracking-worker \
  tracking-worker=REPOSITORIO@sha256:DIGEST_ANTERIOR
kubectl -n tracking rollout status deployment/tracking-api --timeout=5m
kubectl -n tracking rollout status deployment/tracking-worker --timeout=5m
```

## Diagnóstico de rollout

Comece pelo estado e pelos eventos, sem alterar a baseline:

```bash
kubectl -n tracking get deployment,pod,hpa
kubectl -n tracking describe deployment tracking-api
kubectl -n tracking describe deployment tracking-worker
kubectl -n tracking get events --sort-by=.lastTimestamp
kubectl -n tracking logs deployment/tracking-api --all-containers --tail=200
kubectl -n tracking logs deployment/tracking-worker --all-containers --tail=200
```

- `ImagePullBackOff`: confirme digest, autenticação do node group no ECR e existência da imagem.
- falha de mount: verifique `SecretProviderClass`, Pod Identity, ASCP e as quatro chaves do segredo.
- probe da API: confirme `/api/v1/health` na porta `3000`.
- probe do worker: confirme a atualização de `/tmp/tracking-worker-health` e o volume `emptyDir`.
- pods pendentes: verifique capacidade de nós, requests e distribuição por zona.

Mudanças em probes, recursos, segurança, volumes, portas, comandos, Service ou segredos devem ser feitas no repositório de infraestrutura, não nesta action.
# Observabilidade e rollout

Antes de publicar esta imagem, aplique primeiro a PR de infraestrutura de
observabilidade: ela fornece add-on, permissões, log group, filtros e alarmes. O
backend usa somente o endpoint OTLP interno injetado pelo add-on; não configure
endpoint OTLP público.

No rollout, informe o `environment` correto no Helm values e confirme
`OTEL_SERVICE_NAME=shipment-tracking-service` em API e worker. Após o deploy, aguarde
alguns minutos e valide o serviço e os traces em CloudWatch Application Signals. Em
Logs Insights, procure `application.started` e `bullmq.backlog` nas duas filas com as
consultas de [OBSERVABILITY.md](OBSERVABILITY.md). A ausência de eventos dos alarmes
é `notBreaching`.
