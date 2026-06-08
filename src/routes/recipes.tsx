import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, Pencil, Trash2, X, ChefHat, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import { SheetShell, SheetField, ConfirmSheet } from "@/components/InventorySheets";
import { StockTabs } from "@/components/StockTabs";

export const Route = createFileRoute("/recipes")({ component: RecipesPage });

type Ingredient = {
  id: string; name: string; unit: string; cost_per_unit: number; current_stock: number;
};
type Product = { id: string; name: string; price: number; image_url: string | null };
type RecipeIngredient = {
  id?: string;
  ingredient_id: string;
  quantity: number;
  unit: string;
};
type Recipe = {
  id: string;
  user_id: string;
  product_id: string;
  name: string;
  serving_size: number;
  notes: string | null;
  recipe_ingredients?: RecipeIngredient[];
};

type Sheet =
  | { kind: "none" }
  | { kind: "form"; item?: Recipe }
  | { kind: "delete"; item: Recipe };

function RecipesPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheet, setSheet] = useState<Sheet>({ kind: "none" });
  const [search, setSearch] = useState("");

  const load = async () => {
    const [{ data: rec, error: e1 }, { data: ing }, { data: prod }] = await Promise.all([
      supabase.from("recipes" as any).select("*, recipe_ingredients(*)").order("created_at", { ascending: false }),
      supabase.from("ingredients" as any).select("id, name, unit, cost_per_unit, current_stock").order("name"),
      supabase.from("inventory").select("id, name, price, image_url").order("name"),
    ]);
    if (e1) toast.error(e1.message);
    setRecipes((rec ?? []) as unknown as Recipe[]);
    setIngredients((ing ?? []) as unknown as Ingredient[]);
    setProducts((prod ?? []) as unknown as Product[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const ingMap = useMemo(() => {
    const m = new Map<string, Ingredient>();
    ingredients.forEach((i) => m.set(i.id, i));
    return m;
  }, [ingredients]);
  const prodMap = useMemo(() => {
    const m = new Map<string, Product>();
    products.forEach((p) => m.set(p.id, p));
    return m;
  }, [products]);

  const recipeCost = (r: Recipe): number => {
    const total = (r.recipe_ingredients ?? []).reduce((sum, ri) => {
      const ing = ingMap.get(ri.ingredient_id);
      return sum + (ing ? Number(ing.cost_per_unit) * Number(ri.quantity) : 0);
    }, 0);
    return total / Math.max(1, Number(r.serving_size) || 1);
  };

  const filteredRecipes = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return recipes;
    return recipes.filter((r) => {
      const prod = prodMap.get(r.product_id);
      return (
        r.name.toLowerCase().includes(q) ||
        (prod?.name ?? "").toLowerCase().includes(q)
      );
    });
  }, [recipes, search, prodMap]);

  const handleDelete = async (it: Recipe) => {
    const { error } = await supabase.from("recipes" as any).delete().eq("id", it.id);
    if (error) { toast.error(error.message); return; }
    toast.success(t("recipe_deleted"));
    setSheet({ kind: "none" });
    load();
  };

  return (
    <div className="px-5 pt-10 pb-24 space-y-5 relative">
      <header className="flex items-center gap-3">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">{t("recipes")}</h1>
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-primary/10 text-primary">{recipes.length}</span>
      </header>

      <StockTabs active="recipes" />

      <div className="relative">
        <Search className="h-4 w-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`${t("search")}...`}
          className="w-full pl-9 pr-3 py-2.5 rounded-2xl bg-muted/40 border border-border/60 text-sm outline-none focus:border-primary"
        />
      </div>

      {loading && (
        <div className="flex justify-center py-10">
          <div className="h-6 w-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
        </div>
      )}
      {!loading && filteredRecipes.length === 0 && (
        <p className="text-center text-sm text-muted-foreground py-10 px-4">{t("no_recipes")}</p>
      )}

      <div className="space-y-3">
        {filteredRecipes.map((r) => {
          const prod = prodMap.get(r.product_id);
          const cost = recipeCost(r);
          const price = prod ? Number(prod.price) : 0;
          const profit = price - cost;
          const margin = price > 0 ? (profit / price) * 100 : 0;
          const good = margin >= 30;
          const losing = profit < 0;
          return (
            <article key={r.id} className="rounded-2xl bg-card border border-border/60 p-4 space-y-3 shadow-[var(--shadow-card)]">
              <div className="flex items-start gap-3">
                <div className="h-14 w-14 shrink-0 rounded-xl bg-muted/50 border border-border/60 overflow-hidden flex items-center justify-center">
                  {prod?.image_url ? (
                    <img src={prod.image_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <ChefHat className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0 space-y-0.5">
                  <p className="text-sm font-semibold text-foreground truncate">{r.name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {prod?.name ?? "—"} · {(r.recipe_ingredients ?? []).length} {t("ingredients_count")}
                  </p>
                </div>
                <div className="flex flex-col gap-1">
                  <button onClick={() => setSheet({ kind: "form", item: r })} className="p-1.5 rounded-full hover:bg-muted">
                    <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                  <button onClick={() => setSheet({ kind: "delete", item: r })} className="p-1.5 rounded-full hover:bg-red-50">
                    <Trash2 className="h-3.5 w-3.5 text-red-500" />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-muted/40 p-2">
                  <p className="text-[10px] text-muted-foreground">{t("cost_per_serving")}</p>
                  <p className="text-sm font-bold text-foreground">RM {cost.toFixed(2)}</p>
                </div>
                <div className="rounded-xl bg-muted/40 p-2">
                  <p className="text-[10px] text-muted-foreground">{t("selling_price")}</p>
                  <p className="text-sm font-bold text-foreground">RM {price.toFixed(2)}</p>
                </div>
                <div className={`rounded-xl p-2 ${losing ? "bg-red-50" : good ? "bg-emerald-50" : "bg-amber-50"}`}>
                  <p className="text-[10px] text-muted-foreground">{t("profit_margin")}</p>
                  <p className={`text-sm font-bold ${losing ? "text-red-600" : good ? "text-emerald-700" : "text-amber-700"}`}>
                    {margin.toFixed(0)}%
                  </p>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <button
        onClick={() => setSheet({ kind: "form" })}
        className="fixed bottom-20 right-5 h-14 w-14 rounded-full bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-lg flex items-center justify-center active:scale-95"
      >
        <Plus className="h-6 w-6" />
      </button>

      {sheet.kind === "form" && (
        <RecipeForm
          item={sheet.item}
          products={products}
          ingredients={ingredients}
          onClose={() => setSheet({ kind: "none" })}
          onSaved={() => { setSheet({ kind: "none" }); load(); }}
          userId={user?.id ?? ""}
        />
      )}

      {sheet.kind === "delete" && (
        <ConfirmSheet
          title={t("delete_recipe")}
          subtitle={sheet.item.name}
          onClose={() => setSheet({ kind: "none" })}
          onConfirm={() => handleDelete(sheet.item)}
          variant="destructive"
        />
      )}
    </div>
  );
}

function RecipeForm({
  item, products, ingredients, onClose, onSaved, userId,
}: {
  item?: Recipe;
  products: Product[];
  ingredients: Ingredient[];
  onClose: () => void;
  onSaved: () => void;
  userId: string;
}) {
  const { t } = useI18n();
  const [productId, setProductId] = useState(item?.product_id ?? "");
  const [name, setName] = useState(item?.name ?? "");
  const [serving, setServing] = useState(String(item?.serving_size ?? "1"));
  const [notes, setNotes] = useState(item?.notes ?? "");
  const [rows, setRows] = useState<RecipeIngredient[]>(item?.recipe_ingredients ?? []);
  const [saving, setSaving] = useState(false);

  const ingMap = useMemo(() => {
    const m = new Map<string, Ingredient>();
    ingredients.forEach((i) => m.set(i.id, i));
    return m;
  }, [ingredients]);

  const onProductChange = (id: string) => {
    setProductId(id);
    if (!item && !name.trim()) {
      const p = products.find((x) => x.id === id);
      if (p) setName(p.name);
    }
  };

  const addRow = () => setRows((r) => [...r, { ingredient_id: "", quantity: 1, unit: "" }]);
  const updateRow = (i: number, patch: Partial<RecipeIngredient>) =>
    setRows((r) => r.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  const removeRow = (i: number) => setRows((r) => r.filter((_, idx) => idx !== i));

  const totalCost = rows.reduce((sum, r) => {
    const ing = ingMap.get(r.ingredient_id);
    return sum + (ing ? Number(ing.cost_per_unit) * Number(r.quantity || 0) : 0);
  }, 0);
  const servings = Math.max(1, Number(serving) || 1);
  const costPerServing = totalCost / servings;
  const product = products.find((p) => p.id === productId);
  const sellingPrice = product ? Number(product.price) : 0;
  const grossProfit = sellingPrice - costPerServing;
  const margin = sellingPrice > 0 ? (grossProfit / sellingPrice) * 100 : 0;

  const save = async () => {
    if (!productId) { toast.error(t("select_product")); return; }
    if (!name.trim()) { toast.error(t("required_field")); return; }
    setSaving(true);
    const payload: any = {
      product_id: productId,
      name: name.trim(),
      serving_size: servings,
      notes: notes.trim() || null,
    };
    let recipeId = item?.id;
    let err;
    if (item) {
      ({ error: err } = await supabase.from("recipes" as any).update(payload).eq("id", item.id));
    } else {
      const { data, error } = await supabase.from("recipes" as any).insert({ ...payload, user_id: userId }).select("id").single();
      err = error;
      recipeId = (data as any)?.id;
    }
    if (err || !recipeId) { setSaving(false); toast.error(err?.message ?? "Error"); return; }

    // Replace recipe_ingredients
    await supabase.from("recipe_ingredients" as any).delete().eq("recipe_id", recipeId);
    const validRows = rows.filter((r) => r.ingredient_id && Number(r.quantity) > 0);
    if (validRows.length > 0) {
      const { error: e2 } = await supabase.from("recipe_ingredients" as any).insert(
        validRows.map((r) => ({
          recipe_id: recipeId,
          ingredient_id: r.ingredient_id,
          quantity: Number(r.quantity),
          unit: r.unit || ingMap.get(r.ingredient_id)?.unit || "",
        }))
      );
      if (e2) { setSaving(false); toast.error(e2.message); return; }
    }
    setSaving(false);
    toast.success(t("recipe_saved"));
    onSaved();
  };

  return (
    <SheetShell onClose={onClose}>
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold">{item ? t("edit_recipe") : t("add_recipe")}</h3>
        <button onClick={onClose} className="p-1.5 rounded-full hover:bg-muted"><X className="h-4 w-4" /></button>
      </div>

      <div className="space-y-1.5">
        <label className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground px-1">{t("select_product")}</label>
        <select
          value={productId}
          onChange={(e) => onProductChange(e.target.value)}
          className="w-full rounded-2xl bg-muted/40 border border-border/60 px-4 py-3 text-sm text-foreground outline-none focus:border-primary"
        >
          <option value="">—</option>
          {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      <SheetField label={t("recipe_name")} value={name} onChange={setName} />

      <div className="space-y-1.5">
        <label className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground px-1">{t("serving_size")}</label>
        <input
          type="number"
          value={serving}
          onChange={(e) => setServing(e.target.value)}
          className="w-full rounded-2xl bg-muted/40 border border-border/60 px-4 py-3 text-sm text-foreground outline-none focus:border-primary"
        />
        <p className="text-[11px] text-muted-foreground px-1">{t("serving_size_hint")}</p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground px-1">{t("ingredients")}</label>
          <button type="button" onClick={addRow} className="text-xs font-semibold text-primary">+ {t("add_ingredient_to_recipe")}</button>
        </div>
        {rows.length === 0 && (
          <p className="text-xs text-muted-foreground italic px-1">{t("no_ingredients_added")}</p>
        )}
        {rows.map((r, i) => {
          const ing = ingMap.get(r.ingredient_id);
          const lineCost = ing ? Number(ing.cost_per_unit) * Number(r.quantity || 0) : 0;
          return (
            <div key={i} className="rounded-xl bg-muted/30 border border-border/60 p-2 space-y-2">
              <div className="flex gap-2 items-center">
                <select
                  value={r.ingredient_id}
                  onChange={(e) => {
                    const newId = e.target.value;
                    const ni = ingMap.get(newId);
                    updateRow(i, { ingredient_id: newId, unit: ni?.unit ?? r.unit });
                  }}
                  className="flex-1 min-w-0 rounded-lg bg-card border border-border/60 px-2 py-2 text-xs"
                >
                  <option value="">{t("select_ingredient")}</option>
                  {ingredients.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
                <button type="button" onClick={() => removeRow(i)} className="p-1.5 rounded-full hover:bg-red-50">
                  <X className="h-3.5 w-3.5 text-red-500" />
                </button>
              </div>
              <div className="flex gap-2 items-center">
                <input
                  type="number"
                  value={String(r.quantity)}
                  onChange={(e) => updateRow(i, { quantity: Number(e.target.value) || 0 })}
                  className="w-20 rounded-lg bg-card border border-border/60 px-2 py-2 text-xs"
                />
                <span className="text-xs text-muted-foreground">{r.unit || ing?.unit || ""}</span>
                <span className="ml-auto text-xs font-semibold text-foreground">
                  {t("estimated_cost")}: RM {lineCost.toFixed(2)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <SheetField label={t("notes")} value={notes} onChange={setNotes} />

      <div className="rounded-2xl bg-gradient-to-br from-primary/5 to-primary/10 border border-primary/20 p-3 space-y-2">
        <p className="text-xs font-bold text-foreground">{t("cost_analysis")}</p>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <span className="text-muted-foreground">{t("total_ingredient_cost")}</span>
          <span className="text-right font-semibold">RM {totalCost.toFixed(2)}</span>
          <span className="text-muted-foreground">{t("cost_per_serving")}</span>
          <span className="text-right font-semibold">RM {costPerServing.toFixed(2)}</span>
          <span className="text-muted-foreground">{t("selling_price")}</span>
          <span className="text-right font-semibold">RM {sellingPrice.toFixed(2)}</span>
          <span className="text-muted-foreground">{t("gross_profit")}</span>
          <span className={`text-right font-semibold ${grossProfit < 0 ? "text-red-600" : "text-emerald-700"}`}>
            RM {grossProfit.toFixed(2)}
          </span>
          <span className="text-muted-foreground">{t("profit_margin")}</span>
          <span className={`text-right font-bold ${margin < 0 ? "text-red-600" : margin >= 30 ? "text-emerald-700" : "text-amber-700"}`}>
            {margin.toFixed(1)}%
          </span>
        </div>
      </div>

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