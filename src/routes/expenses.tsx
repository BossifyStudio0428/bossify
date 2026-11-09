import { useEffect, useMemo, useState } from "react";
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

      <div className="rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] p-4">
        <p className="text-xs text-muted-foreground">{c.thisMonth}</p>
        <p className="text-2xl font-bold text-foreground mt-1">RM {thisMonthTotal.toFixed(2)}</p>
      </div>

      {loading && (
        <div className="flex justify-center py-10">
          <div className="h-6 w-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
        </div>
      )}
      {!loading && items.length === 0 && (
        <p className="text-center text-sm text-muted-foreground py-10 px-4">{c.empty}</p>
      )}

      <div className="space-y-3 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-3 xl:grid-cols-3 lg:items-start">
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
        className="w-full py-3.5 rounded-2xl bg-primary text-primary-foreground font-semibold disabled:opacity-60 active:scale-[0.99]"
      >
        {saving ? c.saving : c.save}
      </button>
    </SheetShell>
  );
}