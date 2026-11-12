import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { ChevronLeft, Eye, EyeOff, Mail, Check, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import { authErrorText, isValidEmail, pwStrength } from "@/lib/authErrors";
import { safeSessionStorage } from "@/lib/safeStorage";
import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { AuthShell } from "@/components/AuthShell";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
  // tiktok_email / tiktok_code are passed through as well: the TikTok
  // authorisation page sends the seller back here with them, and dropping
  // them from the validated search would lose the one-time login code.
  validateSearch: (search: Record<string, unknown>): { mode?: string; tiktok_email?: string; tiktok_code?: string } => ({
    mode: typeof search.mode === "string" ? search.mode : undefined,
    tiktok_email: typeof search.tiktok_email === "string" ? search.tiktok_email : undefined,
    // A 6-digit code arrives as a number once the router parses the URL.
    tiktok_code:
      typeof search.tiktok_code === "string" || typeof search.tiktok_code === "number"
        ? String(search.tiktok_code)
        : undefined,
  }),
});

type Mode = "login" | "reg_email" | "reg_otp" | "reg_pw";

function AuthPage() {
  const routeSearch = Route.useSearch();
  // A TikTok login code in the URL always means "log in", whatever mode says.
  const [mode, setMode] = useState<Mode>(
    routeSearch.mode === "reg" && !(routeSearch.tiktok_email && routeSearch.tiktok_code) ? "reg_email" : "login",
  );
  const [email, setEmail] = useState("");
  const [businessName, setBusinessName] = useState("");
  const { t } = useI18n();
  // Coming back from TikTok authorisation: the email + one-time code are in
  // the URL. They are read straight away (not in an effect), so the very
  // first render already shows the "logging you in" code screen instead of
  // the plain login form.
  const [tiktokPrefill] = useState<{ email: string; code: string } | null>(() => {
    let tEmail = routeSearch.tiktok_email ?? null;
    let tCode = routeSearch.tiktok_code ?? null;
    if ((!tEmail || !tCode) && typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      tEmail = tEmail ?? params.get("tiktok_email");
      tCode = tCode ?? params.get("tiktok_code");
    }
    return tEmail && tCode ? { email: tEmail, code: tCode } : null;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !tiktokPrefill) return;
    // Clean the sensitive params out of the visible URL/history right away.
    window.history.replaceState({}, "", window.location.pathname);
  }, [tiktokPrefill]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (mode === "login" || mode === "reg_email") {
      safeSessionStorage.removeItem("bossify_registering");
    }
  }, [mode]);

  return (
    <AuthShell
      footer={
        <div className="mt-auto lg:mt-8 pt-4 flex items-center justify-center gap-3 text-[11px]" style={{ color: "#5B5270" }}>
          <Link to="/terms" className="underline hover:text-[#6C4AB6]">{t("terms_conditions")}</Link>
          <span>·</span>
          <Link to="/privacy-policy" className="underline hover:text-[#6C4AB6]">{t("privacy_policy")}</Link>
        </div>
      }
    >
      <div className="flex flex-col flex-1 w-full lg:flex-none lg:max-w-[460px]">
      {(mode === "login" || mode === "reg_email") && <AuthTabs mode={mode} onChange={setMode} />}
      {mode === "login" &&<LoginScreen onGoRegister={() => setMode("reg_email")} tiktokPrefill={tiktokPrefill} />}
      {mode === "reg_email" && (
        <RegEmailScreen
          email={email}
          businessName={businessName}
          setEmail={setEmail}
          setBusinessName={setBusinessName}
          onBack={() => setMode("login")}
          onNext={() => setMode("reg_otp")}
        />
      )}
      {mode === "reg_otp" && (
        <RegOtpScreen
          email={email}
          onBack={() => setMode("reg_email")}
          onNext={() => setMode("reg_pw")}
        />
      )}
      {mode === "reg_pw" && (
        <RegPasswordScreen
          businessName={businessName}
          onDone={() => {
            setMode("login");
            toast.success(t("please_login"));
          }}
        />
      )}
      </div>
    </AuthShell>
  );
}

/* ---------- Shared UI ---------- */

