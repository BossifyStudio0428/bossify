import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { logAiUsage } from "@/lib/ai-usage.server";

// Plain HTTP route instead of createServerFn() — same reason and same
// pattern as src/routes/api/public/ai-chat/send.ts (see the long comment
// there): createServerFn()'s RPC transport doesn't reliably work inside
// the Capacitor Android WebView. This replaces the old
// getCampaignAiSuggestions in src/lib/ai-campaign-suggestions.functions.ts.

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

async function userIdFromRequest(request: Request): Promise<string | null> {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return null;
  const sb = createClient(EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user.id;
}

const InputSchema = z.object({
  lang: z.enum(["en", "ms", "zh"]).default("en"),
  campaignName: z.string().max(100).default("11.11"),
  campaignStart: z.string().max(20),
  campaignEnd: z.string().max(20),
  targetRevenue: z.number().nullable().default(null),
  currentRevenue: z.number().nullable().default(null),
  currentProfit: z.number().nullable().default(null),
  orderCount: z.number().nullable().default(null),
  products: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        stock: z.number(),
        price: z.number(),
        cost_price: z.number(),
        category: z.string().nullable(),
        salesQty14d: z.number(),
      }),
    )
    .max(300),
});

export type CampaignAiSuggestions = {
  own_data_suggestions: string[];
  market_reference: { text: string; disclaimer: string };
};

const langName = (l: string) => (l === "zh" ? "Chinese (Simplified)" : l === "ms" ? "Bahasa Malaysia" : "English");

// IMPORTANT — read before touching this file:
// The Lovable AI Gateway call below is a plain chat/completions proxy with
// no web-search/grounding tool wired up (unverified whether the gateway
// even supports one for Gemini). So this function NEVER claims to know
// real-time market data. "own_data_suggestions" must be grounded only in
// the seller's own numbers passed in below; "market_reference" is general
// model knowledge and is always returned with an explicit non-real-time
// disclaimer — never remove that disclaimer or present it as live data.
function buildSystemPrompt(lang: string) {
  return `You are a business advisor for a small TikTok Shop seller in Malaysia, helping them prepare for a sales campaign (e.g. 11.11 / Double 11). Reply in ${langName(lang)}, in short, practical, non-hype language (this is an accounting/business tool, not a marketing/motivation app).

Return STRICT JSON only matching this TypeScript type:
{
  "own_data_suggestions": string[],   // 3 to 6 short, concrete, actionable sentences
  "market_reference": { "text": string, "disclaimer": string }
}

Rules:
- "own_data_suggestions": base these ONLY on the seller's own data provided below (their products, stock, prices, cost, recent sales pace, campaign target/progress). Never invent numbers, product names, or facts not present in the data. Suggest things like: which products to prioritize promoting (good margin + enough stock), which are at risk of running out, which are overstocked/slow and could use a discount push, and whether they're pacing toward their target.
- "market_reference": 2-4 short sentences of GENERAL knowledge about what categories/product types commonly do well for Malaysian online shoppers during major sale events like 11.11. You do NOT have live internet access and do NOT know actual current 2026 trends — do not claim otherwise, do not cite specific numbers, rankings, or sources.
- "disclaimer": a short sentence, in ${langName(lang)}, stating this is general AI knowledge, not real-time/verified market data, and should not be the sole basis for decisions.
- Output JSON only, no prose, no markdown fences.`;
}

function buildUserText(input: z.infer<typeof InputSchema>) {
  const p = input.products
    .map(
      (i) =>
        `- ${i.name} | stock=${i.stock} | price=RM${i.price.toFixed(2)} | cost=RM${i.cost_price.toFixed(2)} | category=${i.category ?? "-"} | sold~${i.salesQty14d}/14d`,
    )
    .join("\n");
  return `CAMPAIGN: "${input.campaignName}", ${input.campaignStart} to ${input.campaignEnd}
TARGET REVENUE: ${input.targetRevenue != null ? `RM ${input.targetRevenue.toFixed(2)}` : "(not set)"}
PROGRESS SO FAR: ${input.currentRevenue != null ? `revenue RM ${input.currentRevenue.toFixed(2)}, profit RM ${(input.currentProfit ?? 0).toFixed(2)}, ${input.orderCount ?? 0} orders` : "(campaign hasn't started or no data yet)"}

PRODUCTS (id omitted, name | stock | price | cost | category | recent sales pace):
${p || "(no products)"}`;
}

