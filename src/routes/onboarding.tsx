import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export const Route = createFileRoute("/onboarding")({ component: Onboarding });

type Q = {
  key: string;
  label: string;
  title: string;
  options: { emoji: string; text: string }[];
};

const QUESTIONS: Q[] = [
  {
    key: "business_type",
    label: "Your Business",
    title: "What type of business do you run?",
    options: [
      { emoji: "🍱", text: "Food & Beverage" },
      { emoji: "👗", text: "Fashion & Apparel" },
      { emoji: "💄", text: "Beauty & Personal Care" },
      { emoji: "🧵", text: "Handmade / Custom Products" },
      { emoji: "📦", text: "Others" },
    ],
  },
  {
    key: "order_management",
    label: "Order Management",
    title: "How are you currently managing your orders?",
    options: [
      { emoji: "📱", text: "WhatsApp messages" },
      { emoji: "📓", text: "Manual (paper / notebook)" },
      { emoji: "📊", text: "Spreadsheet (Excel / Google Sheets)" },
      { emoji: "❌", text: "No proper system" },
    ],
  },
  {
    key: "biggest_challenge",
    label: "Your Challenges",
    title: "What is your biggest challenge today?",
    options: [
      { emoji: "🗂️", text: "Missing or disorganized orders" },
      { emoji: "💸", text: "Difficulty tracking payments" },
      { emoji: "📦", text: "Inventory not updated accurately" },
      { emoji: "👥", text: "No clear customer records" },
    ],
  },
  {
    key: "daily_orders",
    label: "Order Volume",
    title: "What is your average daily order volume?",
    options: [
      { emoji: "📋", text: "1 – 5 orders" },
      { emoji: "📋", text: "6 – 10 orders" },
      { emoji: "📋", text: "11 – 20 orders" },
      { emoji: "📋", text: "20+ orders" },
    ],
  },
  {
    key: "business_fulltime",
    label: "Business Type",
    title: "How would you describe your business?",
    options: [
      { emoji: "💼", text: "Full-time business" },
      { emoji: "🌙", text: "Side business / part-time" },
    ],
  },
  {
    key: "primary_goal",
    label: "Your Goals",
    title: "What is your primary goal with Bossify?",
    options: [
      { emoji: "✅", text: "Improve order tracking" },
      { emoji: "💰", text: "Keep track of payments" },
      { emoji: "👥", text: "Organise customer data" },
      { emoji: "⏱️", text: "Save time and reduce manual work" },
    ],
  },
  {
    key: "growth_goal",
    label: "Growth Plans",
    title: "What is your growth goal for the next 3–6 months?",
    options: [
      { emoji: "🗂️", text: "Stay organised" },
      { emoji: "⚡", text: "Increase efficiency" },
      { emoji: "📈", text: "Grow sales steadily" },
      { emoji: "🚀", text: "Scale the business significantly" },
    ],
  },
];

function Onboarding() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  // step: 0 = welcome, 1..7 = questions, 8 = complete
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
    (async () => {
      const { data } = await supabase
        .from("onboarding_responses")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data) navigate({ to: "/" });
      else setChecking(false);
    })();
  }, [user, authLoading, navigate]);

  const select = (key: string, val: string) =>
    setAnswers((a) => ({ ...a, [key]: val }));

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
    try {
      const payload: Record<string, string | null> = {
        user_id: user.id,
        business_type: null,
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
      const { error } = await supabase
        .from("onboarding_responses")
        .insert(payload as any);
      if (error) {
        console.error("onboarding insert failed", error);
      }
    } catch (e) {
      console.error("onboarding finish error", e);
    } finally {
      setSaving(false);
      navigate({ to: "/" });
    }
  };

  if (checking || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
        Loading...
      </div>
    );
  }

  const animClass =
    direction === "forward" ? "animate-slide-in-right" : "animate-fade-in";

  return (
    <div className="min-h-screen w-full bg-background flex justify-center">
      <div className="w-full max-w-[420px] min-h-screen flex flex-col px-5 py-8">
        {step === 0 && <Welcome onStart={goNext} onSkip={() => finish(true)} />}

        {step >= 1 && step <= 7 && (
          <QuestionScreen
            key={step}
            animClass={animClass}
            qIndex={step - 1}
            question={QUESTIONS[step - 1]}
            value={answers[QUESTIONS[step - 1].key]}
            onSelect={(v) => select(QUESTIONS[step - 1].key, v)}
            onBack={goBack}
            onContinue={() => {
              if (step === 7) {
                setDirection("forward");
                setStep(8);
              } else {
                goNext();
              }
            }}
            isLast={step === 7}
          />
        )}

        {step === 8 && (
          <Completion
            answers={answers}
            saving={saving}
            onFinish={() => finish(false)}
          />
        )}
      </div>
    </div>
  );
}