// "Sign In | Start Free" switch at the top of the page -- the same two
// words as the landing page buttons, so it is obvious which one you are on
// and you can flip between them without hunting for a small link.
function AuthTabs({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  const { lang } = useI18n();
  const labels =
    lang === "zh" ? ["登录", "免费开始"] : lang === "ms" ? ["Log Masuk", "Mula Percuma"] : ["Sign In", "Start Free"];
  return (
    <div className="w-full max-w-[400px] mx-auto mb-6 grid grid-cols-2 p-1 rounded-full border border-[#E1DCEC] bg-[#F7F5FA]">
      {(["login", "reg_email"] as const).map((m, i) => (
        <button
          key={m}
          type="button"
          aria-pressed={mode === m}
          onClick={() => onChange(m)}
          className="py-2.5 rounded-full text-[14px] font-semibold transition-colors"
          style={{ background: mode === m ? "#3B1E6D" : "transparent", color: mode === m ? "#FFFFFF" : "#5B5270" }}
        >
          {labels[i]}
        </button>
      ))}
    </div>
  );
}

function Logo({ size = 110 }: { size?: number }) {
  return (
    <div className="flex flex-col items-center lg:hidden">
      <img src="/assets/bossify-logo.png" alt="Bossify" style={{ width: size, height: size, objectFit: "contain" }} />
      <p className="mt-2 text-[24px] font-bold" style={{ color: "#1A1225" }}>Bossify</p>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-[12px] font-semibold" style={{ color: "#1A1225" }}>{children}</label>;
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={
        "w-full bg-white border border-[#E1DCEC] rounded-xl px-4 py-3 text-[14px] outline-none focus:border-[#6C4AB6] focus:ring-4 focus:ring-[#6C4AB6]/15 transition " +
        (props.className || "")
      }
      style={{ color: "#1A1225" }}
    />
  );
}

function PrimaryButton({
  loading,
  loadingLabel,
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean; loadingLabel?: string }) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className="w-full text-white font-bold text-[14px] active:scale-[0.99] transition disabled:opacity-60 inline-flex items-center justify-center gap-2"
      style={{ background: "#3B1E6D", borderRadius: 999, padding: 13 }}
    >
      {loading && (
        <span className="h-3.5 w-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin shrink-0" />
      )}
      {loading ? (loadingLabel ?? "…") : children}
    </button>
  );
}

