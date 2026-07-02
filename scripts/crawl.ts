import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { crawlPhucLong } from "../lib/crawl/phuclong";

const baseUrl = process.env.CRAWL_BASE_URL ?? "https://phuclong.com";
const maxPages = Number(process.env.CRAWL_MAX_PAGES ?? 120);
const delayMs = Number(process.env.CRAWL_DELAY_MS ?? 800);
const outputPath = path.join(process.cwd(), "data", "phuclong-products.json");

const result = await crawlPhucLong({ baseUrl, maxPages, delayMs });

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");

console.log(`Crawled ${result.crawledPages} pages`);
console.log(`Extracted ${result.products.length} product candidates`);
console.log(`Saved ${outputPath}`);
