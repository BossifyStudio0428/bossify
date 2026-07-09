import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Plus, Pencil, Trash2, Minus, AlertTriangle, X, Sparkles, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import { useBusinessType } from "@/contexts/BusinessTypeContext";
import { SheetShell, SheetField, ConfirmSheet } from "@/components/InventorySheets";
import { StockTabs } from "@/components/StockTabs";
import { useServerFn } from "@tanstack/react-start";
import { classifyIngredientsWithAi } from "@/lib/ai-classify-ingredient.functions";
import { mergeCategories, translateCategory } from "@/lib/ingredientCategories";

export const Route = createFileRoute("/ingredients")({ component: IngredientsPage });

type Ingredient = {
  id: string;
  user_id: string;
  name: string;
  unit: string;
  current_stock: number;
  min_stock: number;
  cost_per_unit: number;
  supplier_id: string | null;
  notes: string | null;
  category: string | null;
  created_at: string;
};

type Supplier = { id: string; name: string };

const UNITS = ["kg", "g", "liter", "ml", "pcs", "dozen"];

type Sheet =
  | { kind: "none" }
  | { kind: "form"; item?: Ingredient }
  | { kind: "adjust"; item: Ingredient; mode: "restock" | "use" }
  | { kind: "delete"; item: Ingredient };

