import { useNavigate } from "@tanstack/react-router";
import { useI18n } from "@/contexts/I18nContext";
import { STAGE_DEFS } from "@/components/FollowupPipeline";
import type { CustomerRow } from "@/integrations/supabase/client";

export type EduStageInfo = {
  completedCount: number;
  currentStage: number;
  university: string | null;
};

export function CasesKanban({
  customers,
  eduInfo,
}: {
  customers: CustomerRow[];
  eduInfo: Record<string, EduStageInfo>;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();

  return (
    <div className="-mx-5 px-5 overflow-x-auto pb-3">
      <div className="flex gap-3 snap-x snap-mandatory">
        {STAGE_DEFS.map((s) => {
          const items = customers.filter((c) => {
            const info = eduInfo[c.id];
            const stage = info?.currentStage ?? 1;
            return stage === s.num;
          });
          return (
            <div
              key={s.num}
              className="w-64 shrink-0 snap-start rounded-2xl bg-muted/40 border border-border/60 p-2 space-y-2"
            >
              <div className="px-2 py-1 flex items-center justify-between">
                <p className="text-[11px] font-bold text-foreground truncate">
                  {s.emoji} {s.num}. {t(s.key)}
                </p>
                <span className="text-[10px] font-semibold px-1.5 rounded-full bg-primary/10 text-primary">
                  {items.length}
                </span>
              </div>
              <div className="space-y-2 min-h-[60px]">
                {items.length === 0 && (
                  <p className="text-[10px] text-muted-foreground text-center py-4">
                    {t("no_clients_in_stage")}
                  </p>
                )}
                {items.map((c) => {
                  const info = eduInfo[c.id];
                  return (
                    <button
                      key={c.id}
                      onClick={() =>
                        navigate({
                          to: "/customer/$customerId",
                          params: { customerId: c.id },
                          hash: "pipeline",
                        })
                      }
                      className="w-full text-left rounded-xl bg-card border border-border/60 p-2.5 shadow-[var(--shadow-card)] active:scale-[0.98] transition"
                    >
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-full bg-primary/15 text-primary flex items-center justify-center text-sm font-bold shrink-0">
                          {c.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold truncate">{c.name}</p>
                          {info?.university && (
                            <p className="text-[10px] text-muted-foreground truncate">
                              🏫 {info.university}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="mt-1.5 h-1 w-full rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full bg-primary"
                          style={{ width: `${((info?.completedCount ?? 0) / 10) * 100}%` }}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}