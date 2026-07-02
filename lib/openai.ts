import OpenAI from "openai";

export const chatModel = process.env.OPENAI_CHAT_MODEL ?? "gpt-4.1-mini";
export const embeddingModel = process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";

export function getOpenAI() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY");
  }

  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

export async function embedText(input: string) {
  const openai = getOpenAI();
  const response = await openai.embeddings.create({
    model: embeddingModel,
    input: input.replace(/\s+/g, " ").trim(),
  });

  return response.data[0].embedding;
}

export async function embedTexts(inputs: string[]) {
  const openai = getOpenAI();
  const response = await openai.embeddings.create({
    model: embeddingModel,
    input: inputs.map((input) => input.replace(/\s+/g, " ").trim()),
  });

  return response.data.map((item) => item.embedding);
}
