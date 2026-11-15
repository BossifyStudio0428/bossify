import { useEffect, useState } from "react";

export type ViewOption<K extends string> = {
  key: K;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

/** Remembers a page's chosen layout on this device. Storage can be missing
 *  (private mode, blocked site data) — then it just falls back to the default. */
export function useViewMode<K extends string>(storageKey: string, allowed: readonly K[], fallback: K) {
  const [mode, setMode] = useState<K>(fallback);
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(`bossify_view_${storageKey}`) as K | null;
      if (saved && allowed.includes(saved)) setMode(saved);
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);
  const choose = (k: K) => {
    setMode(k);
    try {
      window.localStorage.setItem(`bossify_view_${storageKey}`, k);
    } catch {
      // ignore
    }
  };
  return [mode, choose] as const;
}

/** Small segmented control with an icon (and label on wider screens) per layout. */
export function ViewSwitch<K extends string>({
  value,
  onChange,
  options,
}: {
  value: K;
  onChange: (k: K) => void;
  options: ViewOption<K>[];
}) {
  return (
    <div className="inline-flex shrink-0 gap-0.5 p-0.5 rounded-xl bg-muted/70 border border-border/50" role="tablist">
      {options.map((o) => {
        const active = o.key === value;
        return (
          <button
            key={o.key}
            type="button"
            role="tab"
            aria-selected={active}
            title={o.label}
            onClick={() => onChange(o.key)}
            className={`h-8 px-2.5 rounded-lg flex items-center gap-1.5 text-xs font-semibold transition-colors ${
              active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
            }`}
          >
            <o.icon className="h-4 w-4" />
            <span className="hidden sm:inline">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