function IngredientsPage() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const { type: bizType, loading: btLoading } = useBusinessType();
  const navigate = useNavigate();
  const allowed = bizType === "retail" || bizType === "fnb";

  const [items, setItems] = useState<Ingredient[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>("__all__");
  const [search, setSearch] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sheet, setSheet] = useState<Sheet>({ kind: "none" });
  const classifyFn = useServerFn(classifyIngredientsWithAi);

  useEffect(() => {
    // Guard disabled: allow all business types to access Ingredients
    // if (!btLoading && !allowed) navigate({ to: "/inventory" });
  }, [btLoading, allowed, navigate]);

  const load = async () => {
    const [{ data: ing, error: e1 }, { data: sup }, { data: cats }] = await Promise.all([
      supabase.from("ingredients" as any).select("*").order("name", { ascending: true }),
      supabase.from("suppliers" as any).select("id, name").order("name", { ascending: true }),
      supabase.from("ingredient_categories" as any).select("name").order("name"),
    ]);
    if (e1) toast.error(e1.message);
    setItems(((ing ?? []) as unknown) as Ingredient[]);
    setSuppliers(((sup ?? []) as unknown) as Supplier[]);
    setCustomCategories(((cats ?? []) as any[]).map((c) => c.name as string).filter(Boolean));
    setLoading(false);
  };
  useEffect(() => { if (allowed) load(); }, [allowed]);

  const supplierMap = useMemo(() => {
    const m = new Map<string, string>();
    suppliers.forEach((s) => m.set(s.id, s.name));
    return m;
  }, [suppliers]);

  const lowCount = items.filter((i) => Number(i.current_stock) < Number(i.min_stock)).length;
  const uncategorizedCount = items.filter((i) => !i.category || !i.category.trim()).length;

  // Categories that actually appear in current items, merged with presets + custom
  const allCategoryOptions = useMemo(() => {
    const merged = mergeCategories(customCategories);
    const lower = new Set(merged.map((c) => c.toLowerCase()));
    items.forEach((it) => {
      const c = (it.category ?? "").trim();
      if (c && !lower.has(c.toLowerCase())) {
        lower.add(c.toLowerCase());
        merged.push(c);
      }
    });
    return merged;
  }, [customCategories, items]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = items;
    if (activeCategory === "__none__") {
      list = list.filter((i) => !i.category || !i.category.trim());
    } else if (activeCategory !== "__all__") {
      list = list.filter((i) => (i.category ?? "").toLowerCase() === activeCategory.toLowerCase());
    }
    if (q) {
      list = list.filter((i) => {
        const sup = i.supplier_id ? (supplierMap.get(i.supplier_id) ?? "") : "";
        return (
          i.name.toLowerCase().includes(q) ||
          (i.category ?? "").toLowerCase().includes(q) ||
          sup.toLowerCase().includes(q)
        );
      });
    }
    return list;
  }, [items, activeCategory, search, supplierMap]);

  const handleBulkCategorize = async () => {
    const targets = items.filter((i) => !i.category || !i.category.trim());
    if (targets.length === 0) return;
    setBulkBusy(true);
    try {
      const existing = mergeCategories(customCategories);
      let done = 0;
      const batchSize = 30;
      const newCats = new Set<string>();
      const knownLower = new Set(existing.map((c) => c.toLowerCase()));
      for (let i = 0; i < targets.length; i += batchSize) {
        const batch = targets.slice(i, i + batchSize);
        const result = await classifyFn({
          data: {
            names: batch.map((b) => b.name),
            existingCategories: existing,
          },
        });
        // write back per item
        for (let j = 0; j < batch.length; j++) {
          const r = result[j];
          const c = (r?.category ?? "").trim();
          if (!c) continue;
          if (!knownLower.has(c.toLowerCase())) {
            newCats.add(c);
            knownLower.add(c.toLowerCase());
          }
          const { error: upErr } = await supabase
            .from("ingredients" as any)
            .update({ category: c })
            .eq("id", batch[j].id);
          if (upErr) {
            console.error("[bulk-categorize] update failed", upErr);
            throw new Error(upErr.message);
          }
          done += 1;
        }
      }
      if (newCats.size > 0) {
        await supabase
          .from("ingredient_categories" as any)
          .upsert(
            Array.from(newCats).map((name) => ({ user_id: user?.id, name })),
            { onConflict: "user_id,name", ignoreDuplicates: true },
          );
      }
      toast.success(t("categorized_count").replace("{n}", String(done)));
      await load();
    } catch (e: any) {
      toast.error(String(e?.message ?? e ?? "AI failed"));
    } finally {
      setBulkBusy(false);
    }
  };

  const handleDelete = async (it: Ingredient) => {
    const prev = items;
    setItems((p) => p.filter((x) => x.id !== it.id));
    const { error } = await supabase.from("ingredients" as any).delete().eq("id", it.id);
    if (error) {
      setItems(prev);
      toast.error(error.message);
    } else {
      toast.success(t("ingredient_deleted"));
    }
    setSheet({ kind: "none" });
  };

  const adjustStock = async (it: Ingredient, delta: number) => {
    const next = Math.max(0, Number(it.current_stock) + delta);
    const prev = items;
    setItems((p) => p.map((x) => (x.id === it.id ? { ...x, current_stock: next } : x)));
    const { error } = await supabase.from("ingredients" as any).update({ current_stock: next }).eq("id", it.id);
    if (error) {
      setItems(prev);
      toast.error(error.message);
    } else {
      toast.success(t("stock_updated"));
    }
    setSheet({ kind: "none" });
  };

  if (!allowed) return null;

  return (
    <div className="px-5 pt-10 pb-24 space-y-5 relative">
      <header className="flex items-center gap-3">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">{t("ingredients")}</h1>
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-primary/10 text-primary">{items.length}</span>
      </header>

      <StockTabs active="ingredients" />

      <div className="relative">
        <Search className="h-4 w-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`${t("search")}...`}
          className="w-full pl-9 pr-3 py-2.5 rounded-2xl bg-card border border-border shadow-sm text-sm outline-none focus:border-primary"
        />
      </div>

      {lowCount > 0 && (
        <div className="rounded-2xl bg-amber-50 border border-amber-200 p-3 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-700 mt-0.5" />
          <p className="text-xs text-amber-800 leading-snug">
            <span className="font-semibold">{lowCount} {t("low_stock")}</span>
          </p>
        </div>
      )}

      {uncategorizedCount > 0 && (
        <button
          onClick={handleBulkCategorize}
          disabled={bulkBusy}
          className="w-full py-2.5 rounded-2xl bg-primary/10 border border-primary/30 text-primary text-sm font-semibold flex items-center justify-center gap-2 active:scale-[0.99] disabled:opacity-60"
        >
          <Sparkles className="h-4 w-4" />
          {bulkBusy ? t("categorizing") : `${t("auto_categorize_all")} (${uncategorizedCount})`}
        </button>
      )}

      {/* Category filter chips */}
      {allCategoryOptions.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
          <CategoryChip label={t("all_categories")} active={activeCategory === "__all__"} onClick={() => setActiveCategory("__all__")} />
          {uncategorizedCount > 0 && (
            <CategoryChip label="—" active={activeCategory === "__none__"} onClick={() => setActiveCategory("__none__")} />
          )}
          {allCategoryOptions.map((c) => (
            <CategoryChip key={c} label={translateCategory(c, lang)} active={activeCategory.toLowerCase() === c.toLowerCase()} onClick={() => setActiveCategory(c)} />
          ))}
        </div>
      )}

      {loading && (
        <div className="flex justify-center py-10">
          <div className="h-6 w-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
        </div>
      )}
      {!loading && filteredItems.length === 0 && (
        <p className="text-center text-sm text-muted-foreground py-10 px-4">{t("no_ingredients")}</p>
      )}

      <div className="space-y-3">
        {filteredItems.map((it) => {
          const isLow = Number(it.current_stock) < Number(it.min_stock);
          return (
            <article
              key={it.id}
              className={`rounded-2xl bg-card border p-4 space-y-3 shadow-[var(--shadow-card)] ${isLow ? "border-red-300" : "border-border/60"}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-foreground truncate">{it.name}</p>
                    {it.category && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">{translateCategory(it.category, lang)}</span>
                    )}
                    {isLow && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                        {t("low_stock")}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t("current_stock")}: <span className={`font-semibold ${isLow ? "text-red-600" : "text-foreground"}`}>{Number(it.current_stock)} {it.unit}</span>
                    {" · "}
                    {t("min_stock")}: <span className="font-medium">{Number(it.min_stock)} {it.unit}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("cost_per_unit")}: <span className="font-medium text-foreground">RM {Number(it.cost_per_unit).toFixed(2)}</span>
                    {it.supplier_id && supplierMap.get(it.supplier_id) && (
                      <> {" · "} {t("supplier")}: <span className="font-medium text-foreground">{supplierMap.get(it.supplier_id)}</span></>
                    )}
                  </p>
                  {it.notes && <p className="text-xs text-muted-foreground italic">{it.notes}</p>}
                </div>
                <div className="flex flex-col gap-1">
                  <button onClick={() => setSheet({ kind: "form", item: it })} className="p-1.5 rounded-full hover:bg-muted">
                    <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                  <button onClick={() => setSheet({ kind: "delete", item: it })} className="p-1.5 rounded-full hover:bg-red-50">
                    <Trash2 className="h-3.5 w-3.5 text-red-500" />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setSheet({ kind: "adjust", item: it, mode: "restock" })}
                  className="py-2 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-semibold flex items-center justify-center gap-1 active:scale-[0.98]"
                >
                  <Plus className="h-3.5 w-3.5" /> {t("restock")}
                </button>
                <button
                  onClick={() => setSheet({ kind: "adjust", item: it, mode: "use" })}
                  className="py-2 rounded-xl bg-orange-50 text-orange-700 text-xs font-semibold flex items-center justify-center gap-1 active:scale-[0.98]"
                >
                  <Minus className="h-3.5 w-3.5" /> {t("use")}
                </button>
              </div>
            </article>
          );
        })}
      </div>

      <button
        onClick={() => setSheet({ kind: "form" })}
        className="fixed fab-above-nav-sm right-5 h-14 w-14 rounded-full bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-lg flex items-center justify-center active:scale-95"
      >
        <Plus className="h-6 w-6" />
      </button>

      {sheet.kind === "form" && (
        <IngredientForm
          item={sheet.item}
          suppliers={suppliers}
          customCategories={customCategories}
          onCustomCategoryAdded={(c) => setCustomCategories((p) => [...p, c])}
          onClose={() => setSheet({ kind: "none" })}
          onSaved={() => { setSheet({ kind: "none" }); load(); }}
          userId={user?.id ?? ""}
        />
      )}

      {sheet.kind === "adjust" && (
        <AdjustSheet
          item={sheet.item}
          mode={sheet.mode}
          onClose={() => setSheet({ kind: "none" })}
          onConfirm={(qty) => adjustStock(sheet.item, sheet.mode === "restock" ? qty : -qty)}
        />
      )}

      {sheet.kind === "delete" && (
        <ConfirmSheet
          title={t("delete_ingredient")}
          subtitle={`${t("delete_confirm")} "${sheet.item.name}"?`}
          onClose={() => setSheet({ kind: "none" })}
          onConfirm={() => handleDelete(sheet.item)}
          variant="destructive"
        />
      )}
    </div>
  );
}

function CategoryChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border ${active ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground border-border/60"}`}
    >
      {label}
    </button>
  );
}

function IngredientForm({
  item, suppliers, customCategories, onCustomCategoryAdded, onClose, onSaved, userId,
}: {
  item?: Ingredient;
  suppliers: Supplier[];
  customCategories: string[];
  onCustomCategoryAdded: (c: string) => void;
  onClose: () => void;
  onSaved: () => void;
  userId: string;
}) {
  const { t, lang } = useI18n();
  const classifyFn = useServerFn(classifyIngredientsWithAi);
  const [name, setName] = useState(item?.name ?? "");
  const [unit, setUnit] = useState(item?.unit ?? "kg");
  const [currentStock, setCurrentStock] = useState(String(item?.current_stock ?? "0"));
  const [minStock, setMinStock] = useState(String(item?.min_stock ?? "0"));
  const [cost, setCost] = useState(String(item?.cost_per_unit ?? "0"));
  const [supplierId, setSupplierId] = useState(item?.supplier_id ?? "");
  const [notes, setNotes] = useState(item?.notes ?? "");
  const [category, setCategory] = useState(item?.category ?? "");
  const [customCatInput, setCustomCatInput] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [saving, setSaving] = useState(false);

  const catOptions = useMemo(() => {
    const merged = mergeCategories(customCategories);
    if (category && !merged.some((c) => c.toLowerCase() === category.toLowerCase())) merged.push(category);
    return merged;
  }, [customCategories, category]);

  const handleAiSuggest = async () => {
    if (!name.trim()) { toast.error(t("required_field")); return; }
    setAiBusy(true);
    try {
      const res = await classifyFn({
        data: { names: [name.trim()], existingCategories: mergeCategories(customCategories) },
      });
      const c = (res[0]?.category ?? "").trim();
      if (c) setCategory(c);
    } catch (e: any) {
      toast.error(String(e?.message ?? e ?? "AI failed"));
    } finally {
      setAiBusy(false);
    }
  };

  const save = async () => {
    if (!name.trim()) { toast.error(t("required_field")); return; }
    setSaving(true);
    const payload: any = {
      name: name.trim(),
      unit,
      current_stock: Number(currentStock) || 0,
      min_stock: Number(minStock) || 0,
      cost_per_unit: Number(cost) || 0,
      supplier_id: supplierId || null,
      notes: notes.trim() || null,
      category: category.trim() || null,
    };
    let error;
    if (item) {
      ({ error } = await supabase.from("ingredients" as any).update(payload).eq("id", item.id));
    } else {
      ({ error } = await supabase.from("ingredients" as any).insert({ ...payload, user_id: userId }));
    }

    // Persist a new category to user library so it shows up in pickers later
    const c = category.trim();
    if (!error && c && !mergeCategories(customCategories).some((x) => x.toLowerCase() === c.toLowerCase())) {
      await supabase
        .from("ingredient_categories" as any)
        .upsert({ user_id: userId, name: c }, { onConflict: "user_id,name", ignoreDuplicates: true });
      onCustomCategoryAdded(c);
    }

    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(item ? t("ingredient_updated") : t("ingredient_added"));
    onSaved();
  };

  return (
    <SheetShell onClose={onClose}>
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold">{item ? t("edit_ingredient") : t("add_ingredient")}</h3>
        <button onClick={onClose} className="p-1.5 rounded-full hover:bg-muted"><X className="h-4 w-4" /></button>
      </div>

      <SheetField label={t("ingredient_name")} value={name} onChange={setName} />

      <div className="space-y-1.5">
        <label className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground px-1">{t("unit")}</label>
        <select
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          className="w-full rounded-2xl bg-card border border-border shadow-sm px-4 py-3 text-sm text-foreground outline-none focus:border-primary"
        >
          {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <SheetField label={t("current_stock")} value={currentStock} onChange={setCurrentStock} type="number" />
        <SheetField label={t("min_stock")} value={minStock} onChange={setMinStock} type="number" />
      </div>

      <SheetField label={t("cost_per_unit")} value={cost} onChange={setCost} type="number" />

      <div className="space-y-1.5">
        <div className="flex items-center justify-between px-1">
          <label className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">{t("category")}</label>
          <button
            type="button"
            onClick={handleAiSuggest}
            disabled={aiBusy || !name.trim()}
            className="text-[11px] font-semibold text-primary flex items-center gap-1 disabled:opacity-50"
          >
            <Sparkles className="h-3 w-3" />
            {aiBusy ? t("categorizing") : t("ai_suggest_category")}
          </button>
        </div>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-full rounded-2xl bg-card border border-border shadow-sm px-4 py-3 text-sm text-foreground outline-none focus:border-primary"
        >
          <option value="">{t("select_category")}</option>
          {catOptions.map((c) => <option key={c} value={c}>{translateCategory(c, lang)}</option>)}
        </select>
        <div className="flex gap-2">
          <input
            value={customCatInput}
            onChange={(e) => setCustomCatInput(e.target.value)}
            placeholder={t("new_category")}
            className="flex-1 rounded-2xl bg-card border border-border shadow-sm px-4 py-2.5 text-sm outline-none focus:border-primary"
          />
          <button
            type="button"
            onClick={() => {
              const c = customCatInput.trim();
              if (!c) return;
              setCategory(c);
              setCustomCatInput("");
            }}
            className="px-3 rounded-2xl bg-primary/10 text-primary text-xs font-semibold"
          >
            +
          </button>
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground px-1">{t("supplier")}</label>
        <select
          value={supplierId}
          onChange={(e) => setSupplierId(e.target.value)}
          className="w-full rounded-2xl bg-card border border-border shadow-sm px-4 py-3 text-sm text-foreground outline-none focus:border-primary"
        >
          <option value="">—</option>
          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      <SheetField label={t("notes")} value={notes} onChange={setNotes} />

      <button
        disabled={saving}
        onClick={save}
        className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-primary to-primary/80 text-primary-foreground font-semibold active:scale-[0.99] disabled:opacity-50"
      >
        {saving ? "…" : t("save")}
      </button>
    </SheetShell>
  );
}

function AdjustSheet({
  item, mode, onClose, onConfirm,
}: {
  item: Ingredient;
  mode: "restock" | "use";
  onClose: () => void;
  onConfirm: (qty: number) => void;
}) {
  const { t } = useI18n();
  const [qty, setQty] = useState("1");
  return (
    <SheetShell onClose={onClose}>
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold">{mode === "restock" ? t("restock") : t("use")} — {item.name}</h3>
        <button onClick={onClose} className="p-1.5 rounded-full hover:bg-muted"><X className="h-4 w-4" /></button>
      </div>
      <p className="text-xs text-muted-foreground">
        {t("current_stock")}: <span className="font-semibold text-foreground">{Number(item.current_stock)} {item.unit}</span>
      </p>
      <SheetField label={`${t("quantity")} (${item.unit})`} value={qty} onChange={setQty} type="number" />
      <button
        onClick={() => {
          const q = Number(qty) || 0;
          if (q <= 0) { toast.error(t("required_field")); return; }
          if (mode === "use" && q > Number(item.current_stock)) { toast.error(t("cant_remove_more")); return; }
          onConfirm(q);
        }}
        className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-primary to-primary/80 text-primary-foreground font-semibold active:scale-[0.99]"
      >
        {t("confirm")}
      </button>
    </SheetShell>
  );
}