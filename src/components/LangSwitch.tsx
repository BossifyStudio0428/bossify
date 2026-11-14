import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Globe } from "lucide-react";
import { useI18n, type Lang } from "@/contexts/I18nContext";

// Small language picker for the public pages (landing page, sign in /
// sign up). Uses the same setLang as the in-app Profile setting, so the
// choice is remembered (bossify_lang) and carries into the app.
const OPTIONS: { code: Lang; short: string; name: string }[] = [
  { code: "en", short: "EN", name: "English" },
  { code: "ms", short: "BM", name: "Bahasa Melayu" },
  { code: "zh", short: "中文", name: "简体中文" },
];

export function LangSwitch({ align = "right" }: { align?: "left" | "right" }) {
  const { lang, setLang } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = OPTIONS.find((o) => o.code === lang) ?? OPTIONS[0];

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Language / Bahasa / 语言"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-[14px] font-semibold transition-colors hover:bg-[#F7F5FA]"
        style={{ borderColor: "#E1DCEC", color: "#1E1730", background: "#FFFFFF" }}
      >
        <Globe className="h-4 w-4" style={{ color: "#6C4AB6" }} />
        {current.short}
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} style={{ color: "#5B5270" }} />
      </button>
      {open && (
        <ul
          role="listbox"
          className={`absolute z-50 mt-2 w-48 overflow-hidden rounded-xl border bg-white py-1 shadow-[0_18px_40px_-16px_rgba(30,23,48,0.35)] ${align === "right" ? "right-0" : "left-0"}`}
          style={{ borderColor: "#E1DCEC" }}
        >
          {OPTIONS.map((o) => {
            const sel = o.code === lang;
            return (
              <li key={o.code}>
                <button
                  type="button"
                  role="option"
                  aria-selected={sel}
                  onClick={() => {
                    setLang(o.code);
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left text-[14px] transition-colors hover:bg-[#F7F5FA]"
                  style={{ color: sel ? "#3B1E6D" : "#1E1730", fontWeight: sel ? 600 : 500 }}
                >
                  <span className="w-8 shrink-0 text-[12px]" style={{ color: "#5B5270", fontFamily: '"IBM Plex Mono", ui-monospace, monospace' }}>
                    {o.short}
                  </span>
                  <span className="flex-1">{o.name}</span>
                  {sel && <Check className="h-4 w-4" style={{ color: "#3B1E6D" }} />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
