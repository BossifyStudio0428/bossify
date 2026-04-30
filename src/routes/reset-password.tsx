import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff, Check } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/contexts/I18nContext";
import { mapAuthError, pwStrength } from "@/lib/authErrors";

export const Route = createFileRoute("/reset-password")({ component: ResetPasswordPage });

function ResetPasswordPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showA, setShowA] = useState(false);
  const [showB, setShowB] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Supabase recovery flow puts tokens in the URL hash
    if (typeof window === "undefined") return;
    const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
    const params = new URLSearchParams(hash);
    const access_token = params.get("access_token");
    const refresh_token = params.get("refresh_token");
    const type = params.get("type");
    if (access_token && refresh_token && type === "recovery") {
      supabase.auth.setSession({ access_token, refresh_token }).then(({ error }) => {
        if (error) {
          toast.error(t("invalid_reset_link"));
          navigate({ to: "/auth" });
        } else {
          setReady(true);
          window.history.replaceState({}, "", window.location.pathname);
        }
      });
    } else {
      // Maybe the user already has a session via PKCE redirect
      supabase.auth.getSession().then(({ data }) => {
        if (data.session) setReady(true);
        else {
          toast.error(t("invalid_reset_link"));
          navigate({ to: "/auth" });
        }
      });
    }
  }, [navigate, t]);

  const checks = useMemo(() => ({
    len: pw.length >= 8,
    num: /\d/.test(pw),
    match: pw.length > 0 && pw === confirm,
  }), [pw, confirm]);
  const allOk = checks.len && checks.num && checks.match;
  const strength = pwStrength(pw);
  const barColor = strength === "weak" ? "#EF4444" : strength === "fair" ? "#F59E0B" : "#10B981";
  const barWidth = strength === "weak" ? "33%" : strength === "fair" ? "66%" : "100%";

  const submit = async () => {
    if (!allOk) return;
    setError(null); setLoading(true);
    const { error: err } = await supabase.auth.updateUser({ password: pw });
    setLoading(false);
    if (err) { setError(t(mapAuthError(err.message))); return; }
    await supabase.auth.signOut();
    toast.success(t("password_updated"));
    navigate({ to: "/auth" });
  };

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#F4F3F8" }}>
        <p className="text-[13px]" style={{ color: "#6B7280" }}>{t("loading")}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-5 pt-10 pb-8 flex flex-col" style={{ background: "#F4F3F8", fontFamily: "DM Sans, system-ui, sans-serif" }}>
      <div className="w-full max-w-[400px] mx-auto space-y-4 flex-1">
        <div className="flex flex-col items-center">
          <img src="/assets/bossify-logo.png" alt="Bossify" style={{ width: 56, height: 56 }} />
        </div>
        <div className="text-center">
          <h1 className="text-[20px] font-bold" style={{ color: "#1E1333" }}>{t("set_new_password")}</h1>
          <p className="text-[13px]" style={{ color: "#6B7280" }}>{t("enter_new_pw")}</p>
        </div>

        <div className="bg-white rounded-[20px] p-6 shadow-[0_4px_20px_rgba(124,58,237,0.06)] space-y-3">
          <label className="text-[12px] font-semibold" style={{ color: "#1E1333" }}>{t("password")}</label>
          <div className="relative">
            <input
              type={showA ? "text" : "password"} autoComplete="new-password"
              value={pw} onChange={(e) => setPw(e.target.value)}
              placeholder="Min. 8 characters"
              className="w-full bg-white border border-[#E0DCF0] rounded-xl px-4 py-3 text-[14px] outline-none focus:border-[#7C3AED] focus:ring-4 focus:ring-[#7C3AED]/15"
            />
            <button type="button" onClick={() => setShowA((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6B7280]">
              {showA ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {pw.length > 0 && (
            <div className="h-1.5 bg-[#E0DCF0] rounded-full overflow-hidden">
              <div style={{ width: barWidth, background: barColor, height: "100%" }} />
            </div>
          )}

          <label className="text-[12px] font-semibold" style={{ color: "#1E1333" }}>{t("confirm_password")}</label>
          <div className="relative">
            <input
              type={showB ? "text" : "password"} autoComplete="new-password"
              value={confirm} onChange={(e) => setConfirm(e.target.value)}
              placeholder="Re-enter your password"
              className="w-full bg-white border border-[#E0DCF0] rounded-xl px-4 py-3 text-[14px] outline-none focus:border-[#7C3AED] focus:ring-4 focus:ring-[#7C3AED]/15"
            />
            <button type="button" onClick={() => setShowB((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6B7280]">
              {showB ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          <ul className="space-y-1 text-[12px]">
            <li className="flex items-center gap-2" style={{ color: checks.len ? "#10B981" : "#6B7280" }}><Check className="h-3.5 w-3.5" strokeWidth={3} />{t("pw_min_8")}</li>
            <li className="flex items-center gap-2" style={{ color: checks.num ? "#10B981" : "#6B7280" }}><Check className="h-3.5 w-3.5" strokeWidth={3} />{t("pw_has_num")}</li>
            <li className="flex items-center gap-2" style={{ color: checks.match ? "#10B981" : "#6B7280" }}><Check className="h-3.5 w-3.5" strokeWidth={3} />{t("pw_match")}</li>
          </ul>

          <button
            onClick={submit} disabled={!allOk || loading}
            className="w-full text-white font-bold text-[14px] disabled:opacity-60"
            style={{ background: "#7C3AED", borderRadius: 12, padding: 13 }}
          >
            {loading ? "…" : t("update_password")}
          </button>
          {error && <p className="text-[12px]" style={{ color: "#EF4444" }}>{error}</p>}
        </div>
      </div>
    </div>
  );
}
