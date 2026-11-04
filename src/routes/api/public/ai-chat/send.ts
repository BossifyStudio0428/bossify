import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { orderContributionProfit } from "@/lib/orderMath";
import { logAiUsage } from "@/lib/ai-usage.server";
import { fetchHistory, type ChatMessage } from "./history";

// Plain HTTP route instead of createServerFn(). Established project
// learning (see learnings.md): createServerFn()'s RPC transport does not
// reliably work from inside the Capacitor Android WebView — it's what
// caused the AI chat button to open to a blank "Bossify" screen with no
// catchable React error (the request never resolves, so nothing ever
// throws where an error boundary could see it). Every other feature that
// is confirmed working on a real device (Stripe checkout/activate/webhook)
// uses this exact pattern instead: a plain createFileRoute server handler,
// called from the client with a normal fetch() + Bearer token. This file
// replaces the old ai-chat.functions.ts createServerFn versions of
// sendAiChatMessage/getAiChatHistory/clearAiChatHistory (history.ts covers
// the other two).

const EXTERNAL_SUPABASE_URL = "https://knouahqwazerjiyiqgmh.supabase.co";
const EXTERNAL_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtub3VhaHF3YXplcmppeWlxZ21oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczNjgzNDEsImV4cCI6MjA5Mjk0NDM0MX0.VF6SsKKhnAZ9vbD1HeH3KoEpt_XYdjTJqITGBSg3yjs";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

async function authFromRequest(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return null;
  const sb = createClient(EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) return null;
  return { supabase: sb, userId: data.user.id };
}

const HISTORY_LIMIT = 24;
const langName = (l: string) => (l === "zh" ? "Chinese (Simplified)" : l === "ms" ? "Bahasa Malaysia" : "English");

