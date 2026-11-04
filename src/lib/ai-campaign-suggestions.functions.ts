import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireExternalSupabaseAuth } from "@/integrations/supabase/external-auth-middleware";

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

export const getCampaignAiSuggestions = createServerFn({ method: "POST" })
  .middleware([requireExternalSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data, context }): Promise<CampaignAiSuggestions> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("Missing LOVABLE_API_KEY");
    const { logAiUsage } = await import("@/lib/ai-usage.server");
    const userId = context.userId ?? null;
    const feature = "campaign_suggestions";
    const model = "google/gemini-2.5-flash";

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
          { role: "system", content: buildSystemPrompt(data.lang) },
          { role: "user", content: buildUserText(data) },
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
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
      console.error("[ai-campaign-suggestions] gateway error", res.status, body.slice(0, 500));
      await logAiUsage({ userId, feature, model, status: "error", errorMsg: `HTTP ${res.status}` });
      throw new Error(`AI_ERROR_${res.status}`);
    }

    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const raw = json.choices?.[0]?.message?.content ?? "";

    let parsed: unknown;
    try {
      const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```\s*$/, "").trim();
      parsed = JSON.parse(cleaned);
    } catch (e) {
      console.error("[ai-campaign-suggestions] JSON parse failed", raw.slice(0, 500));
      await logAiUsage({
        userId, feature, model, status: "parse_failed",
        inputTokens: json.usage?.prompt_tokens, outputTokens: json.usage?.completion_tokens,
      });
      throw new Error("AI_PARSE_FAILED");
    }

    await logAiUsage({
      userId, feature, model, status: "ok",
      inputTokens: json.usage?.prompt_tokens, outputTokens: json.usage?.completion_tokens,
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

    const safe = Result.parse(parsed);
    return {
      own_data_suggestions: safe.own_data_suggestions.filter((s) => s.trim().length > 0).slice(0, 6),
      market_reference: {
        text: safe.market_reference.text,
        // Never trust the model to keep its own disclaimer — always end
        // with our own fixed, unambiguous one regardless of what it wrote.
        disclaimer: fallbackDisclaimer,
      },
    };
  });