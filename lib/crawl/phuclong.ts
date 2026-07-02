import * as cheerio from "cheerio";

export type ProductRecord = {
  sourceUrl: string;
  slug: string;
  name: string;
  category: string | null;
  description: string | null;
  priceText: string | null;
  imageUrl: string | null;
  raw: Record<string, unknown>;
};

type CrawlOptions = {
  baseUrl: string;
  maxPages: number;
  delayMs: number;
};

const BLOCKED_PATH_PARTS = [
  "login",
  "logout",
  "account",
  "cart",
  "checkout",
  "gio-hang",
  "thanh-toan",
  "dang-nhap",
  "dang-ky",
  "admin",
];

const PRODUCT_HINTS = ["san-pham", "product", "menu", "thuc-don", "coffee", "tea", "tra", "ca-phe"];

export async function crawlPhucLong(options: CrawlOptions) {
  const base = new URL(options.baseUrl);
  const queue = [base.toString()];
  const visited = new Set<string>();
  const products = new Map<string, ProductRecord>();

  while (queue.length > 0 && visited.size < options.maxPages) {
    const url = queue.shift();
    if (!url || visited.has(url) || !isAllowedUrl(url, base)) continue;

    visited.add(url);
    const html = await fetchHtml(url);
    if (!html) continue;

    const $ = cheerio.load(html);
    extractInternalLinks($, url, base).forEach((link) => {
      if (!visited.has(link) && queue.length < options.maxPages * 4) queue.push(link);
    });

    const product = extractProduct($, url, base);
    if (product && !products.has(product.sourceUrl)) {
      products.set(product.sourceUrl, product);
    }

    await sleep(options.delayMs);
  }

  return {
    crawledPages: visited.size,
    products: [...products.values()].sort((a, b) => a.name.localeCompare(b.name, "vi")),
  };
}

async function fetchHtml(url: string) {
  try {
    const response = await fetch(url, {
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; PhucLongRAGBot/0.1; public product indexing)",
        accept: "text/html,application/xhtml+xml",
      },
    });

    const contentType = response.headers.get("content-type") ?? "";
    if (!response.ok || !contentType.includes("text/html")) return null;
    return await response.text();
  } catch {
    return null;
  }
}

function extractInternalLinks($: cheerio.CheerioAPI, currentUrl: string, base: URL) {
  const links = new Set<string>();

  $("a[href]").each((_, element) => {
    const href = $(element).attr("href");
    if (!href) return;

    try {
      const normalized = normalizeUrl(new URL(href, currentUrl));
      if (isAllowedUrl(normalized, base)) links.add(normalized);
    } catch {
      // Ignore malformed links.
    }
  });

  return [...links];
}

function extractProduct($: cheerio.CheerioAPI, url: string, base: URL): ProductRecord | null {
  const jsonLdProduct = extractJsonLdProduct($);
  const canonical = normalizeUrl(new URL($("link[rel='canonical']").attr("href") || url, url));
  const title = cleanText(jsonLdProduct?.name || $("meta[property='og:title']").attr("content") || $("h1").first().text() || $("title").text());
  const description = cleanText(
    jsonLdProduct?.description ||
      $("meta[name='description']").attr("content") ||
      $("meta[property='og:description']").attr("content") ||
      $(".product-description, .description, .content-detail, .detail-content").first().text(),
  );
  const priceText = cleanText(
    jsonLdProduct?.offers?.price ||
      jsonLdProduct?.offers?.lowPrice ||
      $(".price, .product-price, [class*='price']").first().text(),
  );
  const imageUrl = normalizeMaybeUrl(
    jsonLdProduct?.image || $("meta[property='og:image']").attr("content") || $(".product img, .product-detail img, main img").first().attr("src"),
    base,
  );
  const category = cleanText(
    jsonLdProduct?.category ||
      $(".breadcrumb li, .breadcrumbs li, nav[aria-label='breadcrumb'] a").eq(-2).text() ||
      inferCategoryFromUrl(canonical),
  );

  const isHomePage = new URL(canonical).pathname === "" || new URL(canonical).pathname === "/";
  const isProductLike = Boolean(jsonLdProduct?.name) || PRODUCT_HINTS.some((hint) => canonical.toLowerCase().includes(hint));
  if (isHomePage || !isProductLike || !title || title.length < 3) {
    return null;
  }

  return {
    sourceUrl: canonical,
    slug: new URL(canonical).pathname.split("/").filter(Boolean).pop() ?? slugify(title),
    name: title,
    category: category || null,
    description: description || null,
    priceText: priceText || null,
    imageUrl,
    raw: {
      jsonLd: jsonLdProduct ?? null,
      crawledFrom: url,
    },
  };
}

function extractJsonLdProduct($: cheerio.CheerioAPI): any | null {
  let found: any | null = null;

  $("script[type='application/ld+json']").each((_, element) => {
    if (found) return;
    const raw = $(element).text();
    try {
      const parsed = JSON.parse(raw);
      const nodes = Array.isArray(parsed) ? parsed : [parsed, ...(parsed["@graph"] ?? [])];
      found = nodes.find((node: any) => {
        const type = node?.["@type"];
        return type === "Product" || (Array.isArray(type) && type.includes("Product"));
      });
    } catch {
      // Ignore invalid JSON-LD.
    }
  });

  return found;
}

function isAllowedUrl(url: string, base: URL) {
  const parsed = new URL(url);
  const path = parsed.pathname.toLowerCase();
  return parsed.hostname === base.hostname && !BLOCKED_PATH_PARTS.some((part) => path.includes(part));
}

function normalizeUrl(url: URL) {
  url.hash = "";
  url.search = "";
  return url.toString().replace(/\/$/, "");
}

function normalizeMaybeUrl(value: unknown, base: URL) {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (typeof candidate !== "string" || !candidate) return null;
  try {
    return new URL(candidate, base).toString();
  } catch {
    return null;
  }
}

function inferCategoryFromUrl(url: string) {
  const parts = new URL(url).pathname.split("/").filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 2].replace(/[-_]/g, " ") : "";
}

export function cleanText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\s+/g, " ").trim();
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
