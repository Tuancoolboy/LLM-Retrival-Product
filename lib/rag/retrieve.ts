import { embedText } from "@/lib/openai";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export type RetrievedChunk = {
  id: string;
  product_id: string;
  product_name: string;
  category: string | null;
  price_text: string | null;
  source_url: string | null;
  image_url: string | null;
  content: string;
  metadata: Record<string, unknown> | null;
  vector_score: number | null;
  keyword_score: number | null;
  combined_score: number;
};

export async function retrieveProductChunks(query: string, matchCount = 8) {
  const supabase = getSupabaseAdmin();
  const embedding = await embedText(query);

  const { data, error } = await supabase.rpc("hybrid_search_product_chunks", {
    query_text: query,
    query_embedding: embedding,
    match_count: matchCount,
  });

  if (error) {
    throw new Error(`Supabase hybrid search failed: ${error.message}`);
  }

  return (data ?? []) as RetrievedChunk[];
}

export function uniqueSources(chunks: RetrievedChunk[]) {
  const seen = new Set<string>();
  return chunks
    .filter((chunk) => {
      const key = chunk.source_url || chunk.product_id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((chunk) => ({
      productName: chunk.product_name,
      category: chunk.category,
      priceText: chunk.price_text,
      sourceUrl: chunk.source_url,
      imageUrl: chunk.image_url,
      score: chunk.combined_score,
    }));
}
