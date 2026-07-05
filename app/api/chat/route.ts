import { z } from "zod";
import { chatModel, getOpenAI } from "@/lib/openai";
import { consumeDailyPromptQuota, getDailyChatPromptLimit } from "@/lib/rate-limit";
import { evaluatePartsGuardrails, sanitizeUserText } from "@/lib/rag/guardrails";
import { buildContext, buildSystemPrompt } from "@/lib/rag/prompt";
import { retrieveProductChunks, uniqueSources } from "@/lib/rag/retrieve";

export const runtime = "nodejs";

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(4000),
});

const requestSchema = z.object({
  message: z.string().min(1).max(4000),
  history: z.array(messageSchema).max(8).optional().default([]),
});

export async function POST(request: Request) {
  try {
    const body = requestSchema.parse(await request.json());
    const guardrail = evaluatePartsGuardrails(body.message, body.history);

    if (!guardrail.allowed) {
      return Response.json({
        answer: guardrail.message,
        sources: [],
        guardrail: {
          blocked: true,
          code: guardrail.code,
          detectedInjection: guardrail.detectedInjection,
        },
      });
    }

    const quota = await consumeDailyPromptQuota(request, {
      route: "chat",
      limit: getDailyChatPromptLimit(),
    });

    if (!quota.allowed) {
      return Response.json(
        {
          answer: buildQuotaExceededAnswer(quota.limit, quota.resetAt),
          sources: [],
          rateLimit: quota,
          guardrail: {
            blocked: false,
            detectedInjection: guardrail.detectedInjection,
          },
        },
        {
          status: 429,
          headers: buildRateLimitHeaders(quota),
        },
      );
    }

    const chunks = await retrieveProductChunks(guardrail.sanitizedMessage, 8);
    const context = buildContext(chunks);
    const openai = getOpenAI();

    const completion = await openai.chat.completions.create({
      model: chatModel,
      temperature: 0.2,
      messages: [
        { role: "system", content: buildSystemPrompt() },
        { role: "user", content: `NGỮ CẢNH TRUY XUẤT:\n${context}` },
        ...body.history.map((message) => ({ role: message.role, content: sanitizeUserText(message.content) })),
        { role: "user", content: guardrail.sanitizedMessage },
      ],
    });

    return Response.json({
      answer: completion.choices[0]?.message?.content ?? "Mình chưa tạo được câu trả lời. Bạn thử lại nhé.",
      sources: uniqueSources(chunks),
      rateLimit: quota,
      guardrail: {
        blocked: false,
        detectedInjection: guardrail.detectedInjection,
      },
    }, { headers: buildRateLimitHeaders(quota) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 400 });
  }
}

function buildQuotaExceededAnswer(limit: number, resetAt: string) {
  const resetText = new Date(resetAt).toLocaleString("vi-VN", {
    timeZone: process.env.RATE_LIMIT_TIME_ZONE ?? "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  return `Bạn đã dùng hết ${limit} lượt hỏi hôm nay. Lượt hỏi sẽ tự mở lại lúc ${resetText}.`;
}

function buildRateLimitHeaders(quota: { limit: number; remaining: number; resetAt: string }) {
  const resetAtMs = new Date(quota.resetAt).getTime();
  const retryAfterSeconds = Number.isFinite(resetAtMs) ? Math.max(Math.ceil((resetAtMs - Date.now()) / 1000), 0) : 0;

  return {
    "Retry-After": String(retryAfterSeconds),
    "X-RateLimit-Limit": String(quota.limit),
    "X-RateLimit-Remaining": String(quota.remaining),
    "X-RateLimit-Reset": quota.resetAt,
  };
}
