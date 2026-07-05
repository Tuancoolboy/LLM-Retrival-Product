import { createHash } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export type DailyPromptQuota = {
  allowed: boolean;
  usedCount: number;
  remaining: number;
  limit: number;
  resetAt: string;
};

type DailyPromptQuotaRow = {
  allowed: boolean;
  used_count: number;
  remaining: number;
  reset_at: string;
};

type ConsumeDailyPromptQuotaOptions = {
  route: string;
  limit?: number;
  timeZone?: string;
};

const DEFAULT_DAILY_CHAT_PROMPT_LIMIT = 10;
const DEFAULT_RATE_LIMIT_TIME_ZONE = "Asia/Ho_Chi_Minh";

export async function consumeDailyPromptQuota(request: Request, options: ConsumeDailyPromptQuotaOptions): Promise<DailyPromptQuota> {
  const limit = options.limit ?? getDailyChatPromptLimit();
  const timeZone = options.timeZone ?? process.env.RATE_LIMIT_TIME_ZONE ?? DEFAULT_RATE_LIMIT_TIME_ZONE;
  const clientKey = getClientKey(request);
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .rpc("consume_daily_prompt_quota", {
      p_client_key: clientKey,
      p_route: options.route,
      p_limit: limit,
      p_time_zone: timeZone,
    })
    .single<DailyPromptQuotaRow>();

  if (error) throw new Error(`Rate limit failed: ${error.message}`);
  if (!data) throw new Error("Rate limit failed: no quota row returned");

  return {
    allowed: data.allowed,
    usedCount: data.used_count,
    remaining: data.remaining,
    limit,
    resetAt: data.reset_at,
  };
}

export function getDailyChatPromptLimit() {
  const parsed = Number(process.env.DAILY_CHAT_PROMPT_LIMIT ?? DEFAULT_DAILY_CHAT_PROMPT_LIMIT);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_DAILY_CHAT_PROMPT_LIMIT;
  return Math.floor(parsed);
}

function getClientKey(request: Request) {
  const ipAddress = getClientIpAddress(request);
  const salt = process.env.RATE_LIMIT_SALT || process.env.SUPABASE_SERVICE_ROLE_KEY || "phuclong-rag-chatbot";

  return createHash("sha256").update(`${salt}:${ipAddress}`).digest("hex");
}

function getClientIpAddress(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]?.trim() || "unknown";

  return (
    request.headers.get("x-real-ip") ||
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-vercel-forwarded-for") ||
    "127.0.0.1"
  );
}
