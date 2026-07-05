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
  collectionPath?: string;
  collectionStartPage?: number;
  collectionEndPage?: number;
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
  "gioi-thieu",
  "tin-tuc",
  "cua-hang",
  "tuyen-dung",
  "lien-he",
];

const PRODUCT_HINTS = [
  "san-pham",
  "product",
  "products",
  "collection",
  "collections",
  "phu-tung",
  "bo-xich",
  "xich",
  "bom-thuy-luc",
  "thuy-luc",
  "phot",
  "may-cong-trinh",
  "may-xuc",
  "may-ui",
];

const FETCH_TIMEOUT_MS = 15_000;

export async function crawlPhucLong(options: CrawlOptions) {
  const base = new URL(options.baseUrl);
  const queue = buildInitialQueue(base, options);
  const visited = new Set<string>();
  const queued = new Set(queue);
  const products = new Map<string, ProductRecord>();

  while (queue.length > 0 && visited.size < options.maxPages) {
    const url = queue.shift();
    if (!url || visited.has(url) || !isAllowedUrl(url, base)) continue;

    visited.add(url);
    const html = await fetchHtml(url);
    if (!html) continue;

    const $ = cheerio.load(html);
    const productCards = extractProductCards($, url, base);
    for (const card of productCards) {
      if (!products.has(card.sourceUrl)) products.set(card.sourceUrl, card);
    }

    const product = extractProduct($, url, base);
    if (product) {
      products.set(product.sourceUrl, product);
    }

    extractProductLinks($, url, base).forEach((link) => {
      if (!visited.has(link) && !queued.has(link) && queued.size < options.maxPages * 4) {
        queued.add(link);
        queue.push(link);
      }
    });

    await sleep(options.delayMs);
  }

  return {
    crawledPages: visited.size,
    products: [...products.values()].sort((a, b) => a.name.localeCompare(b.name, "vi")),
  };
}

function buildInitialQueue(base: URL, options: CrawlOptions) {
  const collectionPath = options.collectionPath ?? "/collections/tat-ca-san-pham";
  const startPage = options.collectionStartPage ?? 1;
  const endPage = options.collectionEndPage ?? 212;
  const urls: string[] = [];

  for (let page = startPage; page <= endPage; page += 1) {
    const url = new URL(collectionPath, base);
    if (page > 1) url.searchParams.set("page", String(page));
    urls.push(normalizeUrl(url, { keepSearch: true }));
  }

  return urls;
}

async function fetchHtml(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
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
  } finally {
    clearTimeout(timeout);
  }
}

function extractProductLinks($: cheerio.CheerioAPI, currentUrl: string, base: URL) {
  const links = new Set<string>();

  $("a[href]").each((_, element) => {
    const href = $(element).attr("href");
    if (!href) return;

    try {
      const normalized = normalizeProductUrl(new URL(href, currentUrl));
      const parsed = new URL(normalized);
      const path = parsed.pathname.toLowerCase();
      const text = cleanText($(element).text()).toLowerCase();
      const className = String($(element).attr("class") ?? "").toLowerCase();
      const looksProduct =
        path.includes("/products/") ||
        path.includes("/collections/") ||
        PRODUCT_HINTS.some((hint) => path.includes(hint)) ||
        className.includes("product") ||
        text.includes("phụ tùng") ||
        text.includes("xem chi tiết");

      if (looksProduct && isAllowedUrl(normalized, base)) links.add(normalized);
    } catch {
      // Ignore malformed links.
    }
  });

  return [...links];
}

function extractProductCards($: cheerio.CheerioAPI, currentUrl: string, base: URL) {
  const products = new Map<string, ProductRecord>();
  const cardSelectors = [
    ".product-item",
    ".product-card",
    ".product-loop",
    ".pro-loop",
    ".item_product",
    ".grid__item",
    "[class*='product']",
  ].join(", ");

  $(cardSelectors).each((_, element) => {
    const card = $(element);
    const link = card.find("a[href*='/products/'], a[href*='san-pham'], a[href]").first().attr("href");
    const name = cleanText(
      card.find(".product-name, .pro-name, .name, h2, h3, h4, a[title]").first().attr("title") ||
        card.find(".product-name, .pro-name, .name, h2, h3, h4").first().text() ||
        card.find("a[title]").first().attr("title"),
    );
    if (!link || !name || name.length < 2) return;

    const sourceUrl = normalizeProductUrl(new URL(link, currentUrl));
    if (!isAllowedUrl(sourceUrl, base)) return;
    if (!new URL(sourceUrl).pathname.includes("/products/")) return;

    const priceText = cleanText(card.find(".price, .product-price, .pro-price, [class*='price']").first().text());
    const imageUrl = normalizeMaybeUrl(
      card.find("img").first().attr("data-src") || card.find("img").first().attr("src"),
      base,
    );
    const description = cleanText(card.find(".description, .desc, .summary").first().text());

    products.set(sourceUrl, {
      sourceUrl,
      slug: new URL(sourceUrl).pathname.split("/").filter(Boolean).pop() ?? slugify(name),
      name,
      category: inferCategoryFromUrl(currentUrl) || null,
      description: description || null,
      priceText: priceText || null,
      imageUrl,
      raw: {
        source: "collection-card",
        crawledFrom: currentUrl,
      },
    });
  });

  return [...products.values()];
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

  const parsedCanonical = new URL(canonical);
  const isHomePage = parsedCanonical.pathname === "" || parsedCanonical.pathname === "/";
  const isCollectionPage = parsedCanonical.pathname.includes("/collections/");
  const isProductLike = Boolean(jsonLdProduct?.name) || parsedCanonical.pathname.includes("/products/");
  if (isHomePage || isCollectionPage || !isProductLike || !title || title.length < 3) {
    return null;
  }

  return {
    sourceUrl: canonical,
    slug: parsedCanonical.pathname.split("/").filter(Boolean).pop() ?? slugify(title),
    name: title,
    category: category || null,
    description: description || null,
    priceText: priceText || null,
    imageUrl,
    raw: {
      source: "product-page",
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

function normalizeUrl(url: URL, options: { keepSearch?: boolean } = {}) {
  url.hash = "";
  if (!options.keepSearch) url.search = "";
  return url.toString().replace(/\/$/, "");
}

function normalizeProductUrl(url: URL) {
  const collectionProductMatch = url.pathname.match(/^\/collections\/[^/]+\/products\/([^/]+)/);
  if (collectionProductMatch?.[1]) {
    url.pathname = `/products/${collectionProductMatch[1]}`;
  }

  return normalizeUrl(url);
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
  return parts.length > 1 ? parts[parts.length - 1].replace(/[-_]/g, " ") : "";
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
