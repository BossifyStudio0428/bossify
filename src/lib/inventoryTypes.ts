import type { InventoryRow as BaseInventoryRow } from "@/integrations/supabase/client";

export type Variant = {
  id: string;
  name: string;
  price: number;
};

export type InvRow = BaseInventoryRow & {
  image_url?: string | null;
  category?: string | null;
  description?: string | null;
  variants?: Variant[] | null;
};

export function parseVariants(raw: unknown): Variant[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((v) => {
      if (!v || typeof v !== "object") return null;
      const o = v as Record<string, unknown>;
      const name = typeof o.name === "string" ? o.name : "";
      const price = Number(o.price ?? 0);
      if (!name.trim()) return null;
      return {
        id: typeof o.id === "string" ? o.id : crypto.randomUUID(),
        name: name.trim(),
        price: Number.isFinite(price) ? price : 0,
      } as Variant;
    })
    .filter((v): v is Variant => v !== null);
}

/** A single Shopee-style "detail" entry: one image + its own description. */
export type DetailItem = { url: string; description: string };

/** Accepts legacy string[] or new {url, description}[] and normalizes. */
export function parseDetailItems(raw: unknown): DetailItem[] {
  if (!Array.isArray(raw)) return [];
  const out: DetailItem[] = [];
  for (const v of raw) {
    if (typeof v === "string") {
      if (v.trim()) out.push({ url: v, description: "" });
    } else if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      const url = typeof o.url === "string" ? o.url : "";
      const description = typeof o.description === "string" ? o.description : "";
      if (url.trim()) out.push({ url, description });
    }
  }
  return out;
}