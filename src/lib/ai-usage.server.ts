import { externalSupabaseAdmin as supabaseAdmin } from "@/integrations/supabase/external-admin.server";

// Price per 1M tokens (USD). Keep in sync with Lovable AI Gateway pricing.
const PRICING: Record<string, { input: number; output: number }> = {
  "google/gemini-2.5-flash": { input: 0.075, output: 0.3 },
  "google/gemini-2.5-pro": { input: 1.25, output: 5.0 },
};

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number) {
  const p = PRICING[model] ?? PRICING["google/gemini-2.5-flash"];
  return (inputTokens / 1_000_000) * p.input + (outputTokens / 1_000_000) * p.output;
}

export type LogAiUsageInput = {
  userId: string | null;
  feature: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  status?: "ok" | "rate_limit" | "credit_exhausted" | "error" | "parse_failed";
  errorMsg?: string | null;
};

export async function logAiUsage(input: LogAiUsageInput) {
  try {
    const inputTokens = Math.max(0, Math.floor(input.inputTokens ?? 0));
    const outputTokens = Math.max(0, Math.floor(input.outputTokens ?? 0));
    const cost = estimateCostUsd(input.model, inputTokens, outputTokens);
    await supabaseAdmin.from("ai_usage_logs" as never).insert({
      user_id: input.userId,
      feature: input.feature,
      model: input.model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      est_cost_usd: cost,
      status: input.status ?? "ok",
      error_msg: input.errorMsg ?? null,
    } as never);
  } catch (err) {
    console.warn("[ai-usage] log failed", err);
  }
}