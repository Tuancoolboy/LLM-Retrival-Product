import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { crawlPhucLong } from "../lib/crawl/phuclong";
import { loadEnvLocal } from "./load-env";

loadEnvLocal();

const baseUrl = process.env.CRAWL_BASE_URL ?? "https://phuclong.com";
const maxPages = Number(process.env.CRAWL_MAX_PAGES ?? 1200);
const delayMs = Number(process.env.CRAWL_DELAY_MS ?? 800);
const collectionPath = process.env.CRAWL_COLLECTION_PATH ?? "/collections/tat-ca-san-pham";
const collectionStartPage = Number(process.env.CRAWL_COLLECTION_START_PAGE ?? 1);
const collectionEndPage = Number(process.env.CRAWL_COLLECTION_END_PAGE ?? 212);
const outputPath = path.join(process.cwd(), "data", "phuclong-products.json");

const result = await crawlPhucLong({
  baseUrl,
  maxPages,
  delayMs,
  collectionPath,
  collectionStartPage,
  collectionEndPage,
});

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");

console.log(`Crawled ${result.crawledPages} pages`);
console.log(`Extracted ${result.products.length} product candidates`);
console.log(`Saved ${outputPath}`);
