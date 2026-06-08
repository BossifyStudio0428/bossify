import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireExternalSupabaseAuth } from "@/integrations/supabase/external-auth-middleware";

const InputSchema = z.object({
  names: z.array(z.string().min(1).max(200)).min(1).max(50),
  existingCategories: z.array(z.string().min(1).max(80)).max(200).default([]),
});

export type ClassifiedIngredient = {
  name: string;
  category: string;
  confidence: number;
};

export const classifyIngredientsWithAi = createServerFn({ method: "POST" })
  .middleware([requireExternalSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }): Promise<ClassifiedIngredient[]> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("Missing LOVABLE_API_KEY");

    const catList = data.existingCategories.length
      ? data.existingCategories.join(", ")
      : "(none)";

    const systemPrompt = `You categorize FnB raw ingredients into short category names. Names may be Chinese, Bahasa Malaysia, or English (often mixed).

Return STRICT JSON only with this shape:
{ "items": Array<{ "name": string, "category": string, "confidence": number }> }

Rules:
- Prefer reusing a category from the EXISTING CATEGORIES list when it fits. Use that exact spelling.
- Only invent a new category when none of the existing ones fit. Keep new category names short (1-3 words), in the same primary language as the ingredient name.
- "confidence" is 0..1. Use < 0.5 when unsure.
- Output JSON only, no prose, no markdown fences.`;

    const userText = `EXISTING CATEGORIES: ${catList}

INGREDIENTS TO CATEGORIZE:
${data.names.map((n, i) => `${i + 1}. ${n}`).join("\n")}`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
        "X-Lovable-AIG-SDK": "raw-fetch",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userText },
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
      }),
    });

    if (res.status === 429) throw new Error("AI_RATE_LIMIT");
    if (res.status === 402) throw new Error("AI_CREDIT_EXHAUSTED");
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[ai-classify-ingredient] gateway error", res.status, body.slice(0, 500));
      throw new Error(`AI_ERROR_${res.status}`);
    }

    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const raw = json.choices?.[0]?.message?.content ?? "";

    let parsed: unknown;
    try {
      const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```\s*$/, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      throw new Error("AI_PARSE_FAILED");
    }

    const Result = z.object({
      items: z
        .array(
          z.object({
            name: z.string().default(""),
            category: z.string().default(""),
            confidence: z.coerce.number().min(0).max(1).optional().default(0.7),
          }),
        )
        .default([]),
    });
    const safe = Result.parse(parsed);

    // Map back by name (case-insensitive). If AI misses some, fill with empty.
    const byName = new Map<string, ClassifiedIngredient>();
    safe.items.forEach((it) => {
      const key = (it.name ?? "").trim().toLowerCase();
      if (key) byName.set(key, {
        name: it.name.trim(),
        category: (it.category ?? "").trim(),
        confidence: it.confidence,
      });
    });

    return data.names.map((n) => {
      const match = byName.get(n.trim().toLowerCase());
      return match ?? { name: n, category: "", confidence: 0 };
    });
  });