function ErrorText({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return <p className="text-[12px]" style={{ color: "#F87171" }}>{children}</p>;
}

function ProgressDots({ step, total = 3 }: { step: number; total?: number }) {
  return (
    <div className="flex gap-1.5 justify-center mt-3">
      {Array.from({ length: total }).map((_, i) => (
        <span key={i} style={{ width: 8, height: 8, borderRadius: 999, background: i < step ? "#6C4AB6" : "#E4DEF0" }} />
      ))}
    </div>
  );
}

function BackArrow({ onClick }: { onClick: () => void }) {
  const { t } = useI18n();
  return (
    <button onClick={onClick} aria-label={t("back_arrow")} className="h-10 w-10 rounded-full bg-[#F7F5FA] border border-[#E4DEF0] flex items-center justify-center self-start">
      <ChevronLeft className="h-5 w-5" style={{ color: "#1A1225" }} />
    </button>
  );
}

const PLAN_LABEL: Record<string, string> = {
  free: "Free",
  starter: "Starter",
  pro: "Pro",
  lifetime: "Lifetime",
  team_starter: "Team Starter",
  team_pro: "Team Pro",
  team_business: "Team Business",
};
function planLabel(plan?: string) {
  if (!plan) return "Free";
  return PLAN_LABEL[plan.toLowerCase()] ?? plan;
}

/* ---------- 1. Login ---------- */

function LoginScreen({ onGoRegister, tiktokPrefill }: { onGoRegister: () => void; tiktokPrefill: { email: string; code: string } | null }) {
  const { signIn } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [limitInfo, setLimitInfo] = useState<{ used: number; limit: number; plan: string } | null>(null);
  const [showTikTokCode, setShowTikTokCode] = useState(!!tiktokPrefill);
  const [tiktokStarting, setTiktokStarting] = useState(false);
  const [justLoggedIn, setJustLoggedIn] = useState(false);

  const startTikTokLogin = async () => {
    setTiktokStarting(true);
    try {
      const res = await fetch("https://tanstack-start-app.bossifystudio.workers.dev/api/public/oauth/tiktok/login-start", {
        method: "POST",
      });
      const j = await res.json();
      if (!res.ok || !j?.authUrl) throw new Error(j?.message || "Could not start TikTok login");
      if (Capacitor.isNativePlatform()) {
        await Browser.open({ url: j.authUrl });
        setTiktokStarting(false);
      } else {
        window.location.href = j.authUrl;
      }
    } catch (e: any) {
      toast.error(e?.message || "Could not start TikTok login");
      setTiktokStarting(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!isValidEmail(email)) { setError(t("err_email_format")); return; }
    if (password.length < 6) { setError(t("err_invalid_creds")); return; }
    setLoading(true);
    const { error: err, code, used, limit, plan } = await signIn(email, password);
    setLoading(false);
    if (err) {
      if (code === "device_limit_reached" || err === "device_limit_reached") {
        setLimitInfo({ used: used ?? 0, limit: limit ?? 1, plan: plan ?? "free" });
        setError(null);
      } else {
        setError(authErrorText(err, t));
      }
      return;
    }
    setJustLoggedIn(true);
    router.invalidate();
    // Subtle, brief confirmation before handing off to Home - not a
    // celebration animation, just enough to feel like something happened.
    setTimeout(() => navigate({ to: "/" }), 450);
  };

  if (limitInfo) {
    return (
      <DeviceLimitBlock
        used={limitInfo.used}
        limit={limitInfo.limit}
        planName={planLabel(limitInfo.plan)}
        onManage={() => navigate({ to: "/devices" })}
      />
    );
  }

  if (showTikTokCode) {
    return <TikTokLoginCodeScreen onBack={() => setShowTikTokCode(false)} prefill={tiktokPrefill} />;
  }

  return (
    <div className="w-full max-w-[400px] mx-auto space-y-5 flex-1 flex flex-col">
      <Logo />
      <p className="text-[12px] italic text-center lg:hidden" style={{ color: "#5B5270" }}>{t("slogan")}</p>
      <p className="text-[12px] text-center leading-relaxed -mt-2 px-2 lg:hidden" style={{ color: "#5B5270" }}>
        {t("auth_subheadline")}
      </p>

      <div className="bg-white rounded-[16px] p-6 border border-[#E1DCEC] space-y-4">
        <div>
          <h1 className="text-[18px] font-bold" style={{ color: "#1A1225" }}>{t("welcome_back")}</h1>
          <p className="text-[13px]" style={{ color: "#5B5270" }}>{t("login_subtitle")}</p>
        </div>

        <form onSubmit={submit} className="space-y-3" autoComplete="on" action="#" method="post">
          <div className="space-y-1.5">
            <FieldLabel>{t("email")}</FieldLabel>
            <TextInput
              type="email" required name="email" id="email" autoComplete="email" autoCapitalize="none" autoFocus
              inputMode="email"
              placeholder={t("enter_email_ph")} value={email}
              onChange={(e) => { setEmail(e.target.value); setError(null); }}
            />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>{t("password")}</FieldLabel>
            <div className="relative">
              <TextInput
                type={showPw ? "text" : "password"} required name="password" id="password" autoComplete="current-password"
                placeholder={t("enter_password_ph")} value={password}
                onChange={(e) => { setPassword(e.target.value); setError(null); }}
              />
              <button type="button" onClick={() => setShowPw((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#5B5270]">
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="text-right">
            <button
              type="button"
              onClick={() => navigate({ to: "/forgot-password" })}
              className="text-[12px] font-semibold"
              style={{ color: "#6C4AB6" }}
            >
              {t("forgot_password")}
            </button>
          </div>

          {justLoggedIn ? (
            <div
              className="w-full flex items-center justify-center gap-2 text-white font-bold text-[14px]"
              style={{ background: "#10B981", borderRadius: 12, padding: 13 }}
            >
              <Check className="h-4 w-4" />
              {t("welcome_back")}
            </div>
          ) : (
            <PrimaryButton type="submit" loading={loading} loadingLabel={t("logging_in")}>{t("login_btn")}</PrimaryButton>
          )}
          <ErrorText>{error}</ErrorText>
        </form>

        <div className="flex items-center gap-3 my-1">
          <div className="flex-1 h-px bg-[#E4DEF0]" />
          <span className="text-[11px]" style={{ color: "#5B5270" }}>{t("or_label")}</span>
          <div className="flex-1 h-px bg-[#E4DEF0]" />
        </div>

        <button
          type="button"
          disabled={tiktokStarting}
          onClick={startTikTokLogin}
          className="w-full flex items-center gap-3 rounded-xl border border-[#E4DEF0] bg-[#F7F5FA] text-[13px] font-semibold text-[#1A1225] px-3 py-2.5 active:scale-[0.99] disabled:opacity-60 transition-transform"
        >
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" className="shrink-0">
            <path
              fill="#1A1225"
              d="M16.5 3.2c.1 1.3.6 2.5 1.5 3.4.9.9 2.1 1.4 3.3 1.5v3c-1.7-.1-3.3-.6-4.8-1.5v6.6c0 3.6-2.9 6.5-6.5 6.5S3.5 19.8 3.5 16.2s2.9-6.5 6.5-6.5c.3 0 .7 0 1 .1v3.1c-.3-.1-.6-.1-1-.1-1.9 0-3.5 1.6-3.5 3.5s1.6 3.5 3.5 3.5 3.5-1.6 3.5-3.5V3.2h3z"
            />
          </svg>
          <span className="min-w-0 flex-1 truncate text-left">
            {tiktokStarting ? "..." : "Log in with TikTok Shop"}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setShowTikTokCode(true)}
          className="text-[11px] text-center w-full"
          style={{ color: "#6C4AB6" }}
        >
          Already have a TikTok Shop login code?
        </button>
        <p className="text-[13px] text-center" style={{ color: "#5B5270" }}>
          {t("no_account")}{" "}
          <button onClick={onGoRegister} className="font-bold" style={{ color: "#6C4AB6" }}>{t("register")}</button>
        </p>
      </div>
    </div>
  );
}

/* ---------- Device Limit Block ---------- */

function ComingSoonSocialButton({ provider }: { provider: "tiktok" | "google" }) {
  const { t } = useI18n();
  const label = provider === "tiktok" ? t("auth_signup_tiktok") : t("auth_signup_google");
  const icon =
    provider === "tiktok" ? (
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" className="shrink-0">
        <path
          fill="#1A1225"
          d="M16.5 3.2c.1 1.3.6 2.5 1.5 3.4.9.9 2.1 1.4 3.3 1.5v3c-1.7-.1-3.3-.6-4.8-1.5v6.6c0 3.6-2.9 6.5-6.5 6.5S3.5 19.8 3.5 16.2s2.9-6.5 6.5-6.5c.3 0 .7 0 1 .1v3.1c-.3-.1-.6-.1-1-.1-1.9 0-3.5 1.6-3.5 3.5s1.6 3.5 3.5 3.5 3.5-1.6 3.5-3.5V3.2h3z"
        />
      </svg>
    ) : (
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" className="shrink-0">
        <path fill="#4285F4" d="M22.5 12.3c0-.8-.1-1.5-.2-2.2H12v4.2h5.9c-.3 1.4-1 2.5-2.2 3.3v2.8h3.5c2.1-1.9 3.3-4.7 3.3-8.1z" />
        <path fill="#34A853" d="M12 23c2.9 0 5.4-1 7.2-2.6l-3.5-2.8c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.1-4.6H2.3v2.9C4.2 20.6 7.9 23 12 23z" />
        <path fill="#FBBC05" d="M5.9 14.1c-.2-.7-.4-1.4-.4-2.1s.1-1.4.4-2.1V7H2.3C1.5 8.5 1 10.2 1 12s.5 3.5 1.3 5l3.6-2.9z" />
        <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.1-3.1C17.4 2.4 14.9 1.4 12 1.4 7.9 1.4 4.2 3.8 2.3 7l3.6 2.9C6.7 7.3 9.1 5.4 12 5.4z" />
      </svg>
    );
  return (
    <button
      type="button"
      onClick={() => toast.message(t("auth_coming_soon_toast"))}
      className="w-full flex items-center gap-3 rounded-xl border border-[#E4DEF0] bg-[#F7F5FA] text-[13px] font-semibold text-[#1A1225] opacity-60 cursor-not-allowed px-3 py-2.5"
      aria-disabled="true"
    >
      {icon}
      <span className="min-w-0 flex-1 truncate text-left">{label}</span>
      <span
        className="shrink-0 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full"
        style={{ background: "#EFEAFA", color: "#6C4AB6", letterSpacing: "0.5px" }}
      >
        {t("auth_coming_soon")}
      </span>
    </button>
  );
}

/* ---------- TikTok Shop login code entry ---------- */

function TikTokLoginCodeScreen({ onBack, prefill }: { onBack: () => void; prefill: { email: string; code: string } | null }) {
  const router = useRouter();
  const navigate = useNavigate();
  const [email, setEmail] = useState(prefill?.email ?? "");
  const [code, setCode] = useState(prefill?.code ?? "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const verify = async (e?: FormEvent) => {
    e?.preventDefault();
    setError(null);
    if (!email.trim() || code.trim().length < 6) {
      setError("Enter the email and code shown after TikTok authorization.");
      return;
    }
    setLoading(true);
    const { data, error: err } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: "email",
    });
    setLoading(false);
    if (err || !data?.session) {
      setError("That code didn't work — it may have expired. Try connecting again.");
      return;
    }
    router.invalidate();
    navigate({ to: "/" });
  };

  // Pre-filled from the TikTok callback redirect — log in automatically,
  // no extra tap needed.
  useEffect(() => {
    if (prefill?.email && prefill?.code) verify();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="w-full max-w-[400px] mx-auto space-y-4 flex-1">
      <BackArrow onClick={onBack} />
      <div className="flex flex-col items-center gap-1 lg:hidden">
        <img src="/assets/bossify-logo.png" alt="Bossify" style={{ width: 64, height: 64 }} />
        <p className="text-[16px] font-bold" style={{ color: "#1A1225" }}>Bossify</p>
      </div>
      <div className="text-center">
        <h1 className="text-[20px] font-bold" style={{ color: "#1A1225" }}>TikTok Shop login code</h1>
        <p className="text-[13px]" style={{ color: "#5B5270" }}>
          Enter the email and code shown on the TikTok authorization page.
        </p>
      </div>
      <form onSubmit={verify} className="bg-white rounded-[16px] p-6 border border-[#E1DCEC] space-y-3">
        <div className="space-y-1.5">
          <FieldLabel>Email shown on that page</FieldLabel>
          <TextInput
            type="email" autoCapitalize="none" inputMode="email"
            placeholder="shop-xxxx@..." value={email}
            onChange={(e) => { setEmail(e.target.value); setError(null); }}
          />
        </div>
        <div className="space-y-1.5">
          <FieldLabel>6-digit code</FieldLabel>
          <TextInput
            type="text" inputMode="numeric" maxLength={6}
            placeholder="123456" value={code}
            onChange={(e) => { setCode(e.target.value.replace(/\D/g, "").slice(0, 6)); setError(null); }}
          />
        </div>
        <PrimaryButton type="submit" loading={loading}>Log in</PrimaryButton>
        <ErrorText>{error}</ErrorText>
      </form>
    </div>
  );
}

/* ---------- Device Limit Block ---------- */

function DeviceLimitBlock({
  used, limit, planName, onManage,
}: { used: number; limit: number; planName: string; onManage: () => void }) {
  const { t } = useI18n();
  return (
    <div className="w-full max-w-[400px] mx-auto space-y-5 flex-1 flex flex-col">
      <Logo />
      <div className="bg-white rounded-[16px] p-6 border border-[#E1DCEC] space-y-4 text-center">
        <div className="mx-auto h-14 w-14 rounded-2xl bg-amber-500/15 text-amber-600 flex items-center justify-center"><Smartphone className="h-7 w-7" /></div>
        <h1 className="text-[18px] font-bold" style={{ color: "#1A1225" }}>{t("device_limit_title")}</h1>
        <p className="text-[13px]" style={{ color: "#5B5270" }}>
          {t("device_limit_message")
            .replace("{plan}", planName)
            .replace("{limit}", String(limit))}
        </p>
        <div className="rounded-xl bg-[#FCFBFE] p-3">
          <p className="text-[12px] font-semibold" style={{ color: "#1A1225" }}>
            {used}/{limit}
          </p>
          <p className="text-[11px] mt-1" style={{ color: "#5B5270" }}>{t("device_limit_plans_hint")}</p>
        </div>
        <button
          type="button"
          onClick={onManage}
          className="w-full text-white font-bold text-[14px] active:scale-[0.99] transition-transform"
          style={{ background: "#3B1E6D", borderRadius: 999, padding: 13 }}
        >
          {t("device_limit_manage")}
        </button>
      </div>
    </div>
  );
}

/* ---------- 2a. Start Free: connect TikTok Shop first ---------- */

// What "Start Free" opens. Bossify exists to turn a TikTok Shop's orders
// into real profit, so the first thing a new seller is asked to do is
// connect that shop -- the TikTok authorisation itself creates the Bossify
// account (see api/public/oauth/tiktok/callback.ts). Signing up with an
// email is the secondary route underneath.
function ConnectTikTokScreen({ onUseEmail }: { onUseEmail: () => void }) {
  const { lang } = useI18n();
  const [starting, setStarting] = useState(false);

  const copy =
    lang === "zh"
      ? {
          title: "连接你的 TikTok Shop",
          sub: "Bossify 会把你的订单和产品带进来,算出你真正赚了多少。",
          steps: ["在 TikTok Shop 授权 Bossify", "订单和产品自动同步进来", "马上看到真实利润、库存和报表"],
          cta: "连接 TikTok Shop · 免费",
          note: "授权后会自动为你开好 Bossify 账号,不用另外填表。",
          or: "不是 TikTok Shop 卖家?",
          ownTitle: "自己的店也可以用",
          ownBody: "不需要 TikTok Shop,这些照样能用:",
          ownPoints: [
            "自己记录订单,管理产品和库存",
            "库存盘点和供应商采购单",
            "一键用 WhatsApp 发收据给顾客",
            "WhatsApp 信息模板,一键提醒未付款的顾客",
          ],
          email: "用邮箱开始",
          agree: "继续即表示你同意服务条款和隐私政策。",
        }
      : lang === "ms"
        ? {
            title: "Sambungkan TikTok Shop anda",
            sub: "Bossify bawa masuk pesanan dan produk anda, kemudian kira berapa untung sebenar anda.",
            steps: [
              "Benarkan Bossify di TikTok Shop",
              "Pesanan dan produk disegerakkan automatik",
              "Terus lihat untung sebenar, stok dan laporan",
            ],
            cta: "Sambung TikTok Shop · Percuma",
            note: "Akaun Bossify anda dibuka secara automatik selepas kebenaran, tanpa borang lain.",
            or: "Bukan penjual TikTok Shop?",
            ownTitle: "Kedai sendiri pun boleh",
            ownBody: "Tak perlu TikTok Shop. Semua ini tetap boleh digunakan:",
            ownPoints: [
              "Rekod pesanan sendiri, urus produk dan stok",
              "Kiraan stok dan pesanan belian pembekal",
              "Hantar resit kepada pelanggan melalui WhatsApp dengan 1 ketik",
              "Templat mesej WhatsApp untuk ingatkan pelanggan belum bayar dengan 1 ketik",
            ],
            email: "Mula dengan e-mel",
            agree: "Dengan meneruskan, anda bersetuju dengan Terma Perkhidmatan dan Dasar Privasi.",
          }
        : {
            title: "Connect your TikTok Shop",
            sub: "Bossify brings in your orders and products, then works out what you actually keep.",
            steps: [
              "Authorise Bossify on TikTok Shop",
              "Your orders and products sync in automatically",
              "See real profit, stock and reports right away",
            ],
            cta: "Connect TikTok Shop · Free",
            note: "Authorising opens your Bossify account automatically — no other form to fill in.",
            or: "Not on TikTok Shop?",
            ownTitle: "Run your own shop",
            ownBody: "You don't need TikTok Shop. All of this still works:",
            ownPoints: [
              "Record orders yourself, manage products and stock",
              "Stock checks and supplier purchase orders",
              "Send a customer their receipt on WhatsApp in 1 tap",
              "WhatsApp message templates to remind unpaid customers in 1 tap",
            ],
            email: "Start with email",
            agree: "By continuing you agree to the Terms of Service and Privacy Policy.",
          };

  const start = async () => {
    setStarting(true);
    try {
      const res = await fetch("https://tanstack-start-app.bossifystudio.workers.dev/api/public/oauth/tiktok/login-start", {
        method: "POST",
      });
      const j = await res.json();
      if (!res.ok || !j?.authUrl) throw new Error(j?.message || "Could not start TikTok login");
      if (Capacitor.isNativePlatform()) {
        await Browser.open({ url: j.authUrl });
        setStarting(false);
      } else {
        window.location.href = j.authUrl;
      }
    } catch (e: any) {
      toast.error(e?.message || "Could not start TikTok login");
      setStarting(false);
    }
  };

  return (
    <div className="w-full max-w-[400px] mx-auto space-y-5 flex-1">
      <div>
        <h1 className="text-[26px] font-bold leading-tight" style={{ color: "#1A1225" }}>{copy.title}</h1>
        <p className="mt-2 text-[14.5px] leading-relaxed" style={{ color: "#5B5270" }}>{copy.sub}</p>
      </div>

      <div className="bg-white rounded-[16px] border border-[#E1DCEC] overflow-hidden">
        <ol>
          {copy.steps.map((s, i) => (
            <li key={s} className="flex items-baseline gap-4 px-5 py-3.5 border-b border-[#E1DCEC]">
              <span className="text-[13px] shrink-0" style={{ color: "#FF3B5C", fontFamily: '"IBM Plex Mono", ui-monospace, monospace' }}>
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="text-[14.5px] font-medium" style={{ color: "#1A1225" }}>{s}</span>
            </li>
          ))}
        </ol>
        <div className="p-5 space-y-3">
          <button
            type="button"
            disabled={starting}
            onClick={start}
            className="w-full inline-flex items-center justify-center gap-2.5 text-white font-bold text-[15px] active:scale-[0.99] transition disabled:opacity-60"
            style={{ background: "#1E1730", borderRadius: 999, padding: 14 }}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" className="shrink-0">
              <path
                fill="#FFFFFF"
                d="M16.5 3.2c.1 1.3.6 2.5 1.5 3.4.9.9 2.1 1.4 3.3 1.5v3c-1.7-.1-3.3-.6-4.8-1.5v6.6c0 3.6-2.9 6.5-6.5 6.5S3.5 19.8 3.5 16.2s2.9-6.5 6.5-6.5c.3 0 .7 0 1 .1v3.1c-.3-.1-.6-.1-1-.1-1.9 0-3.5 1.6-3.5 3.5s1.6 3.5 3.5 3.5 3.5-1.6 3.5-3.5V3.2h3z"
              />
            </svg>
            {starting ? "…" : copy.cta}
          </button>
          <p className="text-[12.5px] leading-relaxed text-center" style={{ color: "#5B5270" }}>{copy.note}</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-[#E1DCEC]" />
        <span className="text-[12.5px]" style={{ color: "#5B5270" }}>{copy.or}</span>
        <div className="flex-1 h-px bg-[#E1DCEC]" />
      </div>

      {/* Not a TikTok seller: Bossify still works as a plain shop ledger. */}
      <div className="bg-[#F7F5FA] rounded-[16px] border border-[#E1DCEC] p-5 space-y-3">
        <div>
          <p className="text-[16px] font-bold" style={{ color: "#1A1225", fontFamily: '"Space Grotesk", system-ui, sans-serif' }}>
            {copy.ownTitle}
          </p>
          <p className="mt-1 text-[13.5px] leading-relaxed" style={{ color: "#5B5270" }}>{copy.ownBody}</p>
          <ul className="mt-2.5 border-t border-[#E1DCEC]">
            {copy.ownPoints.map((p) => (
              <li key={p} className="flex items-start gap-2.5 py-2 border-b border-[#E1DCEC] text-[13.5px] font-medium" style={{ color: "#1A1225" }}>
                <Check className="h-4 w-4 mt-0.5 shrink-0" style={{ color: "#FF3B5C" }} />
                {p}
              </li>
            ))}
          </ul>
        </div>
        <button
          type="button"
          onClick={onUseEmail}
          className="w-full inline-flex items-center justify-center gap-2 font-semibold text-[14.5px] border border-[#3B1E6D] bg-white transition-colors hover:bg-[#EFE8FB]"
          style={{ color: "#3B1E6D", borderRadius: 999, padding: 12 }}
        >
          <Mail className="h-4 w-4" />
          {copy.email}
        </button>
      </div>
      <p className="text-[11.5px] text-center" style={{ color: "#5B5270" }}>{copy.agree}</p>
    </div>
  );
}

/* ---------- 2. Register Step 1: Email ---------- */

function RegEmailScreen({
  email, businessName, setEmail, setBusinessName, onBack, onNext,
}: {
  email: string; businessName: string;
  setEmail: (v: string) => void; setBusinessName: (v: string) => void;
  onBack: () => void; onNext: () => void;
}) {
  const { t } = useI18n();
  const [agree, setAgree] = useState(false);
  // Start Free leads with "Connect TikTok Shop" -- that is what Bossify is
  // for. The email form is the fallback for sellers without a shop yet.
  const [useEmail, setUseEmail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!businessName.trim()) { setError(t("required_field")); return; }
    if (!isValidEmail(email)) { setError(t("err_email_format")); return; }
    if (!agree) { setError(t("must_agree_terms")); return; }
    setLoading(true);
    const { error: err } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true, data: { business_name: businessName } },
    });
    setLoading(false);
    if (err) { setError(authErrorText(err.message, t)); return; }
    onNext();
  };

  if (!useEmail) return <ConnectTikTokScreen onUseEmail={() => setUseEmail(true)} />;

  return (
    <div className="w-full max-w-[400px] mx-auto space-y-4 flex-1">
      <BackArrow onClick={() => setUseEmail(false)} />
      <div className="flex flex-col items-center gap-1 lg:hidden">
        <img src="/assets/bossify-logo.png" alt="Bossify" style={{ width: 64, height: 64 }} />
        <p className="text-[16px] font-bold" style={{ color: "#1A1225" }}>Bossify</p>
      </div>
      <ProgressDots step={1} />
      <div className="text-center">
        <h1 className="text-[20px] font-bold" style={{ color: "#1A1225" }}>{t("create_account")}</h1>
        <p className="text-[13px]" style={{ color: "#5B5270" }}>{t("enter_email_started")}</p>
      </div>

      <form onSubmit={submit} className="bg-white rounded-[16px] p-6 border border-[#E1DCEC] space-y-3" autoComplete="on" action="#" method="post">
        <div className="space-y-1.5">
          <FieldLabel>{t("business_name")}</FieldLabel>
          <TextInput
            type="text" required name="business_name" autoComplete="organization"
            placeholder={t("business_name_ph")} value={businessName}
            onChange={(e) => { setBusinessName(e.target.value); setError(null); }}
          />
        </div>
        <div className="space-y-1.5">
          <FieldLabel>{t("email")}</FieldLabel>
          <TextInput
            type="email" required name="email" id="reg-email" autoComplete="email" autoCapitalize="none" inputMode="email"
            placeholder={t("enter_email_ph")} value={email}
            onChange={(e) => { setEmail(e.target.value); setError(null); }}
          />
        </div>
        <label className="flex items-start gap-2 text-[12px]" style={{ color: "#1A1225" }}>
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 accent-[#6C4AB6]" />
          <span>{t("agree_terms")}</span>
        </label>
        <PrimaryButton type="submit" loading={loading}>{t("send_otp")}</PrimaryButton>
        <ErrorText>{error}</ErrorText>
      </form>
    </div>
  );
}

/* ---------- 3. Register Step 2: OTP ---------- */

function RegOtpScreen({ email, onBack, onNext }: { email: string; onBack: () => void; onNext: () => void }) {
  const { t } = useI18n();
  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(false);
  const [seconds, setSeconds] = useState(60);
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (seconds <= 0) return;
    const id = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [seconds]);

  const code = digits.join("");
  const allFilled = code.length === 6;

  const setDigit = (i: number, v: string) => {
    const clean = v.replace(/\D/g, "").slice(-1);
    setDigits((prev) => {
      const next = [...prev];
      next[i] = clean;
      return next;
    });
    if (clean && i < 5) refs.current[i + 1]?.focus();
  };

  const onPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const data = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (data.length > 0) {
      e.preventDefault();
      const arr = data.split("").concat(Array(6).fill("")).slice(0, 6);
      setDigits(arr);
      refs.current[Math.min(data.length, 5)]?.focus();
    }
  };

  const verify = async () => {
    if (!allFilled) return;
    setError(null); setLoading(true);
    if (typeof window !== "undefined") {
      safeSessionStorage.setItem("bossify_registering", "1");
    }
    const { data, error: err } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
    setLoading(false);
    if (err || !data?.session) {
      setError(t("invalid_code"));
      setShake(true); setTimeout(() => setShake(false), 500);
      return;
    }
    onNext();
  };

  const resend = async () => {
    setError(null);
    const { error: err } = await supabase.auth.signInWithOtp({ email });
    if (err) setError(authErrorText(err.message, t));
    else { setSeconds(60); toast.success("Code resent"); }
  };

  return (
    <div className="w-full max-w-[400px] mx-auto space-y-4 flex-1">
      <BackArrow onClick={onBack} />
      <ProgressDots step={2} />
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="h-14 w-14 rounded-full flex items-center justify-center" style={{ background: "#EFEAFA" }}>
          <Mail className="h-7 w-7" style={{ color: "#6C4AB6" }} />
        </div>
        <h1 className="text-[20px] font-bold" style={{ color: "#1A1225" }}>{t("check_email")}</h1>
        <p className="text-[13px]" style={{ color: "#5B5270" }}>
          {t("sent_code_to")} <span className="font-semibold" style={{ color: "#1A1225" }}>{email}</span>
        </p>
        <button onClick={onBack} className="text-[12px] underline" style={{ color: "#5B5270" }}>{t("wrong_email")}</button>
      </div>

      <div className={"flex justify-center gap-2 " + (shake ? "animate-[shake_0.4s]" : "")}>
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => { refs.current[i] = el; }}
            inputMode="numeric"
            maxLength={1}
            value={d}
            onChange={(e) => setDigit(i, e.target.value)}
            onPaste={onPaste}
            onKeyDown={(e) => {
              if (e.key === "Backspace" && !digits[i] && i > 0) refs.current[i - 1]?.focus();
            }}
            className="bg-[#F7F5FA] text-center text-[20px] font-bold outline-none transition"
            style={{
              width: 48, height: 56, borderRadius: 12,
              border: d ? "1.5px solid #6C4AB6" : "1.5px solid #E4DEF0",
              boxShadow: d ? "0 0 0 4px rgba(139,92,246,0.25)" : "none",
              color: "#1A1225",
            }}
          />
        ))}
      </div>

      <div className="text-center text-[12px]" style={{ color: "#5B5270" }}>
        {seconds > 0 ? (
          <span>{t("resend_in")} 0:{seconds.toString().padStart(2, "0")}</span>
        ) : (
          <button onClick={resend} className="font-bold" style={{ color: "#6C4AB6" }}>{t("resend_code")}</button>
        )}
      </div>

      <PrimaryButton onClick={verify} disabled={!allFilled} loading={loading}>{t("verify")}</PrimaryButton>
      <ErrorText>{error}</ErrorText>

      <style>{`@keyframes shake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-6px)} 75%{transform:translateX(6px)} }`}</style>
    </div>
  );
}

