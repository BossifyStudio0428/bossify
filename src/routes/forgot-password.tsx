import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { ChevronLeft, Lock, Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/contexts/I18nContext";
import { isValidEmail, mapAuthError } from "@/lib/authErrors";

export const Route = createFileRoute("/forgot-password")({ component: ForgotPasswordPage });

function ForgotPasswordPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (seconds <= 0) return;
    const id = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [seconds]);

  const sendLink = async (e?: FormEvent) => {
    e?.preventDefault();
    setError(null);
    if (!isValidEmail(email)) { setError(t("err_email_format")); return; }
    setLoading(true);
    const redirectTo = typeof window !== "undefined" ? `${window.location.origin}/reset-password` : undefined;
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    setLoading(false);
    if (err) { setError(t(mapAuthError(err.message))); return; }
    setStep(2);
    setSeconds(60);
  };

  return (
    <div className="min-h-screen px-5 pt-10 pb-8 flex flex-col" style={{ background: "#F4F3F8", fontFamily: "DM Sans, system-ui, sans-serif" }}>
      <div className="w-full max-w-[400px] mx-auto space-y-4 flex-1">
        <button onClick={() => navigate({ to: "/auth" })} className="h-10 w-10 rounded-full bg-white border border-[#E0DCF0] flex items-center justify-center self-start">
          <ChevronLeft className="h-5 w-5" style={{ color: "#1E1333" }} />
        </button>

        {step === 1 ? (
          <>
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="h-14 w-14 rounded-full flex items-center justify-center" style={{ background: "#F3F0FF" }}>
                <Lock className="h-7 w-7" style={{ color: "#7C3AED" }} />
              </div>
              <h1 className="text-[20px] font-bold" style={{ color: "#1E1333" }}>{t("forgot_password")}</h1>
              <p className="text-[13px]" style={{ color: "#6B7280" }}>{t("forgot_pw_sub")}</p>
            </div>

            <form onSubmit={sendLink} className="bg-white rounded-[20px] p-6 shadow-[0_4px_20px_rgba(124,58,237,0.06)] space-y-3">
              <label className="text-[12px] font-semibold" style={{ color: "#1E1333" }}>{t("email")}</label>
              <input
                type="email" required name="email" autoComplete="email" autoCapitalize="none"
                value={email} onChange={(e) => { setEmail(e.target.value); setError(null); }}
                placeholder="Enter your email"
                className="w-full bg-white border border-[#E0DCF0] rounded-xl px-4 py-3 text-[14px] outline-none focus:border-[#7C3AED] focus:ring-4 focus:ring-[#7C3AED]/15"
              />
              <button
                type="submit" disabled={loading}
                className="w-full text-white font-bold text-[14px] disabled:opacity-60"
                style={{ background: "#7C3AED", borderRadius: 12, padding: 13 }}
              >
                {loading ? "…" : t("send_reset_link")}
              </button>
              {error && <p className="text-[12px]" style={{ color: "#EF4444" }}>{error}</p>}
            </form>
          </>
        ) : (
          <>
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="h-20 w-20 rounded-full flex items-center justify-center" style={{ background: "#F3F0FF" }}>
                <Mail className="h-10 w-10" style={{ color: "#7C3AED" }} />
              </div>
              <h1 className="text-[20px] font-bold" style={{ color: "#1E1333" }}>{t("check_email")}</h1>
              <p className="text-[13px]" style={{ color: "#6B7280" }}>
                {t("email_sent_sub")} <span className="font-semibold" style={{ color: "#1E1333" }}>{email}</span>.
              </p>
            </div>

            <a
              href="mailto:"
              className="block text-center w-full text-white font-bold text-[14px]"
              style={{ background: "#7C3AED", borderRadius: 12, padding: 13 }}
            >
              {t("open_email_app")}
            </a>

            <button
              onClick={() => sendLink()}
              disabled={seconds > 0 || loading}
              className="w-full text-[13px] font-semibold disabled:opacity-50"
              style={{ color: "#6B7280" }}
            >
              {seconds > 0 ? `${t("resend_email")} (${seconds}s)` : t("resend_email")}
            </button>

            <Link to="/auth" className="block text-center text-[13px] font-bold" style={{ color: "#7C3AED" }}>
              {t("back_to_login")}
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
