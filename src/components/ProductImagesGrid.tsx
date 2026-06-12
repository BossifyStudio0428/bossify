import { useRef } from "react";
import { Plus, X, Video, Star } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type Props = {
  images: string[];
  onChange: (next: string[]) => void;
  videoUrl: string | null;
  onVideoChange: (next: string | null) => void;
  userId: string;
  maxImages?: number;
  maxImageMB?: number;
  maxVideoMB?: number;
};

/**
 * Shopee-style 9-grid image picker + video slot.
 *  - first tile = cover (badge)
 *  - empty tiles show dashed "+" placeholders, fills the 3x3 grid
 *  - tap a filled tile's X to remove
 *  - long-press / drag is not implemented yet; promote to cover with the star button
 *  - video slot below grid (single mp4/webm, optional)
 */
export function ProductImagesGrid({
  images,
  onChange,
  videoUrl,
  onVideoChange,
  userId,
  maxImages = 9,
  maxImageMB = 5,
  maxVideoMB = 30,
}: Props) {
  const imgRef = useRef<HTMLInputElement>(null);
  const vidRef = useRef<HTMLInputElement>(null);

  const uploadImage = async (file: File): Promise<string | null> => {
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

  const uploadVideo = async (file: File): Promise<string | null> => {
    if (file.size > maxVideoMB * 1024 * 1024) {
      toast.error(`Video must be ≤ ${maxVideoMB}MB`);
      return null;
    }
    const ext = file.name.split(".").pop()?.toLowerCase() || "mp4";
    const path = `${userId}/videos/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage
      .from("product-images")
      .upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type });
    if (error) { toast.error(error.message); return null; }
    const { data } = supabase.storage.from("product-images").getPublicUrl(path);
    return data.publicUrl;
  };

  const onPickImages = async (files: FileList) => {
    if (!userId) return;
    const remaining = Math.max(0, maxImages - images.length);
    if (remaining === 0) { toast.error(`Max ${maxImages} images`); return; }
    const slice = Array.from(files).slice(0, remaining);
    const uploaded: string[] = [];
    for (const f of slice) {
      const url = await uploadImage(f);
      if (url) uploaded.push(url);
    }
    if (uploaded.length) onChange([...images, ...uploaded]);
  };

  const onPickVideo = async (file: File) => {
    if (!userId) return;
    const url = await uploadVideo(file);
    if (url) onVideoChange(url);
  };

  const removeAt = (i: number) => onChange(images.filter((_, idx) => idx !== i));
  const makeCover = (i: number) => {
    if (i === 0) return;
    const next = images.slice();
    const [pick] = next.splice(i, 1);
    next.unshift(pick);
    onChange(next);
  };

  // Build 9 cells: filled + first empty add cell (if room)
  const cells: ({ kind: "img"; url: string; idx: number } | { kind: "add" } | { kind: "empty" })[] = [];
  for (let i = 0; i < maxImages; i++) {
    if (i < images.length) cells.push({ kind: "img", url: images[i], idx: i });
    else if (i === images.length) cells.push({ kind: "add" });
    else cells.push({ kind: "empty" });
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {cells.map((c, i) => {
          if (c.kind === "img") {
            return (
              <div
                key={"img" + i}
                className="relative aspect-square rounded-xl overflow-hidden bg-muted/50 border border-border/60"
              >
                <img src={c.url} alt="" className="h-full w-full object-cover" />
                {c.idx === 0 && (
                  <span className="absolute top-1 left-1 text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-primary text-primary-foreground">
                    COVER
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => removeAt(c.idx)}
                  className="absolute top-1 right-1 h-5 w-5 rounded-full bg-black/60 text-white flex items-center justify-center"
                  aria-label="remove"
                >
                  <X className="h-3 w-3" />
                </button>
                {c.idx !== 0 && (
                  <button
                    type="button"
                    onClick={() => makeCover(c.idx)}
                    className="absolute bottom-1 left-1 h-5 px-1.5 rounded-md bg-black/60 text-white text-[9px] font-bold flex items-center gap-0.5"
                    aria-label="make cover"
                  >
                    <Star className="h-2.5 w-2.5" /> Cover
                  </button>
                )}
              </div>
            );
          }
          if (c.kind === "add") {
            return (
              <button
                key={"add" + i}
                type="button"
                onClick={() => imgRef.current?.click()}
                className="aspect-square rounded-xl border-2 border-dashed border-border/80 bg-muted/20 flex flex-col items-center justify-center gap-1 text-muted-foreground hover:border-primary hover:text-primary transition"
              >
                <Plus className="h-5 w-5" strokeWidth={2.5} />
                <span className="text-[10px] font-semibold">
                  {images.length}/{maxImages}
                </span>
              </button>
            );
          }
          return (
            <div
              key={"empty" + i}
              className="aspect-square rounded-xl border border-dashed border-border/40 bg-muted/10"
            />
          );
        })}
      </div>

      <input
        ref={imgRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) onPickImages(e.target.files);
          e.target.value = "";
        }}
      />

      {/* Video slot */}
      <div className="pt-1">
        {videoUrl ? (
          <div className="relative rounded-xl overflow-hidden bg-black border border-border/60">
            <video src={videoUrl} controls preload="metadata" className="w-full max-h-56 object-contain bg-black" />
            <button
              type="button"
              onClick={() => onVideoChange(null)}
              className="absolute top-1.5 right-1.5 h-6 w-6 rounded-full bg-black/70 text-white flex items-center justify-center"
              aria-label="remove video"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => vidRef.current?.click()}
            className="w-full h-20 rounded-xl border-2 border-dashed border-border/80 bg-muted/20 flex items-center justify-center gap-2 text-muted-foreground hover:border-primary hover:text-primary transition"
          >
            <Video className="h-4 w-4" />
            <span className="text-xs font-semibold">
              Upload video <span className="text-muted-foreground/70 font-normal">(≤{maxVideoMB}MB)</span>
            </span>
          </button>
        )}
        <input
          ref={vidRef}
          type="file"
          accept="video/mp4,video/webm,video/quicktime"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onPickVideo(f);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}