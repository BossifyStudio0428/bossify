import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { createFileRoute, useNavigate, useRouter, Link } from "@tanstack/react-router";
import { ChevronLeft, Eye, EyeOff, Mail, Check } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import { mapAuthError, isValidEmail, pwStrength } from "@/lib/authErrors";

export const Route = createFileRoute("/auth")({ component: AuthPage });

type Mode = "login" | "reg_email" | "reg_otp" | "reg_pw";

function AuthPage() {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [businessName, setBusinessName] = useState("");

  return (
    <div className="min-h-screen px-5 pt-10 pb-8 flex flex-col" style={{ background: "#F4F3F8", fontFamily: "DM Sans, system-ui, sans-serif" }}>
      {mode === "login" && <LoginScreen onGoRegister={() => setMode("reg_email")} />}
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
            toast.success("Account created! Please log in.");
          }}
        />
      )}
    </div>
  );
}

/* ---------- Shared UI ---------- */

function Logo({ size = 70 }: { size?: number }) {
  return (
    <div className="flex flex-col items-center">
      <img src="/assets/bossify-logo.png" alt="Bossify" style={{ width: size, height: size, objectFit: "contain" }} />
      <p className="mt-2 text-[24px] font-bold" style={{ color: "#1E1333" }}>Bossify</p>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-[12px] font-semibold" style={{ color: "#1E1333" }}>{children}</label>;
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={
        "w-full bg-white border border-[#E0DCF0] rounded-xl px-4 py-3 text-[14px] outline-none focus:border-[#7C3AED] focus:ring-4 focus:ring-[#7C3AED]/15 transition " +
        (props.className || "")
      }
      style={{ color: "#1E1333" }}
    />
  );
}

function PrimaryButton({ loading, children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className="w-full text-white font-bold text-[14px] active:scale-[0.99] transition disabled:opacity-60"
      style={{ background: "#7C3AED", borderRadius: 12, padding: 13 }}
    >
      {loading ? "…" : children}
    </button>
  );
}

