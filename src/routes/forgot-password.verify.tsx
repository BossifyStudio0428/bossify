import { useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, Mail } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { safeSessionStorage } from "@/lib/safeStorage";

export const Route = createFileRoute("/forgot-password/verify")({ component: VerifyPage });

function VerifyPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(false);
  const [seconds, setSeconds] = useState(60);
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = safeSessionStorage.getItem("bossify_fp_email");
    if (!stored) {
      navigate({ to: "/forgot-password" });
      return;
    }
    setEmail(stored);
  }, [navigate]);

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
    if (!allFilled || !email) return;
    setError(null); setLoading(true);
    const { data, error: err } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
    setLoading(false);
    if (err || !data?.session) {
      setError("Invalid or expired code");
      setShake(true); setTimeout(() => setShake(false), 500);
      return;
    }
    navigate({ to: "/forgot-password/reset" });
  };

  const resend = async () => {
    if (!email) return;
    setError(null);
    const { error: err } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
    if (err) setError(err.message || "Failed to resend");
    else { setSeconds(60); toast.success("Code resent"); }
  };

  return (
    <div className="min-h-screen px-5 pt-10 pb-8 flex flex-col" style={{ background: "#F4F3F8", fontFamily: "DM Sans, system-ui, sans-serif" }}>
      <div className="w-full max-w-[400px] mx-auto space-y-4 flex-1">
        <button onClick={() => navigate({ to: "/forgot-password" })} className="h-10 w-10 rounded-full bg-white border border-[#E0DCF0] flex items-center justify-center self-start">
          <ChevronLeft className="h-5 w-5" style={{ color: "#1E1333" }} />
        </button>

        <div className="flex flex-col items-center gap-3 text-center">
          <div className="h-14 w-14 rounded-full flex items-center justify-center" style={{ background: "#F3F0FF" }}>
            <Mail className="h-7 w-7" style={{ color: "#7C3AED" }} />
          </div>
          <h1 className="text-[20px] font-bold" style={{ color: "#1E1333" }}>Enter Verification Code</h1>
          <p className="text-[13px]" style={{ color: "#6B7280" }}>
            We sent a 6-digit code to <span className="font-semibold" style={{ color: "#1E1333" }}>{email}</span>
          </p>
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
            <span>Resend in 0:{seconds.toString().padStart(2, "0")}</span>
          ) : (
            <button onClick={resend} className="font-bold" style={{ color: "#7C3AED" }}>Resend code</button>
          )}
        </div>

        <button
          onClick={verify} disabled={!allFilled || loading}
          className="w-full text-white font-bold text-[14px] disabled:opacity-60"
          style={{ background: "#7C3AED", borderRadius: 12, padding: 13 }}
        >
          {loading ? "…" : "Verify"}
        </button>
        {error && <p className="text-[12px] text-center" style={{ color: "#EF4444" }}>{error}</p>}

        <style>{`@keyframes shake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-6px)} 75%{transform:translateX(6px)} }`}</style>
      </div>
    </div>
  );
}