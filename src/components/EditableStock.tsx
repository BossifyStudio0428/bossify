import { useEffect, useRef, useState } from "react";
import { Pencil } from "lucide-react";

/**
 * A stock number you can tap and type over (instead of only +/-).
 * Enter or tapping away saves; Esc cancels. Never goes below 0.
 */
export function EditableStock({
  value,
  onCommit,
  className = "",
  inputClassName = "",
  title,
}: {
  value: number;
  onCommit: (next: number) => void;
  className?: string;
  inputClassName?: string;
  title?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(String(value));
  const cancelled = useRef(false);

  useEffect(() => {
    if (!editing) setText(String(value));
  }, [value, editing]);

  const commit = () => {
    setEditing(false);
    if (cancelled.current) { cancelled.current = false; return; }
    if (text.trim() === "") return;
    const n = Math.max(0, Math.round(Number(text)));
    if (!Number.isFinite(n) || n === value) return;
    onCommit(n);
  };

  if (editing) {
    return (
      <input
        autoFocus
        type="number"
        inputMode="numeric"
        min={0}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={commit}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") { cancelled.current = true; (e.target as HTMLInputElement).blur(); }
        }}
        className={`w-20 rounded-lg border border-primary bg-card px-2 py-0.5 text-center font-bold text-foreground outline-none ring-4 ring-primary/15 ${inputClassName}`}
      />
    );
  }

  return (
    <button
      type="button"
      title={title}
      onClick={(e) => { e.stopPropagation(); e.preventDefault(); setEditing(true); }}
      className={`inline-flex items-center gap-1 rounded-lg px-1 -mx-1 hover:bg-muted/60 active:bg-muted transition-colors ${className}`}
    >
      {value}
      <Pencil className="h-3 w-3 opacity-40" />
    </button>
  );
}
