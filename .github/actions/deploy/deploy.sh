#!/usr/bin/env bash
set -euo pipefail

fail() {
  printf '::error::%s\n' "$*" >&2
  exit 1
}

require_name() {
  local label="$1"
  local value="$2"
  [[ "$value" =~ ^[a-z0-9]([-a-z0-9]*[a-z0-9])?$ ]] ||
    fail "$label must be a DNS label: $value"
}

require_positive_integer() {
  local label="$1"
  local value="$2"
  [[ "$value" =~ ^[1-9][0-9]*$ ]] || fail "$label must be a positive integer"
}

require_cpu_target() {
  local label="$1"
  local value="$2"
  require_positive_integer "$label" "$value"
  ((value <= 100)) || fail "$label must be at most 100"
}

for command_name in kubectl mktemp; do
  command -v "$command_name" >/dev/null 2>&1 || fail "$command_name is required"
done

require_name namespace "$DEPLOY_NAMESPACE"
require_name config-map-name "$DEPLOY_CONFIG_MAP_NAME"
require_name api-deployment "$DEPLOY_API_DEPLOYMENT"
require_name api-container "$DEPLOY_API_CONTAINER"
require_name worker-deployment "$DEPLOY_WORKER_DEPLOYMENT"
require_name worker-container "$DEPLOY_WORKER_CONTAINER"
require_name service-name "$DEPLOY_SERVICE_NAME"
require_name target-group-binding-name "$DEPLOY_TARGET_GROUP_BINDING_NAME"
require_name service-account-name "$DEPLOY_SERVICE_ACCOUNT_NAME"
require_name secret-provider-class-name "$DEPLOY_SECRET_PROVIDER_CLASS_NAME"

[[ "$DEPLOY_IMAGE" =~ ^[^[:space:]]+@sha256:[0-9a-fA-F]{64}$ ]] ||
  fail "image must be immutable and use the repository@sha256:<64 hex characters> format"
[[ "$DEPLOY_ROLLOUT_TIMEOUT" =~ ^[1-9][0-9]*(s|m|h)$ ]] ||
  fail "rollout-timeout must use a positive s, m, or h duration"

require_positive_integer api-min-replicas "$DEPLOY_API_MIN_REPLICAS"
require_positive_integer api-max-replicas "$DEPLOY_API_MAX_REPLICAS"
require_cpu_target api-cpu-target "$DEPLOY_API_CPU_TARGET"
require_positive_integer worker-min-replicas "$DEPLOY_WORKER_MIN_REPLICAS"
require_positive_integer worker-max-replicas "$DEPLOY_WORKER_MAX_REPLICAS"
require_cpu_target worker-cpu-target "$DEPLOY_WORKER_CPU_TARGET"
((DEPLOY_API_MIN_REPLICAS <= DEPLOY_API_MAX_REPLICAS)) ||
  fail "api-min-replicas cannot exceed api-max-replicas"
((DEPLOY_WORKER_MIN_REPLICAS <= DEPLOY_WORKER_MAX_REPLICAS)) ||
  fail "worker-min-replicas cannot exceed worker-max-replicas"

declare -A allowed_config_keys=(
  [NODE_ENV]=1
  [JWT_EXPIRES_IN]=1
  [REDIS_HOST]=1
  [TRACKING_QUEUE_NAME]=1
  [TRACKING_DEAD_QUEUE_NAME]=1
  [TRACKING_WORKER_CONCURRENCY]=1
  [TRACKING_BACKOFF_MAX_MS]=1
  [DLQ_REPLAY_INTERVAL_MS]=1
  [OUTBOX_POLL_INTERVAL_MS]=1
  [OUTBOX_REDIS_RECONCILE_MS]=1
  [TRACKING_LOCK_TTL_MS]=1
  [TRACKING_RETRY_WINDOW_MS]=1
  [GEOCODER_URL]=1
  [GEOCODER_USER_AGENT]=1
  [GEOCODE_RATE_LIMIT]=1
  [GEOCODER_CACHE_TTL_SECONDS]=1
  [GEOCODER_CIRCUIT_FAILURES]=1
  [GEOCODER_CIRCUIT_COOLDOWN_MS]=1
  [GEOCODER_TIMEOUT_MS]=1
)

config_file="$(mktemp)"
trap 'rm -f "$config_file"' EXIT
printf '%s\n' "$DEPLOY_CONFIG_MAP_DATA" >"$config_file"
[[ -s "$config_file" ]] || fail "config-map-data cannot be empty"

