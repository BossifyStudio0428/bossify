import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, Package, Receipt } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import { calculateWeightedAverageCost, calculateUnitLandedCost } from "@/lib/orderMath";
import { logInventoryChange } from "@/lib/inventoryAudit";
import { adjustStockAtomic } from "@/lib/inventoryStock";

export const Route = createFileRoute("/add-cost")({ component: AddCostPage });

type Mode = "pick" | "product" | "expense";
type ExpenseCategory = "advertising" | "affiliate_influencer" | "subscriptions" | "ai_software" | "other";

const EXPENSE_CATS: ExpenseCategory[] = ["advertising", "affiliate_influencer", "subscriptions", "ai_software", "other"];

function catLabel(c: ExpenseCategory, lang: string) {
  const map: Record<ExpenseCategory, { en: string; zh: string; ms: string }> = {
    advertising: { en: "Advertising", zh: "广告费", ms: "Iklan" },
    affiliate_influencer: { en: "Affiliate / Influencer", zh: "达人推广费", ms: "Afiliasi / Influencer" },
    subscriptions: { en: "Subscriptions", zh: "工具订阅", ms: "Langganan" },
    ai_software: { en: "AI / Software", zh: "AI / 软件费", ms: "AI / Perisian" },
    other: { en: "Other", zh: "其他", ms: "Lain-lain" },
  };
  const e = map[c];
  return lang === "zh" ? e.zh : lang === "ms" ? e.ms : e.en;
}

