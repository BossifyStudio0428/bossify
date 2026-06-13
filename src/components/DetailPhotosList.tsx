import { useRef, useState } from "react";
import { Plus, X, ArrowUp, ArrowDown } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/contexts/I18nContext";
import type { DetailItem } from "@/lib/inventoryTypes";

type Props = {
  items: DetailItem[];
  onChange: (next: DetailItem[]) => void;
  userId: string;
  maxImageMB?: number;
};

/**
 * Shopee-style detail entries: a vertical list where each entry is ONE photo
 * PLUS its own description ("Detail 1 description", "Detail 2 description", ...).
 * Shown stacked on the customer-facing order form so each image has its own caption.
 */
export function DetailPhotosList({ items, onChange, userId, maxImageMB = 5 }: Props) {
  const { t } = useI18n();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const uploadOne = async (file: File): Promise<string | null> => {
    if (file.size > maxImageMB * 1024 * 1024) {
      toast.error(`Image must be ≤ ${maxImageMB}MB`);
      return null;
    }
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${userId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage
      .from("product-images")
      .upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type });
    if (error) { toast.error(error.message); return null; }
    const { data } = supabase.storage.from("product-images").getPublicUrl(path);
    return data.publicUrl;
  };

  const onPick = async (file: File) => {
    if (!userId) return;
    setUploading(true);
    const url = await uploadOne(file);
    setUploading(false);
    if (url) onChange([...items, { url, description: "" }]);
  };

  const removeAt = (i: number) => onChange(items.filter((_, idx) => idx !== i));
  const updateDesc = (i: number, description: string) =>
    onChange(items.map((it, idx) => (idx === i ? { ...it, description } : it)));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = items.slice();
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <div className="space-y-2.5">
      {items.map((it, i) => (
        <div key={it.url + i} className="rounded-xl border border-border/60 bg-muted/10 overflow-hidden">
          <div className="flex items-center justify-between px-2.5 py-1.5 bg-muted/40">
            <span className="text-[11px] font-bold text-foreground/80">{t("detail_label")} {i + 1}</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => move(i, -1)}
                disabled={i === 0}
                className="h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30"
                aria-label="move up"
              >
                <ArrowUp className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => move(i, 1)}
                disabled={i === items.length - 1}
                className="h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30"
                aria-label="move down"
              >
                <ArrowDown className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => removeAt(i)}
                className="h-6 w-6 rounded-md flex items-center justify-center text-red-500 hover:bg-red-500/10"
                aria-label="remove"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <img src={it.url} alt={`${t("detail_label")} ${i + 1}`} className="w-full h-auto block bg-black/5" />
          <div className="p-2">
            <textarea
              value={it.description}
              onChange={(e) => updateDesc(i, e.target.value)}
              rows={2}
              placeholder={`${t("detail_label")} ${i + 1} ${t("description_label")}`}
              className="w-full rounded-lg bg-background border border-border/60 px-3 py-2 text-sm outline-none focus:border-primary resize-none"
            />
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        className="w-full rounded-xl border-2 border-dashed border-border/80 bg-muted/20 py-4 flex flex-col items-center justify-center gap-1 text-muted-foreground hover:border-primary hover:text-primary transition disabled:opacity-60"
      >
        {uploading ? (
          <div className="h-5 w-5 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
        ) : (
          <>
            <Plus className="h-5 w-5" strokeWidth={2.5} />
            <span className="text-[11px] font-semibold">
              {t("add_detail")} {items.length + 1}
            </span>
            <span className="text-[10px] text-muted-foreground/70">{t("one_photo_per_detail")}</span>
          </>
        )}
      </button>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}