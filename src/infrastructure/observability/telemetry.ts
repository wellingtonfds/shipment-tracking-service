import { context, trace } from '@opentelemetry/api';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';

const serviceName = process.env.OTEL_SERVICE_NAME ?? 'shipment-tracking-service';
const environment = process.env.NODE_ENV ?? 'development';
const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

interface TelemetrySdk {
  start(): void;
  shutdown(): Promise<void>;
}

export function activeTraceFields(): Record<string, string> {
  const spanContext = trace.getSpan(context.active())?.spanContext();
  return spanContext && spanContext.traceId !== '00000000000000000000000000000000'
    ? { traceId: spanContext.traceId, spanId: spanContext.spanId }
    : {};
}

// OTLP is deliberately opt-in: local development never exports telemetry and the
// EKS CloudWatch Observability add-on injects its internal collector endpoint.
export function startTelemetry(
  otlpEndpoint: string | undefined,
  options: {
    serviceName?: string;
    environment?: string;
    tracesEndpoint?: string;
    metricsEndpoint?: string;
    createSdk?: (configuration: ConstructorParameters<typeof NodeSDK>[0]) => TelemetrySdk;
  } = {},
): TelemetrySdk | undefined {
  if (!otlpEndpoint) return undefined;
  const tracesEndpoint = options.tracesEndpoint ?? `${otlpEndpoint}/v1/traces`;
  const metricsEndpoint = options.metricsEndpoint ?? `${otlpEndpoint}/v1/metrics`;
  const createSdk = options.createSdk ?? ((configuration) => new NodeSDK(configuration));
  const sdk = createSdk({
    resource: resourceFromAttributes({
      'service.name': options.serviceName ?? serviceName,
      'deployment.environment.name': options.environment ?? environment,
    }),
    traceExporter: new OTLPTraceExporter({ url: tracesEndpoint }),
    metricReaders: [
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({ url: metricsEndpoint }),
        exportIntervalMillis: 60_000,
      }),
    ],
  });
  sdk.start();
  return sdk;
}

const sdk = startTelemetry(endpoint);
if (sdk) registerShutdown(sdk);

export function registerShutdown(sdk: TelemetrySdk): void {
  const shutdown = (): void => void sdk.shutdown();
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}
