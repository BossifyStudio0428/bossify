import { useCallback, useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase, type OrderRow, type OrderStatus } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import { useBusinessType } from "@/contexts/BusinessTypeContext";
import { bizKey, pofSectionTitleKey, pofDescKey, pofWaShareKey, type BizType } from "@/lib/businessType";
import { getPublicOrigin } from "@/lib/publicUrl";
import { renderTemplate, buildWhatsAppLink, daysSince, getReminderTemplate, getReceiptTemplate, fetchWAProfile, stripEmoji } from "@/lib/wa";
import { buildReceiptPdf } from "@/lib/receiptPdf";
import { exportOrdersListPDF } from "@/lib/pdf";
import { createNotification } from "@/lib/notify";
import { notifySituation } from "@/lib/autoNotify";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { MoreVertical, Pencil, Trash2, Check, Upload, Paperclip, FileCheck2, X, Copy, MessageCircle, QrCode, Eye, Phone, MapPin, Search } from "lucide-react";
import { PhoneActionSheet } from "@/components/PhoneActionSheet";
import { PhoneInput } from "@/components/PhoneInput";
import { PlacesAutocomplete } from "@/components/PlacesAutocomplete";
import { orderCost } from "@/lib/orderMath";
import { HIDE_ORDER_FORM } from "@/lib/featureFlags";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/orders")({ component: OrdersPage });

type Filter = "All" | OrderStatus;
const filters: Filter[] = ["All", "Unpaid", "Paid", "Pending"];

const statusStyles: Record<OrderStatus, string> = {
  Paid: "bg-emerald-100 text-emerald-700",
  Unpaid: "bg-red-100 text-red-600",
  Pending: "bg-amber-100 text-amber-700",
};

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const yest = new Date(now); yest.setDate(yest.getDate() - 1);
  const isYest = d.toDateString() === yest.toDateString();
  if (sameDay) return d.toLocaleTimeString("en-MY", { hour: "numeric", minute: "2-digit" });
  if (isYest) return "Yesterday";
  return d.toLocaleDateString("en-MY", { day: "numeric", month: "short" });
}

