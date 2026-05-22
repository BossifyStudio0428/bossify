import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, Check } from "lucide-react";
import { useI18n } from "@/contexts/I18nContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { getPlatform, type PlatformKey } from "@/lib/platforms";

export const Route = createFileRoute("/connected-platforms/$platform")({
  component: PlatformConnectPage,
});

function PlatformConnectPage() {
  const { platform } = Route.useParams();
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [connected, setConnected] = useState(false);

  const cfg = getPlatform(platform);

  useEffect(() => {
    if (!user || !cfg) return;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("connected_platforms" as any)
        .eq("id", user.id)
        .maybeSingle();
      const cp = ((data as any)?.connected_platforms ?? {}) as Record<PlatformKey, boolean>;
      setConnected(!!cp[cfg.key]);
    })();
  }, [user, cfg]);

  if (!cfg) {
    return (
      <div className="px-5 pt-10 pb-8">
        <button onClick={() => navigate({ to: "/profile" })} className="text-sm text-muted-foreground underline">
          ← {t("back")}
        </button>
        <p className="mt-6 text-sm">Platform not found.</p>
      </div>
    );
  }

  return (
    <div className="px-5 pt-10 pb-8 space-y-6">
      <header className="flex items-center gap-3">
        <button
          onClick={() => navigate({ to: "/profile" })}
          className="h-10 w-10 rounded-full bg-card border border-border/60 flex items-center justify-center"
          aria-label={t("back")}
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="text-2xl font-bold">{cfg.name}</h1>
      </header>

      <div className="flex flex-col items-center text-center gap-3">
        <div className="h-24 w-24 rounded-3xl bg-gradient-to-br from-primary/15 to-primary/5 border border-border/60 flex items-center justify-center text-5xl shadow-[var(--shadow-soft)]">
          {cfg.emoji}
        </div>
        <span
          className={`text-xs font-semibold px-3 py-1 rounded-full ${
            connected
              ? "bg-emerald-100 text-emerald-700"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {connected ? `${t("connected")} ✅` : t("not_connected")}
        </span>
        <p className="text-sm text-muted-foreground max-w-sm">{cfg.description[lang]}</p>
      </div>

      <section className="rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] p-4 space-y-3">
        {cfg.benefits[lang].map((b, i) => (
          <div key={i} className="flex items-start gap-3">
            <span className="h-6 w-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5">
              <Check className="h-3.5 w-3.5" strokeWidth={3} />
            </span>
            <p className="text-sm text-foreground flex-1">{b}</p>
          </div>
        ))}
      </section>

      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        className="w-full py-4 rounded-2xl bg-gradient-to-r from-primary to-primary/80 text-primary-foreground font-bold text-sm shadow-[var(--shadow-soft)] active:scale-[0.99]"
      >
        {cfg.connectLabel[lang]}
      </button>

      {sheetOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 animate-fade-in"
          onClick={() => setSheetOpen(false)}
        >
          <div
            className="w-full max-w-[390px] bg-card rounded-t-3xl p-5 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto h-1 w-10 rounded-full bg-muted" />
            <p className="text-lg font-bold text-foreground py-1">{t("coming_soon_title")}</p>
            <p className="text-sm text-muted-foreground">{cfg.comingSoonMsg[lang]}</p>
            <button
              onClick={() => setSheetOpen(false)}
              className="w-full py-3 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}