import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireExternalSupabaseAuth } from "@/integrations/supabase/external-auth-middleware";

const InputSchema = z.object({
  kind: z.enum(["image", "pdf", "text"]),
  // base64 (without data: prefix) for image/pdf, or raw text for text
  payload: z.string().min(1).max(15_000_000),
  mimeType: z.string().max(100).optional(),
  mode: z.enum(["ingredients", "inventory"]).default("ingredients"),
  items: z
    .array(z.object({ id: z.string(), name: z.string(), unit: z.string().optional().nullable() }))
    .max(2000),
  suppliers: z.array(z.object({ id: z.string(), name: z.string() })).max(500),
  existingCategories: z.array(z.string().min(1).max(80)).max(200).default([]),
});

export type ParsedPoItem = {
  matched_id: string | null;
  name: string;
  quantity: number;
  unit: string;
  unit_price: number;
  confidence: number;
  category: string | null;
};

export type ParsedPoResult = {
  supplier: { matched_id: string | null; name: string; confidence: number };
  items: ParsedPoItem[];
  order_date: string | null;
  notes: string | null;
};

function buildSystemPrompt(mode: "ingredients" | "inventory") {
  const domain =
    mode === "inventory"
      ? "finished retail products (e.g. clothing, accessories, packaged goods) being restocked from a supplier"
      : "FnB raw ingredients / materials";
  return `You are an assistant that extracts purchase order data from receipts, invoices, supplier order forms, or chat messages in Chinese, Bahasa Malaysia, and English (often mixed). The buyer's items are ${domain}.

Return STRICT JSON only matching this TypeScript type:
{
  "supplier": { "matched_id": string | null, "name": string, "confidence": number },
  "items": Array<{
    "matched_id": string | null,
    "name": string,
    "quantity": number,
    "unit": string,
    "unit_price": number,
    "confidence": number,
    "category": string | null
  }>,
  "order_date": string | null,   // ISO date YYYY-MM-DD if visible
  "notes": string | null
}

Rules:
- For each item, try to match it to one entry from the provided ${mode === "inventory" ? "products" : "ingredients"} list (case-insensitive, fuzzy, multilingual, allow size/color/SKU variants to match the base product). If a confident match exists, set matched_id to that id. Otherwise set null.
- Same for supplier vs the suppliers list.
- "confidence" is 0..1. Use < 0.5 only when very unsure.
- "name" should be the cleaned-up product name as shown on the document (keep original language).
- "quantity" must be a number (default 1 if unclear).
- "unit" examples: ${mode === "inventory" ? "pcs, pair, set, box, ctn, pack" : "kg, g, pcs, box, ctn, L, ml, pack"}. Use the most likely unit; empty string if unknown.
- "unit_price" is RM per unit. 0 if unknown.
- "category" (${mode === "ingredients" ? "ingredients only" : "leave null for retail products"}): ${mode === "ingredients" ? "pick a short category. Prefer reusing one from the EXISTING CATEGORIES list (exact spelling). Only invent a new short category (1-3 words, same primary language as the name) when none fit. Null only when truly unclear." : "always null."}
- Ignore subtotals, tax lines, totals, delivery fees, discounts.
- Output JSON only, no prose, no markdown fences.`;
}

function buildUserText(
  mode: "ingredients" | "inventory",
  items: { id: string; name: string }[],
  suppliers: { id: string; name: string }[],
  categories: string[],
  textPayload?: string,
) {
  const ingList = items.map((i) => `- ${i.id} :: ${i.name}`).join("\n");
  const supList = suppliers.map((s) => `- ${s.id} :: ${s.name}`).join("\n");
  const label = mode === "inventory" ? "PRODUCTS" : "INGREDIENTS";
  const catBlock = mode === "ingredients"
    ? `EXISTING CATEGORIES: ${categories.length ? categories.join(", ") : "(none)"}\n\n`
    : "";
  return `EXISTING ${label} (id :: name):
${ingList || "(none)"}

EXISTING SUPPLIERS (id :: name):
${supList || "(none)"}

${catBlock}${textPayload ? `DOCUMENT TEXT:\n${textPayload}\n` : "Extract the purchase order from the attached file."}`;
}

