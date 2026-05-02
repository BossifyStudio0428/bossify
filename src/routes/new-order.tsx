import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase, type OrderStatus, type InventoryRow } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import { renderTemplate, buildWhatsAppLink, DEFAULT_ORDER_TPL } from "@/lib/wa";
import { createNotification } from "@/lib/notify";
import { useSubscription, FREE_LIMITS } from "@/contexts/SubscriptionContext";
import { safeLocalStorage } from "@/lib/safeStorage";

export const Route = createFileRoute("/new-order")({ component: NewOrderPage });

const COUNTRIES: { code: string; flag: string; name: string }[] = [
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

function buildFullPhone(countryCode: string, local: string): string {
  // Strip non-digits, drop leading 0
  const digits = local.replace(/\D/g, "").replace(/^0+/, "");
  if (!digits) return "";
  return countryCode + digits;
}

const statuses: { key: OrderStatus; bg: string; text: string; ring: string }[] = [
  { key: "Paid", bg: "bg-emerald-50", text: "text-emerald-700", ring: "ring-emerald-500" },
  { key: "Unpaid", bg: "bg-red-50", text: "text-red-600", ring: "ring-red-500" },
  { key: "Pending", bg: "bg-amber-50", text: "text-amber-700", ring: "ring-amber-500" },
];

function genCode() {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const rnd = String(Math.floor(Math.random() * 1000)).padStart(3, "0");
  return `ORD-${ymd}-${rnd}`;
}

function NewOrderPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const { isPro, ordersUsed, ordersLimit, ordersRemaining, showUpgrade } = useSubscription();
  const statusLabels: Record<OrderStatus, string> = {
    Paid: `${t("paid")} ✓`,
    Unpaid: t("unpaid"),
    Pending: t("pending"),
  };
  const [status, setStatus] = useState<OrderStatus>("Unpaid");
  const [form, setForm] = useState({
    customer_name: "", phone: "", product: "", quantity: "1", amount: "", notes: "",
  });
  const [countryCode, setCountryCode] = useState<string>(() => {
    if (typeof window === "undefined") return "60";
    return safeLocalStorage.getItem("bossify_country_code") || "60";
  });
  useEffect(() => {
    if (typeof window !== "undefined") safeLocalStorage.setItem("bossify_country_code", countryCode);
  }, [countryCode]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [inventory, setInventory] = useState<InventoryRow[]>([]);
  const [showSuggest, setShowSuggest] = useState(false);
  const [orderTpl, setOrderTpl] = useState<string>(DEFAULT_ORDER_TPL);

  useEffect(() => {
    (async () => {
      const [{ data: inv }, { data: pref }] = await Promise.all([
        supabase.from("inventory").select("*"),
        supabase.from("user_preferences").select("wa_order_template").maybeSingle(),
      ]);
      setInventory((inv ?? []) as InventoryRow[]);
      if (pref?.wa_order_template) setOrderTpl(pref.wa_order_template);
    })();
  }, []);

  const upd = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((p) => ({ ...p, [k]: e.target.value }));
    if (errors[k]) setErrors((p) => ({ ...p, [k]: "" }));
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.customer_name.trim()) e.customer_name = t("required_field");
    if (!form.product.trim()) e.product = t("required_field");
    if (!form.quantity || Number(form.quantity) < 1) e.quantity = t("required_field");
    if (!form.amount || Number(form.amount) < 0) e.amount = t("required_field");
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const checkLimit = () => {
    if (!isPro && ordersUsed >= FREE_LIMITS.ordersPerMonth) {
      showUpgrade(t("limit_orders"));
      return false;
    }
    return true;
  };

  const persist = async (): Promise<{ id: string; code: string } | null> => {
    if (!user) return null;
    const code = genCode();
    const amount = Number(form.amount) || 0;
    const quantity = Number(form.quantity) || 1;
    const fullPhone = buildFullPhone(countryCode, form.phone);

    const { data: inserted, error: orderErr } = await supabase
      .from("orders")
      .insert({
        user_id: user.id,
        code,
        customer_name: form.customer_name.trim(),
        phone: fullPhone || null,
        product: form.product.trim(),
        quantity,
        amount,
        status,
        notes: form.notes.trim() || null,
      })
      .select("id, code")
      .single();

    if (orderErr || !inserted) {
      toast.error(t("order_save_failed"));
      return null;
    }

    // Upsert customer by phone (only if phone provided)
    if (fullPhone) {
      const phone = fullPhone;
      const { data: existing } = await supabase
        .from("customers")
        .select("*")
        .eq("user_id", user.id)
        .eq("phone", phone)
        .maybeSingle();
      if (existing) {
        await supabase.from("customers").update({
          total_orders: (existing.total_orders ?? 0) + 1,
          total_spent: Number(existing.total_spent ?? 0) + amount,
          last_order_at: new Date().toISOString(),
          name: existing.name || form.customer_name.trim(),
        }).eq("id", existing.id);
      } else {
        await supabase.from("customers").insert({
          user_id: user.id,
          name: form.customer_name.trim(),
          phone,
          total_orders: 1,
          total_spent: amount,
          last_order_at: new Date().toISOString(),
        });
      }
    }

    return { id: inserted.id, code: inserted.code };
  };

  const buildMessage = (code: string) => renderTemplate(orderTpl, {
    customer_name: form.customer_name || "Customer",
    code,
    product: form.product || "—",
    quantity: form.quantity || "1",
    amount: form.amount ? Number(form.amount).toFixed(2) : "0.00",
    status,
    notes: form.notes,
  });

  const livePreview = buildMessage("ORD-PREVIEW-001");

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    if (!checkLimit()) return;
    setSaving(true);
    const res = await persist();
    setSaving(false);
    if (!res) return;
    toast.success(t("order_saved"));
    if (user) {
      await createNotification({
        user_id: user.id, type: "new_order",
        title: t("notif_new_order").replace("{code}", res.code).replace("{name}", form.customer_name),
        message: `RM ${Number(form.amount).toFixed(2)} · ${form.product}`,
        link: "/orders",
      });
    }
    setForm({ customer_name: "", phone: "", product: "", quantity: "1", amount: "", notes: "" });
    setStatus("Unpaid");
    setTimeout(() => navigate({ to: "/orders" }), 1500);
  };

  const saveAndWhatsApp = async () => {
    if (!validate()) return;
    if (!checkLimit()) return;
    if (!form.phone.trim()) {
      alert(t("enter_phone_for_wa"));
      return;
    }
    setSaving(true);
    const res = await persist();
    setSaving(false);
    if (!res) return;
    toast.success(t("order_saved"));
    const msg = buildMessage(res.code);
    if (user) {
      await createNotification({
        user_id: user.id, type: "new_order",
        title: t("notif_new_order").replace("{code}", res.code).replace("{name}", form.customer_name),
        message: `RM ${Number(form.amount).toFixed(2)} · ${form.product}`,
        link: "/orders",
      });
    }
    window.open(buildWhatsAppLink(buildFullPhone(countryCode, form.phone), msg), "_blank");
    setTimeout(() => navigate({ to: "/orders" }), 800);
  };

  const productMatches =
    form.product.length > 0
      ? inventory.filter((i) => i.name.toLowerCase().includes(form.product.toLowerCase())).slice(0, 5)
      : [];

  return (
    <div className="px-5 pt-10 pb-6 space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          {t("new_order")} <span className="text-primary">✦</span>
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("fill_details")}</p>
      </header>

      <form className="space-y-5" onSubmit={save} noValidate>
        <Field label={t("customer_name")} icon="👤" placeholder="e.g. Siti Aminah" value={form.customer_name} onChange={upd("customer_name")} error={errors.customer_name} />
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground px-1">
            {t("phone_number")}
          </label>
          <div className="flex gap-2">
            <div className="relative shrink-0">
              <select
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value)}
                className="appearance-none h-full rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] pl-3 pr-7 py-3 text-sm text-foreground outline-none focus:border-primary focus:ring-4 focus:ring-primary/15 transition"
                aria-label="Country code"
              >
                {COUNTRIES.map((c) => (
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
                placeholder="123456789"
                value={form.phone}
                onChange={upd("phone")}
                className="w-full rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] pl-10 pr-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/70 outline-none focus:border-primary focus:ring-4 focus:ring-primary/15 transition"
              />
            </div>
          </div>
          {form.phone.trim() && (
            <p className="text-[10px] text-muted-foreground px-1">
              → +{buildFullPhone(countryCode, form.phone)}
            </p>
          )}
        </div>

        <div className="space-y-1.5 relative">
          <label className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground px-1">{t("product")}</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-base">🛍️</span>
            <input
              value={form.product}
              onChange={(e) => { upd("product")(e); setShowSuggest(true); }}
              onFocus={() => setShowSuggest(true)}
              onBlur={() => setTimeout(() => setShowSuggest(false), 150)}
              placeholder="..."
              className={`w-full rounded-2xl bg-card border shadow-[var(--shadow-card)] pl-10 pr-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/70 outline-none focus:border-primary focus:ring-4 focus:ring-primary/15 transition ${errors.product ? "border-red-400" : "border-border/60"}`}
            />
          </div>
          {errors.product && <p className="text-[11px] text-red-500 px-1">{errors.product}</p>}
          {showSuggest && productMatches.length > 0 && (
            <div className="absolute z-10 left-0 right-0 top-full mt-1 rounded-xl bg-card border border-border/60 shadow-lg overflow-hidden">
              {productMatches.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { setForm((p) => ({ ...p, product: m.name })); setShowSuggest(false); }}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-muted/60"
                >
                  {m.name} <span className="text-xs text-muted-foreground">· {m.stock} {m.unit}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <Field label={t("quantity")} icon="#" placeholder="1" value={form.quantity} onChange={upd("quantity")} type="number" error={errors.quantity} />
        <Field label={t("price")} icon="💰" placeholder="0.00" value={form.amount} onChange={upd("amount")} type="number" error={errors.amount} />

        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground px-1">
            {t("payment_status")}
          </p>
          <div className="grid grid-cols-3 gap-2">
            {statuses.map((s) => {
              const sel = status === s.key;
              return (
                <button
                  key={s.key} type="button" onClick={() => setStatus(s.key)}
                  className={`py-3 rounded-2xl text-sm font-semibold transition-all ${s.bg} ${s.text} ${sel ? `ring-2 ${s.ring}` : "ring-0"}`}
                >
                  {statusLabels[s.key]}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground px-1">
            {t("notes")}
          </label>
          <textarea
            rows={3} value={form.notes} onChange={upd("notes")}
            placeholder={t("add_special")}
            className="w-full rounded-2xl bg-muted/60 border border-border/60 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/70 outline-none focus:border-primary focus:ring-4 focus:ring-primary/15 transition resize-none"
          />
        </div>

        <div className="space-y-3 pt-2">
          <button
            type="submit" disabled={saving}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-primary to-primary/80 text-primary-foreground font-bold text-sm shadow-[var(--shadow-soft)] active:scale-[0.99] transition-transform disabled:opacity-60"
          >
            {saving ? t("saving") : t("save_order")}
          </button>
          {!isPro && (
            <p className="text-center text-[11px] text-muted-foreground">
              {ordersUsed} / {ordersLimit} {t("orders_used")}
              {ordersRemaining <= 5 && ordersRemaining > 0 && (
                <span className="ml-1 text-amber-600 font-semibold">· {ordersRemaining} left</span>
              )}
            </p>
          )}
          <button
            type="button"
            onClick={saveAndWhatsApp}
            disabled={saving}
            className="w-full py-4 rounded-2xl bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold text-sm active:scale-[0.99] transition-transform disabled:opacity-60"
          >
            📲 {t("save_whatsapp")}
          </button>
        </div>

        {(form.customer_name || form.product) && (
          <div className="rounded-2xl bg-emerald-50/60 border border-emerald-200 p-3">
            <p className="text-[10px] uppercase font-semibold text-emerald-700 mb-1">{t("live_preview")}</p>
            <pre className="whitespace-pre-wrap text-[11px] text-emerald-900 font-sans">{livePreview}</pre>
          </div>
        )}
      </form>
    </div>
  );
}

function Field({
  label, icon, error, ...rest
}: { label: string; icon: string; error?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground px-1">{label}</label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-base">{icon}</span>
        <input
          {...rest}
          className={`w-full rounded-2xl bg-card border shadow-[var(--shadow-card)] pl-10 pr-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/70 outline-none focus:border-primary focus:ring-4 focus:ring-primary/15 transition ${error ? "border-red-400" : "border-border/60"}`}
        />
      </div>
      {error && <p className="text-[11px] text-red-500 px-1">{error}</p>}
    </div>
  );
}