/* ---------- 4. Register Step 3: Password ---------- */

function RegPasswordScreen({ businessName, onDone }: { businessName: string; onDone: () => void }) {
  const { t } = useI18n();
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showA, setShowA] = useState(false);
  const [showB, setShowB] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const checks = useMemo(() => ({
    len: pw.length >= 8,
    num: /\d/.test(pw),
    match: pw.length > 0 && pw === confirm,
  }), [pw, confirm]);
  const allOk = checks.len && checks.num && checks.match;
  const strength = pwStrength(pw);

  const submit = async () => {
    if (!allOk) return;
    setError(null); setLoading(true);
    const { data: userRes, error: updErr } = await supabase.auth.updateUser({
      password: pw,
      data: { business_name: businessName },
    });
    if (updErr || !userRes.user) {
      setLoading(false);
      setError(authErrorText(updErr?.message, t));
      return;
    }
    const uid = userRes.user.id;
    // best-effort profile + subscription seed (RLS / triggers may handle some)
    await supabase.from("profiles").upsert({ id: uid, business_name: businessName }, { onConflict: "id" });
    await supabase.from("subscriptions").upsert({ user_id: uid, plan: "free" }, { onConflict: "user_id" });
    // Sign out so user logs in fresh
    await supabase.auth.signOut();
    if (typeof window !== "undefined") {
      safeSessionStorage.removeItem("bossify_registering");
    }
    setLoading(false);
    setSuccess(true);
    setTimeout(onDone, 1500);
  };

  const barColor = strength === "weak" ? "#F87171" : strength === "fair" ? "#FBBF24" : "#4ADE80";
  const barWidth = strength === "weak" ? "33%" : strength === "fair" ? "66%" : "100%";

  if (success) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3">
        <div className="h-20 w-20 rounded-full flex items-center justify-center" style={{ background: "#4ADE80" }}>
          <Check className="h-10 w-10 text-white" strokeWidth={3} />
        </div>
        <p className="text-[18px] font-bold" style={{ color: "#1A1225" }}>{t("account_created")}</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[400px] mx-auto space-y-4 flex-1">
      <ProgressDots step={3} />
      <div className="text-center">
        <h1 className="text-[20px] font-bold" style={{ color: "#1A1225" }}>{t("create_password")}</h1>
        <p className="text-[13px]" style={{ color: "#5B5270" }}>{t("choose_strong_pw")}</p>
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); submit(); }}
        autoComplete="on"
        action="#"
        method="post"
        className="bg-white rounded-[16px] p-6 border border-[#E1DCEC] space-y-3"
      >
        {/* Hidden username field helps Google Password Manager associate the
            new password with the account being created. */}
        <input
          type="email"
          name="username"
          autoComplete="username"
          value=""
          readOnly
          hidden
          aria-hidden="true"
        />
        <div className="space-y-1.5">
          <FieldLabel>{t("password")}</FieldLabel>
          <div className="relative">
            <TextInput
              type={showA ? "text" : "password"} name="new-password" autoComplete="new-password"
              placeholder="Min. 8 characters" value={pw}
              onChange={(e) => setPw(e.target.value)}
            />
            <button type="button" onClick={() => setShowA((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#5B5270]">
              {showA ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {pw.length > 0 && (
            <div className="space-y-1">
              <div className="h-1.5 bg-[#E4DEF0] rounded-full overflow-hidden">
                <div style={{ width: barWidth, background: barColor, height: "100%", transition: "all 0.2s" }} />
              </div>
              <p className="text-[11px]" style={{ color: barColor }}>
                {t(strength === "weak" ? "password_strength_weak" : strength === "fair" ? "password_strength_fair" : "password_strength_strong")}
              </p>
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <FieldLabel>{t("confirm_password")}</FieldLabel>
          <div className="relative">
            <TextInput
              type={showB ? "text" : "password"} name="confirm-password" autoComplete="new-password"
              placeholder="Re-enter your password" value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
            <button type="button" onClick={() => setShowB((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#5B5270]">
              {showB ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <ul className="space-y-1 text-[12px]">
          <ReqLine ok={checks.len}>{t("pw_min_8")}</ReqLine>
          <ReqLine ok={checks.num}>{t("pw_has_num")}</ReqLine>
          <ReqLine ok={checks.match}>{t("pw_match")}</ReqLine>
        </ul>

        <PrimaryButton type="submit" disabled={!allOk} loading={loading}>{t("create_account")}</PrimaryButton>
        <ErrorText>{error}</ErrorText>
      </form>
    </div>
  );
}

function ReqLine({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2" style={{ color: ok ? "#4ADE80" : "#5B5270" }}>
      <Check className="h-3.5 w-3.5" strokeWidth={3} />
      <span>{children}</span>
    </li>
  );
}