export const parsePurchaseOrderWithAi = createServerFn({ method: "POST" })
  .middleware([requireExternalSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data, context }): Promise<ParsedPoResult> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("Missing LOVABLE_API_KEY");
    const { logAiUsage } = await import("@/lib/ai-usage.server");
    const userId = context.userId ?? null;
    const feature = "parse_po";

    const systemPrompt = buildSystemPrompt(data.mode);
    const userText = buildUserText(
      data.mode,
      data.items,
      data.suppliers,
      data.existingCategories ?? [],
      data.kind === "text" ? data.payload : undefined,
    );

    type ContentPart =
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } };

    const userContent: ContentPart[] = [{ type: "text", text: userText }];

    if (data.kind === "image") {
      const mime = data.mimeType || "image/jpeg";
      userContent.push({
        type: "image_url",
        image_url: { url: `data:${mime};base64,${data.payload}` },
      });
    } else if (data.kind === "pdf") {
      // Best-effort: pass PDF as image_url data URL (gemini-2.5-pro tolerates this in many cases).
      userContent.push({
        type: "image_url",
        image_url: { url: `data:application/pdf;base64,${data.payload}` },
      });
    }

    const model = data.kind === "text" ? "google/gemini-2.5-flash" : "google/gemini-2.5-pro";

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
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
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
      console.error("[ai-parse-po] gateway error", res.status, body.slice(0, 500));
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
      // Some models still wrap output in fences; strip them defensively.
      const cleaned = raw
        .trim()
        .replace(/^```(?:json)?/i, "")
        .replace(/```\s*$/, "")
        .trim();
      parsed = JSON.parse(cleaned);
    } catch (e) {
      console.error("[ai-parse-po] JSON parse failed", raw.slice(0, 500));
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

    const Result = z.object({
      supplier: z
        .object({
          matched_id: z.string().nullable().optional(),
          name: z.string().optional().default(""),
          confidence: z.number().min(0).max(1).optional().default(0),
        })
        .default({ matched_id: null, name: "", confidence: 0 }),
      items: z
        .array(
          z.object({
            matched_id: z.string().nullable().optional(),
            matched_ingredient_id: z.string().nullable().optional(),
            name: z.string().default(""),
            quantity: z.coerce.number().default(1),
            unit: z.string().optional().default(""),
            unit_price: z.coerce.number().optional().default(0),
            confidence: z.coerce.number().min(0).max(1).optional().default(0.5),
            category: z.string().nullable().optional().default(null),
          }),
        )
        .default([]),
      order_date: z.string().nullable().optional().default(null),
      notes: z.string().nullable().optional().default(null),
    });

    const safe = Result.parse(parsed);

    // Verify matched ids actually exist in the user-provided lists.
    const itemIds = new Set(data.items.map((i) => i.id));
    const supIds = new Set(data.suppliers.map((s) => s.id));

    return {
      supplier: {
        matched_id:
          safe.supplier.matched_id && supIds.has(safe.supplier.matched_id)
            ? safe.supplier.matched_id
            : null,
        name: safe.supplier.name ?? "",
        confidence: safe.supplier.confidence ?? 0,
      },
      items: safe.items.map((it) => {
        const candidate = it.matched_id ?? it.matched_ingredient_id ?? null;
        return {
          matched_id: candidate && itemIds.has(candidate) ? candidate : null,
          name: (it.name ?? "").trim(),
          quantity: Number.isFinite(it.quantity) ? Number(it.quantity) : 1,
          unit: it.unit ?? "",
          unit_price: Number.isFinite(it.unit_price) ? Number(it.unit_price) : 0,
          confidence: it.confidence ?? 0.5,
          category: (it.category ?? "").toString().trim() || null,
        };
      }),
      order_date: safe.order_date ?? null,
      notes: safe.notes ?? null,
    };
  });