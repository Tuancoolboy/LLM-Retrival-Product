const OUT_OF_SCOPE_MESSAGE =
  "Mình là chatbot chuyên tra cứu phụ tùng/cơ khí Phúc Long, nên mình chỉ hỗ trợ các câu hỏi về phụ tùng, mã hàng, dòng máy, danh mục, giá hiển thị, nguồn sản phẩm hoặc phản hồi liên quan đến sản phẩm. Bạn hãy hỏi lại theo mã phụ tùng, model máy hoặc cụm hệ thống cần tra cứu nhé.";

const INJECTION_REFUSAL_MESSAGE =
  "Mình không thể làm theo yêu cầu thay đổi vai trò, bỏ qua hướng dẫn hệ thống hoặc tiết lộ prompt nội bộ. Mình vẫn có thể hỗ trợ nếu bạn hỏi trực tiếp về phụ tùng, mã hàng, dòng máy hoặc nguồn sản phẩm Phúc Long.";

const PARTS_KEYWORDS = [
  "phu tung",
  "phuc long",
  "co khi",
  "may cong trinh",
  "may xuc",
  "may ui",
  "may dao",
  "xe co gioi",
  "gam may",
  "thuy luc",
  "bom thuy luc",
  "bom banh rang",
  "bo dieu tiet",
  "bo ruot bom",
  "motor",
  "mo to",
  "di chuyen",
  "quay toa",
  "banh dan huong",
  "banh rang",
  "vanh rang",
  "vanh sao",
  "xich",
  "bo xich",
  "dai xich",
  "la xich",
  "ga le",
  "gale",
  "rang gau",
  "loi gau",
  "gau",
  "ac gau",
  "bac gau",
  "phot",
  "zoang",
  "seal",
  "sin",
  "moay o",
  "truc lap",
  "truc quay toa",
  "cum di chuyen",
  "cum quay toa",
  "bua pha da",
  "dam rung",
  "ma phu tung",
  "ma hang",
  "nguon san pham",
  "model may",
  "dong may",
];

const OFF_TOPIC_KEYWORDS = [
  "do an",
  "do uong",
  "mon an",
  "tra sua",
  "ca phe",
  "coffee",
  "food",
  "drink",
  "restaurant",
  "nha hang",
  "am thuc",
  "thoi tiet",
  "tin tuc",
  "chinh tri",
  "bong da",
  "phim",
  "nhac",
  "crypto",
  "coin",
];

const INJECTION_PATTERNS = [
  /\bignore (all )?(previous|prior|above) (instructions?|messages?|rules?)\b/i,
  /\bdisregard (all )?(previous|prior|above) (instructions?|messages?|rules?)\b/i,
  /\bforget (all )?(previous|prior|above) (instructions?|messages?|rules?)\b/i,
  /\byou are now\b/i,
  /\bact as\b/i,
  /\bjailbreak\b/i,
  /\bdeveloper message\b/i,
  /\bsystem prompt\b/i,
  /\bhidden prompt\b/i,
  /\bprompt injection\b/i,
  /\breveal\b.*\b(prompt|instruction|system|developer)\b/i,
  /bo qua (tat ca )?(huong dan|chi dan|quy tac)/i,
  /quen (tat ca )?(huong dan|chi dan|quy tac)/i,
  /khong can (theo|tuan thu) (huong dan|chi dan|quy tac)/i,
  /tiet lo .*?(prompt|huong dan|system|developer)/i,
  /in ra .*?(prompt|huong dan|system|developer)/i,
  /doi vai tro/i,
];