function Welcome({ onStart, onSkip }: { onStart: () => void; onSkip: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center animate-fade-in">
      <img
        src="/assets/bossify-logo.png"
        alt="Bossify"
        style={{ width: 240 }}
        className="mb-6"
      />
      <h1 className="text-[22px] font-medium text-foreground">
        Welcome to Bossify!
      </h1>
      <p className="mt-2 text-sm italic text-muted-foreground">
        Manage your shop like a boss.
      </p>
      <div className="mt-6 flex gap-2">
        <span className="px-4 py-1.5 rounded-full bg-[#F3F0FF] text-primary text-xs font-medium">
          Takes 1 min
        </span>
        <span className="px-4 py-1.5 rounded-full bg-[#F3F0FF] text-primary text-xs font-medium">
          7 quick questions
        </span>
      </div>
      <div className="w-full mt-10 space-y-3">
        <button
          onClick={onStart}
          className="w-full bg-primary text-primary-foreground rounded-xl font-semibold text-sm active:scale-[0.99] transition"
          style={{ padding: "13px" }}
        >
          Let's Get Started →
        </button>
        <button
          onClick={onSkip}
          className="w-full text-center text-[12px]"
          style={{ color: "#A78BFA" }}
        >
          Skip for now
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
  return (
    <div className={`flex-1 flex flex-col ${animClass}`}>
      {/* Progress */}
      <div className="flex gap-1.5 mb-4">
        {Array.from({ length: 7 }).map((_, i) => (
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
        Question {qIndex + 1} of 7
      </p>
      <p
        className="mt-5 text-[11px] uppercase font-semibold"
        style={{ color: "#A78BFA", letterSpacing: "0.8px" }}
      >
        {question.label}
      </p>
      <h2
        className="mt-2 text-[17px] font-medium text-foreground"
        style={{ lineHeight: 1.4 }}
      >
        {question.title}
      </h2>

      <div className="mt-6 space-y-2.5 flex-1">
        {question.options.map((o) => {
          const selected = value === o.text;
          return (
            <button
              key={o.text}
              onClick={() => onSelect(o.text)}
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
              <span className="text-[13px] font-medium">{o.text}</span>
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
          {isLast ? "Finish" : "Continue"} <ArrowRight className="h-4 w-4" />
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
  const summary = [
    { label: "Business", key: "business_type" },
    { label: "Challenge", key: "biggest_challenge" },
    { label: "Goal", key: "primary_goal" },
    { label: "Growth", key: "growth_goal" },
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
        You're all set, Boss!
      </h1>
      <p className="mt-2 text-[13px] text-muted-foreground px-4">
        We've personalised Bossify based on your answers. Time to take control
        of your business.
      </p>

      <div
        className="w-full mt-6 bg-card text-left p-4 space-y-3"
        style={{ borderRadius: 12, border: "1px solid #E0DCF0" }}
      >
        {summary.map((s) => (
          <div key={s.key} className="flex items-start justify-between gap-3">
            <span className="text-[11px] uppercase font-semibold tracking-wider text-muted-foreground">
              {s.label}
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
        {saving ? "Saving..." : "Go to Dashboard →"}
      </button>
    </div>
  );
}
