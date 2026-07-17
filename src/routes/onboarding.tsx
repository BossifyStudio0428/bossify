import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n, type TKey } from "@/contexts/I18nContext";
import { safeLocalStorage, safeSessionStorage } from "@/lib/safeStorage";
import { RETAIL_ONLY_MODE } from "@/lib/featureFlags";
import { useBusinessType } from "@/contexts/BusinessTypeContext";

export const Route = createFileRoute("/onboarding")({ component: Onboarding });

const ONBOARDING_DONE_KEY = "bossify_onboarding_done_session";

type Q = {
  key: string;
  labelKey: TKey;
  titleKey: TKey;
  options: { emoji: string; textKey: TKey }[];
};

const QUESTIONS: Q[] = [
  {
    key: "order_management",
    labelKey: "ob_q2_label",
    titleKey: "ob_q2_title",
    options: [
      { emoji: "📱", textKey: "ob_q2_o1" },
      { emoji: "📓", textKey: "ob_q2_o2" },
      { emoji: "📊", textKey: "ob_q2_o3" },
      { emoji: "❌", textKey: "ob_q2_o4" },
    ],
  },
  {
    key: "biggest_challenge",
    labelKey: "ob_q3_label",
    titleKey: "ob_q3_title",
    options: [
      { emoji: "🗂️", textKey: "ob_q3_o1" },
      { emoji: "💸", textKey: "ob_q3_o2" },
      { emoji: "📦", textKey: "ob_q3_o3" },
      { emoji: "👥", textKey: "ob_q3_o4" },
    ],
  },
  {
    key: "daily_orders",
    labelKey: "ob_q4_label",
    titleKey: "ob_q4_title",
    options: [
      { emoji: "📋", textKey: "ob_q4_o1" },
      { emoji: "📋", textKey: "ob_q4_o2" },
      { emoji: "📋", textKey: "ob_q4_o3" },
      { emoji: "📋", textKey: "ob_q4_o4" },
    ],
  },
  {
    key: "business_fulltime",
    labelKey: "ob_q5_label",
    titleKey: "ob_q5_title",
    options: [
      { emoji: "💼", textKey: "ob_q5_o1" },
      { emoji: "🌙", textKey: "ob_q5_o2" },
    ],
  },
  {
    key: "primary_goal",
    labelKey: "ob_q6_label",
    titleKey: "ob_q6_title",
    options: [
      { emoji: "✅", textKey: "ob_q6_o1" },
      { emoji: "💰", textKey: "ob_q6_o2" },
      { emoji: "👥", textKey: "ob_q6_o3" },
      { emoji: "⏱️", textKey: "ob_q6_o4" },
    ],
  },
  {
    key: "growth_goal",
    labelKey: "ob_q7_label",
    titleKey: "ob_q7_title",
    options: [
      { emoji: "🗂️", textKey: "ob_q7_o1" },
      { emoji: "⚡", textKey: "ob_q7_o2" },
      { emoji: "📈", textKey: "ob_q7_o3" },
      { emoji: "🚀", textKey: "ob_q7_o4" },
    ],
  },
];

