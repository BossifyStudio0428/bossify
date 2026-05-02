import { useState, type FormEvent } from "react";
import { createFileRoute, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { isValidEmail } from "@/lib/authErrors";
import { safeSessionStorage } from "@/lib/safeStorage";
import { useI18n } from "@/contexts/I18nContext";

export const Route = createFileRoute("/forgot-password")({ component: ForgotPasswordPage });

function ForgotPasswordPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (location.pathname !== "/forgot-password") {
    return <Outlet />;
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!isValidEmail(email)) { setError(t("err_email_format")); return; }
    setLoading(true);
    const { error: err } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    });
    setLoading(false);
    if (err) {
      const msg = (err.message || "").toLowerCase();
      if (msg.includes("not found") || msg.includes("signups not allowed") || msg.includes("user not found")) {
        setError(t("fp_email_not_found"));
      } else {
        setError(err.message || t("fp_something_wrong"));
      }
      return;
    }
    if (typeof window !== "undefined") {
      safeSessionStorage.setItem("bossify_fp_email", email);
    }
    navigate({ to: "/forgot-password/verify" });
  };

  return (
    <div className="min-h-screen px-5 pt-10 pb-8 flex flex-col" style={{ background: "#F4F3F8", fontFamily: "DM Sans, system-ui, sans-serif" }}>
      <div className="w-full max-w-[400px] mx-auto space-y-4 flex-1">
        <button onClick={() => navigate({ to: "/auth" })} className="h-10 w-10 rounded-full bg-white border border-[#E0DCF0] flex items-center justify-center self-start">
          <ChevronLeft className="h-5 w-5" style={{ color: "#1E1333" }} />
        </button>

        <div className="flex flex-col items-center gap-3 text-center">
          <div className="h-14 w-14 rounded-full flex items-center justify-center" style={{ background: "#F3F0FF" }}>
            <Lock className="h-7 w-7" style={{ color: "#7C3AED" }} />
          </div>
          <h1 className="text-[20px] font-bold" style={{ color: "#1E1333" }}>{t("forgot_password")}</h1>
          <p className="text-[13px]" style={{ color: "#6B7280" }}>{t("forgot_pw_sub")}</p>
        </div>

        <form onSubmit={submit} className="bg-white rounded-[20px] p-6 shadow-[0_4px_20px_rgba(124,58,237,0.06)] space-y-3">
          <label className="text-[12px] font-semibold" style={{ color: "#1E1333" }}>{t("email")}</label>
          <input
            type="email" required name="email" autoComplete="email" autoCapitalize="none"
            value={email} onChange={(e) => { setEmail(e.target.value); setError(null); }}
            placeholder={t("enter_email_ph")}
            className="w-full bg-white border border-[#E0DCF0] rounded-xl px-4 py-3 text-[14px] outline-none focus:border-[#7C3AED] focus:ring-4 focus:ring-[#7C3AED]/15"
            style={{ color: "#1E1333" }}
          />
          <button
            type="submit" disabled={loading}
            className="w-full text-white font-bold text-[14px] disabled:opacity-60"
            style={{ background: "#7C3AED", borderRadius: 12, padding: 13 }}
          >
            {loading ? "…" : t("fp_send_code")}
          </button>
          {error && <p className="text-[12px]" style={{ color: "#EF4444" }}>{error}</p>}
        </form>
      </div>
    </div>
  );
}