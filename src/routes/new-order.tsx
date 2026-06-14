import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase, type OrderStatus, type InventoryRow } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import { useBusinessType } from "@/contexts/BusinessTypeContext";
import { bizKey } from "@/lib/businessType";
import { formatUnit } from "@/lib/labels";
import { renderTemplate, buildWhatsAppLink, getOrderTemplate, fetchWAProfile } from "@/lib/wa";
import { createNotification } from "@/lib/notify";
import { notify as deviceNotify } from "@/lib/notifications";
import { isPrefEnabled } from "@/lib/notifPrefs";
import { notifySituation } from "@/lib/autoNotify";
import { getNotifMessage } from "@/lib/notifMessages";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { PhoneInput } from "@/components/PhoneInput";

export const Route = createFileRoute("/new-order")({ component: NewOrderPage });

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
  const { t, lang } = useI18n();
  const { type: bizType } = useBusinessType();
  const navigate = useNavigate();
  const { hasFullAccess, ordersUsed, ordersLimit, ordersRemaining, showUpgrade } = useSubscription();
  const statusLabels: Record<OrderStatus, string> = {
    Paid: `${t("paid")} ✓`,
    Unpaid: t("unpaid"),
    Pending: t("pending"),
  };

  // ---- Business-type config ----
  const eff = (bizType ?? "retail") as
    | "retail" | "fnb" | "education" | "beauty" | "property" | "freelance";
  const isRetailish = eff === "retail" || eff === "fnb";
  const showQuantity = isRetailish;
  const showPaymentStatus = eff !== "property";
  const productLabel =
    eff === "education" ? t("f_service")
    : eff === "beauty"  ? t("f_service")
    : eff === "property" ? t("f_property_type")
    : eff === "freelance" ? t("f_project_type")
    : eff === "fnb" ? t("f_menu_item")
    : t("product");
  const productPh =
    eff === "education" ? t("f_service_ph")
    : eff === "beauty"  ? t("f_beauty_service_ph")
    : eff === "property" ? t("f_property_ph")
    : eff === "freelance" ? t("f_freelance_service_ph")
    : t("select_product");
  const customerLabel = isRetailish ? t("customer_name") : t("f_client_name");
  const customerPh    = isRetailish ? t("customer_name_ph") : t("f_client_name_ph");
  const priceLabel    = eff === "education" ? t("f_consultation_fee")
                      : eff === "property"  ? t("f_budget")
                      : t("price");
  const saveLabel =
    eff === "education" ? t("save_case")
    : eff === "beauty"  ? t("save_appointment")
    : eff === "property" ? t("save_lead")
    : eff === "freelance" ? t("save_project")
    : t("save_order");

  const [status, setStatus] = useState<OrderStatus>("Unpaid");
  const [form, setForm] = useState({
    customer_name: "", phone: "", product: "", quantity: "1", amount: "", notes: "",
  });
  // Per-business-type extras
  const [extras, setExtras] = useState({
    course_interest: "",
    university_preference: "",
    application_status: "not_applied" as
      "not_applied" | "applied" | "interview" | "offer_received" | "accepted" | "rejected",
    date_time: "",
    location_interest: "",
    lead_status: "enquiry" as "enquiry" | "in_progress" | "completed" | "rejected",
    followup_date: "",
    project_description: "",
    deadline_date: "",
  });
  const updExtra = <K extends keyof typeof extras>(k: K) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setExtras((p) => ({ ...p, [k]: e.target.value as any }));

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [inventory, setInventory] = useState<InventoryRow[]>([]);
  const [showSuggest, setShowSuggest] = useState(false);
  const [services, setServices] = useState<Array<{ id: string; name: string; price: number }>>([]);
  const [listings, setListings] = useState<Array<{ id: string; title: string }>>([]);
  const [interestedListingId, setInterestedListingId] = useState<string>("");
  const [existingCustomers, setExistingCustomers] = useState<Array<{ id: string; name: string; phone: string | null }>>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [unitPrice, setUnitPrice] = useState<number | null>(null);
  const [customOrderTpl, setCustomOrderTpl] = useState<string | null>(null);
  const [paymentPreviewBlock, setPaymentPreviewBlock] = useState<string>("");
  const [businessName, setBusinessName] = useState<string>("");

  useEffect(() => {
    (async () => {
      if (!user) return;
      const [{ data: inv }, { data: pref }] = await Promise.all([
        supabase.from("inventory").select("*"),
        supabase.from("user_preferences").select("wa_order_template").eq("user_id", user.id).maybeSingle(),
      ]);
      setInventory((inv ?? []) as InventoryRow[]);
      if (pref?.wa_order_template) setCustomOrderTpl(pref.wa_order_template);
      const wa = await fetchWAProfile(user.id, lang);
      setPaymentPreviewBlock(wa.paymentDetails);
      setBusinessName(wa.businessName);
      if (!isRetailish) {
        const { data: svc } = await supabase
          .from("services")
          .select("id,name,price")
          .eq("user_id", user.id)
          .eq("is_active", true)
          .order("created_at", { ascending: false });
        setServices(((svc ?? []) as any).map((s: any) => ({ ...s, price: Number(s.price) })));
      }
      if (eff === "property") {
        const { data: lst } = await (supabase as any)
          .from("listings")
          .select("id,title,status")
          .eq("user_id", user.id)
          .eq("status", "available")
          .order("created_at", { ascending: false });
        setListings(((lst ?? []) as any).map((l: any) => ({ id: l.id, title: l.title })));
        const { data: cs } = await supabase
          .from("customers")
          .select("id,name,phone")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });
        setExistingCustomers(((cs ?? []) as any).map((c: any) => ({ id: c.id, name: c.name, phone: c.phone })));
      }
    })();
  }, [lang, user, isRetailish, eff]);

  const upd = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((p) => ({ ...p, [k]: e.target.value }));
    if (errors[k]) setErrors((p) => ({ ...p, [k]: "" }));
  };

  // Quantity: if unit price locked from inventory, auto-recompute amount.
  const onQuantityChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const v = e.target.value;
    setForm((p) => {
      const next = { ...p, quantity: v };
      if (unitPrice != null) {
        const q = Number(v) || 0;
        next.amount = (unitPrice * q).toFixed(2);
      }
      return next;
    });
    if (errors.quantity) setErrors((p) => ({ ...p, quantity: "" }));
  };

  // Amount: manual edit means custom price → unlock auto-calc.
  const onAmountChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((p) => ({ ...p, amount: e.target.value }));
    if (unitPrice != null) setUnitPrice(null);
    if (errors.amount) setErrors((p) => ({ ...p, amount: "" }));
  };

  // Product text edit: if it no longer matches the locked inventory item, drop the unit price lock.
  const onProductChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    upd("product")(e);
    setShowSuggest(true);
    setUnitPrice(null);
  };

  // Find inventory match for the currently-typed product (case-insensitive exact match)
  const matchedInventory = inventory.find(
    (i) => i.name.trim().toLowerCase() === form.product.trim().toLowerCase(),
  );

  const selectInventoryProduct = (item: InventoryRow) => {
    const price = item.price ? Number(item.price) : null;
    const q = Number(form.quantity) || 1;
    setForm((p) => ({
      ...p,
      product: item.name,
      amount: price != null ? (price * q).toFixed(2) : p.amount,
    }));
    setUnitPrice(price);
    setShowSuggest(false);
    if (errors.product) setErrors((p) => ({ ...p, product: "" }));
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.customer_name.trim()) e.customer_name = t("required_field");
    if (!form.product.trim()) e.product = t("required_field");
    if (showQuantity && (!form.quantity || Number(form.quantity) < 1)) e.quantity = t("required_field");
    if (!form.amount || Number(form.amount) < 0) e.amount = t("required_field");
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const checkLimit = () => {
    if (!hasFullAccess && ordersUsed >= ordersLimit) {
      showUpgrade(t("upgrade_message"));
      return false;
    }
    return true;
  };

  const persist = async (): Promise<{ id: string; code: string } | null> => {
    if (!user) return null;
    const code = genCode();
    const amount = Number(form.amount) || 0;
    const quantity = showQuantity ? (Number(form.quantity) || 1) : 1;
    const fullPhone = form.phone.replace(/\D/g, "");
    const productName = form.product.trim();

    // Look up matching inventory item (case-insensitive) for cost & stock
    const matchedItem = inventory.find(
      (i) => i.name.trim().toLowerCase() === productName.toLowerCase(),
    );
    const unitCost = matchedItem ? Number(matchedItem.cost_price ?? 0) : 0;
    const cost = unitCost * quantity;
    const gross_profit = amount - cost;

    // Build notes payload: include any extra type-specific fields above the user's note.
    const extraLines: string[] = [];
    if (eff === "education") {
      if (extras.course_interest) extraLines.push(`${t("f_course_interest")}: ${extras.course_interest}`);
      if (extras.university_preference) extraLines.push(`${t("f_university_preference")}: ${extras.university_preference}`);
      extraLines.push(`${t("f_app_status")}: ${t(`edu_app_${extras.application_status}` as any)}`);
    } else if (eff === "beauty") {
      if (extras.date_time) extraLines.push(`${t("f_date_time")}: ${extras.date_time}`);
    } else if (eff === "property") {
      if (extras.location_interest) extraLines.push(`${t("f_location_interest")}: ${extras.location_interest}`);
      extraLines.push(`${t("f_lead_status")}: ${t(`cs_${extras.lead_status}` as any)}`);
      if (extras.followup_date) extraLines.push(`${t("f_followup_date")}: ${extras.followup_date}`);
    } else if (eff === "freelance") {
      if (extras.project_description) extraLines.push(`${t("f_project_description")}: ${extras.project_description}`);
      if (extras.deadline_date) extraLines.push(`${t("f_deadline_date")}: ${extras.deadline_date}`);
    }
    const userNote = form.notes.trim();
    const combinedNotes = [extraLines.join("\n"), userNote].filter(Boolean).join("\n\n") || null;
    const effectiveStatus: OrderStatus = eff === "property" ? "Pending" : status;
    let savedCustomerId: string | null = null;

    const { data: inserted, error: orderErr } = await supabase
      .from("orders")
      .insert({
        user_id: user.id,
        code,
        customer_name: form.customer_name.trim(),
        phone: fullPhone || null,
        product: productName,
        quantity,
        amount,
        cost,
        gross_profit,
        status: effectiveStatus,
        notes: combinedNotes,
      })
      .select("id, code")
      .single();

    if (orderErr || !inserted) {
      toast.error(t("order_save_failed"));
      return null;
    }

    // Stock deduction is handled by the DB trigger `trg_deduct_stock_on_order`.
    // We only fire the low-stock notification here based on the projected value.
    if (matchedItem) {
      const newStock = Math.max(0, Number(matchedItem.stock ?? 0) - quantity);
      if (newStock <= 5 && newStock < Number(matchedItem.stock ?? 0)) {
        const m = getNotifMessage("low_stock", bizType, lang, {
          product: matchedItem.name,
          quantity: newStock,
        });
        notifySituation({
          kind: "low_stock",
          title: m.title,
          body: m.body,
          link: "/inventory",
          prefKey: "notif_inventory",
          dedupeKey: `stock_${matchedItem.id}_${newStock}`,
        }).catch(() => {});
      }
    }

    // Upsert customer — match by phone if provided, else by name.
    {
      const nameTrim = form.customer_name.trim();
      let existing: any = null;
      if (fullPhone) {
        const { data } = await supabase
          .from("customers").select("*")
          .eq("user_id", user.id).eq("phone", fullPhone).maybeSingle();
        existing = data;
      } else if (nameTrim) {
        const { data } = await supabase
          .from("customers").select("*")
          .eq("user_id", user.id).is("phone", null).eq("name", nameTrim).maybeSingle();
        existing = data;
      }
      if (existing) {
        await (supabase as any).from("customers").update({
          total_orders: (existing.total_orders ?? 0) + 1,
          total_spent: Number(existing.total_spent ?? 0) + amount,
          last_order_at: new Date().toISOString(),
          name: existing.name || nameTrim,
          ...(eff === "property" && interestedListingId
            ? { interested_listing_id: interestedListingId }
            : {}),
        }).eq("id", existing.id);
        savedCustomerId = existing.id;
      } else if (nameTrim) {
        const { data: createdCustomer } = await (supabase as any).from("customers").insert({
          user_id: user.id,
          name: nameTrim,
          phone: fullPhone || null,
          total_orders: 1,
          total_spent: amount,
          last_order_at: new Date().toISOString(),
          ...(eff === "property" && interestedListingId
            ? { interested_listing_id: interestedListingId }
            : {}),
        }).select("id").single();
        savedCustomerId = createdCustomer?.id ?? null;
      }
    }

    // Education: also persist structured fields onto client_education_details
    // if a customer row exists for this phone.
    if (eff === "education" && fullPhone) {
      try {
        const { data: cust } = await supabase
          .from("customers").select("id").eq("user_id", user.id).eq("phone", fullPhone).maybeSingle();
        if (cust?.id) {
          await (supabase as any).from("client_education_details").upsert({
            client_id: cust.id,
            user_id: user.id,
            course_interest: extras.course_interest || null,
            university_preference: extras.university_preference || null,
            application_status: extras.application_status,
          }, { onConflict: "client_id" });
        }
      } catch { /* non-fatal */ }
    }

    // Property: persist follow-up reminder
    if (eff === "property" && extras.followup_date && savedCustomerId) {
      try {
        await (supabase as any).from("follow_ups").insert({
          user_id: user.id,
          customer_id: savedCustomerId,
          follow_up_date: extras.followup_date,
          note: form.product.trim() || null,
        });
      } catch { /* non-fatal */ }
    }

    return { id: inserted.id, code: inserted.code };
  };

  const buildMessage = (code: string, paymentDetails = paymentPreviewBlock) => {
    const name = form.customer_name || "Customer";
    const amt = form.amount ? Number(form.amount).toFixed(2) : "0.00";
    const svc = form.product || "—";
    // Property is enquiry-only — never include payment details in the message.
    const pay = eff === "property" ? "" : (status !== "Paid" ? paymentDetails : "");
    return renderTemplate(getOrderTemplate(lang, bizType, customOrderTpl), {
      customer_name: name,
      business_name: businessName || "us",
      code,
      product: svc,
      quantity: form.quantity || "1",
      amount: amt,
      status,
      notes: form.notes,
      payment_details: pay,
      date_time: extras.date_time,
      follow_up_date: extras.followup_date,
      deadline: extras.deadline_date,
    }, lang);
  };

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
    isPrefEnabled("notif_new_order") && deviceNotify("New Order Added! 🎉", `Order from ${form.customer_name} — RM ${Number(form.amount).toFixed(2)} has been saved.`, { route: "/orders" }).catch(() => {});
    setForm({ customer_name: "", phone: "", product: "", quantity: "1", amount: "", notes: "" });
    setStatus("Unpaid");
    setTimeout(() => navigate({ to: eff === "property" ? "/customers" : "/orders" }), 1500);
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
    const msg = buildMessage(res.code, user ? (await fetchWAProfile(user.id, lang)).paymentDetails : "");
    if (user) {
      await createNotification({
        user_id: user.id, type: "new_order",
        title: t("notif_new_order").replace("{code}", res.code).replace("{name}", form.customer_name),
        message: `RM ${Number(form.amount).toFixed(2)} · ${form.product}`,
        link: "/orders",
      });
    }
    isPrefEnabled("notif_new_order") && deviceNotify("New Order Added! 🎉", `Order from ${form.customer_name} — RM ${Number(form.amount).toFixed(2)} has been saved.`, { route: "/orders" }).catch(() => {});
    window.open(buildWhatsAppLink(form.phone.replace(/\D/g, ""), msg), "_blank");
    setTimeout(() => navigate({ to: eff === "property" ? "/customers" : "/orders" }), 800);
  };

  const productMatches =
    form.product.length > 0
      ? inventory.filter((i) => i.name.toLowerCase().includes(form.product.toLowerCase())).slice(0, 5)
      : [];

  const serviceMatches =
    !isRetailish && form.product.length > 0
      ? services.filter((s) => s.name.toLowerCase().includes(form.product.toLowerCase())).slice(0, 5)
      : !isRetailish
        ? services.slice(0, 5)
        : [];

  const selectService = (s: { id: string; name: string; price: number }) => {
    setForm((p) => ({
      ...p,
      product: s.name,
      amount: s.price > 0 ? s.price.toFixed(2) : p.amount,
    }));
    setShowSuggest(false);
  };

  return (
    <div className="px-5 pt-10 pb-6 space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          {t(bizKey(bizType, "new_order"))} <span className="text-primary">✦</span>
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("fill_details")}</p>
      </header>

      <form className="space-y-5" onSubmit={save} noValidate>
        {eff === "property" && (
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground px-1">
              👥 {t("f_select_existing_customer" as any)}
            </label>
            <select
              value={selectedCustomerId}
              onChange={(e) => {
                const id = e.target.value;
                setSelectedCustomerId(id);
                if (!id) {
                  setForm((p) => ({ ...p, customer_name: "", phone: "" }));
                  return;
                }
                const c = existingCustomers.find((x) => x.id === id);
                if (c) setForm((p) => ({ ...p, customer_name: c.name, phone: c.phone ?? "" }));
              }}
              className="w-full rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] px-4 py-3 text-sm text-foreground outline-none focus:border-primary focus:ring-4 focus:ring-primary/15 transition"
            >
              <option value="">{t("f_new_customer_option" as any)}</option>
              {existingCustomers.map((c) => (
                <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ""}</option>
              ))}
            </select>
          </div>
        )}
        <Field label={customerLabel} icon="👤" placeholder={customerPh} value={form.customer_name} onChange={upd("customer_name")} error={errors.customer_name} />
        <PhoneInput
          label={t("phone_number")}
          value={form.phone}
          onChange={(v) => setForm((p) => ({ ...p, phone: v }))}
        />

        <div className="space-y-1.5 relative" id="tour-no-product">
          <label className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground px-1">{productLabel}</label>
          {(() => {
            // Property: use a plain text input — listings are picked in the dropdown below.
            if (eff === "property") {
              return (
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-base z-10 pointer-events-none">🏠</span>
                  <input
                    type="text"
                    value={form.product}
                    onChange={(e) => {
                      setForm((p) => ({ ...p, product: e.target.value }));
                      if (errors.product) setErrors((p) => ({ ...p, product: "" }));
                    }}
                    placeholder={productPh}
                    className={`w-full rounded-2xl bg-card border shadow-[var(--shadow-card)] pl-10 pr-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/70 outline-none focus:border-primary focus:ring-4 focus:ring-primary/15 transition ${errors.product ? "border-red-400" : "border-border/60"}`}
                  />
                </div>
              );
            }
            const hasList = isRetailish ? inventory.length > 0 : services.length > 0;
            if (!hasList) {
              return (
                <div className="rounded-2xl border border-dashed border-border bg-muted/40 px-4 py-4 space-y-2">
                  <p className="text-xs text-muted-foreground">
                    {isRetailish
                      ? (lang === "ms"
                          ? "Anda belum menambah produk inventori. Sila tambah di Inventori dahulu."
                          : lang === "zh"
                            ? "您还没有添加库存产品。请先到「库存」页面添加。"
                            : "You haven't added any inventory products yet. Please add one in Inventory first.")
                      : (lang === "ms"
                          ? "Anda belum menyediakan perkhidmatan. Sila tambah di Perkhidmatan dahulu."
                          : lang === "zh"
                            ? "您还没有添加服务。请先到「服务」页面添加。"
                            : "You haven't added any services yet. Please add one in Services first.")}
                  </p>
                  <button
                    type="button"
                    onClick={() => navigate({ to: isRetailish ? "/inventory" : "/services" } as any)}
                    className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold active:scale-95"
                  >
                    {isRetailish
                      ? (lang === "ms" ? "Pergi ke Inventori" : lang === "zh" ? "前往库存" : "Go to Inventory")
                      : (lang === "ms" ? "Pergi ke Perkhidmatan" : lang === "zh" ? "前往服务" : "Go to Services")}
                  </button>
                </div>
              );
            }
            return (
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-base z-10 pointer-events-none">{eff === "education" ? "🎓" : eff === "beauty" ? "✨" : eff === "freelance" ? "💼" : "🛍️"}</span>
                <select
                  value={form.product}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (!v) {
                      setForm((p) => ({ ...p, product: "", amount: "" }));
                      setUnitPrice(null);
                      return;
                    }
                    if (isRetailish) {
                      const item = inventory.find((i) => i.name === v);
                      if (item) selectInventoryProduct(item);
                    } else {
                      const svc = services.find((s) => s.name === v);
                      if (svc) selectService(svc);
                    }
                    if (errors.product) setErrors((p) => ({ ...p, product: "" }));
                  }}
                  className={`w-full rounded-2xl bg-card border shadow-[var(--shadow-card)] pl-10 pr-4 py-3 text-sm text-foreground outline-none focus:border-primary focus:ring-4 focus:ring-primary/15 transition appearance-none ${errors.product ? "border-red-400" : "border-border/60"}`}
                >
                  <option value="">{productPh}</option>
                  {isRetailish
                    ? inventory.map((m) => (
                        <option key={m.id} value={m.name}>
                          {m.name}{m.price ? ` — RM ${Number(m.price).toFixed(2)}` : ""} · {m.stock} {formatUnit(m.unit, t)}
                        </option>
                      ))
                    : services.map((s) => (
                        <option key={s.id} value={s.name}>
                          {s.name}{s.price > 0 ? ` — RM ${s.price.toFixed(2)}` : ""}
                        </option>
                      ))}
                </select>
              </div>
            );
          })()}
          {errors.product && <p className="text-[11px] text-red-500 px-1">{errors.product}</p>}
          {isRetailish && matchedInventory && (
            <p className="text-[11px] text-emerald-600 px-1 flex items-center gap-1">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
              {t("from_inventory")} · {t("stock_available")
                .replace("{x}", String(matchedInventory.stock))
                .replace("{unit}", matchedInventory.unit)}
            </p>
          )}
        </div>

        {showQuantity && (
          <Field label={t("quantity")} icon="#" placeholder="1" value={form.quantity} onChange={onQuantityChange} type="number" error={errors.quantity} />
        )}

        {/* Per-business extra fields */}
        {eff === "education" && (
          <>
            <Field label={t("f_course_interest")} icon="🎓" placeholder={t("f_course_ph")} value={extras.course_interest} onChange={updExtra("course_interest")} />
            <Field label={t("f_university_preference")} icon="🏫" placeholder={t("f_uni_ph")} value={extras.university_preference} onChange={updExtra("university_preference")} />
          </>
        )}
        {eff === "beauty" && (
          <Field label={t("f_date_time")} icon="📅" placeholder="" value={extras.date_time} onChange={updExtra("date_time")} type="datetime-local" />
        )}
        {eff === "property" && (
          <Field label={t("f_location_interest")} icon="📍" placeholder={t("f_location_ph")} value={extras.location_interest} onChange={updExtra("location_interest")} />
        )}
        {eff === "property" && (
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground px-1">
              🏠 {t("f_interested_listing" as any)}
            </label>
            <select
              value={interestedListingId}
              onChange={(e) => setInterestedListingId(e.target.value)}
              className="w-full rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] px-4 py-3 text-sm text-foreground outline-none focus:border-primary focus:ring-4 focus:ring-primary/15 transition"
            >
              <option value="">{t("f_no_listing" as any)}</option>
              {listings.map((l) => (
                <option key={l.id} value={l.id}>{l.title}</option>
              ))}
            </select>
          </div>
        )}
        {eff === "freelance" && (
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground px-1">{t("f_project_description")}</label>
            <textarea
              rows={3} value={extras.project_description} onChange={updExtra("project_description")}
              placeholder={t("f_project_desc_ph")}
              className="w-full rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/70 outline-none focus:border-primary focus:ring-4 focus:ring-primary/15 transition resize-none"
            />
          </div>
        )}

        <Field
          label={priceLabel}
          icon="💰"
          placeholder="0.00"
          value={form.amount}
          onChange={onAmountChange}
          type="number"
          error={errors.amount}
          hint={unitPrice != null ? `Auto: RM ${unitPrice.toFixed(2)} × ${Number(form.quantity) || 0}` : undefined}
        />

        {eff === "education" && (
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground px-1">{t("f_app_status")}</label>
            <select value={extras.application_status} onChange={updExtra("application_status")}
              className="w-full rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] px-4 py-3 text-sm text-foreground outline-none focus:border-primary focus:ring-4 focus:ring-primary/15 transition">
              {(["not_applied","applied","interview","offer_received","accepted","rejected"] as const).map((s) => (
                <option key={s} value={s}>{t(`edu_app_${s}` as any)}</option>
              ))}
            </select>
          </div>
        )}

        {eff === "property" && (
          <>
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground px-1">{t("f_lead_status")}</label>
              <select value={extras.lead_status} onChange={updExtra("lead_status")}
                className="w-full rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] px-4 py-3 text-sm text-foreground outline-none focus:border-primary focus:ring-4 focus:ring-primary/15 transition">
                {(["enquiry","in_progress","completed","rejected"] as const).map((s) => (
                  <option key={s} value={s}>{t(`cs_${s}` as any)}</option>
                ))}
              </select>
            </div>
            <Field label={t("f_followup_date")} icon="📅" placeholder="" value={extras.followup_date} onChange={updExtra("followup_date")} type="date" />
          </>
        )}

        {eff === "freelance" && (
          <Field label={t("f_deadline_date")} icon="📅" placeholder="" value={extras.deadline_date} onChange={updExtra("deadline_date")} type="date" />
        )}

        {showPaymentStatus && (
        <div className="space-y-1.5" id="tour-no-status">
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
        )}

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
            {saving ? t("saving") : saveLabel}
          </button>
          {!hasFullAccess && (
            <p className="text-center text-[11px] text-muted-foreground">
              {t("orders_used").replace("{x}", String(ordersUsed)).replace("{limit}", String(ordersLimit))}
              {ordersRemaining <= 5 && ordersRemaining > 0 && (
                <span className="ml-1 text-amber-600 font-semibold">· {ordersRemaining} left</span>
              )}
            </p>
          )}
          <button
            type="button"
            onClick={saveAndWhatsApp}
            id="tour-no-wa"
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
  label, icon, error, hint, ...rest
}: { label: string; icon: string; error?: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
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
      {!error && hint && <p className="text-[11px] text-emerald-600 px-1">{hint}</p>}
    </div>
  );
}