export const Route = createFileRoute("/api/public/campaign-ai/suggest")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { headers: CORS }),
      POST: async ({ request }) => {
        const userId = await userIdFromRequest(request);
        if (!userId) return json(401, { error: "Unauthorized" });

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return json(400, { error: "Invalid JSON" });
        }
        const parsed = InputSchema.safeParse(body);
        if (!parsed.success) return json(400, { error: "Invalid request" });
        const data = parsed.data;

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) return json(500, { error: "Missing GEMINI_API_KEY" });
        const feature = "campaign_suggestions";
        // Same model-name fix as ai-chat/send.ts — see comment there.
        let model = "gemini-3.8-flash";
        // Same note as ai-chat/send.ts: "gemini-2.5-*" 404s on this
        // OpenAI-compat endpoint entirely, so the fallback stays in the
        // "gemini-3.x" family.
        const FALLBACK_MODEL = "gemini-3.5-flash-lite";

        // Calls Google's Gemini API directly (via its OpenAI-compatible
        // endpoint — same request/response shape as before). No longer
        // proxied through Lovable's AI Gateway; see ai-chat/send.ts for why.
        const chatMessages = [
          { role: "system", content: buildSystemPrompt(data.lang) },
          { role: "user", content: buildUserText(data) },
        ];
        const callGemini = (m: string) =>
          fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({ model: m, messages: chatMessages, response_format: { type: "json_object" }, temperature: 0.3 }),
          });

        let res: Response;
        try {
          res = await callGemini(model);
          // 503 = "the model is overloaded" — transient on Google's side,
          // worth one quick retry on the same model first.
          if (res.status === 503) {
            await new Promise((r) => setTimeout(r, 900));
            res = await callGemini(model);
          }
          // Still failing for a model-specific reason (except account-level
          // 429/402, which a different model won't fix)? Fall back once.
          // See ai-chat/send.ts for the same pattern.
          if (!res.ok && res.status !== 429 && res.status !== 402) {
            model = FALLBACK_MODEL;
            res = await callGemini(model);
          }
        } catch (e) {
          console.error("[campaign-ai/suggest] gemini fetch failed", e);
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
          console.error("[campaign-ai/suggest] gateway error", res.status, errBody.slice(0, 500));
          await logAiUsage({ userId, feature, model, status: "error", errorMsg: `HTTP ${res.status}` });
          return json(502, { error: `AI_ERROR_${res.status}` });
        }

        const gatewayJson = (await res.json()) as {
          choices?: { message?: { content?: string } }[];
          usage?: { prompt_tokens?: number; completion_tokens?: number };
        };
        const raw = gatewayJson.choices?.[0]?.message?.content ?? "";

        let parsedContent: unknown;
        try {
          const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```\s*$/, "").trim();
          parsedContent = JSON.parse(cleaned);
        } catch {
          console.error("[campaign-ai/suggest] JSON parse failed", raw.slice(0, 500));
          await logAiUsage({
            userId, feature, model, status: "parse_failed",
            inputTokens: gatewayJson.usage?.prompt_tokens, outputTokens: gatewayJson.usage?.completion_tokens,
          });
          return json(502, { error: "AI_PARSE_FAILED" });
        }

        await logAiUsage({
          userId, feature, model, status: "ok",
          inputTokens: gatewayJson.usage?.prompt_tokens, outputTokens: gatewayJson.usage?.completion_tokens,
        });

        const fallbackDisclaimer =
          data.lang === "zh"
            ? "以上市场参考基于 AI 的一般知识，不是实时数据，仅供参考"
            : data.lang === "ms"
              ? "Rujukan pasaran ini berdasarkan pengetahuan umum AI, bukan data masa nyata"
              : "This market reference is general AI knowledge, not real-time data";

        const Result = z.object({
          own_data_suggestions: z.array(z.string()).max(10).default([]),
          market_reference: z
            .object({
              text: z.string().default(""),
              disclaimer: z.string().default(fallbackDisclaimer),
            })
            .default({ text: "", disclaimer: fallbackDisclaimer }),
        });

        const safeResult = Result.safeParse(parsedContent);
        if (!safeResult.success) return json(502, { error: "AI_PARSE_FAILED" });

        const result: CampaignAiSuggestions = {
          own_data_suggestions: safeResult.data.own_data_suggestions.filter((s) => s.trim().length > 0).slice(0, 6),
          market_reference: {
            text: safeResult.data.market_reference.text,
            // Never trust the model to keep its own disclaimer — always end
            // with our own fixed, unambiguous one regardless of what it wrote.
            disclaimer: fallbackDisclaimer,
          },
        };
        return json(200, result);
      },
    },
  },
});