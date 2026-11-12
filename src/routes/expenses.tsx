import { useEffect, useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell, PieChart, Pie } from "recharts";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, Plus, Pencil, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import { SheetShell, SheetField, ConfirmSheet } from "@/components/InventorySheets";

export const Route = createFileRoute("/expenses")({ component: ExpensesPage });

type ExpenseCategory = "advertising" | "affiliate_influencer" | "subscriptions" | "ai_software" | "other";

export type Expense = {
  id: string;
  user_id: string;
  incurred_at: string;
  paid_at: string | null;
  category: ExpenseCategory;
  description: string | null;
  amount: number;
  currency_code: string;
  created_at: string;
};

type Sheet =
  | { kind: "none" }
  | { kind: "form"; item?: Expense }
  | { kind: "delete"; item: Expense };

function categoryLabel(c: ExpenseCategory, lang: string): string {
  const map: Record<ExpenseCategory, { en: string; zh: string; ms: string }> = {
    advertising: { en: "Advertising", zh: "广告费", ms: "Iklan" },
    affiliate_influencer: { en: "Affiliate / Influencer", zh: "达人推广费", ms: "Afiliasi / Influencer" },
    subscriptions: { en: "Subscriptions", zh: "工具订阅", ms: "Langganan" },
    ai_software: { en: "AI / Software", zh: "AI / 软件费", ms: "AI / Perisian" },
    other: { en: "Other", zh: "其他", ms: "Lain-lain" },
  };
  const e = map[c];
  if (lang === "zh") return e.zh;
  if (lang === "ms") return e.ms;
  return e.en;
}

const CATEGORIES: ExpenseCategory[] = ["advertising", "affiliate_influencer", "subscriptions", "ai_software", "other"];

function pageCopy(lang: string) {
  if (lang === "zh") {
    return {
      title: "营业费用",
      subtitle: "记录广告费、达人推广费、订阅等开支",
      empty: "还没有记录任何营业费用。",
      addBtn: "记一笔",
      thisMonth: "本月总计",
      editTitle: "编辑费用",
      addTitle: "新增费用",
      dateIncurred: "发生日期",
      datePaid: "付款日期（选填）",
      category: "分类",
      description: "备注",
      amount: "金额 (RM)",
      save: "保存",
      saving: "保存中…",
      deleteConfirm: "确定要删除这笔费用吗？",
      deleted: "已删除",
      savedMsg: "已保存",
      required: "此栏必填",
    };
  }
  if (lang === "ms") {
    return {
      title: "Perbelanjaan Operasi",
      subtitle: "Rekod iklan, bayaran influencer, langganan dan lain-lain",
      empty: "Belum ada perbelanjaan direkodkan.",
      addBtn: "Tambah",
      thisMonth: "Jumlah bulan ini",
      editTitle: "Edit perbelanjaan",
      addTitle: "Perbelanjaan baharu",
      dateIncurred: "Tarikh berlaku",
      datePaid: "Tarikh dibayar (pilihan)",
      category: "Kategori",
      description: "Catatan",
      amount: "Jumlah (RM)",
      save: "Simpan",
      saving: "Menyimpan…",
      deleteConfirm: "Padam perbelanjaan ini?",
      deleted: "Dipadam",
      savedMsg: "Disimpan",
      required: "Ruangan ini diperlukan",
    };
  }
  return {
    title: "Operating Expenses",
    subtitle: "Track advertising, influencer payouts, subscriptions, and more",
    empty: "No expenses recorded yet.",
    addBtn: "Add expense",
    thisMonth: "This month's total",
    editTitle: "Edit expense",
    addTitle: "New expense",
    dateIncurred: "Date incurred",
    datePaid: "Date paid (optional)",
    category: "Category",
    description: "Description",
    amount: "Amount (RM)",
    save: "Save",
    saving: "Saving…",
    deleteConfirm: "Delete this expense?",
    deleted: "Deleted",
    savedMsg: "Saved",
    required: "This field is required",
  };
}

