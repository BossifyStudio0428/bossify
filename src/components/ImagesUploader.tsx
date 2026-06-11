import { useRef } from "react";
import { Upload, Trash2, ImageIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/contexts/I18nContext";

type Props = {
  images: string[];
  onChange: (next: string[]) => void;
  userId: string;
  max?: number;
};

export function ImagesUploader({ images, onChange, userId, max = 6 }: Props) {
  const { t } = useI18n();
  const fileRef = useRef<HTMLInputElement>(null);

  const uploadOne = async (file: File): Promise<string | null> => {
    if (file.size > 5 * 1024 * 1024) {
      toast.error(t("image_too_large"));
      return null;
    }
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${userId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage
      .from("product-images")
      .upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type });
    if (error) {
      toast.error(error.message);
      return null;
    }
    const { data: pub } = supabase.storage.from("product-images").getPublicUrl(path);
    return pub.publicUrl;
  };

  const onPick = async (files: FileList) => {
    if (!userId) return;
    const remaining = Math.max(0, max - images.length);
    if (remaining === 0) {
      toast.error(`Max ${max} images`);
      return;
    }
    const slice = Array.from(files).slice(0, remaining);
    const uploaded: string[] = [];
    for (const f of slice) {
      const url = await uploadOne(f);
      if (url) uploaded.push(url);
    }
    if (uploaded.length) onChange([...images, ...uploaded]);
  };

  const remove = (idx: number) => onChange(images.filter((_, i) => i !== idx));
  const move = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= images.length) return;
    const next = images.slice();
    [next[idx], next[j]] = [next[j], next[idx]];
    onChange(next);
  };

  return (
    <div className="space-y-2">
      <label className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground px-1">
        {t("image")} ({images.length}/{max})
      </label>

      {images.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {images.map((url, i) => (
            <div key={url + i} className="relative aspect-square rounded-xl overflow-hidden bg-muted/50 border border-border/60 group">
              <img src={url} alt="" className="h-full w-full object-cover" />
              {i === 0 && (
                <span className="absolute top-1 left-1 text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-primary text-primary-foreground">
                  MAIN
                </span>
              )}
              <button
                type="button"
                onClick={() => remove(i)}
                className="absolute top-1 right-1 h-6 w-6 rounded-full bg-black/60 text-white flex items-center justify-center"
                aria-label="remove"
              >
                <Trash2 className="h-3 w-3" />
              </button>
              <div className="absolute bottom-1 left-1 right-1 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  className="h-6 w-6 rounded-full bg-black/60 text-white flex items-center justify-center disabled:opacity-30"
                >
                  <ChevronLeft className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => move(i, 1)}
                  disabled={i === images.length - 1}
                  className="h-6 w-6 rounded-full bg-black/60 text-white flex items-center justify-center disabled:opacity-30"
                >
                  <ChevronRight className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {images.length === 0 && (
        <div className="aspect-[3/2] rounded-xl bg-muted/40 border border-dashed border-border/60 flex items-center justify-center">
          <ImageIcon className="h-8 w-8 text-muted-foreground" />
        </div>
      )}

      {images.length < max && (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-primary/10 text-primary text-xs font-semibold"
        >
          <Upload className="h-3.5 w-3.5" />
          {images.length === 0 ? t("upload_image") : t("change_image")}
        </button>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) onPick(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}