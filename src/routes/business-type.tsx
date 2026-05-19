import { useState } from "react";
import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { useI18n } from "@/contexts/I18nContext";
import { useBusinessType } from "@/contexts/BusinessTypeContext";
import { BIZ_TYPES, type BizType } from "@/lib/businessType";
import { toast } from "sonner";

type Search = { from?: "profile" | "onboarding" };

export const Route = createFileRoute("/business-type")({
  component: BusinessTypePage,
  validateSearch: (s: Record<string, unknown>): Search => ({
    from: s.from === "profile" ? "profile" : "onboarding",
  }),
});

function BusinessTypePage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { from } = useSearch({ from: "/business-type" });
  const { type, setType } = useBusinessType();
  const [selected, setSelected] = useState<BizType | null>(type);
  const [saving, setSaving] = useState(false);

  const onContinue = async () => {
    if (!selected || saving) return;
    setSaving(true);
    try {
      await setType(selected);
      toast.success(t("business_type_saved"));
      if (from === "profile") navigate({ to: "/profile", replace: true });
      else navigate({ to: "/payment-setup", replace: true });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex justify-center bg-background">
      <div className="w-full max-w-[390px] px-5 pt-10 pb-32 flex flex-col">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {t("business_type_title")}
        </h1>
        <p className="text-sm text-muted-foreground mt-2">{t("business_type_sub")}</p>

        <div className="grid grid-cols-2 gap-3 mt-8">
          {BIZ_TYPES.map((b) => {
            const active = selected === b.key;
            return (
              <button
                key={b.key}
                onClick={() => setSelected(b.key)}
                className={`relative aspect-square rounded-2xl border p-3 flex flex-col items-center justify-center gap-2 text-center transition-all active:scale-95 ${
                  active
                    ? "border-primary bg-primary/10 ring-2 ring-primary"
                    : "border-border/60 bg-card"
                }`}
              >
                {active && (
                  <span className="absolute top-2 right-2 h-5 w-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                    <Check className="h-3 w-3" />
                  </span>
                )}
                <span className="text-3xl leading-none">{b.emoji}</span>
                <span className="text-[12px] font-semibold leading-tight text-foreground">
                  {t(b.nameKey)}
                </span>
              </button>
            );
          })}
        </div>

        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[390px] px-5 pb-6 pt-4 bg-gradient-to-t from-background via-background to-transparent">
          <button
            onClick={onContinue}
            disabled={!selected || saving}
            className="w-full h-12 rounded-2xl bg-primary text-primary-foreground font-semibold disabled:opacity-50 active:scale-[0.98]"
          >
            {saving ? t("saving") : t("continue")}
          </button>
        </div>
      </div>
    </div>
  );
}