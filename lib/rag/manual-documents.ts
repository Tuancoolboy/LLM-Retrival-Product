import { embedTexts } from "@/lib/openai";
import { getSupabaseAdmin } from "@/lib/supabase/server";

const DEFAULT_CATEGORY = "Tài liệu tự nhập";
const MAX_CHUNK_CHARS = 1600;
const CHUNK_OVERLAP_CHARS = 180;
const MAX_CHUNKS_PER_DOCUMENT = 24;

type ManualDocumentInput = {
  title: string;
  content: string;
  category?: string;
  sourceUrl?: string;
  priceText?: string;
};

type ProductRow = {
  id: string;
  source_url: string;
  name: string;
};

export type IndexedManualDocument = {
  productId: string;
  sourceUrl: string;
  title: string;
  chunkCount: number;
};

export async function indexManualDocument(input: ManualDocumentInput): Promise<IndexedManualDocument> {
  const title = normalizeWhitespace(input.title);
  const content = normalizeDocumentContent(input.content);
  const category = normalizeWhitespace(input.category) || DEFAULT_CATEGORY;
  const sourceUrl = normalizeWhitespace(input.sourceUrl) || createManualSourceUrl(title);
  const priceText = normalizeWhitespace(input.priceText);
  const now = new Date().toISOString();
  const supabase = getSupabaseAdmin();

  const { data: productRow, error: productError } = await supabase
    .from("products")
    .upsert(
      {
        source_url: sourceUrl,
        slug: slugify(title),
        name: title,
        category,
        description: content.slice(0, 900),
        price_text: priceText || null,
        image_url: null,
        raw: {
          origin: "manual_document",
          importedAt: now,
        },
        updated_at: now,
      },
      { onConflict: "source_url" },
    )
    .select("id, source_url, name")
    .single<ProductRow>();

  if (productError) throw new Error(`Không lưu được tài liệu: ${productError.message}`);
  if (!productRow) throw new Error("Không nhận được dòng tài liệu từ Supabase");

  const chunks = createManualChunks({ title, content, category, sourceUrl, priceText });
  const embeddings = await embedTexts(chunks.map((chunk) => chunk.content));

  await supabase.from("product_chunks").delete().eq("product_id", productRow.id);

  const { error: chunkError } = await supabase.from("product_chunks").insert(
    chunks.map((chunk, index) => ({
      product_id: productRow.id,
      content: chunk.content,
      metadata: chunk.metadata,
      embedding: embeddings[index],
    })),
  );

  if (chunkError) throw new Error(`Không index được tài liệu: ${chunkError.message}`);

  return {
    productId: productRow.id,
    sourceUrl: productRow.source_url,
    title: productRow.name,
    chunkCount: chunks.length,
  };
}

function createManualChunks(input: Required<Pick<ManualDocumentInput, "title" | "content" | "category" | "sourceUrl">> & Pick<ManualDocumentInput, "priceText">) {
  const header = [
    `Tài liệu phụ tùng: ${input.title}`,
    `Danh mục: ${input.category}`,
    input.priceText ? `Giá hiển thị: ${input.priceText}` : null,
    `Nguồn: ${input.sourceUrl.startsWith("manual://") ? DEFAULT_CATEGORY : input.sourceUrl}`,
  ]
    .filter(Boolean)
    .join("\n");

  return splitDocumentContent(input.content)
    .slice(0, MAX_CHUNKS_PER_DOCUMENT)
    .map((chunk, index, allChunks) => ({
      content: `${header}\n\nNội dung (${index + 1}/${allChunks.length}):\n${chunk}`,
      metadata: {
        kind: "manual_document",
        sourceUrl: input.sourceUrl,
        chunkIndex: index,
        chunkCount: allChunks.length,
      },
    }));
}

function splitDocumentContent(content: string) {
  const paragraphs = content
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    if (paragraph.length > MAX_CHUNK_CHARS) {
      if (current) {
        chunks.push(current);
        current = "";
      }
      chunks.push(...splitLongText(paragraph));
      continue;
    }

    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length <= MAX_CHUNK_CHARS) {
      current = candidate;
    } else {
      if (current) chunks.push(current);
      current = paragraph;
    }
  }

  if (current) chunks.push(current);
  return chunks.length > 0 ? chunks : [content.slice(0, MAX_CHUNK_CHARS)];
}

function splitLongText(text: string) {
  const chunks: string[] = [];
  const step = MAX_CHUNK_CHARS - CHUNK_OVERLAP_CHARS;

  for (let start = 0; start < text.length; start += step) {
    const chunk = text.slice(start, start + MAX_CHUNK_CHARS).trim();
    if (chunk) chunks.push(chunk);
  }

  return chunks;
}

function createManualSourceUrl(title: string) {
  return `manual://documents/${slugify(title)}-${Date.now()}`;
}

function normalizeDocumentContent(input: string) {
  return input
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

function normalizeWhitespace(input?: string) {
  return input?.replace(/\s+/g, " ").trim() ?? "";
}

function slugify(input: string) {
  const slug = input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "tai-lieu-tu-nhap";
}