const INJECTION_STRIP_PATTERNS = [
  /ignore (all )?(previous|prior|above) (instructions?|messages?|rules?)/gi,
  /disregard (all )?(previous|prior|above) (instructions?|messages?|rules?)/gi,
  /forget (all )?(previous|prior|above) (instructions?|messages?|rules?)/gi,
  /you are now/gi,
  /act as/gi,
  /jailbreak/gi,
  /developer message/gi,
  /system prompt/gi,
  /hidden prompt/gi,
  /prompt injection/gi,
  /bo qua (tat ca )?(huong dan|chi dan|quy tac)/gi,
  /bỏ qua (tất cả )?(hướng dẫn|chỉ dẫn|quy tắc)/gi,
  /quen (tat ca )?(huong dan|chi dan|quy tac)/gi,
  /quên (tất cả )?(hướng dẫn|chỉ dẫn|quy tắc)/gi,
  /khong can (theo|tuan thu) (huong dan|chi dan|quy tac)/gi,
  /không cần (theo|tuân thủ) (hướng dẫn|chỉ dẫn|quy tắc)/gi,
  /tiet lo .*?(prompt|huong dan|system|developer)/gi,
  /tiết lộ .*?(prompt|hướng dẫn|system|developer)/gi,
  /in ra .*?(prompt|huong dan|system|developer)/gi,
  /in ra .*?(prompt|hướng dẫn|system|developer)/gi,
  /doi vai tro/gi,
  /đổi vai trò/gi,
];

export type GuardrailDecision =
  | {
      allowed: true;
      sanitizedMessage: string;
      detectedInjection: boolean;
    }
  | {
      allowed: false;
      code: "out_of_scope" | "prompt_injection";
      message: string;
      detectedInjection: boolean;
    };

type HistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

export function evaluatePartsGuardrails(message: string, history: HistoryMessage[] = []): GuardrailDecision {
  const normalizedMessage = normalizeText(message);
  const normalizedConversation = normalizeText([message, ...history.slice(-4).map((item) => item.content)].join(" "));
  const detectedInjection = hasPromptInjection(message);
  const isPartsRelated = isPartsDomainQuery(normalizedConversation);
  const isClearlyOffTopic = hasOffTopicIntent(normalizedMessage) && !isPartsRelated;

  if (detectedInjection && !isPartsRelated) {
    return {
      allowed: false,
      code: "prompt_injection",
      message: INJECTION_REFUSAL_MESSAGE,
      detectedInjection,
    };
  }

  if (isClearlyOffTopic || !isPartsRelated) {
    return {
      allowed: false,
      code: "out_of_scope",
      message: OUT_OF_SCOPE_MESSAGE,
      detectedInjection,
    };
  }

  return {
    allowed: true,
    sanitizedMessage: sanitizeUserText(message),
    detectedInjection,
  };
}

export function sanitizeUserText(input: string) {
  return INJECTION_STRIP_PATTERNS.reduce((current, pattern) => current.replace(pattern, " "), input)
    .replace(/\s+/g, " ")
    .trim();
}

export function getOutOfScopeMessage() {
  return OUT_OF_SCOPE_MESSAGE;
}

function hasPromptInjection(input: string) {
  const normalized = normalizeText(input);
  return INJECTION_PATTERNS.some((pattern) => pattern.test(normalized));
}

function hasOffTopicIntent(normalizedInput: string) {
  return OFF_TOPIC_KEYWORDS.some((keyword) => normalizedInput.includes(keyword));
}

function isPartsDomainQuery(normalizedInput: string) {
  if (PARTS_KEYWORDS.some((keyword) => normalizedInput.includes(keyword))) return true;

  // Common heavy-equipment and pump model codes in the product catalog, e.g. D9R,
  // PC200-8, EX200-5, K3V63DT, HPV95. These keep short follow-up searches usable.
  return /\b(?:pc|ex|zx|zax|dh|dx|sk|sh|r|ec|e|d|d6|d7|d8|d9|k3v|k5v|hpv|ap2d|a10v|a8v|gm|m2x|m5x)\s*[-/]?\s*\d{1,4}[a-z0-9/-]*\b/i.test(
    normalizedInput,
  );
}

function normalizeText(input: string) {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
}