function AddCostPage() {
  const { user } = useAuth();
  const { lang } = useI18n();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("pick");

  // --- Product cost (Receive Stock) fields ---
  const [items, setItems] = useState<Array<{ id: string; name: string; cost_price: number; stock: number }>>([]);
  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState("");
  const [purchaseAmount, setPurchaseAmount] = useState("");
  const [landedExtra, setLandedExtra] = useState("");
  const [supplier, setSupplier] = useState("");

  // --- Expense (operating_expenses) fields ---
  const [category, setCategory] = useState<ExpenseCategory>("ai_software");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [incurredAt, setIncurredAt] = useState(() => new Date().toISOString().slice(0, 10));

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from("inventory").select("id,name,cost_price,stock").eq("user_id", user.id).order("name").then(({ data }) => {
      setItems(((data ?? []) as any[]).map((i) => ({ id: i.id, name: i.name, cost_price: Number(i.cost_price ?? 0), stock: Number(i.stock ?? 0) })));
    });
  }, [user?.id]);

  const submitProductCost = async () => {
    if (!user) return;
    const item = items.find((i) => i.id === productId);
    const q = Number(qty);
    const amt = Number(purchaseAmount);
    if (!item || q <= 0 || amt < 0) {
      toast.error(lang === "zh" ? "请选商品并填写正确的数量和金额" : "Select a product and enter valid quantity/amount");
      return;
    }
    setSaving(true);
    try {
      const unitLandedCost = calculateUnitLandedCost(amt, Number(landedExtra) || 0, q);
      const newCost = calculateWeightedAverageCost({ existingStock: item.stock, existingCostPrice: item.cost_price, quantityReceived: q, unitLandedCost });
      let newStock = item.stock + q;

      const { error: e1 } = await supabase.from("stock_receipts" as any).insert({
        user_id: user.id, product_id: item.id, quantity_received: q, purchase_amount: amt,
        landed_extra_costs: Number(landedExtra) || 0, unit_landed_cost: unitLandedCost,
        cost_before: item.cost_price, cost_after: newCost, supplier_name: supplier || null,
      });
      if (e1) throw new Error(e1.message);

      // Stock goes up by the received quantity in one database step.
      const recv = await adjustStockAtomic(item.id, q, newCost);
      if (recv.error || recv.stock === null) throw new Error(recv.error ?? "Failed");
      newStock = recv.stock;

      logInventoryChange({ userId: user.id, productId: item.id, productName: item.name, fieldName: "stock", oldValue: item.stock, newValue: newStock, source: "add_cost_page" });
      logInventoryChange({ userId: user.id, productId: item.id, productName: item.name, fieldName: "cost_price", oldValue: item.cost_price, newValue: newCost, source: "add_cost_page" });

      toast.success(lang === "zh" ? `已记录,成本更新为 RM ${newCost.toFixed(2)}` : `Cost updated to RM ${newCost.toFixed(2)}`);
      navigate({ to: "/" });
    } catch (e: any) {
      toast.error(e?.message || "Failed");
    } finally {
      setSaving(false);
    }
  };

  const submitExpense = async () => {
    if (!user) return;
    const amt = Number(amount);
    if (amt <= 0) {
      toast.error(lang === "zh" ? "请填写正确的金额" : "Enter a valid amount");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from("operating_expenses" as any).insert({
        user_id: user.id, category, amount: amt, description: description.trim() || null, incurred_at: incurredAt,
      });
      if (error) throw new Error(error.message);
      toast.success(lang === "zh" ? "已记录" : "Recorded");
      navigate({ to: "/" });
    } catch (e: any) {
      toast.error(e?.message || "Failed");
    } finally {
      setSaving(false);
    }
  };

  const title = lang === "zh" ? "记一笔成本" : lang === "ms" ? "Rekod Kos" : "Add a Cost";

  return (
    <div className="px-4 pt-4 pb-24 space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={() => (mode === "pick" ? navigate({ to: "/" }) : setMode("pick"))} className="h-9 w-9 rounded-full flex items-center justify-center text-muted-foreground active:scale-95 transition-transform">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-bold text-foreground">{title}</h1>
        {mode === "expense" && (
          <Link to="/expenses" className="ml-auto text-xs font-semibold text-primary underline">
            {lang === "zh" ? "查看/修改记录" : lang === "ms" ? "Lihat/Edit rekod" : "View / edit records"}
          </Link>
        )}
      </div>

      {mode === "pick" && (
        <div className="space-y-2">
          <button onClick={() => setMode("product")} className="w-full flex items-center gap-3 rounded-2xl bg-card border border-border/60 p-4 active:scale-[0.98] transition-transform">
            <Package className="h-5 w-5 text-primary" />
            <div className="text-left">
              <p className="text-sm font-semibold">{lang === "zh" ? "商品进货成本" : lang === "ms" ? "Kos produk" : "Product purchase cost"}</p>
              <p className="text-xs text-muted-foreground">{lang === "zh" ? "收货,更新库存跟加权平均成本" : "Receive stock, updates weighted-average cost"}</p>
            </div>
          </button>
          <button onClick={() => setMode("expense")} className="w-full flex items-center gap-3 rounded-2xl bg-card border border-border/60 p-4 active:scale-[0.98] transition-transform">
            <Receipt className="h-5 w-5 text-primary" />
            <div className="text-left">
              <p className="text-sm font-semibold">{lang === "zh" ? "营业费用" : lang === "ms" ? "Perbelanjaan operasi" : "Operating expense"}</p>
              <p className="text-xs text-muted-foreground">{lang === "zh" ? "广告费、订阅费、AI 费用等" : "Ads, subscriptions, AI fees, etc"}</p>
            </div>
          </button>
        </div>
      )}

      {mode === "product" && (
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">{lang === "zh" ? "商品" : "Product"}</label>
            <select value={productId} onChange={(e) => setProductId(e.target.value)} className="w-full rounded-xl bg-card border border-border/60 px-3 py-2.5 text-sm">
              <option value="">{lang === "zh" ? "选择商品" : "Select a product"}</option>
              {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">{lang === "zh" ? "收到数量" : "Quantity received"}</label>
            <input type="number" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} className="w-full rounded-xl bg-card border border-border/60 px-3 py-2.5 text-sm" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">{lang === "zh" ? "这批货总价 (RM)" : "Purchase amount (RM)"}</label>
            <input type="number" inputMode="decimal" value={purchaseAmount} onChange={(e) => setPurchaseAmount(e.target.value)} className="w-full rounded-xl bg-card border border-border/60 px-3 py-2.5 text-sm" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">{lang === "zh" ? "运费/清关等额外费用 (RM，可选)" : "Freight/duty (RM, optional)"}</label>
            <input type="number" inputMode="decimal" value={landedExtra} onChange={(e) => setLandedExtra(e.target.value)} className="w-full rounded-xl bg-card border border-border/60 px-3 py-2.5 text-sm" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">{lang === "zh" ? "供应商（可选）" : "Supplier (optional)"}</label>
            <input value={supplier} onChange={(e) => setSupplier(e.target.value)} className="w-full rounded-xl bg-card border border-border/60 px-3 py-2.5 text-sm" />
          </div>
          <button disabled={saving} onClick={submitProductCost} className="w-full py-3 rounded-2xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-60">
            {saving ? "…" : (lang === "zh" ? "确认收货" : "Confirm")}
          </button>
        </div>
      )}

      {mode === "expense" && (
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">{lang === "zh" ? "分类" : "Category"}</label>
            <div className="flex flex-wrap gap-2">
              {EXPENSE_CATS.map((c) => (
                <button key={c} onClick={() => setCategory(c)} className={`px-3 py-1.5 rounded-full text-xs font-semibold ${category === c ? "bg-primary text-primary-foreground" : "bg-card border border-border/60 text-muted-foreground"}`}>
                  {catLabel(c, lang)}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">{lang === "zh" ? "金额 (RM)" : "Amount (RM)"}</label>
            <input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full rounded-xl bg-card border border-border/60 px-3 py-2.5 text-sm" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">{lang === "zh" ? "日期" : "Date"}</label>
            <input type="date" value={incurredAt} onChange={(e) => setIncurredAt(e.target.value)} className="w-full rounded-xl bg-card border border-border/60 px-3 py-2.5 text-sm" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">{lang === "zh" ? "备注（可选）" : "Note (optional)"}</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} className="w-full rounded-xl bg-card border border-border/60 px-3 py-2.5 text-sm" />
          </div>
          <button disabled={saving} onClick={submitExpense} className="w-full py-3 rounded-2xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-60">
            {saving ? "…" : (lang === "zh" ? "确认记录" : "Confirm")}
          </button>
        </div>
      )}
    </div>
  );
}