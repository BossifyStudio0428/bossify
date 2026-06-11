import { useState, type ReactNode } from "react";
import { X, ChevronLeft } from "lucide-react";
import { useI18n } from "@/contexts/I18nContext";

export type WizardStep = {
  label: string;
  content: ReactNode;
};

type Props = {
  title: string;
  steps: WizardStep[];
  saving?: boolean;
  saveLabel?: string;
  onClose: () => void;
  onSave: () => void;
};

/**
 * Full-height bottom sheet with swipeable / paginated steps.
 * - Header (title, step label, close)
 * - Progress dots
 * - Scrollable horizontal pager (scroll-snap)
 * - Fixed footer with Back / Next-or-Save (always visible)
 */
export function WizardSheet({ title, steps, saving, saveLabel, onClose, onSave }: Props) {
  const { t } = useI18n();
  const [idx, setIdx] = useState(0);
  const total = steps.length;
  const isLast = idx === total - 1;

  const go = (i: number) => setIdx(Math.max(0, Math.min(total - 1, i)));

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-[420px] h-[88vh] bg-card text-foreground rounded-t-3xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="shrink-0 px-5 pt-4 pb-3 border-b border-border/60">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold truncate">{title}</h3>
            <button
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-muted text-muted-foreground"
              aria-label="close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {/* Progress dots */}
          <div className="mt-3 flex items-center gap-2">
            {steps.map((s, i) => (
              <button
                key={i}
                type="button"
                onClick={() => go(i)}
                className={`h-1.5 rounded-full transition-all ${
                  i === idx ? "w-8 bg-primary" : "w-4 bg-muted"
                }`}
                aria-label={s.label}
              />
            ))}
            <span className="ml-auto text-[11px] font-semibold text-muted-foreground tabular-nums">
              {idx + 1} / {total} · {steps[idx].label}
            </span>
          </div>
        </div>

        {/* Pager */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <div
            className="h-full flex transition-transform duration-300 ease-out"
            style={{ transform: `translateX(-${idx * 100}%)`, width: `${total * 100}%` }}
          >
            {steps.map((s, i) => (
              <div
                key={i}
                className="h-full overflow-y-auto px-5 py-4 space-y-4"
                style={{ width: `${100 / total}%` }}
                aria-hidden={i !== idx}
              >
                {s.content}
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 px-5 py-3 pb-5 border-t border-border/60 bg-card flex gap-2">
          {idx > 0 ? (
            <button
              type="button"
              onClick={() => go(idx - 1)}
              className="px-4 py-3 rounded-2xl bg-muted text-foreground text-sm font-semibold flex items-center gap-1 active:scale-[0.99]"
            >
              <ChevronLeft className="h-4 w-4" />
              {t("back")}
            </button>
          ) : (
            <div className="w-0" />
          )}
          {isLast ? (
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              className="flex-1 py-3 rounded-2xl bg-gradient-to-r from-primary to-primary/80 text-primary-foreground text-sm font-semibold disabled:opacity-60 active:scale-[0.99] transition-transform"
            >
              {saving ? t("saving") : (saveLabel ?? t("save"))}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => go(idx + 1)}
              className="flex-1 py-3 rounded-2xl bg-gradient-to-r from-primary to-primary/80 text-primary-foreground text-sm font-semibold active:scale-[0.99] transition-transform"
            >
              {t("continue")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}