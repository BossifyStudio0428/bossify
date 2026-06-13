import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getPublicOrigin } from "@/lib/publicUrl";

/**
 * Show a success toast after creating/updating a product/service/listing.
 * Includes an action to open the public order form so the merchant can
 * preview how the new item looks to customers.
 */
export async function toastSavedWithOrderFormLink(
  message: string,
  userId: string,
  labels?: { description?: string; action?: string },
) {
  try {
    const { data } = await supabase
      .from("profiles")
      .select("order_form_code,order_form_enabled" as any)
      .eq("id", userId)
      .maybeSingle();
    const code = (data as any)?.order_form_code as string | null | undefined;
    const enabled = ((data as any)?.order_form_enabled as boolean | undefined) ?? true;

    if (code && enabled) {
      const url = `${getPublicOrigin()}/order/${code}`;
      toast.success(message, {
        description: labels?.description ?? "View it on your order form",
        duration: 6000,
        action: {
          label: labels?.action ?? "View form",
          onClick: () => window.open(url, "_blank", "noopener,noreferrer"),
        },
      });
      return;
    }
  } catch {
    /* fall through to plain success */
  }
  toast.success(message);
}