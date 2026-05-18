import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { useI18n, type Lang } from "@/contexts/I18nContext";
import { safeLocalStorage } from "@/lib/safeStorage";

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
    <div className="min-h-screen px-5 pt-12 pb-8 flex flex-col" style={{ background: "#F4F3F8" }}>
      <img src="/assets/bossify-logo.png" alt="Bossify" width={64} height={64} className="object-contain" />

      <h1 className="mt-6 text-[20px] font-bold" style={{ color: "#1E1333" }}>
        Choose Your Language
      </h1>
      <div className="mt-2 text-[12px]" style={{ color: "#6B7280", lineHeight: 1.7 }}>
        <p>Choose your language</p>
        <p>Pilih bahasa anda</p>
        <p>选择您的语言</p>
      </div>

      <div className="mt-6 space-y-2.5">
        {LANGS.map((l) => {
          const sel = selected === l.code;
          return (
            <button
              key={l.code}
              type="button"
              onClick={() => setSelected(l.code)}
              className="w-full flex items-center gap-3 transition-all active:scale-[0.99]"
              style={{
                background: sel ? "#F3F0FF" : "#FFFFFF",
                border: sel ? "1.5px solid #7C3AED" : "0.5px solid #E0DCF0",
                borderRadius: 14,
                padding: "14px 16px",
              }}
            >
              <span className="text-[22px] leading-none">{l.flag}</span>
              <div className="flex-1 text-left">
                <p className="text-[14px] font-bold" style={{ color: "#1E1333" }}>{l.name}</p>
                <p className="text-[11px]" style={{ color: "#6B7280" }}>{l.native}</p>
              </div>
              {sel && (
                <span className="h-6 w-6 rounded-full flex items-center justify-center" style={{ background: "#7C3AED" }}>
                  <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />
                </span>
              )}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={onContinue}
        className="w-full text-white font-bold text-sm active:scale-[0.99] transition-transform mt-6"
        style={{ background: "#7C3AED", borderRadius: 12, padding: 14 }}
      >
        Continue / Teruskan / 继续 →
      </button>
    </div>
  );
}
