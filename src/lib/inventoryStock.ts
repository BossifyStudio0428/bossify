import { supabase } from "@/integrations/supabase/client";

/**
 * Adds `delta` (may be negative) to a product's stock in ONE database step
 * and returns the resulting stock.
 *
 * Why: the old pattern was "read the stock shown on screen, compute the new
 * number in the app, write it back". Two devices editing the same product
 * at nearly the same moment each wrote their own total, and one edit
 * silently vanished. Letting the database do `stock = stock + delta` means
 * both edits always count.
 *
 * `newCostPrice`, when given, is written in the same step (stock receipts
 * update stock and weighted-average cost together).
 *
 * Uses the `adjust_inventory_stock` database function from
 * supabase/manual-migrations/stock-audit-fixes.sql. If that function hasn't
 * been created yet, this falls back to the old read-then-write so the app
 * keeps working — just without the protection.
 */
export async function adjustStockAtomic(
  productId: string,
  delta: number,
  newCostPrice?: number,
): Promise<{ stock: number | null; error: string | null }> {
  const d = Number(delta) || 0;
  const args: Record<string, unknown> = { p_id: productId, p_delta: d };
  if (newCostPrice !== undefined) args.p_cost_price = newCostPrice;

  const { data, error } = await (supabase as any).rpc("adjust_inventory_stock", args);
  if (!error) {
    if (data === null || data === undefined) return { stock: null, error: "Product not found" };
    return { stock: Number(data), error: null };
  }

  // PGRST202 / 42883 = the function doesn't exist (script not run yet).
  const functionMissing = error.code === "PGRST202" || error.code === "42883";
  if (!functionMissing) return { stock: null, error: error.message ?? "Stock update failed" };

  const { data: row, error: readErr } = await supabase.from("inventory").select("stock").eq("id", productId).maybeSingle();
  if (readErr || !row) return { stock: null, error: readErr?.message ?? "Product not found" };
  const next = Math.max(0, Number((row as any).stock ?? 0) + d);
  const patch: Record<string, unknown> = { stock: next };
  if (newCostPrice !== undefined) patch.cost_price = newCostPrice;
  const { error: writeErr } = await supabase.from("inventory").update(patch as any).eq("id", productId);
  if (writeErr) return { stock: null, error: writeErr.message };
  return { stock: next, error: null };
}
