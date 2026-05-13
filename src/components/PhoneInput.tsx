import { useEffect, useMemo, useState } from "react";
import { safeLocalStorage } from "@/lib/safeStorage";

export const PHONE_COUNTRIES: { code: string; flag: string; name: string }[] = [
  { code: "60", flag: "🇲🇾", name: "Malaysia" },
  { code: "65", flag: "🇸🇬", name: "Singapore" },
  { code: "62", flag: "🇮🇩", name: "Indonesia" },
  { code: "66", flag: "🇹🇭", name: "Thailand" },
  { code: "84", flag: "🇻🇳", name: "Vietnam" },
  { code: "63", flag: "🇵🇭", name: "Philippines" },
  { code: "673", flag: "🇧🇳", name: "Brunei" },
  { code: "86", flag: "🇨🇳", name: "China" },
  { code: "852", flag: "🇭🇰", name: "Hong Kong" },
  { code: "886", flag: "🇹🇼", name: "Taiwan" },
  { code: "91", flag: "🇮🇳", name: "India" },
  { code: "1", flag: "🇺🇸", name: "USA" },
  { code: "44", flag: "🇬🇧", name: "UK" },
  { code: "61", flag: "🇦🇺", name: "Australia" },
];

export function buildFullPhone(countryCode: string, local: string): string {
  const digits = local.replace(/\D/g, "").replace(/^0+/, "");
  if (!digits) return "";
  return countryCode + digits;
}

function splitPhone(full: string): { country: string; local: string } {
  const digits = (full || "").replace(/\D/g, "");
  if (!digits) return { country: "", local: "" };
  const sorted = [...PHONE_COUNTRIES].sort((a, b) => b.code.length - a.code.length);
  for (const c of sorted) {
    if (digits.startsWith(c.code)) return { country: c.code, local: digits.slice(c.code.length) };
  }
  return { country: "", local: digits };
}

type Props = {
  label?: string;
  value: string;
  onChange: (fullPhone: string) => void;
  placeholder?: string;
  showPreview?: boolean;
};

export function PhoneInput({ label, value, onChange, placeholder = "123456789", showPreview = true }: Props) {
  const initial = useMemo(() => splitPhone(value), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [country, setCountry] = useState<string>(() => {
    if (initial.country) return initial.country;
    if (typeof window === "undefined") return "60";
    return safeLocalStorage.getItem("bossify_country_code") || "60";
  });
  const [local, setLocal] = useState<string>(initial.local);

  useEffect(() => {
    if (typeof window !== "undefined") safeLocalStorage.setItem("bossify_country_code", country);
  }, [country]);

  // Sync from external value if it changes meaningfully
  useEffect(() => {
    const s = splitPhone(value);
    if (value && s.country && (s.country !== country || s.local !== local)) {
      setCountry(s.country);
      setLocal(s.local);
    } else if (!value && local) {
      setLocal("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const emit = (c: string, l: string) => {
    onChange(buildFullPhone(c, l));
  };

  return (
    <div className="space-y-1.5">
      {label && (
        <label className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground px-1">
          {label}
        </label>
      )}
      <div className="flex gap-2">
        <div className="relative shrink-0">
          <select
            value={country}
            onChange={(e) => { setCountry(e.target.value); emit(e.target.value, local); }}
            className="appearance-none h-full rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] pl-3 pr-7 py-3 text-sm text-foreground outline-none focus:border-primary focus:ring-4 focus:ring-primary/15 transition"
            aria-label="Country code"
          >
            {PHONE_COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.flag} +{c.code}
              </option>
            ))}
          </select>
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">▼</span>
        </div>
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-base">📱</span>
          <input
            type="tel"
            inputMode="numeric"
            placeholder={placeholder}
            value={local}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, "");
              setLocal(v);
              emit(country, v);
            }}
            className="w-full rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] pl-10 pr-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/70 outline-none focus:border-primary focus:ring-4 focus:ring-primary/15 transition"
          />
        </div>
      </div>
      {showPreview && local.trim() && (
        <p className="text-[10px] text-muted-foreground px-1">
          → +{buildFullPhone(country, local)}
        </p>
      )}
    </div>
  );
}