function Onboarding() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { t } = useI18n();
  const { setType } = useBusinessType();
  // step: 0 = welcome, 1..6 = questions, 7 = complete
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const [checking, setChecking] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate({ to: "/auth" });
      return;
    }
    setChecking(false);
    let cancelled = false;
    const failOpenTimer = window.setTimeout(() => {
      if (!cancelled) {
        console.error("onboarding page check timed out");
        setChecking(false);
      }
    }, 5000);
    (async () => {
      const { data, error } = await supabase
        .from("onboarding_responses")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      window.clearTimeout(failOpenTimer);
      if (error) {
        console.error("onboarding page check failed", error);
        setChecking(false);
        return;
      }
      if (data) navigate({ to: "/", replace: true });
    })();
    return () => {
      cancelled = true;
      window.clearTimeout(failOpenTimer);
    };
  }, [user, authLoading, navigate]);

  const select = (key: string, val: string) => {
    setAnswers((a) => ({ ...a, [key]: val }));
  };

  const goNext = () => {
    setDirection("forward");
    setStep((s) => s + 1);
  };
  const goBack = () => {
    setDirection("back");
    setStep((s) => Math.max(0, s - 1));
  };

  const finish = async (skip = false) => {
    if (!user || saving) return;
    setSaving(true);
    safeLocalStorage.setItem(`${ONBOARDING_DONE_KEY}:${user.id}`, "1");
    // Retail-only pivot: skip the business-type picker entirely and set
    // retail automatically. Prior behaviour (multi-type picker) is
    // restored when RETAIL_ONLY_MODE is flipped off.
    if (RETAIL_ONLY_MODE) {
      try {
        await setType("retail", null);
      } catch (e) {
        console.error("onboarding auto-set retail failed", e);
      }
      navigate({ to: "/payment-setup", replace: true });
    } else {
      navigate({ to: "/business-type", search: { from: "onboarding" }, replace: true });
    }
    try {
      const payload: Record<string, string | null> = {
        user_id: user.id,
        order_management: null,
        biggest_challenge: null,
        daily_orders: null,
        business_fulltime: null,
        primary_goal: null,
        growth_goal: null,
      };
      if (!skip) {
        for (const q of QUESTIONS) payload[q.key] = answers[q.key] ?? null;
      }
      const savePromise = supabase
        .from("onboarding_responses")
        .upsert(payload as any, { onConflict: "user_id" });
      const timeoutPromise = new Promise<{ error: Error }>((resolve) => {
        window.setTimeout(() => resolve({ error: new Error("onboarding save timed out") }), 5000);
      });
      const { error } = await Promise.race([savePromise, timeoutPromise]);
      if (error) {
        console.error("onboarding insert failed", error);
      }
    } catch (e) {
      console.error("onboarding finish error", e);
    } finally {
      setSaving(false);
    }
  };

  if (checking || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
        {t("loading")}
      </div>
    );
  }

  const animClass =
    direction === "forward" ? "animate-slide-in-right" : "animate-fade-in";

  return (
    <div className="min-h-screen w-full bg-background flex justify-center">
      <div className="w-full max-w-[420px] min-h-screen flex flex-col px-5 py-8">
        {step === 0 && <Welcome onStart={goNext} />}

        {step >= 1 && step <= 6 && (
          <QuestionScreen
            key={step}
            animClass={animClass}
            qIndex={step - 1}
            question={QUESTIONS[step - 1]}
            value={answers[QUESTIONS[step - 1].key]}
            onSelect={(v) => select(QUESTIONS[step - 1].key, v)}
            onBack={goBack}
            onContinue={() => {
              if (step === 6) {
                setDirection("forward");
                setStep(7);
              } else {
                goNext();
              }
            }}
            isLast={step === 6}
          />
        )}

        {step === 7 && (
          <Completion
            answers={answers}
            saving={saving}
            onFinish={() => finish(false)}
          />
        )}

        <div className="mt-auto pt-4 flex items-center justify-center gap-3 text-[11px] text-muted-foreground">
          <Link to="/terms" className="underline hover:text-primary">{t("terms_conditions")}</Link>
          <span>·</span>
          <Link to="/privacy-policy" className="underline hover:text-primary">{t("privacy_policy")}</Link>
        </div>
      </div>
    </div>
  );
}

function Welcome({ onStart }: { onStart: () => void }) {
  const { t } = useI18n();
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center animate-fade-in">
      <img
        src="/assets/bossify-logo.png"
        alt="Bossify"
        style={{ width: 240 }}
        className="mb-6"
      />
      <h1 className="text-[22px] font-medium text-foreground">
        {t("welcome_title")}
      </h1>
      <p className="mt-2 text-sm italic text-muted-foreground">
        {t("slogan")}
      </p>
      <p className="mt-3 text-[13px] text-muted-foreground px-4 leading-relaxed">
        {t("welcome_sub")}
      </p>
      <div className="mt-6 flex gap-2">
        <span className="px-4 py-1.5 rounded-full bg-[#F3F0FF] text-primary text-xs font-medium">
          {t("takes_1min")}
        </span>
      </div>
      <div className="w-full mt-10 space-y-3">
        <button
          onClick={onStart}
          className="w-full bg-primary text-primary-foreground rounded-xl font-semibold text-sm active:scale-[0.99] transition"
          style={{ padding: "13px" }}
        >
          {t("get_started")} →
        </button>
      </div>
    </div>
  );
}

