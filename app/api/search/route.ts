import { evaluatePartsGuardrails } from "@/lib/rag/guardrails";
import { retrieveProductChunks, uniqueSources } from "@/lib/rag/retrieve";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q")?.trim();
    const limit = Number(searchParams.get("limit") ?? 8);

    if (!query) {
      return Response.json({ error: "Missing q query parameter" }, { status: 400 });
    }

    const guardrail = evaluatePartsGuardrails(query);

    if (!guardrail.allowed) {
      return Response.json(
        {
          error: guardrail.message,
          chunks: [],
          sources: [],
          guardrail: {
            blocked: true,
            code: guardrail.code,
            detectedInjection: guardrail.detectedInjection,
          },
        },
        { status: 400 },
      );
    }

    const chunks = await retrieveProductChunks(guardrail.sanitizedMessage, Math.min(Math.max(limit, 1), 20));
    return Response.json({
      query,
      sanitizedQuery: guardrail.sanitizedMessage,
      chunks,
      sources: uniqueSources(chunks),
      guardrail: {
        blocked: false,
        detectedInjection: guardrail.detectedInjection,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 400 });
  }
}
