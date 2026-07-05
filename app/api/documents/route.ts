import { z } from "zod";
import { evaluatePartsGuardrails, sanitizeUserText } from "@/lib/rag/guardrails";
import { indexManualDocument } from "@/lib/rag/manual-documents";

export const runtime = "nodejs";

const documentSchema = z.object({
  title: z.string().trim().min(2).max(180),
  category: z.string().trim().max(120).optional(),
  sourceUrl: z.string().trim().max(500).optional(),
  priceText: z.string().trim().max(120).optional(),
  content: z.string().trim().min(20).max(30000),
});

export async function POST(request: Request) {
  try {
    const body = documentSchema.parse(await request.json());
    const guardrailText = [body.title, body.category, body.priceText, body.content.slice(0, 4000)]
      .filter(Boolean)
      .join("\n");
    const guardrail = evaluatePartsGuardrails(guardrailText);

    if (!guardrail.allowed) {
      return Response.json(
        {
          error: guardrail.message,
          guardrail: {
            blocked: true,
            code: guardrail.code,
            detectedInjection: guardrail.detectedInjection,
          },
        },
        { status: 400 },
      );
    }

    const document = await indexManualDocument({
      title: sanitizeUserText(body.title),
      category: body.category ? sanitizeUserText(body.category) : undefined,
      sourceUrl: body.sourceUrl,
      priceText: body.priceText ? sanitizeUserText(body.priceText) : undefined,
      content: sanitizeUserText(body.content),
    });

    return Response.json({
      document,
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