function QuestionScreen({
  qIndex,
  question,
  value,
  onSelect,
  onBack,
  onContinue,
  animClass,
  isLast,
}: {
  qIndex: number;
  question: Q;
  value: string | undefined;
  onSelect: (v: string) => void;
  onBack: () => void;
  onContinue: () => void;
  animClass: string;
  isLast: boolean;
}) {
  const { t } = useI18n();
  return (
    <div className={`flex-1 flex flex-col ${animClass}`}>
      {/* Progress */}
      <div className="flex gap-1.5 mb-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex-1 rounded-full transition-colors"
            style={{
              height: 4,
              background:
                i < qIndex
                  ? "#7C3AED"
                  : i === qIndex
                    ? "#A855F7"
                    : "#E0DCF0",
            }}
          />
        ))}
      </div>
      <p className="text-[11px]" style={{ color: "#A78BFA" }}>
        {t("ob_question_of").replace("{i}", String(qIndex + 1))}
      </p>
      <p
        className="mt-5 text-[11px] uppercase font-semibold"
        style={{ color: "#A78BFA", letterSpacing: "0.8px" }}
      >
        {t(question.labelKey)}
      </p>
      <h2
        className="mt-2 text-[17px] font-medium text-foreground"
        style={{ lineHeight: 1.4 }}
      >
        {t(question.titleKey)}
      </h2>

      <div className="mt-6 space-y-2.5 flex-1">
        {question.options.map((o) => {
          const optText = t(o.textKey);
          const selected = value === optText;
          return (
            <button
              key={o.textKey}
              onClick={() => onSelect(optText)}
              className="w-full flex items-center gap-3 text-left transition-all active:scale-[1.02]"
              style={{
                padding: "11px 14px",
                borderRadius: 12,
                border: selected ? "1.5px solid #7C3AED" : "0.5px solid #E0DCF0",
                background: selected ? "#F3F0FF" : "#FFFFFF",
                color: selected ? "#5B21B6" : "#3D3559",
              }}
            >
              <span
                className="flex items-center justify-center text-base shrink-0"
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  background: "#F3F0FF",
                }}
              >
                {o.emoji}
              </span>
              <span className="text-[13px] font-medium">{optText}</span>
            </button>
          );
        })}
      </div>

      <div className="flex gap-3 pt-6 pb-2">
        <button
          onClick={onBack}
          className="h-12 w-12 rounded-xl border border-border flex items-center justify-center text-muted-foreground active:scale-95"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <button
          onClick={onContinue}
          disabled={!value}
          className="flex-1 h-12 rounded-xl bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2 disabled:bg-[#E0DCF0] disabled:text-muted-foreground transition"
        >
          {isLast ? t("ob_finish") : t("continue")} <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function Completion({
  answers,
  saving,
  onFinish,
}: {
  answers: Record<string, string>;
  saving: boolean;
  onFinish: () => void;
}) {
  const { t } = useI18n();
  const summary: { labelKey: TKey; key: string }[] = [
    { labelKey: "ob_summary_challenge", key: "biggest_challenge" },
    { labelKey: "ob_summary_goal", key: "primary_goal" },
    { labelKey: "ob_summary_growth", key: "growth_goal" },
  ];
  return (
    <div className="flex-1 flex flex-col items-center text-center animate-fade-in pt-6">
      <div
        className="rounded-full bg-primary flex items-center justify-center"
        style={{ width: 56, height: 56 }}
      >
        <Check className="h-7 w-7 text-white" strokeWidth={3} />
      </div>
      <h1 className="mt-5 text-[18px] font-medium text-foreground">
        {t("youre_set")}
      </h1>
      <p className="mt-2 text-[13px] text-muted-foreground px-4">
        {t("ob_personalised")}
      </p>

      <div
        className="w-full mt-6 bg-card text-left p-4 space-y-3"
        style={{ borderRadius: 12, border: "1px solid #E0DCF0" }}
      >
        {summary.map((s) => (
          <div key={s.key} className="flex items-start justify-between gap-3">
            <span className="text-[11px] uppercase font-semibold tracking-wider text-muted-foreground">
              {t(s.labelKey)}
            </span>
            <span className="text-[13px] text-foreground text-right">
              {answers[s.key] || "—"}
            </span>
          </div>
        ))}
      </div>

      <button
        onClick={onFinish}
        disabled={saving}
        className="w-full mt-8 bg-primary text-primary-foreground rounded-xl font-semibold text-sm disabled:opacity-60"
        style={{ padding: "13px" }}
      >
        {saving ? t("saving") : `${t("go_dashboard")} →`}
      </button>
    </div>
  );
}
