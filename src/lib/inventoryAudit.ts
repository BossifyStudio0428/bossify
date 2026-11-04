import { supabase } from "@/integrations/supabase/client";

/**
 * Logs a single field change on a product. Fire-and-forget on purpose —
 * a logging failure must never block the real inventory update it's
 * describing. Only logs when the value actually changed (skips no-ops).
 */
export async function logInventoryChange(input: {
  userId: string;
  productId: string;
  productName: string;
  fieldName: "cost_price" | "price" | "stock";
  oldValue: number | null | undefined;
  newValue: number | null | undefined;
  source: string;
}) {
  try {
    const oldV = input.oldValue ?? null;
    const newV = input.newValue ?? null;
    if (oldV === newV) return;
    await supabase.from("inventory_audit_log" as any).insert({
      user_id: input.userId,
      product_id: input.productId,
      product_name: input.productName,
      field_name: input.fieldName,
      old_value: oldV === null ? null : String(oldV),
      new_value: newV === null ? null : String(newV),
      source: input.source,
    });
  } catch {
    // Non-fatal — never let audit logging break the real save.
  }
}