function ErrorText({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return <p className="text-[12px]" style={{ color: "#EF4444" }}>{children}</p>;
}

function ProgressDots({ step, total = 3 }: { step: number; total?: number }) {
  return (
    <div className="flex gap-1.5 justify-center mt-3">
      {Array.from({ length: total }).map((_, i) => (
        <span key={i} style={{ width: 8, height: 8, borderRadius: 999, background: i < step ? "#7C3AED" : "#E0DCF0" }} />
      ))}
    </div>
  );
}

function BackArrow({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="h-10 w-10 rounded-full bg-white border border-[#E0DCF0] flex items-center justify-center self-start">
      <ChevronLeft className="h-5 w-5" style={{ color: "#1E1333" }} />
    </button>
  );
}

/* ---------- 1. Login ---------- */

function LoginScreen({ onGoRegister }: { onGoRegister: () => void }) {
  const { signIn } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!isValidEmail(email)) { setError(t("err_email_format")); return; }
    if (password.length < 6) { setError(t("err_invalid_creds")); return; }
    setLoading(true);
    const { error: err } = await signIn(email, password);
    setLoading(false);
    if (err) { setError(t(mapAuthError(err))); return; }
    router.invalidate();
    navigate({ to: "/" });
  };

  return (
    <div className="w-full max-w-[400px] mx-auto space-y-5 flex-1 flex flex-col">
      <Logo />
      <p className="text-[12px] italic text-center" style={{ color: "#6B7280" }}>{t("slogan")}</p>

      <div className="bg-white rounded-[20px] p-6 shadow-[0_4px_20px_rgba(124,58,237,0.06)] space-y-4">
        <div>
          <h1 className="text-[18px] font-bold" style={{ color: "#1E1333" }}>{t("welcome_back")}</h1>
          <p className="text-[13px]" style={{ color: "#6B7280" }}>{t("login_subtitle")}</p>
        </div>

        <form onSubmit={submit} className="space-y-3" autoComplete="on">
          <div className="space-y-1.5">
            <FieldLabel>{t("email")}</FieldLabel>
            <TextInput
              type="email" required name="email" autoComplete="email" autoCapitalize="none"
              placeholder="Enter your email" value={email}
              onChange={(e) => { setEmail(e.target.value); setError(null); }}
            />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>{t("password")}</FieldLabel>
            <div className="relative">
              <TextInput
                type={showPw ? "text" : "password"} required name="password" autoComplete="current-password"
                placeholder="Enter your password" value={password}
                onChange={(e) => { setPassword(e.target.value); setError(null); }}
              />
              <button type="button" onClick={() => setShowPw((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6B7280]">
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="text-right">
            <Link to="/forgot-password" className="text-[12px] font-semibold" style={{ color: "#7C3AED" }}>
              {t("forgot_password")}
            </Link>
          </div>

          <PrimaryButton type="submit" loading={loading}>{t("login_btn")}</PrimaryButton>
          <ErrorText>{error}</ErrorText>
        </form>

        <div className="flex items-center gap-3 my-1">
          <div className="flex-1 h-px bg-[#E0DCF0]" />
          <span className="text-[11px]" style={{ color: "#6B7280" }}>— or —</span>
          <div className="flex-1 h-px bg-[#E0DCF0]" />
        </div>

        <p className="text-[13px] text-center" style={{ color: "#6B7280" }}>
          {t("no_account")}{" "}
          <button onClick={onGoRegister} className="font-bold" style={{ color: "#7C3AED" }}>{t("register")}</button>
        </p>
      </div>
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
    if (err) { setError(t(mapAuthError(err.message))); return; }
    onNext();
  };

  return (
    <div className="w-full max-w-[400px] mx-auto space-y-4 flex-1">
      <BackArrow onClick={onBack} />
      <div className="flex flex-col items-center gap-1">
        <img src="/assets/bossify-logo.png" alt="Bossify" style={{ width: 44, height: 44 }} />
        <p className="text-[16px] font-bold" style={{ color: "#1E1333" }}>Bossify</p>
      </div>
      <ProgressDots step={1} />
      <div className="text-center">
        <h1 className="text-[20px] font-bold" style={{ color: "#1E1333" }}>{t("create_account")}</h1>
        <p className="text-[13px]" style={{ color: "#6B7280" }}>{t("enter_email_started")}</p>
      </div>

      <form onSubmit={submit} className="bg-white rounded-[20px] p-6 shadow-[0_4px_20px_rgba(124,58,237,0.06)] space-y-3" autoComplete="on">
        <div className="space-y-1.5">
          <FieldLabel>{t("business_name")}</FieldLabel>
          <TextInput
            type="text" required autoComplete="organization"
            placeholder={t("business_name_ph")} value={businessName}
            onChange={(e) => { setBusinessName(e.target.value); setError(null); }}
          />
        </div>
        <div className="space-y-1.5">
          <FieldLabel>{t("email")}</FieldLabel>
          <TextInput
            type="email" required name="email" autoComplete="email" autoCapitalize="none"
            placeholder="Enter your email" value={email}
            onChange={(e) => { setEmail(e.target.value); setError(null); }}
          />
        </div>
        <label className="flex items-start gap-2 text-[12px]" style={{ color: "#1E1333" }}>
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 accent-[#7C3AED]" />
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
    const { error: err } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
    setLoading(false);
    if (err) {
      setError(t("invalid_code"));
      setShake(true); setTimeout(() => setShake(false), 500);
      return;
    }
    onNext();
  };

  const resend = async () => {
    setError(null);
    const { error: err } = await supabase.auth.signInWithOtp({ email });
    if (err) setError(t(mapAuthError(err.message)));
    else { setSeconds(60); toast.success("Code resent"); }
  };

  return (
    <div className="w-full max-w-[400px] mx-auto space-y-4 flex-1">
      <BackArrow onClick={onBack} />
      <ProgressDots step={2} />
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="h-14 w-14 rounded-full flex items-center justify-center" style={{ background: "#F3F0FF" }}>
          <Mail className="h-7 w-7" style={{ color: "#7C3AED" }} />
        </div>
        <h1 className="text-[20px] font-bold" style={{ color: "#1E1333" }}>{t("check_email")}</h1>
        <p className="text-[13px]" style={{ color: "#6B7280" }}>
          {t("sent_code_to")} <span className="font-semibold" style={{ color: "#1E1333" }}>{email}</span>
        </p>
        <button onClick={onBack} className="text-[12px] underline" style={{ color: "#6B7280" }}>{t("wrong_email")}</button>
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
            className="bg-white text-center text-[20px] font-bold outline-none transition"
            style={{
              width: 48, height: 56, borderRadius: 12,
              border: d ? "1.5px solid #7C3AED" : "1.5px solid #E0DCF0",
              boxShadow: d ? "0 0 0 4px rgba(124,58,237,0.15)" : "none",
              color: "#1E1333",
            }}
          />
        ))}
      </div>

      <div className="text-center text-[12px]" style={{ color: "#6B7280" }}>
        {seconds > 0 ? (
          <span>{t("resend_in")} 0:{seconds.toString().padStart(2, "0")}</span>
        ) : (
          <button onClick={resend} className="font-bold" style={{ color: "#7C3AED" }}>{t("resend_code")}</button>
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
    const { data: userRes, error: updErr } = await supabase.auth.updateUser({ password: pw });
    if (updErr || !userRes.user) {
      setLoading(false);
      setError(t(mapAuthError(updErr?.message)));
      return;
    }
    const uid = userRes.user.id;
    // best-effort profile + subscription seed (RLS / triggers may handle some)
    await supabase.from("profiles").upsert({ id: uid, business_name: businessName }, { onConflict: "id" });
    await supabase.from("subscriptions").upsert({ user_id: uid, plan: "free" }, { onConflict: "user_id" });
    // Sign out so user logs in fresh
    await supabase.auth.signOut();
    setLoading(false);
    setSuccess(true);
    setTimeout(onDone, 1500);
  };

  const barColor = strength === "weak" ? "#EF4444" : strength === "fair" ? "#F59E0B" : "#10B981";
  const barWidth = strength === "weak" ? "33%" : strength === "fair" ? "66%" : "100%";

  if (success) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3">
        <div className="h-20 w-20 rounded-full flex items-center justify-center" style={{ background: "#10B981" }}>
          <Check className="h-10 w-10 text-white" strokeWidth={3} />
        </div>
        <p className="text-[18px] font-bold" style={{ color: "#1E1333" }}>{t("account_created")}</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[400px] mx-auto space-y-4 flex-1">
      <ProgressDots step={3} />
      <div className="text-center">
        <h1 className="text-[20px] font-bold" style={{ color: "#1E1333" }}>{t("create_password")}</h1>
        <p className="text-[13px]" style={{ color: "#6B7280" }}>{t("choose_strong_pw")}</p>
      </div>

      <div className="bg-white rounded-[20px] p-6 shadow-[0_4px_20px_rgba(124,58,237,0.06)] space-y-3">
        <div className="space-y-1.5">
          <FieldLabel>{t("password")}</FieldLabel>
          <div className="relative">
            <TextInput
              type={showA ? "text" : "password"} autoComplete="new-password"
              placeholder="Min. 8 characters" value={pw}
              onChange={(e) => setPw(e.target.value)}
            />
            <button type="button" onClick={() => setShowA((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6B7280]">
              {showA ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {pw.length > 0 && (
            <div className="space-y-1">
              <div className="h-1.5 bg-[#E0DCF0] rounded-full overflow-hidden">
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
              type={showB ? "text" : "password"} autoComplete="new-password"
              placeholder="Re-enter your password" value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
            <button type="button" onClick={() => setShowB((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6B7280]">
              {showB ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <ul className="space-y-1 text-[12px]">
          <ReqLine ok={checks.len}>{t("pw_min_8")}</ReqLine>
          <ReqLine ok={checks.num}>{t("pw_has_num")}</ReqLine>
          <ReqLine ok={checks.match}>{t("pw_match")}</ReqLine>
        </ul>

        <PrimaryButton onClick={submit} disabled={!allOk} loading={loading}>{t("create_account")}</PrimaryButton>
        <ErrorText>{error}</ErrorText>
      </div>
    </div>
  );
}

function ReqLine({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2" style={{ color: ok ? "#10B981" : "#6B7280" }}>
      <Check className="h-3.5 w-3.5" strokeWidth={3} />
      <span>{children}</span>
    </li>
  );
}
