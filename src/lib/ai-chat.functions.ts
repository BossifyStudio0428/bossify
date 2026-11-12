import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireExternalSupabaseAuth } from "@/integrations/supabase/external-auth-middleware";
import { orderContributionProfit, PAID_STATUSES } from "@/lib/orderMath";

// Global "Ask AI" chat widget (AppShell-level, every page). Unlike
// ai-campaign-suggestions.functions.ts this one DOES ground its answers in
// the seller's live business data — that's the whole point of it being a
// chat assistant ("what did I sell this month" etc). It still has no
// real-time web/search access, so it must never claim to know external
// market/news facts; the system prompt below constrains it to the
// seller's own data plus general business/accounting knowledge.

export type ChatMessage = { id: string; role: "user" | "assistant"; content: string; created_at: string };

const HISTORY_LIMIT = 24; // messages kept as conversation context per turn
const langName = (l: string) => (l === "zh" ? "Chinese (Simplified)" : l === "ms" ? "Bahasa Malaysia" : "English");

function startOfThisMonthUTC(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

/** Pulls a compact, current snapshot of the seller's own data — kept small
 * on purpose (token cost + so the model isn't drowned in rows). Every
 * number in here is real; the model is instructed to only state business
 * facts that come from this block. */
async function buildDataSnapshot(supabase: any, userId: string) {
  const [{ data: prof }, { data: inv }, { data: ord }] = await Promise.all([
    supabase.from("profiles").select("low_stock_threshold" as any).eq("id", userId).maybeSingle(),
    supabase.from("inventory").select("id,name,stock,price,cost_price,category").eq("user_id", userId),
    supabase
      .from("orders")
      .select("amount,cost,gross_profit,status,created_at,platform_fee_amount,shipping_cost,affiliate_commission,financial_status")
      .eq("user_id", userId)
      .in("status", PAID_STATUSES)
      .gte("created_at", startOfThisMonthUTC()),
  ]);

  const threshold = Number((prof as any)?.low_stock_threshold ?? 5);
  const invRows = (inv ?? []) as { id: string; name: string; stock: number | null; price: number | null; cost_price: number | null; category: string | null }[];
  const outOfStock = invRows.filter((i) => Number(i.stock ?? 0) <= 0);
  const lowStock = invRows.filter((i) => Number(i.stock ?? 0) > 0 && Number(i.stock ?? 0) <= threshold);

  const { data: adj } = await supabase
    .from("order_adjustments" as any)
    .select("revenue_reversed,cogs_reversed")
    .eq("user_id", userId)
    .gte("created_at", startOfThisMonthUTC());
  const adjRows = (adj ?? []) as { revenue_reversed: number | null; cogs_reversed: number | null }[];
  const revenueReversed = adjRows.reduce((s, r) => s + Number(r.revenue_reversed ?? 0), 0);
  const cogsReversed = adjRows.reduce((s, r) => s + Number(r.cogs_reversed ?? 0), 0);

  const complete = ((ord ?? []) as any[]).filter((o) => o.financial_status !== "pending");
  let revenue = 0;
  let profit = 0;
  for (const o of complete) {
    revenue += Number(o.amount ?? 0);
    profit += orderContributionProfit(o);
  }
  revenue -= revenueReversed;
  profit -= revenueReversed - cogsReversed;

  const fmtList = (rows: typeof invRows) =>
    rows
      .slice(0, 12)
      .map((i) => `${i.name} (stock ${i.stock ?? 0}${i.category ? `, ${i.category}` : ""})`)
      .join("; ") || "none";

  return `SELLER'S LIVE DATA SNAPSHOT (as of now — this is the ONLY source of truth for facts about their business; do not use any other number):
- Total products: ${invRows.length}
- Out of stock (${outOfStock.length}): ${fmtList(outOfStock)}
- Low stock, threshold ${threshold} (${lowStock.length}): ${fmtList(lowStock)}
- This calendar month so far (approximate, UTC-based): revenue RM ${revenue.toFixed(2)}, contribution profit RM ${profit.toFixed(2)}, ${complete.length} paid orders`;
}

function buildSystemPrompt(lang: string, dataSnapshot: string) {
  return `You are the in-app AI assistant for Bossify, a business-management app for small TikTok Shop sellers in Malaysia (run by the seller as a sole proprietor, not an accounting expert). Reply in ${langName(lang)}, concise and practical — this is a business tool, not a hype/motivation app. No markdown headers or heavy formatting; short plain sentences or a short list is fine.

${dataSnapshot}

Rules:
- For any question about THEIR business (sales, stock, profit, products), answer ONLY using the snapshot above. If the answer isn't in the snapshot (e.g. a specific date range, a specific customer, something older than this month), say you don't have that data here rather than guessing, and suggest which page in the app would show it (e.g. Cost Breakdown, Product Profit, Reports).
- You have NO real-time internet/search access. Never claim to know current news, prices, or "what's trending right now" as fact — general knowledge only, clearly caveated as such if asked.
- You may give general TikTok Shop / small-business / basic bookkeeping advice from your own knowledge, clearly separate from the seller's actual numbers.
- Keep replies short (a few sentences) unless the question genuinely needs a list.`;
}

async function fetchHistory(supabase: any, userId: string): Promise<ChatMessage[]> {
  const { data } = await supabase
    .from("ai_chat_messages" as any)
    .select("id,role,content,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(200);
  return (data ?? []) as ChatMessage[];
}

export const getAiChatHistory = createServerFn({ method: "POST" })
  .middleware([requireExternalSupabaseAuth])
  .handler(async ({ context }): Promise<ChatMessage[]> => {
    return fetchHistory(context.supabase, context.userId);
  });

export const clearAiChatHistory = createServerFn({ method: "POST" })
  .middleware([requireExternalSupabaseAuth])
  .handler(async ({ context }): Promise<{ ok: true }> => {
    await context.supabase.from("ai_chat_messages" as any).delete().eq("user_id", context.userId);
    return { ok: true };
  });

const SendInput = z.object({
  message: z.string().min(1).max(2000),
  lang: z.enum(["en", "ms", "zh"]).default("en"),
});

export const sendAiChatMessage = createServerFn({ method: "POST" })
  .middleware([requireExternalSupabaseAuth])
  .inputValidator((input: unknown) => SendInput.parse(input))
  .handler(async ({ data, context }): Promise<{ reply: string; history: ChatMessage[] }> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("Missing LOVABLE_API_KEY");
    const { logAiUsage } = await import("@/lib/ai-usage.server");
    const supabase = context.supabase;
    const userId = context.userId;
    const feature = "chat_assistant";
    const model = "google/gemini-2.5-flash";

    const { error: insErr } = await supabase.from("ai_chat_messages" as any).insert({ user_id: userId, role: "user", content: data.message });
    if (insErr) throw new Error(insErr.message);

    const [priorHistory, dataSnapshot] = await Promise.all([
      fetchHistory(supabase, userId),
      buildDataSnapshot(supabase, userId),
    ]);
    const recent = priorHistory.slice(-HISTORY_LIMIT);

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
        "X-Lovable-AIG-SDK": "raw-fetch",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: buildSystemPrompt(data.lang, dataSnapshot) },
          ...recent.map((m) => ({ role: m.role, content: m.content })),
        ],
        temperature: 0.4,
      }),
    });

    if (res.status === 429) {
      await logAiUsage({ userId, feature, model, status: "rate_limit", errorMsg: "429" });
      throw new Error("AI_RATE_LIMIT");
    }
    if (res.status === 402) {
      await logAiUsage({ userId, feature, model, status: "credit_exhausted", errorMsg: "402" });
      throw new Error("AI_CREDIT_EXHAUSTED");
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[ai-chat] gateway error", res.status, body.slice(0, 500));
      await logAiUsage({ userId, feature, model, status: "error", errorMsg: `HTTP ${res.status}` });
      throw new Error(`AI_ERROR_${res.status}`);
    }

    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const reply = (json.choices?.[0]?.message?.content ?? "").trim();

    await logAiUsage({
      userId, feature, model, status: reply ? "ok" : "parse_failed",
      inputTokens: json.usage?.prompt_tokens, outputTokens: json.usage?.completion_tokens,
    });

    if (!reply) throw new Error("AI_PARSE_FAILED");

    const { error: replyErr } = await supabase.from("ai_chat_messages" as any).insert({ user_id: userId, role: "assistant", content: reply });
    if (replyErr) throw new Error(replyErr.message);

    const history = await fetchHistory(supabase, userId);
    return { reply, history };
  });