config_key_count=0
declare -A seen_config_keys=()
while IFS= read -r line || [[ -n "$line" ]]; do
  [[ -z "$line" || "$line" == \#* ]] && continue
  [[ "$line" =~ ^[A-Z][A-Z0-9_]*= ]] ||
    fail "config-map-data contains an invalid env line"
  key="${line%%=*}"
  [[ -n "${allowed_config_keys[$key]:-}" ]] ||
    fail "$key is secret, deployment-owned, or unsupported in the runtime ConfigMap"
  seen_config_keys[$key]=1
  ((config_key_count += 1))
done <"$config_file"
((config_key_count > 0)) || fail "config-map-data must contain at least one supported key"
[[ -n "${seen_config_keys[REDIS_HOST]:-}" ]] ||
  fail "config-map-data must define REDIS_HOST because the queue is enabled"

kubectl version --client >/dev/null
kubectl get namespace "$DEPLOY_NAMESPACE" >/dev/null

for resource in \
  "deployment/$DEPLOY_API_DEPLOYMENT" \
  "deployment/$DEPLOY_WORKER_DEPLOYMENT" \
  "service/$DEPLOY_SERVICE_NAME" \
  "targetgroupbinding/$DEPLOY_TARGET_GROUP_BINDING_NAME" \
  "serviceaccount/$DEPLOY_SERVICE_ACCOUNT_NAME" \
  "secretproviderclass/$DEPLOY_SECRET_PROVIDER_CLASS_NAME"; do
  kubectl -n "$DEPLOY_NAMESPACE" get "$resource" >/dev/null ||
    fail "required infrastructure resource not found: $DEPLOY_NAMESPACE/$resource"
done

container_name() {
  local deployment="$1"
  local container="$2"
  kubectl -n "$DEPLOY_NAMESPACE" get deployment "$deployment" \
    -o "jsonpath={.spec.template.spec.containers[?(@.name==\"$container\")].name}"
}

container_image() {
  local deployment="$1"
  local container="$2"
  kubectl -n "$DEPLOY_NAMESPACE" get deployment "$deployment" \
    -o "jsonpath={.spec.template.spec.containers[?(@.name==\"$container\")].image}"
}

[[ "$(container_name "$DEPLOY_API_DEPLOYMENT" "$DEPLOY_API_CONTAINER")" == "$DEPLOY_API_CONTAINER" ]] ||
  fail "API container was not found in its infrastructure Deployment"
[[ "$(container_name "$DEPLOY_WORKER_DEPLOYMENT" "$DEPLOY_WORKER_CONTAINER")" == "$DEPLOY_WORKER_CONTAINER" ]] ||
  fail "worker container was not found in its infrastructure Deployment"

previous_api_image="$(container_image "$DEPLOY_API_DEPLOYMENT" "$DEPLOY_API_CONTAINER")"
previous_worker_image="$(container_image "$DEPLOY_WORKER_DEPLOYMENT" "$DEPLOY_WORKER_CONTAINER")"

kubectl -n "$DEPLOY_NAMESPACE" create configmap "$DEPLOY_CONFIG_MAP_NAME" \
  --from-env-file="$config_file" --dry-run=client -o yaml |
  kubectl apply -f -

kubectl -n "$DEPLOY_NAMESPACE" set image \
  "deployment/$DEPLOY_API_DEPLOYMENT" "$DEPLOY_API_CONTAINER=$DEPLOY_IMAGE"
kubectl -n "$DEPLOY_NAMESPACE" set image \
  "deployment/$DEPLOY_WORKER_DEPLOYMENT" "$DEPLOY_WORKER_CONTAINER=$DEPLOY_IMAGE"

kubectl apply -f - <<EOF
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: ${DEPLOY_API_DEPLOYMENT}
  namespace: ${DEPLOY_NAMESPACE}
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: ${DEPLOY_API_DEPLOYMENT}
  minReplicas: ${DEPLOY_API_MIN_REPLICAS}
  maxReplicas: ${DEPLOY_API_MAX_REPLICAS}
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: ${DEPLOY_API_CPU_TARGET}
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 0
      selectPolicy: Max
      policies:
        - type: Pods
          value: 2
          periodSeconds: 60
    scaleDown:
      stabilizationWindowSeconds: 300
      selectPolicy: Max
      policies:
        - type: Percent
          value: 25
          periodSeconds: 60
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: ${DEPLOY_WORKER_DEPLOYMENT}
  namespace: ${DEPLOY_NAMESPACE}
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: ${DEPLOY_WORKER_DEPLOYMENT}
  minReplicas: ${DEPLOY_WORKER_MIN_REPLICAS}
  maxReplicas: ${DEPLOY_WORKER_MAX_REPLICAS}
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: ${DEPLOY_WORKER_CPU_TARGET}
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 0
      selectPolicy: Max
      policies:
        - type: Pods
          value: 2
          periodSeconds: 60
    scaleDown:
      stabilizationWindowSeconds: 300
      selectPolicy: Max
      policies:
        - type: Percent
          value: 25
          periodSeconds: 60
EOF

# A CPU HPA cannot activate a target held at zero; this action owns that transition.
kubectl -n "$DEPLOY_NAMESPACE" scale "deployment/$DEPLOY_API_DEPLOYMENT" \
  --replicas="$DEPLOY_API_MIN_REPLICAS"
kubectl -n "$DEPLOY_NAMESPACE" scale "deployment/$DEPLOY_WORKER_DEPLOYMENT" \
  --replicas="$DEPLOY_WORKER_MIN_REPLICAS"

kubectl -n "$DEPLOY_NAMESPACE" rollout status \
  "deployment/$DEPLOY_API_DEPLOYMENT" --timeout="$DEPLOY_ROLLOUT_TIMEOUT"
kubectl -n "$DEPLOY_NAMESPACE" rollout status \
  "deployment/$DEPLOY_WORKER_DEPLOYMENT" --timeout="$DEPLOY_ROLLOUT_TIMEOUT"

if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  {
    printf 'previous-api-image=%s\n' "$previous_api_image"
    printf 'previous-worker-image=%s\n' "$previous_worker_image"
    printf 'deployed-image=%s\n' "$DEPLOY_IMAGE"
  } >>"$GITHUB_OUTPUT"
fi