function ExpensesPage() {
  const { lang } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();
  const c = pageCopy(lang);

  const [items, setItems] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheet, setSheet] = useState<Sheet>({ kind: "none" });

  const load = async () => {
    const { data, error } = await supabase
      .from("operating_expenses" as any)
      .select("*")
      .order("incurred_at", { ascending: false });
    if (error) toast.error(error.message);
    setItems(((data ?? []) as unknown) as Expense[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const thisMonthTotal = useMemo(() => {
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    return items
      .filter((e) => e.incurred_at.startsWith(ym))
      .reduce((s, e) => s + Number(e.amount), 0);
  }, [items]);

  const CATEGORY_COLORS: Record<ExpenseCategory, string> = {
    advertising: "#6C4AB6",
    affiliate_influencer: "#FBBF24",
    subscriptions: "#60A5FA",
    ai_software: "#F472B6",
    other: "#9CA3AF",
  };

  const categoryBreakdown = useMemo(() => {
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const byCat = new Map<ExpenseCategory, number>();
    for (const e of items) {
      if (!e.incurred_at.startsWith(ym)) continue;
      byCat.set(e.category, (byCat.get(e.category) ?? 0) + Number(e.amount));
    }
    return CATEGORIES
      .map((cat) => ({ name: categoryLabel(cat, lang), value: Math.round((byCat.get(cat) ?? 0) * 100) / 100, color: CATEGORY_COLORS[cat] }))
      .filter((d) => d.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [items, lang]);

  const handleDelete = async (it: Expense) => {
    const prev = items;
    setItems((p) => p.filter((x) => x.id !== it.id));
    const { error } = await supabase.from("operating_expenses" as any).delete().eq("id", it.id);
    if (error) {
      setItems(prev);
      toast.error(error.message);
    } else {
      toast.success(c.deleted);
    }
    setSheet({ kind: "none" });
  };

  return (
    <div className="px-5 pt-10 pb-24 space-y-5 relative lg:max-w-5xl lg:mx-auto lg:px-8 lg:pt-8">
      <header className="flex items-center gap-2">
        <button onClick={() => navigate({ to: "/profile" })} className="-ml-2 p-2 rounded-full active:bg-muted">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{c.title}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">{c.subtitle}</p>
        </div>
        {/* Desktop: same add-expense action as the mobile FAB below
            (which hides on desktop), same handler. */}
        <button
          onClick={() => setSheet({ kind: "form" })}
          className="hidden lg:inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          {c.addBtn}
        </button>
      </header>

      <div className="lg:hidden rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] p-4">
        <p className="text-xs text-muted-foreground">{c.thisMonth}</p>
        <p className="text-2xl font-bold text-foreground mt-1">RM {thisMonthTotal.toFixed(2)}</p>
      </div>

      {/* Desktop-only KPI row \u2014 this month's total + a card per category
          that actually has spend this month (no fabricated categories like
          "Platform Fees"/"Shipping" \u2014 those are order-level costs tracked
          on the Real Profit page, not operating expenses). */}
      <div className="hidden lg:grid lg:gap-4" style={{ gridTemplateColumns: `repeat(${1 + categoryBreakdown.length}, minmax(0, 1fr))` }}>
        <div className="rounded-2xl bg-primary/5 border border-primary/20 p-4 space-y-1">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{c.thisMonth}</p>
          <p className="text-2xl font-bold text-foreground">RM {thisMonthTotal.toFixed(2)}</p>
        </div>
        {categoryBreakdown.map((d) => (
          <div key={d.name} className="rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] p-4 space-y-1">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full shrink-0" style={{ background: d.color }} />
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide truncate">{d.name}</p>
            </div>
            <p className="text-2xl font-bold text-foreground">RM {d.value.toFixed(2)}</p>
          </div>
        ))}
      </div>

      {categoryBreakdown.length > 0 && (
        <div className="lg:hidden rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase mb-3">
            {lang === "zh" ? "\u672c\u6708\u652f\u51fa\u5206\u7c7b" : lang === "ms" ? "Perbelanjaan Mengikut Kategori" : "Expenses by category"}
          </p>
          <ResponsiveContainer width="100%" height={Math.max(100, categoryBreakdown.length * 36)}>
            <BarChart data={categoryBreakdown} layout="vertical" margin={{ top: 4, right: 12, left: 4, bottom: 0 }}>
              <XAxis type="number" tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={110} />
              <Tooltip formatter={(v: number) => `RM ${v.toFixed(2)}`} />
              <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                {categoryBreakdown.map((d, i) => (
                  <Cell key={i} fill={d.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Desktop-only Expenses by Category donut */}
      {categoryBreakdown.length > 0 && (
        <div className="hidden lg:block rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">
            {lang === "zh" ? "\u672c\u6708\u652f\u51fa\u5206\u7c7b" : lang === "ms" ? "Perbelanjaan Mengikut Kategori" : "Expenses by Category"}
          </p>
          <div className="flex items-center gap-6">
            <ResponsiveContainer width={200} height={200}>
              <PieChart>
                <Pie data={categoryBreakdown} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={52} outerRadius={78} paddingAngle={2}>
                  {categoryBreakdown.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip formatter={(v: number) => `RM ${v.toFixed(2)}`} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-col gap-2">
              {categoryBreakdown.map((d) => (
                <span key={d.name} className="inline-flex items-center gap-2 text-sm text-foreground">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: d.color }} />
                  {d.name} <span className="text-muted-foreground">(RM {d.value.toFixed(2)})</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {loading && (
        <div className="flex justify-center py-10">
          <div className="h-6 w-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
        </div>
      )}
      {!loading && items.length === 0 && (
        <p className="text-center text-sm text-muted-foreground py-10 px-4">{c.empty}</p>
      )}

      <div className="lg:hidden space-y-3">
        {items.map((it) => (
          <article key={it.id} className="rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] p-4 space-y-1.5">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0 space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                    {categoryLabel(it.category, lang)}
                  </span>
                  <span className="text-[11px] text-muted-foreground">{it.incurred_at}</span>
                </div>
                {it.description && (
                  <p className="text-sm text-foreground truncate">{it.description}</p>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => setSheet({ kind: "form", item: it })} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => setSheet({ kind: "delete", item: it })} className="p-1.5 rounded-lg hover:bg-red-500/10 text-red-500">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <p className="text-sm font-bold text-foreground">RM {Number(it.amount).toFixed(2)}</p>
          </article>
        ))}
      </div>

      {/* Desktop: expense transactions table */}
      {!loading && items.length > 0 && (
        <div className="hidden lg:block rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 bg-muted/30 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3">{lang === "zh" ? "日期" : lang === "ms" ? "Tarikh" : "Date"}</th>
                <th className="px-4 py-3">{c.category}</th>
                <th className="px-4 py-3">{c.description}</th>
                <th className="px-4 py-3 text-right">{lang === "zh" ? "金额" : lang === "ms" ? "Jumlah" : "Amount"}</th>
                <th className="px-4 py-3 text-right">{lang === "zh" ? "操作" : lang === "ms" ? "Tindakan" : "Action"}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className="border-b border-border/40 last:border-0 hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{it.incurred_at}</td>
                  <td className="px-4 py-3">
                    <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-primary/10 text-primary">
                      {categoryLabel(it.category, lang)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-foreground truncate max-w-[280px]">{it.description || "—"}</td>
                  <td className="px-4 py-3 text-right font-semibold text-foreground">RM {Number(it.amount).toFixed(2)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => setSheet({ kind: "form", item: it })} className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted/40 transition-colors">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button onClick={() => setSheet({ kind: "delete", item: it })} className="h-8 w-8 rounded-lg flex items-center justify-center text-red-600 hover:bg-red-500/10 transition-colors">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <button
        onClick={() => setSheet({ kind: "form" })}
        aria-label={c.addBtn}
        className="fixed fab-above-nav left-1/2 -translate-x-1/2 z-30 h-12 px-5 rounded-full text-primary-foreground font-semibold shadow-[var(--shadow-soft)] flex items-center gap-2 active:scale-[0.98] transition-transform bg-primary lg:hidden"
      >
        <Plus className="h-5 w-5" strokeWidth={2.5} />
        {c.addBtn}
      </button>

      {sheet.kind === "form" && (
        <ExpenseFormSheet
          item={sheet.item}
          userId={user?.id ?? ""}
          lang={lang}
          onClose={() => setSheet({ kind: "none" })}
          onSaved={() => { setSheet({ kind: "none" }); load(); }}
        />
      )}
      {sheet.kind === "delete" && (
        <ConfirmSheet
          title={c.deleteConfirm}
          onClose={() => setSheet({ kind: "none" })}
          onConfirm={() => handleDelete(sheet.item)}
        />
      )}
    </div>
  );
}

function ExpenseFormSheet({
  item, userId, lang, onClose, onSaved,
}: { item?: Expense; userId: string; lang: string; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n();
  const c = pageCopy(lang);
  const todayStr = new Date().toISOString().slice(0, 10);
  const [incurredAt, setIncurredAt] = useState(item?.incurred_at ?? todayStr);
  const [paidAt, setPaidAt] = useState(item?.paid_at ?? "");
  const [category, setCategory] = useState<ExpenseCategory>(item?.category ?? "advertising");
  const [description, setDescription] = useState(item?.description ?? "");
  const [amount, setAmount] = useState(item?.amount != null ? String(item.amount) : "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!incurredAt) { toast.error(c.required); return; }
    if (!amount || Number(amount) <= 0) { toast.error(c.required); return; }
    if (!userId) return;
    setSaving(true);
    const payload = {
      incurred_at: incurredAt,
      paid_at: paidAt || null,
      category,
      description: description.trim() || null,
      amount: Number(amount),
      currency_code: "MYR",
    };
    const { error } = item
      ? await supabase.from("operating_expenses" as any).update(payload).eq("id", item.id)
      : await supabase.from("operating_expenses" as any).insert({ ...payload, user_id: userId });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(c.savedMsg);
    onSaved();
  };

  return (
    <SheetShell onClose={onClose}>
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-foreground">{item ? c.editTitle : c.addTitle}</h3>
        <button onClick={onClose} aria-label={t("close")} className="p-1.5 rounded-full hover:bg-muted text-muted-foreground"><X className="h-4 w-4" /></button>
      </div>

      <div className="space-y-1.5">
        <label className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground px-1">{c.category}</label>
        <div className="grid grid-cols-2 gap-2">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategory(cat)}
              className={`py-2.5 rounded-2xl text-xs font-semibold border transition-colors ${
                category === cat
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-muted/40 border-border/60 text-muted-foreground"
              }`}
            >
              {categoryLabel(cat, lang)}
            </button>
          ))}
        </div>
      </div>

      <SheetField label={c.dateIncurred} value={incurredAt} onChange={setIncurredAt} type="date" />
      <SheetField label={c.datePaid} value={paidAt} onChange={setPaidAt} type="date" />
      <SheetField label={c.amount} value={amount} onChange={setAmount} type="number" placeholder="0.00" />
      <SheetField label={c.description} value={description} onChange={setDescription} />

      <button
        onClick={save}
        disabled={saving}
        className="w-full py-3.5 rounded-2xl bg-primary text-primary-foreground font-semibold disabled:opacity-60 active:scale-[0.99] transition-transform"
      >
        {saving ? c.saving : c.save}
      </button>
    </SheetShell>
  );
}