function startOfThisMonthUTC(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function buildDataSnapshot(supabase: any, userId: string) {
  const [{ data: prof }, { data: inv }, { data: ord }] = await Promise.all([
    supabase.from("profiles").select("low_stock_threshold").eq("id", userId).maybeSingle(),
    supabase.from("inventory").select("id,name,stock,price,cost_price,category").eq("user_id", userId),
    supabase
      .from("orders")
      .select("amount,cost,gross_profit,status,created_at,platform_fee_amount,shipping_cost,affiliate_commission,financial_status")
      .eq("user_id", userId)
      .eq("status", "Paid")
      .gte("created_at", startOfThisMonthUTC()),
  ]);

  const threshold = Number(prof?.low_stock_threshold ?? 5);
  const invRows = (inv ?? []) as { id: string; name: string; stock: number | null; price: number | null; cost_price: number | null; category: string | null }[];
  const outOfStock = invRows.filter((i) => Number(i.stock ?? 0) <= 0);
  const lowStock = invRows.filter((i) => Number(i.stock ?? 0) > 0 && Number(i.stock ?? 0) <= threshold);

  const { data: adj } = await supabase
    .from("order_adjustments")
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

const SendInput = z.object({
  message: z.string().min(1).max(2000),
  lang: z.enum(["en", "ms", "zh"]).default("en"),
});

export const Route = createFileRoute("/api/public/ai-chat/send")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { headers: CORS }),
      POST: async ({ request }) => {
        const auth = await authFromRequest(request);
        if (!auth) return json(401, { error: "Unauthorized" });
        const { supabase, userId } = auth;

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return json(400, { error: "Invalid JSON" });
        }
        const parsed = SendInput.safeParse(body);
        if (!parsed.success) return json(400, { error: "Invalid request" });
        const { message, lang } = parsed.data;

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) return json(500, { error: "Missing GEMINI_API_KEY" });
        const feature = "chat_assistant";
        // "gemini-2.5-flash" was returning 404 on the OpenAI-compat endpoint
        // (model not recognized there as of Sept 2026) — using Google's own
        // current documented example model instead. FALLBACK_MODEL is a
        // smaller/cheaper model tried once if the primary one is overloaded
        // (503) — newest flagship models get hit hardest by free-tier
        // demand, a lighter model is more likely to have spare capacity.
        let model = "gemini-3.8-flash";
        // NOTE: the "gemini-2.5-*" family 404s on this OpenAI-compat
        // endpoint entirely (confirmed — not just the plain "flash"
        // variant), so the fallback must stay in the "gemini-3.x" family,
        // which the endpoint recognizes (that family returns 503 when
        // busy, never 404).
        const FALLBACK_MODEL = "gemini-3.5-flash-lite";

        const { error: insErr } = await supabase.from("ai_chat_messages").insert({ user_id: userId, role: "user", content: message });
        if (insErr) return json(500, { error: insErr.message });

        const [priorHistory, dataSnapshot] = await Promise.all([
          fetchHistory(supabase, userId),
          buildDataSnapshot(supabase, userId),
        ]);
        const recent = priorHistory.slice(-HISTORY_LIMIT);

        // Calls Google's Gemini API directly (via its OpenAI-compatible
        // endpoint, so the request/response shape below stays unchanged) —
        // no longer proxied through Lovable's AI Gateway, since this app no
        // longer runs on Lovable's hosting and that key isn't available
        // here. Get a key at https://aistudio.google.com/apikey and set it
        // as the GEMINI_API_KEY secret on the Cloudflare Worker.
        const chatMessages = [
          { role: "system", content: buildSystemPrompt(lang, dataSnapshot) },
          ...recent.map((m: ChatMessage) => ({ role: m.role, content: m.content })),
        ];
        const callGemini = (m: string) =>
          fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({ model: m, messages: chatMessages, temperature: 0.4 }),
          });

        let res: Response;
        try {
          res = await callGemini(model);
          // 503 = "the model is overloaded" — a common, transient condition
          // on Google's side (especially for newer flagship models), not a
          // config problem. Retry once on the same model first.
          if (res.status === 503) {
            await new Promise((r) => setTimeout(r, 900));
            res = await callGemini(model);
          }
          // Still failing for a model-specific reason (still overloaded,
          // this particular model isn't available on this endpoint, etc —
          // anything except account-level 429/402, which a different model
          // won't fix)? Fall back once to a different model rather than
          // failing outright.
          if (!res.ok && res.status !== 429 && res.status !== 402) {
            model = FALLBACK_MODEL;
            res = await callGemini(model);
          }
        } catch (e) {
          console.error("[ai-chat/send] gemini fetch failed", e);
          return json(502, { error: "AI_ERROR_NETWORK" });
        }

        if (res.status === 429) {
          await logAiUsage({ userId, feature, model, status: "rate_limit", errorMsg: "429" });
          return json(429, { error: "AI_RATE_LIMIT" });
        }
        if (res.status === 402) {
          await logAiUsage({ userId, feature, model, status: "credit_exhausted", errorMsg: "402" });
          return json(402, { error: "AI_CREDIT_EXHAUSTED" });
        }
        if (res.status === 503) {
          await logAiUsage({ userId, feature, model, status: "overloaded", errorMsg: "503" });
          return json(503, { error: "AI_OVERLOADED" });
        }
        if (!res.ok) {
          const errBody = await res.text().catch(() => "");
          console.error("[ai-chat/send] gateway error", res.status, errBody.slice(0, 500));
          await logAiUsage({ userId, feature, model, status: "error", errorMsg: `HTTP ${res.status}` });
          return json(502, { error: `AI_ERROR_${res.status}` });
        }

        const gatewayJson = (await res.json()) as {
          choices?: { message?: { content?: string } }[];
          usage?: { prompt_tokens?: number; completion_tokens?: number };
        };
        const reply = (gatewayJson.choices?.[0]?.message?.content ?? "").trim();

        await logAiUsage({
          userId, feature, model, status: reply ? "ok" : "parse_failed",
          inputTokens: gatewayJson.usage?.prompt_tokens, outputTokens: gatewayJson.usage?.completion_tokens,
        });

        if (!reply) return json(502, { error: "AI_PARSE_FAILED" });

        const { error: replyErr } = await supabase.from("ai_chat_messages").insert({ user_id: userId, role: "assistant", content: reply });
        if (replyErr) return json(500, { error: replyErr.message });

        const history = await fetchHistory(supabase, userId);
        return json(200, { reply, history });
      },
    },
  },
});