import { type ReactNode } from "react";
import { X } from "lucide-react";
import { useI18n } from "@/contexts/I18nContext";

export type FormSection = {
  /** Heading shown at the top of the card */
  title: string;
  /** Optional small subtitle under the title */
  subtitle?: string;
  content: ReactNode;
};

type Props = {
  title: string;
  sections: FormSection[];
  saving?: boolean;
  saveLabel?: string;
  onClose: () => void;
  onSave: () => void;
};

/**
 * Shopee-style full-screen long form:
 *  - sticky header (close + title + save)
 *  - vertical scroll, each section is a white rounded card
 *  - sticky bottom save bar for thumb reach on mobile
 */
export function ProductFormScreen({
  title,
  sections,
  saving,
  saveLabel,
  onClose,
  onSave,
}: Props) {
  const { t } = useI18n();
  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-stretch justify-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[420px] bg-muted/30 text-foreground flex flex-col overflow-hidden h-full"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sticky header */}
        <div
          className="shrink-0 bg-card border-b border-border/60 px-4 py-3 flex items-center gap-2"
          style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)" }}
        >
          <button
            onClick={onClose}
            className="p-1.5 -ml-1 rounded-full hover:bg-muted text-muted-foreground"
            aria-label="close"
          >
            <X className="h-5 w-5" />
          </button>
          <h3 className="text-base font-bold truncate flex-1">{title}</h3>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="px-4 py-2 rounded-full bg-gradient-to-r from-primary to-primary/80 text-primary-foreground text-xs font-bold disabled:opacity-60 active:scale-[0.98]"
          >
            {saving ? t("saving") : (saveLabel ?? t("save"))}
          </button>
        </div>

        {/* Scroll body */}
        <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-3 pb-28">
          {sections.map((s, i) => (
            <section
              key={i}
              className="bg-card rounded-2xl border border-border/60 shadow-[var(--shadow-card)] overflow-hidden"
            >
              <div className="px-4 pt-3.5 pb-2">
                <h4 className="text-sm font-bold text-foreground">{s.title}</h4>
                {s.subtitle && (
                  <p className="text-[11px] text-muted-foreground mt-0.5">{s.subtitle}</p>
                )}
              </div>
              <div className="px-4 pb-4 space-y-3">{s.content}</div>
            </section>
          ))}
        </div>

        {/* Sticky bottom save bar (mobile thumb reach) */}
        <div
          className="shrink-0 bg-card border-t border-border/60 px-4 py-3"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)" }}
        >
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="w-full py-3 rounded-2xl bg-gradient-to-r from-primary to-primary/80 text-primary-foreground text-sm font-bold disabled:opacity-60 active:scale-[0.99]"
          >
            {saving ? t("saving") : (saveLabel ?? t("save"))}
          </button>
        </div>
      </div>
    </div>
  );
}