function OrdersPage() {
  const { user } = useAuth();
  const { t, lang } = useI18n();
  const { type: bizType } = useBusinessType();
  const navigate = useNavigate();
  const { hasFullAccess, showUpgrade } = useSubscription();
  const [hydrated, setHydrated] = useState(false);
  const [active, setActive] = useState<Filter>("All");
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [productImages, setProductImages] = useState<Record<string, string>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [detail, setDetail] = useState<OrderRow | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [customReminderTpl, setCustomReminderTpl] = useState<string | null>(null);
  const [bulkProgress, setBulkProgress] = useState<{ i: number; n: number } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<OrderRow | null>(null);
  const [editingOrder, setEditingOrder] = useState<OrderRow | null>(null);
  const [editForm, setEditForm] = useState<Partial<OrderRow>>({});
  const [editSaving, setEditSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [phoneSheet, setPhoneSheet] = useState<{ phone: string; name: string } | null>(null);
  const [waProfile, setWaProfile] = useState<{ paymentDetails: string; businessName: string }>({
    paymentDetails: "",
    businessName: "us",
  });
  const [ofCode, setOfCode] = useState<string | null>(null);
  const [ofEnabled, setOfEnabled] = useState<boolean>(true);
  const [ofBizType, setOfBizType] = useState<string | null>(null);
  const [ofQrOpen, setOfQrOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [dateOpen, setDateOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => { setHydrated(true); }, []);

  useEffect(() => {
    (async () => {
      if (!user) return;
      const { data } = await supabase.from("user_preferences").select("wa_reminder_template").eq("user_id", user.id).maybeSingle();
      if (data?.wa_reminder_template) setCustomReminderTpl(data.wa_reminder_template);
    })();
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("order_form_code,order_form_enabled,business_type" as any)
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      let existing = ((data as any)?.order_form_code as string) ?? null;
      setOfEnabled(((data as any)?.order_form_enabled as boolean) ?? true);
      setOfBizType(((data as any)?.business_type as string) ?? null);
      if (!existing) {
        const fresh = Math.random().toString(16).slice(2, 10);
        const { error: upErr } = await supabase
          .from("profiles")
          .update({ order_form_code: fresh, order_form_enabled: true } as any)
          .eq("id", user.id);
        if (!upErr) {
          existing = fresh;
          setOfEnabled(true);
        }
      }
      if (cancelled) return;
      setOfCode(existing);
    })();
    return () => { cancelled = true; };
  }, [user]);

  const load = useCallback(async (silent = false) => {
    if (!user) {
      setOrders([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    else setOrders((data ?? []) as OrderRow[]);
    setLoading(false);
    setRefreshing(false);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!user) { setProductImages({}); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("inventory")
        .select("name,image_url")
        .eq("user_id", user.id);
      if (cancelled || !data) return;
      const map: Record<string, string> = {};
      for (const r of data as Array<{ name: string; image_url: string | null }>) {
        if (r.image_url) map[r.name.trim().toLowerCase()] = r.image_url;
      }
      setProductImages(map);
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  useEffect(() => {
    if (!user) {
      setWaProfile({ paymentDetails: "", businessName: "us" });
      return;
    }
    let cancelled = false;
    fetchWAProfile(user.id, lang).then((profile) => {
      if (!cancelled) setWaProfile(profile);
    });
    return () => { cancelled = true; };
  }, [user?.id, lang]);

  // Re-fetch whenever the page/tab regains focus so the list never shows
  // stale local state (e.g. after a delete from another device).
  useEffect(() => {
    const onFocus = () => load(true);
    const onVisible = () => { if (document.visibilityState === "visible") load(true); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  // Realtime
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel("orders-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `user_id=eq.${user.id}` }, () => {
        load(true);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id, load]);

  // Pull to refresh
  useEffect(() => {
    let startY = 0;
    let pulling = false;
    const onStart = (e: TouchEvent) => {
      if (window.scrollY === 0) { startY = e.touches[0].clientY; pulling = true; }
    };
    const onMove = (e: TouchEvent) => {
      if (!pulling) return;
      const dy = e.touches[0].clientY - startY;
      if (dy > 80 && !refreshing) { setRefreshing(true); load(true); pulling = false; }
    };
    const onEnd = () => { pulling = false; };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
    };
  }, [refreshing, load]);

  const updateStatus = async (id: string, next: OrderStatus) => {
    const prev = orders;
    const target = orders.find((o) => o.id === id);
    setOrders((p) => p.map((o) => (o.id === id ? { ...o, status: next } : o)));
    if (detail?.id === id) setDetail({ ...detail, status: next });
    const { error } = await supabase.from("orders").update({ status: next }).eq("id", id);
    if (error) {
      setOrders(prev);
      toast.error(t("update_failed"));
    } else {
      toast.success(t("order_updated"));
      if (next === "Paid" && target && target.status !== "Paid" && user) {
        const title = t("notif_paid").replace("{name}", target.customer_name).replace("{amount}", Number(target.amount).toFixed(2));
        createNotification({
          user_id: user.id, type: "paid",
          title,
          message: target.code, link: "/orders",
        });
        notifySituation({
          kind: "custom",
          title: "Payment Received ✅",
          body: `${target.customer_name} paid RM ${Number(target.amount).toFixed(2)}`,
          link: "/orders",
          prefKey: "notif_unpaid",
          dedupeKey: `paid_${target.id}`,
        }).catch(() => {});
      }
    }
  };

  const remind = (o: OrderRow) => {
    if (!o.phone) { alert(t("no_phone_for_wa")); return; }
    if (!user) return;
    const msg = renderTemplate(getReminderTemplate(lang, bizType, customReminderTpl), {
      customer_name: o.customer_name, business_name: waProfile.businessName,
      code: o.code, product: o.product,
      quantity: o.quantity, amount: Number(o.amount).toFixed(2),
      status: o.status, days_ago: daysSince(o.created_at),
      payment_details: waProfile.paymentDetails,
    }, lang);
    const cleaned = o.phone.replace(/[^0-9]/g, "");
    const url = `https://wa.me/${cleaned}?text=${encodeURIComponent(stripEmoji(msg))}`;
    window.open(url, "_blank");
  };

  // ---- Receipt: upload, send, confirm ----
  const [receiptUploadingId, setReceiptUploadingId] = useState<string | null>(null);

  const uploadReceipt = async (o: OrderRow, file: File) => {
    if (!user) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("Max 5MB"); return; }
    setReceiptUploadingId(o.id);
    try {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
      const path = `${user.id}/${o.id}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("order-receipts")
        .upload(path, file, { upsert: true, contentType: file.type || undefined });
      if (upErr) throw upErr;
      const { error: dbErr } = await supabase
        .from("orders")
        .update({ receipt_url: path } as any)
        .eq("id", o.id);
      if (dbErr) throw dbErr;
      setOrders((p) => p.map((x) => (x.id === o.id ? ({ ...x, receipt_url: path } as any) : x)));
      toast.success(t("receipt_uploaded"));
    } catch (e: any) {
      toast.error(e?.message || "Upload failed");
    } finally {
      setReceiptUploadingId(null);
    }
  };

  const removeReceipt = async (o: OrderRow) => {
    if (!user) return;
    const url = (o as any).receipt_url as string | null;
    if (url) {
      await supabase.storage.from("order-receipts").remove([url]).catch(() => {});
    }
    await supabase.from("orders").update({ receipt_url: null, receipt_confirmed: false } as any).eq("id", o.id);
    setOrders((p) => p.map((x) => (x.id === o.id ? ({ ...x, receipt_url: null, receipt_confirmed: false } as any) : x)));
  };

  const toggleReceiptConfirmed = async (o: OrderRow) => {
    const next = !((o as any).receipt_confirmed as boolean);
    setOrders((p) => p.map((x) => (x.id === o.id ? ({ ...x, receipt_confirmed: next } as any) : x)));
    const { error } = await supabase.from("orders").update({ receipt_confirmed: next } as any).eq("id", o.id);
    if (error) {
      setOrders((p) => p.map((x) => (x.id === o.id ? ({ ...x, receipt_confirmed: !next } as any) : x)));
      toast.error(t("update_failed"));
    }
  };

  const viewReceipt = async (o: OrderRow) => {
    const path = (o as any).receipt_url as string | null;
    if (!path) return;
    const { data, error } = await supabase.storage.from("order-receipts").createSignedUrl(path, 60 * 60);
    if (error || !data?.signedUrl) { toast.error(error?.message || "Failed"); return; }
    window.open(data.signedUrl, "_blank");
  };

  const sendReceipt = async (o: OrderRow) => {
    if (!o.phone) { alert(t("no_phone_for_wa")); return; }
    if (!user) return;
    let receiptUrl = "";
    try {
      // Always generate a fresh, branded PDF receipt with the current order
      // data so the customer receives a real-looking receipt — even if the
      // merchant previously uploaded a payment-proof image.
      setReceiptUploadingId(o.id);
      const blob = await buildReceiptPdf({
        businessName: waProfile.businessName,
        customerName: o.customer_name,
        customerPhone: o.phone,
        code: o.code,
        product: o.product,
        quantity: o.quantity,
        amount: Number(o.amount),
        createdAt: (o as any).created_at ?? new Date().toISOString(),
        lang,
        bizType,
      });
      const autoPath = `${user.id}/auto/${o.id}-${Date.now()}.pdf`;
      const { error: upErr } = await supabase.storage
        .from("order-receipts")
        .upload(autoPath, blob, { upsert: true, contentType: "application/pdf" });
      if (upErr) throw upErr;
      const { data } = await supabase.storage
        .from("order-receipts")
        .createSignedUrl(autoPath, 60 * 60 * 24 * 30); // 30 days
      receiptUrl = data?.signedUrl ?? "";
      if (!receiptUrl) throw new Error("Failed to get receipt URL");
    } catch (e: any) {
      toast.error(e?.message || "Failed to generate receipt");
      return;
    } finally {
      setReceiptUploadingId(null);
    }
    const msg = renderTemplate(getReceiptTemplate(lang, bizType), {
      customer_name: o.customer_name,
      business_name: waProfile.businessName,
      code: o.code,
      product: o.product,
      quantity: o.quantity,
      amount: Number(o.amount).toFixed(2),
      receipt_url: receiptUrl,
    }, lang);
    const cleaned = o.phone.replace(/[^0-9]/g, "");
    window.open(`https://wa.me/${cleaned}?text=${encodeURIComponent(stripEmoji(msg))}`, "_blank");
  };

  const remindAllUnpaid = async () => {
    const unpaid = orders.filter((o) => o.status === "Unpaid" && o.phone);
    if (unpaid.length === 0) return;
    if (!confirm(t("confirm_remind_all").replace("{n}", String(unpaid.length)))) return;
    for (let i = 0; i < unpaid.length; i++) {
      setBulkProgress({ i: i + 1, n: unpaid.length });
      await remind(unpaid[i]);
      if (i < unpaid.length - 1) await new Promise((r) => setTimeout(r, 2000));
    }
    setBulkProgress(null);
  };

  const [exportingPdf, setExportingPdf] = useState(false);
  const exportPDF = async () => {
    if (!hasFullAccess) { showUpgrade(t("export_pdf")); return; }
    if (exportingPdf) return;
    setExportingPdf(true);
    await new Promise((r) => setTimeout(r, 30));
    try {
      const rows = visible.map((o) => ({
        date: new Date(o.created_at).toLocaleDateString("en-MY"),
        code: o.code, customer: o.customer_name, product: o.product,
        qty: Number(o.quantity), amount: Number(o.amount), status: o.status,
      }));
      const { data: profile } = await supabase
        .from("profiles")
        .select("business_name,avatar_url")
        .eq("id", user?.id ?? "")
        .maybeSingle();
      const eff = (bizType ?? "retail") as
        | "retail" | "fnb" | "education" | "beauty" | "property" | "freelance";
      await exportOrdersListPDF({
        lang,
        bizType: eff,
        businessName: profile?.business_name ?? (user?.email?.split("@")[0] ?? "My Store"),
        logoDataUrl: profile?.avatar_url ?? null,
        statusLabel: active,
        rows,
      });
    } catch (e) {
      console.error("[orders] export failed", e);
      toast.error(t("pdf_failed"));
    } finally {
      setExportingPdf(false);
    }
  };

  const remove = async (id: string) => {
    const target = orders.find((o) => o.id === id);
    if (!target) return;
    setDeletingId(id);

    const { error, count } = await supabase
      .from("orders")
      .delete({ count: "exact" })
      .eq("id", id)
      .eq("user_id", user?.id ?? "");

    if (error) {
      setDeletingId(null);
      toast.error(error.message || t("update_failed"));
      return;
    }
    if (!count) {
      setDeletingId(null);
      toast.error(t("failed_delete_perm"));
      return;
    }

    // Sync customer aggregates
    if (user && target.phone) {
      const { data: existing } = await supabase
        .from("customers")
        .select("*")
        .eq("user_id", user.id)
        .eq("phone", target.phone)
        .maybeSingle();
      if (existing) {
        const newOrders = Math.max(0, (existing.total_orders ?? 0) - 1);
        const newSpent = Math.max(0, Number(existing.total_spent ?? 0) - Number(target.amount));
        if (newOrders === 0) {
          await supabase.from("customers").delete().eq("id", existing.id);
        } else {
          await supabase.from("customers").update({
            total_orders: newOrders,
            total_spent: newSpent,
          }).eq("id", existing.id);
        }
      }
    }
    if (user && !target.phone) {
      const { data: existing } = await supabase
        .from("customers")
        .select("*")
        .eq("user_id", user.id)
        .is("phone", null)
        .eq("name", target.customer_name)
        .maybeSingle();
      if (existing) {
        const newOrders = Math.max(0, (existing.total_orders ?? 0) - 1);
        const newSpent = Math.max(0, Number(existing.total_spent ?? 0) - Number(target.amount));
        if (newOrders === 0) await supabase.from("customers").delete().eq("id", existing.id);
        else await supabase.from("customers").update({ total_orders: newOrders, total_spent: newSpent }).eq("id", existing.id);
      }
    }
    if (user) {
      await createNotification({
        user_id: user.id,
        type: "order_deleted",
        title: `Order ${target.code} deleted`,
        message: `${target.customer_name} · RM ${Number(target.amount).toFixed(2)}`,
        link: "/orders",
      });
    }

    // Step 2: only mutate UI after DB confirms delete.
    setOrders((prev) => prev.filter((o) => o.id !== id));
    setDetail(null);
    setRemovingId(null);
    setDeletingId(null);
    toast.success(t("order_deleted"));
    // Re-fetch in the background to stay in sync (no navigation).
    load(true);
  };

  const openEdit = (order: OrderRow) => {
    setEditingOrder(order);
    setEditForm(order);
  };

  const saveEdit = async () => {
    if (!editingOrder || !user) return;
    setEditSaving(true);
    const updates = {
      customer_name: editForm.customer_name?.toString().trim() || editingOrder.customer_name,
      phone: editForm.phone?.toString().trim() || null,
      product: editForm.product?.toString().trim() || editingOrder.product,
      quantity: Number(editForm.quantity ?? editingOrder.quantity),
      amount: Number(editForm.amount ?? editingOrder.amount),
      cost: orderCost(editingOrder),
      status: (editForm.status ?? editingOrder.status) as OrderStatus,
      delivery_address: (editForm.delivery_address as string)?.toString().trim() || null,
      notes: editForm.notes?.toString().trim() || null,
    };
    const { error } = await supabase.from("orders").update(updates).eq("id", editingOrder.id).eq("user_id", user.id);
    setEditSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    const next = { ...editingOrder, ...updates } as OrderRow;
    setOrders((prev) => prev.map((order) => (order.id === editingOrder.id ? next : order)));
    if (detail?.id === editingOrder.id) setDetail(next);
    if (editingOrder.status !== "Paid" && updates.status === "Paid") {
      notifySituation({
        kind: "custom",
        title: "Payment Received ✅",
        body: `${editingOrder.customer_name} paid RM ${Number(updates.amount).toFixed(2)}`,
        link: "/orders",
        prefKey: "notif_unpaid",
        dedupeKey: `paid_${editingOrder.id}`,
      }).catch(() => {});
    }
    setEditingOrder(null);
    setEditForm({});
    toast.success(t("order_updated"));
  };

  const inDateRange = (iso: string) => {
    if (!dateFrom && !dateTo) return true;
    const t = new Date(iso).getTime();
    if (dateFrom) {
      const from = new Date(dateFrom + "T00:00:00").getTime();
      if (t < from) return false;
    }
    if (dateTo) {
      const to = new Date(dateTo + "T23:59:59").getTime();
      if (t > to) return false;
    }
    return true;
  };
  const byStatus = active === "All" ? orders : orders.filter((o) => o.status === active);
  const byDate = byStatus.filter((o) => inDateRange(o.created_at));
  const q = searchQuery.trim().toLowerCase();
  const visible = q
    ? byDate.filter((o) => {
        const hay = [
          o.customer_name,
          o.phone ?? "",
          o.code ?? "",
          o.product ?? "",
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      })
    : byDate;
  const dateFilterActive = !!(dateFrom || dateTo);
  const todayCount = orders.filter((o) => new Date(o.created_at).toDateString() === new Date().toDateString()).length;
  const unpaidCount = orders.filter((o) => o.status === "Unpaid").length;

  return (
    <div className="px-5 pt-10 pb-4 space-y-5">
      <header className="flex items-center gap-3">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">{t(bizKey(bizType, "orders"))}</h1>
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-primary/10 text-primary">
          {todayCount} {t(
            bizType === "education" ? "today_count_cases"
            : bizType === "beauty" ? "today_count_appointments"
            : bizType === "property" ? "today_count_leads"
            : bizType === "freelance" ? "today_count_projects"
            : "today_count"
          )}
        </span>
        {refreshing && <span className="text-[10px] text-muted-foreground">↻</span>}
        <button
          onClick={() => navigate({ to: "/import-orders" })}
          className="ml-auto p-2 rounded-full bg-card border border-border/60 active:scale-95"
          aria-label="Import"
          title="Import Excel/CSV"
        >
          <Upload className="h-4 w-4" />
        </button>
        <button onClick={exportPDF} disabled={exportingPdf} className="p-2 rounded-full bg-card border border-border/60 active:scale-95 disabled:opacity-60" aria-label={t("export_pdf")}>
          {exportingPdf ? "…" : "📄"}
        </button>
      </header>

      {/* Compact Public Order Form */}
      {!HIDE_ORDER_FORM && ofCode && (
        <section className="rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] p-3.5 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm">🔗</span>
              <div>
                <p className="text-xs font-semibold text-foreground">{t(pofSectionTitleKey(ofBizType as BizType | null))}</p>
                <p className={`text-[10px] ${ofEnabled ? "text-emerald-500" : "text-muted-foreground"}`}>
                  {ofEnabled ? t("pof_enabled") : t("pof_disabled")}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={async () => {
                if (!user) return;
                const next = !ofEnabled;
                setOfEnabled(next);
                const { error } = await supabase
                  .from("profiles")
                  .update({ order_form_enabled: next } as any)
                  .eq("id", user.id);
                if (error) {
                  setOfEnabled(!next);
                  toast.error(error.message);
                }
              }}
              role="switch"
              aria-checked={ofEnabled}
              className={`relative h-5 w-9 rounded-full transition-colors ${ofEnabled ? "bg-primary" : "bg-muted-foreground/30"}`}
            >
              <span
                className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${ofEnabled ? "translate-x-4" : ""}`}
              />
            </button>
          </div>
          {ofEnabled && (
            <>
              <div className="rounded-lg bg-muted/50 border border-border/60 px-2.5 py-1.5 text-[10px] font-mono text-foreground break-all">
                {`${getPublicOrigin()}/order/${ofCode}`}
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(`${getPublicOrigin()}/order/${ofCode}`);
                    toast.success(t("pof_link_copied"));
                  }}
                  className="py-2 px-1 rounded-lg bg-primary text-primary-foreground text-[10px] font-semibold active:scale-95 flex flex-col items-center gap-1"
                >
                  <Copy size={14} />
                  <span className="leading-none">{t("pof_copy_link")}</span>
                </button>
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(stripEmoji(t(pofWaShareKey(ofBizType as BizType | null)).replace("{link}", `${getPublicOrigin()}/order/${ofCode}`)))}`}
                  target="_blank"
                  rel="noreferrer"
                  className="py-2 px-1 rounded-lg bg-emerald-500 text-white text-[10px] font-semibold text-center active:scale-95 flex flex-col items-center gap-1"
                >
                  <MessageCircle size={14} />
                  <span className="leading-none">WhatsApp</span>
                </a>
                <button
                  type="button"
                  onClick={() => setOfQrOpen(true)}
                  className="py-2 px-1 rounded-lg bg-card border border-border/60 text-[10px] font-semibold active:scale-95 flex flex-col items-center gap-1"
                >
                  <QrCode size={14} />
                  <span className="leading-none">{t("pof_qr_code")}</span>
                </button>
                <a
                  href={`${getPublicOrigin()}/order/${ofCode}`}
                  target="_blank"
                  rel="noreferrer"
                  className="py-2 px-1 rounded-lg bg-card border border-border/60 text-[10px] font-semibold text-center active:scale-95 flex flex-col items-center gap-1"
                >
                  <Eye size={14} />
                  <span className="leading-none">{t("pof_view_form")}</span>
                </a>
              </div>
            </>
          )}
          {ofQrOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onClick={() => setOfQrOpen(false)}>
              <div className="bg-card rounded-3xl p-6 text-center max-w-xs" onClick={(e) => e.stopPropagation()}>
                <p className="text-sm font-semibold mb-3">{t("pof_qr_title")}</p>
                <img src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(`${getPublicOrigin()}/order/${ofCode}`)}`} alt="QR" className="mx-auto h-60 w-60 rounded-xl" />
                <p className="text-[10px] text-muted-foreground mt-3 break-all">{`${getPublicOrigin()}/order/${ofCode}`}</p>
                <button onClick={() => setOfQrOpen(false)} className="mt-4 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold">{t("pof_close")}</button>
              </div>
            </div>
          )}
        </section>
      )}


      {active === "Unpaid" && unpaidCount > 0 && (
        <button onClick={hasFullAccess ? remindAllUnpaid : () => showUpgrade(t("remind_all_unpaid"))} disabled={!!bulkProgress}
          className="w-full py-3 rounded-2xl bg-orange-500 text-white font-semibold text-sm shadow-sm active:scale-[0.99] disabled:opacity-60">
          {bulkProgress
            ? t("sending_progress").replace("{i}", String(bulkProgress.i)).replace("{n}", String(bulkProgress.n))
            : `${hasFullAccess ? "📲" : "🔒"} ${t("remind_all_unpaid")} (${orders.filter((o) => o.status === "Unpaid" && o.phone).length})`}
        </button>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <input
          type="search"
          inputMode="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t("search_orders_placeholder")}
          className="w-full h-10 pl-9 pr-9 rounded-2xl bg-card border border-border text-sm placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 rounded-full flex items-center justify-center text-muted-foreground active:bg-muted"
            aria-label="clear"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="-mx-5 px-5 overflow-x-auto scrollbar-none" id="tour-orders-filters">
        <div className="flex gap-2 w-max">
          {filters.map((f) => {
            const isActive = active === f;
            const label = f === "All" ? t("all") : f === "Paid" ? t("paid") : f === "Unpaid" ? t("unpaid") : t("pending");
            return (
              <button
                key={f}
                onClick={() => setActive(f)}
                className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all flex items-center gap-1.5 ${
                  isActive
                    ? "bg-gradient-to-r from-primary to-primary/80 text-primary-foreground shadow-[var(--shadow-soft)]"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {label}
                {f === "Unpaid" && unpaidCount > 0 && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${isActive ? "bg-white/25" : "bg-red-500 text-white"}`}>
                    {unpaidCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Date range filter */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setDateOpen((v) => !v)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-colors border ${
              dateFilterActive
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-foreground border-border"
            }`}
          >
            📅 {lang === "zh" ? "时间" : lang === "ms" ? "Tarikh" : "Date"}
            {dateFilterActive && <span className="text-[10px] opacity-80">●</span>}
          </button>
          {dateFilterActive && (
            <button
              type="button"
              onClick={() => { setDateFrom(""); setDateTo(""); }}
              className="text-[11px] text-muted-foreground underline"
            >
              {lang === "zh" ? "清除" : lang === "ms" ? "Buang" : "Clear"}
            </button>
          )}
          {dateFilterActive && (
            <span className="text-[11px] text-muted-foreground ml-auto">
              {visible.length} {lang === "zh" ? "条结果" : lang === "ms" ? "hasil" : "results"}
            </span>
          )}
        </div>
        {dateOpen && (
          <div className="rounded-2xl bg-card border border-border/60 p-3 space-y-2 shadow-[var(--shadow-card)]">
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[11px] font-semibold text-muted-foreground">
                {lang === "zh" ? "从" : lang === "ms" ? "Dari" : "From"}
                <input
                  type="date"
                  value={dateFrom}
                  max={dateTo || undefined}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="mt-1 w-full text-sm rounded-lg border border-border bg-background px-2 py-1.5 text-foreground"
                />
              </label>
              <label className="text-[11px] font-semibold text-muted-foreground">
                {lang === "zh" ? "至" : lang === "ms" ? "Hingga" : "To"}
                <input
                  type="date"
                  value={dateTo}
                  min={dateFrom || undefined}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="mt-1 w-full text-sm rounded-lg border border-border bg-background px-2 py-1.5 text-foreground"
                />
              </label>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[
                { k: "today", n: 0 },
                { k: "7d", n: 7 },
                { k: "30d", n: 30 },
              ].map((p) => (
                <button
                  key={p.k}
                  type="button"
                  onClick={() => {
                    const now = new Date();
                    const to = now.toISOString().slice(0, 10);
                    const fromD = new Date(now);
                    fromD.setDate(fromD.getDate() - p.n);
                    setDateFrom(fromD.toISOString().slice(0, 10));
                    setDateTo(to);
                  }}
                  className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-muted text-foreground active:scale-95"
                >
                  {p.k === "today"
                    ? (lang === "zh" ? "今天" : lang === "ms" ? "Hari ini" : "Today")
                    : p.k === "7d"
                      ? (lang === "zh" ? "近7天" : lang === "ms" ? "7 hari" : "Last 7 days")
                      : (lang === "zh" ? "近30天" : lang === "ms" ? "30 hari" : "Last 30 days")}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="space-y-3">
        {loading && <p className="text-center text-sm text-muted-foreground py-10">{t("loading")}</p>}

        {!loading && visible.map((o) => {
          const statusLabel = o.status === "Paid" ? t("paid") : o.status === "Unpaid" ? t("unpaid") : t("pending");
          const removing = removingId === o.id;
          const firstUnpaidId = visible.find((x) => x.status === "Unpaid")?.id;
          return (
            <article
              key={o.id}
              onClick={(e) => {
                if ((e.target as HTMLElement).closest("button,a,[role='menuitem']")) return;
                navigate({ to: "/orders/$orderId", params: { orderId: o.id }, search: {} as never });
              }}
              className={`rounded-2xl bg-white border border-slate-100 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] overflow-hidden cursor-pointer transition-all ${removing ? "opacity-0 scale-95" : "opacity-100"}`}
            >
              {/* Header */}
              <div className="p-4 pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex gap-3 min-w-0 flex-1">
                    <div className="h-12 w-12 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-lg shrink-0">
                      {o.customer_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <div className="flex items-center gap-2 min-w-0 flex-wrap">
                        <span className="font-bold text-slate-900 text-base leading-tight truncate">{o.customer_name}</span>
                        {(o as any).order_source === "online_form" && (
                          <span className="shrink-0 px-2 py-0.5 bg-indigo-50 text-indigo-600 text-[10px] font-medium rounded-full border border-indigo-100/50">
                            🌐 {t("pof_source_online")}
                          </span>
                        )}
                        {(o as any).order_source === "tiktok" && (
                          <span className="shrink-0 px-2 py-0.5 bg-black text-white text-[10px] font-medium rounded-full">
                            🎵 TikTok
                          </span>
                        )}
                      </div>
                      {o.phone ? (
                        <button
                          onClick={(e) => { e.stopPropagation(); setPhoneSheet({ phone: o.phone!, name: o.customer_name }); }}
                          className="flex items-center gap-1.5 text-slate-500 text-sm font-medium"
                        >
                          <Phone className="h-3.5 w-3.5" />
                          <span>{o.phone}</span>
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          onClick={(e) => e.stopPropagation()}
                          aria-label={statusLabel}
                          className={`text-xs font-semibold px-2.5 py-1 rounded-lg flex items-center gap-1.5 active:scale-95 transition ${statusStyles[o.status]}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${o.status === "Paid" ? "bg-emerald-500 animate-pulse" : o.status === "Unpaid" ? "bg-red-500" : "bg-amber-500"}`} />
                          {statusLabel} ▾
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                        {(["Paid", "Unpaid", "Pending"] as OrderStatus[]).map((s) => (
                          <DropdownMenuItem
                            key={s}
                            disabled={s === o.status}
                            onSelect={(e) => { e.preventDefault(); if (s !== o.status) updateStatus(o.id, s); }}
                          >
                            <span className={`inline-block h-2 w-2 rounded-full mr-2 ${s === "Paid" ? "bg-emerald-500" : s === "Unpaid" ? "bg-red-500" : "bg-amber-500"}`} />
                            {s === "Paid" ? t("paid") : s === "Unpaid" ? t("unpaid") : t("pending")}
                            {s === o.status && <Check className="h-3.5 w-3.5 ml-auto" />}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          onClick={(e) => e.stopPropagation()}
                          aria-label={t("order_options")}
                          className="h-6 w-6 rounded-full flex items-center justify-center text-slate-300 hover:text-slate-500 hover:bg-slate-50 active:scale-95"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenuItem onSelect={(e) => { e.preventDefault(); openEdit(o); }}>
                          <Pencil className="h-4 w-4 mr-2" /> {t("edit") || "Edit"}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-red-600 focus:text-red-600"
                          onSelect={(e) => { e.preventDefault(); setPendingDelete(o); }}
                        >
                          <Trash2 className="h-4 w-4 mr-2" /> {t("delete_order") || "Delete"}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                {/* Meta row */}
                <div className="mt-3 flex items-center justify-between border-t border-slate-50 pt-2.5 text-[11px] text-slate-400 tracking-wide">
                  <span className="truncate">{o.code}</span>
                  <span suppressHydrationWarning className="shrink-0 ml-2">{hydrated ? formatTime(o.created_at) : ""}</span>
                </div>
              </div>

              {/* Content */}
              <div className="px-4 py-3 bg-slate-50/60 space-y-2">
                <div className="flex items-center gap-2.5">
                  {(() => {
                    const raw = (o.product ?? "").trim().toLowerCase();
                    // strip trailing " × N" / " x N" / " (variant)" suffix from online-form orders
                    const base = raw
                      .replace(/\s*[×x]\s*\d+\s*$/i, "")
                      .replace(/\s*\([^)]*\)\s*$/i, "")
                      .trim();
                    const img = productImages[raw] || productImages[base];
                    return img ? (
                      <img
                        src={img}
                        alt={o.product}
                        loading="lazy"
                        className="h-9 w-9 rounded-lg object-cover border border-slate-200 shrink-0"
                      />
                    ) : null;
                  })()}
                  <span className="flex-1 min-w-0 text-slate-800 font-semibold text-sm break-words">{o.product}</span>
                  <span className="shrink-0 text-slate-400 text-xs font-medium">× {o.quantity}</span>
                </div>
                {o.delivery_address ? (
                  <div className="flex gap-2 items-start">
                    <MapPin className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
                    <p className="text-slate-500 text-xs leading-relaxed flex-1 break-words">{o.delivery_address}</p>
                  </div>
                ) : null}
                {(() => {
                  const dm = (o as any).delivery_method as string | undefined;
                  const storeAddr = (o as any).store_address_snapshot as string | null | undefined;
                  const tableLabel = (o as any).table_label as string | undefined;
                  if (!dm) return null;
                  let emoji = "🏪", label = t("order_pickup" as any), cls = "bg-amber-50 text-amber-700", sub: string | null = null;
                  if (dm === "delivery") {
                    emoji = "🚗"; label = t("order_delivery" as any); cls = "bg-blue-50 text-blue-600";
                  } else if (dm === "dine_in") {
                    emoji = "🍽️"; label = t("dine_in" as any); cls = "bg-violet-50 text-violet-700";
                    sub = tableLabel ? `🪑 ${tableLabel}` : null;
                  } else if (dm === "takeaway") {
                    emoji = "🛍️"; cls = "bg-amber-50 text-amber-700";
                    label = lang === "zh" ? "外带" : lang === "ms" ? "Bungkus" : "Takeaway";
                    sub = storeAddr ?? null;
                  } else { // pickup
                    sub = storeAddr ?? null;
                  }
                  return (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full ${cls}`}>
                        {emoji} {label}
                      </span>
                      {sub ? (
                        <span className="text-slate-500 text-xs leading-relaxed break-words flex-1 min-w-0">{sub}</span>
                      ) : null}
                    </div>
                  );
                })()}
              </div>

              {/* Footer */}
              <div className="p-4 flex items-center justify-between gap-3">
                <div className="flex flex-col shrink-0">
                  <span className="text-xl font-bold text-slate-900 leading-tight">RM {Number(o.amount).toFixed(2)}</span>
                </div>
                {o.status === "Unpaid" && (
                  <button
                    onClick={(e) => { e.stopPropagation(); remind(o); }}
                    id={o.id === firstUnpaidId ? "tour-orders-remind" : undefined}
                    className="text-xs font-bold px-4 py-2.5 rounded-xl bg-emerald-500 text-white shadow-md shadow-emerald-100 active:scale-95 transition-transform"
                  >
                    {t("remind")}
                  </button>
                )}
                {o.status === "Pending" && (
                  <button
                    onClick={(e) => { e.stopPropagation(); updateStatus(o.id, "Paid"); }}
                    className="text-xs font-bold px-4 py-2.5 rounded-xl bg-amber-400 text-amber-950 shadow-md shadow-amber-100 active:scale-95 transition-transform"
                  >
                    {t("mark_paid")}
                  </button>
                )}
                {o.status === "Paid" && (() => {
                  const url = (o as any).receipt_url as string | null;
                  const confirmed = ((o as any).receipt_confirmed as boolean) ?? false;
                  const uploading = receiptUploadingId === o.id;
                  return (
                    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1 pr-1.5 border-r border-slate-100">
                        <button
                          onClick={() => toggleReceiptConfirmed(o)}
                          aria-label={confirmed ? t("receipt_unconfirmed") : t("receipt_confirmed")}
                          title={confirmed ? t("receipt_confirmed") : t("upload_receipt")}
                          className={`h-8 w-8 rounded-lg flex items-center justify-center active:scale-95 transition ${confirmed ? "bg-emerald-50 text-emerald-600" : "text-slate-400 hover:bg-slate-50"}`}
                        >
                          <FileCheck2 className="h-4 w-4" />
                        </button>
                        {url ? (
                          <>
                            <button
                              onClick={() => viewReceipt(o)}
                              aria-label={t("view_receipt")}
                              title={t("view_receipt")}
                              className="h-8 w-8 rounded-lg text-indigo-500 hover:bg-indigo-50 flex items-center justify-center active:scale-95"
                            >
                              <Paperclip className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => removeReceipt(o)}
                              aria-label={t("receipt_remove")}
                              title={t("receipt_remove")}
                              className="h-8 w-8 rounded-lg text-rose-400 hover:bg-rose-50 flex items-center justify-center active:scale-95"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </>
                        ) : (
                          <label
                            className={`h-8 w-8 rounded-lg text-slate-400 hover:bg-slate-50 flex items-center justify-center cursor-pointer active:scale-95 ${uploading ? "opacity-60 pointer-events-none" : ""}`}
                            title={t("upload_receipt")}
                            aria-label={t("upload_receipt")}
                          >
                            <Upload className="h-4 w-4" />
                            <input
                              type="file"
                              accept="image/*,application/pdf"
                              className="hidden"
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) uploadReceipt(o, f);
                                e.currentTarget.value = "";
                              }}
                            />
                          </label>
                        )}
                      </div>
                      <button
                        onClick={() => sendReceipt(o)}
                        className={`flex items-center gap-1.5 text-xs font-bold px-3 py-2.5 rounded-xl shadow-md active:scale-95 transition-transform ${url ? "bg-emerald-100 text-emerald-700 shadow-emerald-50" : "bg-emerald-500 text-white shadow-emerald-100"}`}
                      >
                        <Check className="h-3.5 w-3.5" />
                        {url ? t("receipt_sent") : t("send_receipt")}
                      </button>
                    </div>
                  );
                })()}
              </div>
            </article>
          );
        })}

        {!loading && visible.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-10">
            {orders.length === 0 ? t("no_orders_create") : t("no_orders_here")}
          </p>
        )}
      </div>

      {detail && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center"
          onClick={() => setDetail(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[390px] bg-background rounded-t-3xl sm:rounded-3xl p-5 space-y-4 max-h-[85vh] overflow-y-auto animate-fade-in"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">{t("order_details")}</h2>
              <button onClick={() => setDetail(null)} className="text-2xl text-muted-foreground leading-none">×</button>
            </div>

            <div className="space-y-2 text-sm">
              <Row label={t("customer_name")} value={detail.customer_name} />
              <Row label={t("phone_number")} value={detail.phone || "—"} />
              <Row label={t("code_label")} value={detail.code} />
              <Row label={t("product")} value={`${detail.product} x${detail.quantity}`} />
              <Row label={t("price")} value={`RM ${Number(detail.amount).toFixed(2)}`} />
              <Row label={t("payment_status")} value={
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusStyles[detail.status]}`}>
                  {detail.status}
                </span>
              } />
              {detail.delivery_address && (
                <Row label={t("delivery_address" as any)} value={detail.delivery_address} />
              )}
              {(() => {
                const dm = (detail as any).delivery_method as string | undefined;
                if (!dm) return null;
                let emoji = "🏪", label = t("order_pickup" as any);
                if (dm === "delivery") { emoji = "🚗"; label = t("order_delivery" as any); }
                else if (dm === "dine_in") { emoji = "🍽️"; label = t("dine_in" as any); }
                else if (dm === "takeaway") { emoji = "🛍️"; label = lang === "zh" ? "外带" : lang === "ms" ? "Bungkus" : "Takeaway"; }
                return <Row label={t("delivery_type" as any)} value={`${emoji} ${label}`} />;
              })()}
              {(() => {
                const dm = (detail as any).delivery_method as string | undefined;
                const storeAddr = (detail as any).store_address_snapshot as string | null | undefined;
                if (!storeAddr) return null;
                const isDel = dm === "delivery";
                return (
                  <Row
                    label={isDel ? t("delivering_from" as any) : t("pickup_at" as any)}
                    value={storeAddr}
                  />
                );
              })()}
              <Row label={t("notes")} value={detail.notes || "—"} />
              <Row label={t("date_label")} value={new Date(detail.created_at).toLocaleString("en-MY")} />
            </div>

            <div className="space-y-2 pt-2">
              <p className="text-[11px] font-semibold uppercase text-muted-foreground">{t("edit_status")}</p>
              <div className="grid grid-cols-3 gap-2">
                {(["Paid", "Unpaid", "Pending"] as OrderStatus[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => updateStatus(detail.id, s)}
                    className={`py-2 rounded-xl text-xs font-semibold ${statusStyles[s]} ${detail.status === s ? "ring-2 ring-primary" : ""}`}
                  >
                    {s === "Paid" ? t("paid") : s === "Unpaid" ? t("unpaid") : t("pending")}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() => setPendingDelete(detail)}
              className="w-full py-3 rounded-2xl bg-red-50 text-red-600 border border-red-200 font-semibold text-sm"
            >
              🗑 {t("delete_order")}
            </button>
          </div>
        </div>
      )}

      <PhoneActionSheet
        open={!!phoneSheet}
        onOpenChange={(o) => { if (!o) setPhoneSheet(null); }}
        phone={phoneSheet?.phone ?? null}
        name={phoneSheet?.name}
      />

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("delete_order") || "Delete order?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete
                ? `${pendingDelete.customer_name} · ${pendingDelete.code} — RM ${Number(pendingDelete.amount).toFixed(2)}`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!deletingId}>{t("cancel") || "Cancel"}</AlertDialogCancel>
            <AlertDialogAction
              disabled={!!deletingId}
              className="bg-red-500 hover:bg-red-600 text-white disabled:opacity-60"
              onClick={async () => {
                if (!pendingDelete) return;
                const target = pendingDelete;
                setPendingDelete(null);
                await remove(target.id);
              }}
            >
              {deletingId ? "..." : (t("delete_order") || "Delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {editingOrder && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center" onClick={() => setEditingOrder(null)}>
          <div className="w-full max-w-[390px] bg-background rounded-t-3xl sm:rounded-3xl p-5 space-y-3 max-h-[88vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between pb-1">
              <h2 className="text-lg font-bold">{t("edit") || "Edit"}</h2>
              <button onClick={() => setEditingOrder(null)} className="h-9 w-9 rounded-full bg-muted text-muted-foreground text-xl leading-none">×</button>
            </div>
            <EditInput label={t("customer_name")} value={editForm.customer_name ?? ""} onChange={(v) => setEditForm((p) => ({ ...p, customer_name: v }))} />
            <PhoneInput label={t("phone_number")} value={(editForm.phone as string) ?? ""} onChange={(v) => setEditForm((p) => ({ ...p, phone: v }))} />
            <EditInput label={t("product")} value={editForm.product ?? ""} onChange={(v) => setEditForm((p) => ({ ...p, product: v }))} />
            <EditInput label={t("quantity")} type="number" value={String(editForm.quantity ?? 1)} onChange={(v) => setEditForm((p) => ({ ...p, quantity: Number(v) }))} />
            <EditInput label={t("price")} type="number" value={String(editForm.amount ?? 0)} onChange={(v) => setEditForm((p) => ({ ...p, amount: Number(v) }))} />
            <div className="space-y-1.5">
              <label className="text-[11px] uppercase font-semibold text-muted-foreground px-1">{t("payment_status")}</label>
              <div className="grid grid-cols-3 gap-2">
                {(["Paid", "Unpaid", "Pending"] as OrderStatus[]).map((s) => (
                  <button key={s} type="button" onClick={() => setEditForm((p) => ({ ...p, status: s }))}
                    className={`py-3 rounded-xl text-xs font-semibold ${editForm.status === s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                    {s === "Paid" ? t("paid") : s === "Unpaid" ? t("unpaid") : t("pending")}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground px-1">{t("delivery_address" as any)}</label>
              <PlacesAutocomplete
                value={(editForm.delivery_address as string) ?? ""}
                onChange={({ address }) => setEditForm((p) => ({ ...p, delivery_address: address }))}
                placeholder={t("delivery_address" as any)}
                className="w-full rounded-2xl bg-card border border-border/60 px-4 py-3 text-sm text-foreground outline-none focus:border-primary"
              />
            </div>
            <EditInput label={t("notes")} value={(editForm.notes as string) ?? ""} onChange={(v) => setEditForm((p) => ({ ...p, notes: v }))} />
            <div className="flex gap-2 pt-2">
              <button onClick={() => setEditingOrder(null)} className="flex-1 py-3 rounded-2xl bg-muted font-semibold text-sm">{t("cancel") || "Cancel"}</button>
              <button onClick={saveEdit} disabled={editSaving} className="flex-1 py-3 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm disabled:opacity-60">
                {editSaving ? t("saving") : t("save")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1 border-b border-border/40 last:border-0">
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground text-right">{value}</span>
    </div>
  );
}

function EditInput({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground px-1">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-2xl bg-card border border-border/60 px-4 py-3 text-sm text-foreground outline-none focus:border-primary" />
    </div>
  );
}