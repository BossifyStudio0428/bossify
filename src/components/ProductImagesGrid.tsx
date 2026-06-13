import { useRef, useState } from "react";
import { Plus, X, Video, Star } from "lucide-react";
import { toast } from "sonner";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
  arrayMove,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { supabase } from "@/integrations/supabase/client";

type Props = {
  images: string[];
  onChange: (next: string[]) => void;
  videoUrl: string | null;
  onVideoChange: (next: string | null) => void;
  /** Fires after the first-frame thumbnail of an uploaded video has been captured + stored. */
  onVideoThumbReady?: (thumbUrl: string | null) => void;
  userId: string;
  maxImages?: number;
  maxImageMB?: number;
  maxVideoMB?: number;
  /** Hide the video upload slot (for "detail photos" sections that are images-only). */
  hideVideo?: boolean;
};

/**
 * Shopee-style 9-grid image picker + video slot.
 *  - first tile = cover (badge)
 *  - long-press (200ms) to drag-reorder; tap a tile's buttons normally
 *  - tap X to remove, ⭐ Cover to promote
 *  - video slot below grid: auto-captures first-frame thumbnail and bubbles it
 *    via onVideoThumbReady so the parent can fall back to it as cover_image_url.
 */
export function ProductImagesGrid({
  images,
  onChange,
  videoUrl,
  onVideoChange,
  onVideoThumbReady,
  userId,
  maxImages = 9,
  maxImageMB = 5,
  maxVideoMB = 30,
  hideVideo = false,
}: Props) {
  const imgRef = useRef<HTMLInputElement>(null);
  const vidRef = useRef<HTMLInputElement>(null);
  const [busyThumb, setBusyThumb] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

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

  /** Capture frame at ~0.1s, encode JPEG, upload, return public URL. */
  const captureAndUploadThumb = async (srcUrl: string): Promise<string | null> => {
    const blob = await captureFrame(srcUrl);
    if (!blob) return null;
    const path = `${userId}/video-thumbs/${crypto.randomUUID()}.jpg`;
    const { error } = await supabase.storage
      .from("product-images")
      .upload(path, blob, { cacheControl: "3600", upsert: false, contentType: "image/jpeg" });
    if (error) return null;
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
    if (!url) return;
    onVideoChange(url);
    if (onVideoThumbReady) {
      setBusyThumb(true);
      const thumb = await captureAndUploadThumb(url);
      setBusyThumb(false);
      onVideoThumbReady(thumb);
    }
  };

  const removeAt = (i: number) => onChange(images.filter((_, idx) => idx !== i));
  const makeCover = (i: number) => {
    if (i === 0) return;
    const next = images.slice();
    const [pick] = next.splice(i, 1);
    next.unshift(pick);
    onChange(next);
  };

  const onDragEnd = (ev: DragEndEvent) => {
    const { active, over } = ev;
    if (!over || active.id === over.id) return;
    const from = images.indexOf(String(active.id));
    const to = images.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    onChange(arrayMove(images, from, to));
  };

  // 9 cells: filled images (sortable) + one "+" add cell + empty placeholders
  const placeholders: number[] = [];
  const placeholderStart = images.length + (images.length < maxImages ? 1 : 0);
  for (let i = placeholderStart; i < maxImages; i++) placeholders.push(i);

  return (
    <div className="space-y-3">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={images} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-3 gap-2">
            {images.map((url, idx) => (
              <SortableImageCell
                key={url}
                url={url}
                idx={idx}
                onRemove={() => removeAt(idx)}
                onMakeCover={() => makeCover(idx)}
              />
            ))}
            {images.length < maxImages && (
              <button
                type="button"
                onClick={() => imgRef.current?.click()}
                className="aspect-square rounded-xl border-2 border-dashed border-border/80 bg-muted/20 flex flex-col items-center justify-center gap-1 text-muted-foreground hover:border-primary hover:text-primary transition"
              >
                <Plus className="h-5 w-5" strokeWidth={2.5} />
                <span className="text-[10px] font-semibold">
                  {images.length}/{maxImages}
                </span>
              </button>
            )}
            {placeholders.map((i) => (
              <div
                key={"empty" + i}
                className="aspect-square rounded-xl border border-dashed border-border/40 bg-muted/10"
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {images.length > 1 && (
        <p className="text-[10px] text-muted-foreground px-1">
          长按图片可拖动排序 · 第一张为封面
        </p>
      )}

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
      {!hideVideo && <div className="pt-1">
        {videoUrl ? (
          <div className="relative rounded-xl overflow-hidden bg-black border border-border/60">
            <video src={videoUrl} controls preload="metadata" className="w-full max-h-56 object-contain bg-black" />
            {busyThumb && (
              <span className="absolute bottom-1.5 left-1.5 text-[10px] px-1.5 py-0.5 rounded-md bg-black/70 text-white">
                生成缩略图…
              </span>
            )}
            <button
              type="button"
              onClick={() => { onVideoChange(null); onVideoThumbReady?.(null); }}
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
      </div>}
    </div>
  );
}

function SortableImageCell({
  url, idx, onRemove, onMakeCover,
}: { url: string; idx: number; onRemove: () => void; onMakeCover: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: url });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    touchAction: "manipulation",
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="relative aspect-square rounded-xl overflow-hidden bg-muted/50 border border-border/60 select-none"
    >
      <img src={url} alt="" className="h-full w-full object-cover pointer-events-none" draggable={false} />
      {idx === 0 && (
        <span className="absolute top-1 left-1 text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-primary text-primary-foreground">
          COVER
        </span>
      )}
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onRemove}
        className="absolute top-1 right-1 h-5 w-5 rounded-full bg-black/60 text-white flex items-center justify-center"
        aria-label="remove"
      >
        <X className="h-3 w-3" />
      </button>
      {idx !== 0 && (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onMakeCover}
          className="absolute bottom-1 left-1 h-5 px-1.5 rounded-md bg-black/60 text-white text-[9px] font-bold flex items-center gap-0.5"
          aria-label="make cover"
        >
          <Star className="h-2.5 w-2.5" /> Cover
        </button>
      )}
    </div>
  );
}

/** Decode video, seek to first frame, return JPEG blob. Returns null on failure. */
async function captureFrame(src: string): Promise<Blob | null> {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    v.crossOrigin = "anonymous";
    v.preload = "metadata";
    v.muted = true;
    v.playsInline = true;
    v.src = src;

    let settled = false;
    const done = (b: Blob | null) => { if (!settled) { settled = true; resolve(b); } };
    const timer = window.setTimeout(() => done(null), 8000);

    v.onloadedmetadata = () => {
      try { v.currentTime = Math.min(0.1, (v.duration || 1) / 2); }
      catch { done(null); }
    };
    v.onseeked = () => {
      try {
        const w = v.videoWidth, h = v.videoHeight;
        if (!w || !h) { done(null); return; }
        const maxSide = 720;
        const scale = Math.min(1, maxSide / Math.max(w, h));
        const cw = Math.round(w * scale), ch = Math.round(h * scale);
        const c = document.createElement("canvas");
        c.width = cw; c.height = ch;
        const ctx = c.getContext("2d");
        if (!ctx) { done(null); return; }
        ctx.drawImage(v, 0, 0, cw, ch);
        c.toBlob((b) => { window.clearTimeout(timer); done(b); }, "image/jpeg", 0.82);
      } catch { done(null); }
    };
    v.onerror = () => { window.clearTimeout(timer); done(null); };
  });
}