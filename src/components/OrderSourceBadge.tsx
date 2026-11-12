import { Globe } from "lucide-react";

/** Normalised "where did this order come from" key. Orders created by hand
 *  in Bossify have order_source = "manual" (or nothing, on very old rows). */
export function orderSourceKey(order: unknown): string {
  const raw = String((order as any)?.order_source ?? "").trim();
  return raw || "manual";
}

export function orderSourceLabel(key: string, lang: string): string {
  switch (key) {
    case "tiktok": return "TikTok";
    case "manual": return lang === "zh" ? "手动添加" : lang === "ms" ? "Tambah manual" : "Manual";
    case "online_form": return lang === "zh" ? "线上表单" : lang === "ms" ? "Borang dalam talian" : "Online form";
    case "dine_in": return lang === "zh" ? "堂食" : lang === "ms" ? "Makan di kedai" : "Dine-in";
    case "shopee": return "Shopee";
    case "lazada": return "Lazada";
    case "facebook": return "Facebook";
    case "instagram": return "Instagram";
    default: return key;
  }
}

/** Small pill showing an order's source: synced from TikTok, added by hand,
 *  placed through the public order form, etc. */
export function OrderSourceBadge({ order, lang }: { order: unknown; lang: string }) {
  const key = orderSourceKey(order);
  const label = orderSourceLabel(key, lang);
  if (key === "tiktok") {
    return <span className="shrink-0 px-2 py-0.5 bg-black text-white text-[10px] font-medium rounded-full">{label}</span>;
  }
  if (key === "online_form") {
    return (
      <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-500/10 text-indigo-600 text-[10px] font-medium rounded-full border border-indigo-500/20">
        <Globe className="h-2.5 w-2.5" /> {label}
      </span>
    );
  }
  return (
    <span className="shrink-0 px-2 py-0.5 bg-muted text-muted-foreground text-[10px] font-medium rounded-full border border-border/60">
      {label}
    </span>
  );
}
