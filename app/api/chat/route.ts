import { z } from "zod";
import { chatModel, getOpenAI } from "@/lib/openai";
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
    const chunks = await retrieveProductChunks(body.message, 8);
    const context = buildContext(chunks);
    const openai = getOpenAI();

    const completion = await openai.chat.completions.create({
      model: chatModel,
      temperature: 0.2,
      messages: [
        { role: "system", content: buildSystemPrompt() },
        { role: "user", content: `NGỮ CẢNH TRUY XUẤT:\n${context}` },
        ...body.history.map((message) => ({ role: message.role, content: message.content })),
        { role: "user", content: body.message },
      ],
    });

    return Response.json({
      answer: completion.choices[0]?.message?.content ?? "Mình chưa tạo được câu trả lời. Bạn thử lại nhé.",
      sources: uniqueSources(chunks),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 400 });
  }
}
