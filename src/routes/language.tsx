import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { useI18n, type Lang } from "@/contexts/I18nContext";
import { safeLocalStorage } from "@/lib/safeStorage";
import { AuthShell } from "@/components/AuthShell";

const MONO = '"IBM Plex Mono", ui-monospace, Consolas, monospace';

export const Route = createFileRoute("/language")({ component: LanguagePage });

const LANGS: { code: Lang; flag: string; name: string; native: string }[] = [
  { code: "en", flag: "🇬🇧", name: "English", native: "English" },
  { code: "ms", flag: "🇲🇾", name: "Bahasa Malaysia", native: "Bahasa Melayu" },
  { code: "zh", flag: "🇨🇳", name: "Chinese Simplified", native: "简体中文" },
];

function LanguagePage() {
  const navigate = useNavigate();
  const { lang, setLang } = useI18n();
  const [selected, setSelected] = useState<Lang>(lang);

  const onContinue = () => {
    setLang(selected);
    // setLang persists `bossify_lang` to localStorage. That key is the
    // single source of truth for "user has chosen a language". It is only
    // written here (Continue) or from Profile after the user is in the app.
    if (typeof window !== "undefined") {
      safeLocalStorage.setItem("bossify_lang", selected);
    }
    navigate({ to: "/auth" });
  };

  return (
    <AuthShell>
      <div className="w-full max-w-[420px] mx-auto flex flex-col lg:mx-0">
        <img src="/assets/bossify-logo.png" alt="Bossify" width={56} height={56} className="object-contain lg:hidden" />

        <p
          className="mt-6 lg:mt-0 text-[12px] uppercase tracking-[0.14em]"
          style={{ color: "#6C4AB6", fontFamily: MONO }}
        >
          Language · Bahasa · 语言
        </p>
        <h1 className="mt-2 text-[28px] font-bold leading-tight" style={{ color: "#1E1730" }}>
          Choose your language
        </h1>
        <p className="mt-2 text-[14.5px]" style={{ color: "#5B5270", lineHeight: 1.7 }}>
          Pilih bahasa anda · 选择您的语言
        </p>

        <div className="mt-7 border-t-2" style={{ borderColor: "#1E1730" }}>
          {LANGS.map((l, i) => {
            const sel = selected === l.code;
            return (
              <button
                key={l.code}
                type="button"
                aria-pressed={sel}
                onClick={() => setSelected(l.code)}
                className="w-full flex items-center gap-4 px-3 py-4 border-b text-left transition-colors"
                style={{ borderColor: "#E1DCEC", background: sel ? "rgba(108,74,182,0.09)" : "transparent" }}
              >
                <span className="text-[13px] w-6 shrink-0" style={{ color: sel ? "#FF3B5C" : "#5B5270", fontFamily: MONO }}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="text-[22px] leading-none">{l.flag}</span>
                <span className="flex-1">
                  <span className="block text-[16.5px] font-semibold" style={{ color: sel ? "#3B1E6D" : "#1E1730" }}>{l.native}</span>
                  <span className="block text-[13px]" style={{ color: "#5B5270" }}>{l.name}</span>
                </span>
                <span
                  className="h-6 w-6 rounded-full flex items-center justify-center border"
                  style={{ background: sel ? "#3B1E6D" : "transparent", borderColor: sel ? "#3B1E6D" : "#CDC5DE" }}
                >
                  {sel && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
                </span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={onContinue}
          className="w-full text-white font-bold text-[15px] active:scale-[0.99] transition-transform mt-7"
          style={{ background: "#3B1E6D", borderRadius: 999, padding: 14 }}
        >
          Continue / Teruskan / 继续 →
        </button>
      </div>
    </AuthShell>
  );
}
