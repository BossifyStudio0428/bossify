import { useEffect, useState } from "react";
import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { useI18n } from "@/contexts/I18nContext";
import { useBusinessType } from "@/contexts/BusinessTypeContext";
import { BIZ_TYPES, FNB_SUB_TYPES, type BizType, type FnbSubType } from "@/lib/businessType";
import { RETAIL_ONLY_MODE } from "@/lib/featureFlags";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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
  const { type, subType, setType } = useBusinessType();
  const [selected, setSelected] = useState<BizType | null>(RETAIL_ONLY_MODE ? "retail" : type);
  const [selectedSub, setSelectedSub] = useState<FnbSubType | null>(subType);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Retail-only pivot: auto-persist retail and skip this screen.
  // Existing non-Retail accounts are also silently coerced to retail
  // here (their old DB data is preserved on other tables).
  useEffect(() => {
    if (!RETAIL_ONLY_MODE) return;
    let cancelled = false;
    (async () => {
      try {
        await setType("retail", null);
      } catch (e) {
        console.error("auto-set retail failed", e);
      }
      if (cancelled) return;
      if (from === "profile") navigate({ to: "/profile", replace: true });
      else navigate({ to: "/payment-setup", replace: true });
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visibleTypes = RETAIL_ONLY_MODE
    ? BIZ_TYPES.filter((b) => b.key === "retail")
    : BIZ_TYPES;

  const doSave = async () => {
    if (!selected || saving) return;
    if (selected === "fnb" && !selectedSub) return;
    setSaving(true);
    try {
      await setType(selected, selected === "fnb" ? selectedSub : null);
      toast.success(t("business_type_saved"));
      if (from === "profile") navigate({ to: "/profile", replace: true });
      else navigate({ to: "/payment-setup", replace: true });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
      setConfirmOpen(false);
    }
  };

  const onContinue = () => {
    if (!selected || saving) return;
    if (selected === "fnb" && !selectedSub) return;
    // Confirm only when changing an existing type (no data loss, just labels)
    if (type && (selected !== type || (selected === "fnb" && selectedSub !== subType))) {
      setConfirmOpen(true);
      return;
    }
    void doSave();
  };

  return (
    <div className="min-h-screen w-full flex justify-center bg-background">
      <div className="w-full max-w-[390px] px-5 pt-10 pb-32 flex flex-col">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {t("business_type_title")}
        </h1>
        <p className="text-sm text-muted-foreground mt-2">{t("business_type_sub")}</p>

        <div className="grid grid-cols-2 gap-3 mt-8">
          {visibleTypes.map((b) => {
            const active = selected === b.key;
            return (
              <button
                key={b.key}
                onClick={() => {
                  setSelected(b.key);
                  if (b.key !== "fnb") setSelectedSub(null);
                  else if (!selectedSub) setSelectedSub("general");
                }}
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

        {selected === "fnb" && (
          <div className="mt-6 space-y-2">
            <p className="text-sm font-semibold text-foreground">{t("bst_pick_sub_type")}</p>
            <div className="space-y-2">
              {FNB_SUB_TYPES.map((s) => {
                const active = selectedSub === s.key;
                return (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => setSelectedSub(s.key)}
                    className={`w-full flex items-center gap-3 rounded-2xl border p-3 text-left transition-all active:scale-[0.99] ${
                      active
                        ? "border-primary bg-primary/10 ring-2 ring-primary"
                        : "border-border/60 bg-card"
                    }`}
                  >
                    <span className="text-2xl leading-none">{s.emoji}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold text-foreground">{t(s.nameKey)}</span>
                      <span className="block text-[11px] text-muted-foreground leading-snug">{t(s.descKey)}</span>
                    </span>
                    {active && (
                      <span className="h-5 w-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0">
                        <Check className="h-3 w-3" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[390px] px-5 pb-6 pt-4 bg-gradient-to-t from-background via-background to-transparent">
          <button
            onClick={onContinue}
            disabled={!selected || saving || (selected === "fnb" && !selectedSub)}
            className="w-full h-12 rounded-2xl bg-primary text-primary-foreground font-semibold disabled:opacity-50 active:scale-[0.98]"
          >
            {saving ? t("saving") : t("continue")}
          </button>
        </div>

        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("business_type_confirm_title")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("business_type_confirm_body")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={saving}>{t("cancel")}</AlertDialogCancel>
              <AlertDialogAction onClick={(e) => { e.preventDefault(); void doSave(); }} disabled={saving}>
                {saving ? t("saving") : t("business_type_confirm_yes")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}