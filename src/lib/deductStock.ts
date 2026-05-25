import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Deduct inventory stock for the given items, matching by case-insensitive name
 * within the given user's inventory. Best-effort: silently skips items with no
 * matching inventory row, and never throws.
 *
 * Works with both the browser supabase client and a server-side admin client
 * (the `.from(...).select/update` API is identical).
 */
export async function deductInventoryStock(
  sb: SupabaseClient | any,
  userId: string,
  items: Array<{ product: string; quantity: number }>,
): Promise<void> {
  // Aggregate by lowercased product name in case the same item appears twice.
  const totals = new Map<string, number>();
  for (const it of items) {
    const name = (it.product || "").trim();
    const qty = Math.max(0, Math.floor(Number(it.quantity) || 0));
    if (!name || qty <= 0) continue;
    const key = name.toLowerCase();
    totals.set(key, (totals.get(key) || 0) + qty);
  }
  if (totals.size === 0) return;

  try {
    const { data: inv } = await sb
      .from("inventory")
      .select("id,name,stock")
      .eq("user_id", userId);
    const rows = (inv ?? []) as Array<{ id: string; name: string; stock: number | null }>;

    for (const row of rows) {
      const key = (row.name || "").trim().toLowerCase();
      const dec = totals.get(key);
      if (!dec) continue;
      const newStock = Math.max(0, Number(row.stock ?? 0) - dec);
      if (newStock === Number(row.stock ?? 0)) continue;
      await sb.from("inventory").update({ stock: newStock }).eq("id", row.id);
    }
  } catch {
    // non-fatal — order is already saved
  }
}