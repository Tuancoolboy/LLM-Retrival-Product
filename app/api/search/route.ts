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

    const chunks = await retrieveProductChunks(query, Math.min(Math.max(limit, 1), 20));
    return Response.json({ query, chunks, sources: uniqueSources(chunks) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 400 });
  }
}
