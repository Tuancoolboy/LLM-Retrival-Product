import { readFile } from "node:fs/promises";
import path from "node:path";
import { embedTexts } from "../lib/openai";
import { getSupabaseAdmin } from "../lib/supabase/server";
import type { ProductRecord } from "../lib/crawl/phuclong";

type CrawlFile = {
  crawledPages: number;
  products: ProductRecord[];
};

type ProductRow = {
  id: string;
  source_url: string;
};

const inputPath = process.argv[2] ?? path.join(process.cwd(), "data", "phuclong-products.json");
const raw = await readFile(inputPath, "utf8");
const payload = JSON.parse(raw) as CrawlFile;
const supabase = getSupabaseAdmin();

console.log(`Loading ${payload.products.length} products from ${inputPath}`);

for (const product of payload.products) {
  const { data: productRow, error: productError } = await supabase
    .from("products")
    .upsert(
      {
        source_url: product.sourceUrl,
        slug: product.slug,
        name: product.name,
        category: product.category,
        description: product.description,
        price_text: product.priceText,
        image_url: product.imageUrl,
        raw: product.raw,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "source_url" },
    )
    .select("id, source_url")
    .single<ProductRow>();

  if (productError) throw new Error(`Product upsert failed for ${product.name}: ${productError.message}`);
  if (!productRow) throw new Error(`No product row returned for ${product.name}`);

  const chunks = createChunks(product);
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

  if (chunkError) throw new Error(`Chunk insert failed for ${product.name}: ${chunkError.message}`);
  console.log(`Indexed ${product.name} (${chunks.length} chunks)`);
}

function createChunks(product: ProductRecord) {
  const summary = [
    `Tên sản phẩm: ${product.name}`,
    product.category ? `Danh mục: ${product.category}` : null,
    product.priceText ? `Giá hiển thị: ${product.priceText}` : null,
    `Nguồn: ${product.sourceUrl}`,
  ]
    .filter(Boolean)
    .join("\n");

  const details = [
    product.description ? `Mô tả: ${product.description}` : null,
    product.imageUrl ? `Hình ảnh: ${product.imageUrl}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return [
    { content: summary, metadata: { kind: "summary", sourceUrl: product.sourceUrl } },
    ...(details ? [{ content: details, metadata: { kind: "details", sourceUrl: product.sourceUrl } }] : []),
  ];
}
