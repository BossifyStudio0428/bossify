import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n, type TKey } from "@/contexts/I18nContext";
import { Check } from "lucide-react";
import { toast } from "sonner";

export type Stage = {
  id?: string;
  client_id: string;
  user_id: string;
  stage_number: number;
  stage_name: string;
  is_completed: boolean;
  completed_date: string | null;
  notes: string | null;
};

export const STAGE_DEFS: { num: number; emoji: string; key: TKey }[] = [
  { num: 1,  emoji: "📞", key: "edu_stage_1" },
  { num: 2,  emoji: "📋", key: "edu_stage_2" },
  { num: 3,  emoji: "📝", key: "edu_stage_3" },
  { num: 4,  emoji: "🎤", key: "edu_stage_4" },
  { num: 5,  emoji: "🎤", key: "edu_stage_5" },
  { num: 6,  emoji: "📬", key: "edu_stage_6" },
  { num: 7,  emoji: "🏠", key: "edu_stage_7" },
  { num: 8,  emoji: "🏆", key: "edu_stage_8" },
  { num: 9,  emoji: "💰", key: "edu_stage_9" },
  { num: 10, emoji: "✅", key: "edu_stage_10" },
];

export function FollowupPipeline({ clientId, userId }: { clientId: string; userId: string }) {
  const { t } = useI18n();
  const [rows, setRows] = useState<Record<number, Stage>>({});
  const [openNum, setOpenNum] = useState<number | null>(null);
  const [saving, setSaving] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any)
        .from("education_followup_stages")
        .select("*").eq("client_id", clientId);
      const map: Record<number, Stage> = {};
      for (const r of (data ?? []) as Stage[]) map[r.stage_number] = r;
      setRows(map);
    })();
  }, [clientId]);

  const completedCount = STAGE_DEFS.filter((s) => rows[s.num]?.is_completed).length;
  const currentNum = STAGE_DEFS.find((s) => !rows[s.num]?.is_completed)?.num ?? 10;
  const todayStr = new Date().toISOString().slice(0, 10);

  const upsertStage = async (num: number, patch: Partial<Stage>) => {
    setSaving(num);
    const def = STAGE_DEFS.find((s) => s.num === num)!;
    const existing = rows[num];
    const next: any = {
      ...(existing ?? {}),
      client_id: clientId,
      user_id: userId,
      stage_number: num,
      stage_name: t(def.key),
      ...patch,
    };
    const { data, error } = await (supabase as any)
      .from("education_followup_stages")
      .upsert(next, { onConflict: "client_id,stage_number" })
      .select("*").single();
    setSaving(null);
    if (error) { toast.error(error.message); return; }
    setRows((m) => ({ ...m, [num]: data as Stage }));
  };

  const toggle = (num: number) => {
    const cur = rows[num];
    const done = !cur?.is_completed;
    upsertStage(num, {
      is_completed: done,
      completed_date: done ? todayStr : null,
    });
  };

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <p className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">
          🚀 {t("edu_pipeline")}
        </p>
        <span className="text-[11px] font-semibold text-primary">
          {completedCount}/10 {t("edu_completed_word")}
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
        <div className="h-full bg-primary transition-all"
          style={{ width: `${(completedCount / 10) * 100}%` }} />
      </div>

      <ol className="rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] divide-y divide-border/60">
        {STAGE_DEFS.map((s) => {
          const r = rows[s.num];
          const done = !!r?.is_completed;
          const isCurrent = !done && s.num === currentNum;
          const isOpen = openNum === s.num;
          return (
            <li key={s.num} className={`p-3 ${isCurrent ? "bg-primary/5" : ""}`}>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => toggle(s.num)}
                  disabled={saving === s.num}
                  className={`h-7 w-7 rounded-full border-2 flex items-center justify-center shrink-0 ${
                    done
                      ? "border-emerald-500 bg-emerald-500 text-white"
                      : isCurrent
                      ? "border-primary"
                      : "border-border"
                  }`}
                  aria-label="toggle"
                >
                  {done && <Check className="h-4 w-4" />}
                </button>
                <button
                  onClick={() => setOpenNum(isOpen ? null : s.num)}
                  className="flex-1 text-left min-w-0"
                >
                  <p className={`text-sm font-semibold truncate ${
                    done ? "text-emerald-700" : isCurrent ? "text-primary" : "text-foreground"
                  }`}>
                    {s.emoji} {s.num}. {t(s.key)}
                  </p>
                  {done && r?.completed_date && (
                    <p className="text-[11px] text-muted-foreground">
                      {new Date(r.completed_date).toLocaleDateString("en-MY",
                        { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  )}
                  {r?.notes && !isOpen && (
                    <p className="text-[11px] text-muted-foreground truncate">📝 {r.notes}</p>
                  )}
                </button>
              </div>
              {isOpen && (
                <div className="mt-2 pl-10 space-y-2">
                  <textarea
                    defaultValue={r?.notes ?? ""}
                    placeholder={t("notes")}
                    rows={2}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if ((r?.notes ?? "") !== v) upsertStage(s.num, { notes: v || null });
                    }}
                    className="w-full rounded-xl bg-muted/40 border border-border/60 px-3 py-2 text-xs outline-none focus:border-primary"
                  />
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
