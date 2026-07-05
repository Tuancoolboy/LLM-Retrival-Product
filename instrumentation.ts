import { LangfuseSpanProcessor } from "@langfuse/otel";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";

declare global {
  // Keep OpenTelemetry from being registered multiple times during dev reloads.
  // eslint-disable-next-line no-var
  var __phuclongLangfuseOtelStarted: boolean | undefined;
}

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (globalThis.__phuclongLangfuseOtelStarted) return;

  if (!process.env.LANGFUSE_PUBLIC_KEY || !process.env.LANGFUSE_SECRET_KEY) {
    return;
  }

  const tracerProvider = new NodeTracerProvider({
    spanProcessors: [
      new LangfuseSpanProcessor({
        exportMode: process.env.VERCEL ? "immediate" : "batched",
      }),
    ],
  });

  tracerProvider.register();
  globalThis.__phuclongLangfuseOtelStarted = true;
}
