import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useI18n, type Lang } from "@/contexts/I18nContext";
import type {
  getPublicOrderForm,
  submitPublicOrder,
} from "@/lib/public-order.functions";
import { stripEmoji } from "@/lib/wa";
import { ShoppingBag, ShoppingCart, ArrowLeft, X, Plus, Minus, Check, Globe, Search, ChevronLeft, ChevronRight } from "lucide-react";
import bossifyLogo from "@/assets/bossify-logo.png";
import { PhoneInput } from "@/components/PhoneInput";


async function readJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!response.ok) throw new Error(text || `HTTP ${response.status} ${response.statusText}`);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Invalid response from server (HTTP ${response.status})`);
  }
}

async function fetchPublicOrderForm(code: string) {
  const response = await fetch(`/api/public/order-form?code=${encodeURIComponent(code)}`, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  return readJsonResponse<Awaited<ReturnType<typeof getPublicOrderForm>>>(response);
}

async function postPublicOrder(payload: Record<string, unknown>) {
  // Retry once on network failure (status 0 / aborted connection).
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch("/api/public/order-form", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
        cache: "no-store",
        credentials: "omit",
      });
      return await readJsonResponse<Awaited<ReturnType<typeof submitPublicOrder>>>(response);
    } catch (err) {
      lastErr = err;
      // Small backoff before retry
      await new Promise((r) => setTimeout(r, 600));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Network error");
}

export const Route = createFileRoute("/order/$code")({
  component: PublicOrderFormPage,
});

type Variant = { id?: string; name: string; price: number };
type Product = {
  id: string;
  name: string;
  price: number;
  image_url: string | null;
  category: string | null;
  description: string | null;
  variants: Variant[];
  duration_minutes?: number | null;
  stock?: number | null;
  images?: string[];
  property?: {
    property_type: string | null;
    listing_type: string | null;
    bedrooms: number | null;
    bathrooms: number | null;
    size_sqft: number | null;
    address: string | null;
  };
};
type CartLine = {
  productId: string;
  product: string;
  variant: string;
  unit_price: number;
  quantity: number;
  image_url: string | null;
};

type LoadState =
  | { status: "loading" }
  | { status: "error"; reason: "not_found" | "disabled" | "network" }
  | {
      status: "ready";
      profile: {
        business_name: string;
        avatar_url: string | null;
        business_type: string;
        whatsapp_number: string | null;
        language?: string;
        allow_cod?: boolean;
        payment_methods?: Array<{
          type: string | null;
          bank: string | null;
          number: string | null;
          name: string | null;
          qr_url: string | null;
        }>;
      };
      products: Product[];
    };

function PublicOrderFormPage() {
  const { code } = Route.useParams();
  const { t, lang } = useI18n();
  const { setLang } = useI18n();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<null | {
    name: string;
    code: string;
    business: string;
    amount: number;
    paymentMethod: string;
    whatsapp: string | null;
    paymentMethods?: Array<{
      type: string | null;
      bank: string | null;
      number: string | null;
      name: string | null;
      qr_url: string | null;
    }>;
  }>(null);

  // Language picker: shown first if customer hasn't chosen for this session
  const [langPicked, setLangPicked] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return sessionStorage.getItem("pof_lang_picked") === "1";
    } catch {
      return false;
    }
  });
  const [showLangMenu, setShowLangMenu] = useState(false);
  const userPickedRef = useRef<boolean>(langPicked);

  const pickLang = (l: Lang) => {
    userPickedRef.current = true;
    setLang(l);
    try {
      sessionStorage.setItem("pof_lang_picked", "1");
    } catch {
      /* ignore */
    }
    setLangPicked(true);
    setShowLangMenu(false);
  };

  const [activeCategory, setActiveCategory] = useState<string>("__all");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeLocation, setActiveLocation] = useState<string>("__all");
  const [openProductId, setOpenProductId] = useState<string | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [showCheckout, setShowCheckout] = useState(false);


  const [form, setForm] = useState({
    customer_name: "",
    phone: "",
    notes: "",
    address: "",
    fulfilment: "takeaway", // fnb only
    course_interest: "",
    university_preference: "",
    date_time: "",
    budget: "",
    location_interest: "",
    project_description: "",
    deadline: "",
  });
  const [paymentMethod, setPaymentMethod] = useState<"bank_transfer" | "cash_on_delivery" | "">("");
  const upd =
    (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((p) => ({ ...p, [k]: e.target.value }));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchPublicOrderForm(code);
        if (cancelled) return;
        if (!res.ok) {
          setState({ status: "error", reason: res.reason });
          return;
        }
        setState({
          status: "ready",
          profile: res.profile,
          products: res.products as Product[],
        });
        // Only auto-apply seller's language if the customer hasn't chosen their own
        if (
          !userPickedRef.current &&
          (res.profile.language === "en" || res.profile.language === "ms" || res.profile.language === "zh")
        ) {
          setLang(res.profile.language);
        }
      } catch {
        if (!cancelled) setState({ status: "error", reason: "network" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, setLang]);

  const categories = useMemo(() => {
    if (state.status !== "ready") return [] as string[];
    const set = new Set<string>();
    for (const p of state.products) if (p.category) set.add(p.category);
    return Array.from(set).sort();
  }, [state]);

  // Extract a short area label from a full address (take last comma segment,
  // strip postcodes). Falls back to the trimmed address itself.
  const extractArea = (addr: string | null | undefined): string => {
    if (!addr) return "";
    const cleaned = addr.replace(/\b\d{4,6}\b/g, "").trim();
    const parts = cleaned.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length === 0) return "";
    // Prefer second-to-last segment (city/area), fallback to last.
    return parts.length >= 2 ? parts[parts.length - 2] : parts[parts.length - 1];
  };

  const locations = useMemo(() => {
    if (state.status !== "ready") return [] as string[];
    const set = new Set<string>();
    for (const p of state.products) {
      const area = extractArea(p.property?.address);
      if (area) set.add(area);
    }
    return Array.from(set).sort();
  }, [state]);

  const filteredProducts = useMemo(() => {
    if (state.status !== "ready") return [] as Product[];
    let list = state.products;
    if (activeCategory !== "__all") {
      list = list.filter((p) => (p.category ?? "") === activeCategory);
    }
    if (activeLocation !== "__all") {
      list = list.filter((p) => extractArea(p.property?.address) === activeLocation);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q));
    }
    return list;
  }, [state, activeCategory, activeLocation, searchQuery]);


  const bizType = state.status === "ready" ? state.profile.business_type : "retail";
  const isRetailish = bizType === "retail" || bizType === "fnb";
  const cartTotal = cart.reduce((s, l) => s + l.unit_price * (isRetailish ? l.quantity : 1), 0);
  const cartCount = cart.reduce((s, l) => s + (isRetailish ? l.quantity : 1), 0);

  const addToCart = (line: CartLine) => {
    setCart((prev) => {
      if (!isRetailish) return [line]; // services: only one selection at a time
      const key = `${line.productId}::${line.variant}`;
      const existing = prev.find((l) => `${l.productId}::${l.variant}` === key);
      if (existing) {
        return prev.map((l) =>
          l === existing ? { ...l, quantity: l.quantity + line.quantity } : l,
        );
      }
      return [...prev, line];
    });
  };

  const updateLineQty = (idx: number, delta: number) => {
    setCart((prev) =>
      prev
        .map((l, i) => (i === idx ? { ...l, quantity: Math.max(0, l.quantity + delta) } : l))
        .filter((l) => l.quantity > 0),
    );
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (state.status !== "ready") return;
    if (!form.customer_name.trim() || !form.phone.trim() || cart.length === 0) return;
    const bt = state.profile.business_type;
    const needsPayment = bt === "retail" || bt === "fnb";
    if (needsPayment && !paymentMethod) {
      alert(t("select_payment_method"));
      return;
    }
    setSubmitting(true);
    try {
      const res = await postPublicOrder({
        code,
        customer_name: form.customer_name.trim(),
        phone: form.phone.trim(),
        items: cart.map((l) => ({
          product: l.product,
          variant: l.variant,
          quantity: l.quantity,
          unit_price: l.unit_price,
          listing_id: bizType === "property" ? l.productId : undefined,
        })),
        listing_id: bizType === "property" && cart.length > 0 ? cart[0].productId : undefined,
        notes: form.notes,
        address: form.address,
        fulfilment: bizType === "fnb" ? form.fulfilment : "",
        course_interest: form.course_interest,
        university_preference: form.university_preference,
        date_time: form.date_time,
        budget: form.budget,
        location_interest: form.location_interest,
        project_description: form.project_description,
        deadline: form.deadline,
        payment_method: needsPayment ? paymentMethod : undefined,
      });
      if (res.ok) {
        setDone({
          name: form.customer_name.trim(),
          code: res.code,
          business: res.business_name || state.profile.business_name,
          amount: cartTotal,
          paymentMethod: needsPayment ? paymentMethod : "",
          whatsapp: state.profile.whatsapp_number || null,
          paymentMethods: state.profile.payment_methods ?? [],
        });
      } else {
        const reason = (res as any).reason;
        if (reason === "shop_closed" || reason === "disabled") {
          setState({ status: "error", reason: "disabled" });
          return;
        }
        const detail = (res as any).error || reason || "";
        alert(`${t("order_save_failed")}${detail ? `\n\n${detail}` : ""}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`${t("order_save_failed")}\n\n${msg}`);
    } finally {
      setSubmitting(false);
    }
  };

  if (state.status === "loading") {
    return (
      <div className="pof-scope min-h-screen flex items-center justify-center">
        <PofStyles />
        <p className="text-sm text-muted-foreground">{t("loading")}</p>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="pof-scope min-h-screen flex items-center justify-center px-6">
        <PofStyles />
        <div className="text-center max-w-sm">
          <div className="text-5xl mb-3">😢</div>
          <h1 className="text-xl font-bold">
            {state.reason === "disabled" ? t("pof_form_disabled") : t("pof_not_found")}
          </h1>
          <p className="text-sm text-muted-foreground mt-2">
            {state.reason === "disabled" ? t("pof_form_disabled_sub") : t("pof_not_found_sub")}
          </p>
          <a
            href="https://bossify-malaysia.lovable.app"
            className="inline-block mt-6 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold"
          >
            Bossify
          </a>
        </div>
      </div>
    );
  }

  // ---- Language picker screen ----
  if (!langPicked) {
    return (
      <div className="pof-scope min-h-screen flex items-center justify-center px-6">
        <PofStyles />
        <div className="w-full max-w-sm text-center">
          <img
            src={bossifyLogo}
            alt="Bossify"
            className="mx-auto mb-6 h-20 w-20 object-contain"
          />
          <h1 className="text-xl font-bold">Bossify</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Choose your language · Pilih bahasa · 选择语言
          </p>
          <div className="mt-8 space-y-2.5">
            {([
              { code: "en" as Lang, label: "English", sub: "Continue in English" },
              { code: "ms" as Lang, label: "Bahasa Malaysia", sub: "Teruskan dalam Bahasa Malaysia" },
              { code: "zh" as Lang, label: "中文", sub: "继续使用中文" },
            ]).map((opt) => (
              <button
                key={opt.code}
                type="button"
                onClick={() => pickLang(opt.code)}
                className="w-full px-5 py-4 rounded-2xl border border-border bg-card text-left active:scale-[0.99] transition-transform flex items-center justify-between"
              >
                <span>
                  <span className="block text-sm font-bold">{opt.label}</span>
                  <span className="block text-[11px] text-muted-foreground mt-0.5">{opt.sub}</span>
                </span>
                <span className="text-primary text-lg">→</span>
              </button>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground mt-10">Powered by Bossify 💜</p>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="pof-scope min-h-screen flex flex-col items-center justify-center px-6">
        <PofStyles />
        <div className="text-center max-w-sm">
          <div className="mx-auto mb-6 h-24 w-24 rounded-full bg-emerald-100 flex items-center justify-center animate-scale-in">
            <svg
              className="h-14 w-14 text-emerald-500"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold">
            {t("pof_thanks").replace("{name}", done.name)} 🎉
          </h1>
          <p className="text-sm text-muted-foreground mt-3">{t("pof_will_contact")}</p>
          <div className="mt-6 rounded-2xl border border-border bg-card px-5 py-4">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Order</p>
            <p className="text-sm font-mono font-semibold mt-1">{done.code}</p>
            <p className="text-xs text-muted-foreground mt-2">— {done.business}</p>
          </div>
          {done.paymentMethod !== "cash_on_delivery" && (done.paymentMethods?.some((m) => m && m.type)) && (
            <div className="mt-4 rounded-2xl border border-border bg-card px-5 py-4 text-left">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground text-center">
                💳 {lang === "zh" ? "付款方式" : lang === "ms" ? "Maklumat Pembayaran" : "Payment Details"}
              </p>
              <div className="mt-3 space-y-3">
                {done.paymentMethods!.filter((m) => m && m.type).map((m, i) => (
                  <div key={i} className="rounded-xl bg-muted/40 border border-border/60 px-3 py-2.5 space-y-0.5">
                    <p className="text-sm font-semibold">{m.type}</p>
                    {m.bank && <p className="text-xs text-muted-foreground">{lang === "zh" ? "银行" : "Bank"}: {m.bank}</p>}
                    {m.number && <p className="text-xs font-mono break-all">{m.number}</p>}
                    {m.name && <p className="text-xs text-muted-foreground">{lang === "zh" ? "户名" : lang === "ms" ? "Nama" : "Name"}: {m.name}</p>}
                    {m.qr_url && (
                      <img src={m.qr_url} alt="QR" className="mt-2 h-32 w-32 rounded-lg object-contain bg-white p-1 border border-border/60" />
                    )}
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground mt-3 text-center">
                {lang === "zh"
                  ? `请支付 RM${done.amount.toFixed(2)} 并发送收据`
                  : lang === "ms"
                  ? `Sila bayar RM${done.amount.toFixed(2)} dan hantar resit`
                  : `Please pay RM${done.amount.toFixed(2)} and send your receipt`}
              </p>
            </div>
          )}
          {done.paymentMethod === "bank_transfer" && done.whatsapp && (() => {
            const amountStr = done.amount.toFixed(2);
            const msg =
              lang === "zh"
                ? `你好 ${done.business}，我已完成订单 ${done.code} 的付款 RM${amountStr}，请查收我的转账收据。`
                : lang === "ms"
                ? `Hai ${done.business}, saya telah membuat pembayaran untuk pesanan ${done.code} sebanyak RM${amountStr}. Sila semak resit saya.`
                : `Hi ${done.business}, I have made payment for order ${done.code} amounting to RM${amountStr}. Please find my receipt attached.`;
            const phone = done.whatsapp.replace(/[^0-9]/g, "");
            const href = `https://wa.me/${phone}?text=${encodeURIComponent(stripEmoji(msg))}`;
            const label =
              lang === "zh"
                ? "📎 发送付款收据"
                : lang === "ms"
                ? "📎 Hantar Resit Pembayaran"
                : "📎 Send Payment Receipt";
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-6 inline-flex w-full items-center justify-center gap-2 px-5 py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-semibold text-sm shadow-md active:scale-[0.99] transition"
              >
                {label}
              </a>
            );
          })()}
        </div>
        <p className="text-[11px] text-muted-foreground mt-10">
          {lang === "ms" ? "Dikuasakan oleh" : lang === "zh" ? "由" : "Powered by"} Bossify 💜
        </p>
      </div>
    );
  }

  const { profile, products } = state;
  const initials = (profile.business_name || "?").slice(0, 2).toUpperCase();
  const noProducts = products.length === 0;

  const submitLabelKey =
    bizType === "education" || bizType === "property"
      ? "pof_submit_enquiry"
      : bizType === "beauty"
        ? "pof_book_appt"
        : bizType === "freelance"
          ? "pof_submit_project"
          : "pof_submit";

  const formMeta = (() => {
    switch (bizType) {
      case "education":
      case "property":
        return { titleKey: "pof_title_enquiry" as const, taglineKey: "pof_tagline_enquiry" as const };
      case "beauty":
        return { titleKey: "pof_title_booking" as const, taglineKey: "pof_tagline_booking" as const };
      case "freelance":
        return { titleKey: "pof_title_project" as const, taglineKey: "pof_tagline_project" as const };
      default:
        return { titleKey: "pof_title_retail" as const, taglineKey: "pof_tagline_retail" as const };
    }
  })();

  const labels = (() => {
    switch (bizType) {
      case "education":
      case "beauty":
      case "freelance":
        return { name: t("f_client_name") };
      case "property":
        return { name: t("f_client_name") };
      default:
        return { name: t("customer_name") };
    }
  })();

  // Inline localized labels (avoid i18n churn for new keys)
  const L = (en: string, ms: string, zh: string) =>
    lang === "ms" ? ms : lang === "zh" ? zh : en;

  const browseLabel = L(
    isRetailish ? "Browse menu" : "Browse",
    isRetailish ? "Lihat menu" : "Lihat",
    isRetailish ? "浏览" : "浏览",
  );
  const allLabel = L("All", "Semua", "全部");
  const addLabel = L("Add", "Tambah", "添加");
  const selectLabel = L("Select", "Pilih", "选择");
  const viewCartLabel = isRetailish
    ? L("View cart", "Lihat troli", "查看购物车")
    : L("Continue", "Teruskan", "继续");
  const checkoutLabel = L("Checkout", "Bayar", "结账");
  const cartLabel = isRetailish ? L("Your cart", "Troli anda", "您的购物车") : L("Your selection", "Pilihan anda", "您的选择");
  const detailsLabel = L("Your details", "Maklumat anda", "您的信息");
  const fulfilmentLabel = L("Order type", "Jenis pesanan", "订单类型");
  const dineIn = L("Dine-in", "Makan di sini", "堂食");
  const takeaway = L("Takeaway", "Bungkus", "外带");
  const delivery = L("Delivery", "Hantar", "外送");
  const addressLabel = L("Delivery address", "Alamat penghantaran", "送货地址");
  const totalLabel = L("Total", "Jumlah", "总计");
  const emptyCartLabel = L(
    isRetailish ? "Your cart is empty" : "Nothing selected yet",
    isRetailish ? "Troli anda kosong" : "Belum ada pilihan",
    isRetailish ? "购物车是空的" : "尚未选择",
  );
  const removeLabel = L("Remove", "Buang", "移除");
  const searchPlaceholder = bizType === "property"
    ? L("Search properties...", "Cari hartanah...", "搜索房源...")
    : L("Search products...", "Cari produk...", "搜索产品...");
  const noResultsLabel = L("No products found", "Produk tidak dijumpai", "找不到产品");
  const contactSellerLabel = L("Contact Seller", "Hubungi Penjual", "联系卖家");
  const waMessage = L(
    "Hello, I would like to enquire about my order",
    "Helo, saya ingin bertanya tentang pesanan saya",
    "你好，我想询问关于订单的问题",
  );

  // Detail sheet (product / service detail)
  const renderDetailSheet = () => {
    if (!openProduct) return null;
    return (
      <DetailSheet
        product={openProduct}
        isRetailish={isRetailish}
        addLabel={addToCartLabelFor(bizType, lang)}
        onClose={() => setOpenProduct(null)}
        onAdd={(line) => {
          addToCart(line);
          setOpenProduct(null);
        }}
        lang={lang}
      />
    );
  };

  // ---- Catalog screen ----
  if (!showCheckout) {
    return (
      <div className="pof-scope min-h-screen flex justify-center pb-28">
        <div className="w-full max-w-[420px]">
          {/* Hero header */}
          <header className="pof-hero px-5 pt-10 pb-6 rounded-b-3xl text-white">
            <div className="flex items-center gap-3">
              <div className="h-14 w-14 rounded-2xl bg-white/15 backdrop-blur ring-1 ring-white/30 flex items-center justify-center text-lg font-bold overflow-hidden">
                {profile.avatar_url ? (
                  <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  initials
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] uppercase tracking-wider text-white/70">{t(formMeta.titleKey)}</p>
                <h1 className="text-lg font-bold truncate">{profile.business_name}</h1>
              </div>
              <LangSwitcher
                lang={lang}
                open={showLangMenu}
                onToggle={() => setShowLangMenu((v) => !v)}
                onPick={pickLang}
                variant="hero"
              />
            </div>
            <p className="mt-4 text-xs text-white/80">{browseLabel}</p>
          </header>

          <div className="px-5 pt-5 space-y-5">

          {!noProducts && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full rounded-xl border border-border bg-card pl-9 pr-3 py-2.5 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 h-6 w-6 rounded-full bg-muted flex items-center justify-center text-muted-foreground"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          )}

          {noProducts ? (
            <div className="rounded-2xl border border-dashed border-border bg-muted/40 px-4 py-8 text-center text-xs text-muted-foreground">
              {bizType === "property"
                ? L(
                    "No listings available right now. Please contact the agent.",
                    "Tiada hartanah tersedia buat masa ini. Sila hubungi ejen.",
                    "目前没有可售房源，请联系经纪。",
                  )
                : isRetailish
                ? L(
                    "The seller hasn't added any products yet. Please try again later.",
                    "Penjual belum menambah produk. Sila cuba semula nanti.",
                    "卖家尚未添加产品，请稍后再试。",
                  )
                : L(
                    "The seller hasn't listed any services yet. Please try again later.",
                    "Penjual belum menyediakan perkhidmatan. Sila cuba semula nanti.",
                    "卖家尚未提供服务，请稍后再试。",
                  )}
            </div>
          ) : (
            <>
              {categories.length > 0 && (
                <div className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1 no-scrollbar">
                  <CategoryChip
                    label={allLabel}
                    active={activeCategory === "__all"}
                    onClick={() => setActiveCategory("__all")}
                  />
                  {categories.map((c) => (
                    <CategoryChip
                      key={c}
                      label={c}
                      active={activeCategory === c}
                      onClick={() => setActiveCategory(c)}
                    />
                  ))}
                </div>
              )}

              {bizType === "property" && locations.length > 0 && (
                <div className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1 no-scrollbar">
                  <CategoryChip
                    label={`📍 ${allLabel}`}
                    active={activeLocation === "__all"}
                    onClick={() => setActiveLocation("__all")}
                  />
                  {locations.map((loc) => (
                    <CategoryChip
                      key={loc}
                      label={loc}
                      active={activeLocation === loc}
                      onClick={() => setActiveLocation(loc)}
                    />
                  ))}
                </div>
              )}

              {bizType === "property" ? (
                <div className="space-y-3">
                  {filteredProducts.map((p) => {
                    const prop = p.property;
                    const isRent = prop?.listing_type === "rent";
                    const typeLabel = isRent
                      ? L("For Rent", "Untuk Disewa", "出租")
                      : L("For Sale", "Untuk Dijual", "出售");
                    const enquireLabel = L("Enquire", "Pertanyaan", "查询");
                    return (
                      <div key={p.id} className="rounded-2xl bg-card overflow-hidden pof-card">
                        <button
                          type="button"
                          onClick={() => setOpenProduct(p)}
                          className="block w-full text-left"
                        >
                          <div className="aspect-[16/10] w-full bg-muted/40 overflow-hidden">
                            {p.image_url ? (
                              <img src={p.image_url} alt={p.name} loading="lazy" className="h-full w-full object-cover" />
                            ) : (
                              <div className="h-full w-full flex items-center justify-center text-muted-foreground/40">
                                <ShoppingBag size={32} />
                              </div>
                            )}
                          </div>
                        </button>
                        <div className="p-3 space-y-1.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${isRent ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"}`}>
                              {typeLabel}
                            </span>
                            {prop?.property_type && (
                              <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                                {prop.property_type}
                              </span>
                            )}
                          </div>
                          <p className="text-[14px] font-semibold leading-tight line-clamp-2">{p.name}</p>
                          {prop?.address && (
                            <p className="text-[11px] text-muted-foreground line-clamp-1">📍 {prop.address}</p>
                          )}
                          <p className="text-base font-bold text-primary">
                            RM {Number(p.price || 0).toLocaleString("en-MY", { minimumFractionDigits: 0 })}
                            {isRent && <span className="text-[11px] font-normal text-muted-foreground"> / {L("mo", "bln", "月")}</span>}
                          </p>
                          {(prop?.bedrooms || prop?.bathrooms || prop?.size_sqft) && (
                            <div className="flex items-center gap-3 text-[11px] text-muted-foreground pt-0.5">
                              {prop?.bedrooms ? <span>🛏 {prop.bedrooms}</span> : null}
                              {prop?.bathrooms ? <span>🛁 {prop.bathrooms}</span> : null}
                              {prop?.size_sqft ? <span>📐 {prop.size_sqft} sqft</span> : null}
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() => setOpenProduct(p)}
                            className="mt-2 w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold active:scale-[0.99] transition-transform"
                          >
                            {enquireLabel}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
              <div className="grid grid-cols-2 gap-3">
                {filteredProducts.map((p) => (
                  <div
                    key={p.id}
                    className="relative rounded-2xl bg-card overflow-hidden pof-card"
                  >
                    <button
                      type="button"
                      onClick={() => setOpenProduct(p)}
                      className="block w-full text-left active:scale-[0.98] transition-transform"
                    >
                      <div className="aspect-square w-full bg-muted/40 overflow-hidden">
                        {p.image_url ? (
                          <img src={p.image_url} alt={p.name} loading="lazy" className="h-full w-full object-cover" />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center text-muted-foreground/40">
                            <ShoppingBag size={32} />
                          </div>
                        )}
                      </div>
                      <div className="p-3 pb-12 space-y-1">
                        {p.category && (
                          <p className="text-[9px] font-semibold tracking-wider uppercase text-primary/80 truncate">
                            {p.category}
                          </p>
                        )}
                        <p className="text-[13px] font-semibold leading-tight line-clamp-2 min-h-[2.4em]">{p.name}</p>
                        <p className="text-sm font-bold text-primary">
                          {p.variants && p.variants.length > 0 ? "from " : ""}
                          RM {Number(p.price || (p.variants?.[0]?.price ?? 0)).toFixed(2)}
                        </p>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setOpenProduct(p)}
                      aria-label={addLabel}
                      className="absolute bottom-2.5 right-2.5 h-9 w-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-md active:scale-95 transition-transform"
                    >
                      <Plus size={18} strokeWidth={3} />
                    </button>
                  </div>
                ))}
              </div>
              )}
              {filteredProducts.length === 0 && searchQuery.trim() && (
                <div className="rounded-2xl border border-dashed border-border bg-muted/40 px-4 py-8 text-center text-xs text-muted-foreground">
                  {noResultsLabel}
                </div>
              )}
            </>
          )}

          {profile.whatsapp_number && (
            <a
              href={`https://wa.me/${profile.whatsapp_number.replace(/\D/g, '')}?text=${encodeURIComponent(stripEmoji(waMessage))}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl bg-[#25D366] text-white font-semibold text-sm shadow-md active:scale-[0.99] transition-transform"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              {contactSellerLabel}
            </a>
          )}

          <p className="text-[10px] text-center text-muted-foreground pt-2">
            {lang === "ms" ? "Dikuasakan oleh" : lang === "zh" ? "由" : "Powered by"} Bossify
          </p>
          </div>
        </div>

        {cart.length > 0 && (
          <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[420px] px-4 pb-4 pt-2 bg-gradient-to-t from-background via-background to-transparent">
            <button
              type="button"
              onClick={() => setShowCheckout(true)}
              className="w-full py-3.5 rounded-2xl bg-primary text-primary-foreground font-bold text-sm shadow-lg flex items-center justify-between px-5 active:scale-[0.99] transition-transform"
            >
              <span className="flex items-center gap-2.5">
                <span className="relative inline-flex h-8 w-8 rounded-full bg-white/20 items-center justify-center">
                  <ShoppingCart size={16} />
                  {isRetailish && (
                    <span className="absolute -top-1 -right-1 h-5 min-w-5 px-1 rounded-full bg-white text-primary text-[10px] font-bold flex items-center justify-center">
                      {cartCount}
                    </span>
                  )}
                </span>
                {viewCartLabel}
              </span>
              <span>RM {cartTotal.toFixed(2)}</span>
            </button>
          </div>
        )}

        {renderDetailSheet()}
        <PofStyles />
      </div>
    );
  }

  // ---- Checkout screen ----
  return (
    <div className="pof-scope min-h-screen flex justify-center">
      <div className="w-full max-w-[420px] px-5 pt-8 pb-10 space-y-5">
        <header className="flex items-center gap-3 sticky top-0 -mx-5 px-5 py-3 bg-background/90 backdrop-blur z-10">
          <button
            type="button"
            onClick={() => setShowCheckout(false)}
            className="h-9 w-9 rounded-full bg-card border border-border flex items-center justify-center text-sm"
            aria-label="Back"
          >
            <ArrowLeft size={16} />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold">{checkoutLabel}</h1>
            <p className="text-[11px] text-muted-foreground">{t(formMeta.taglineKey)}</p>
          </div>
          <LangSwitcher
            lang={lang}
            open={showLangMenu}
            onToggle={() => setShowLangMenu((v) => !v)}
            onPick={pickLang}
            variant="plain"
          />
        </header>

        {/* Cart summary */}
        <section className="space-y-2">
          <p className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground px-1">{cartLabel}</p>
          {cart.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-xs text-muted-foreground">
              {emptyCartLabel}
            </div>
          ) : (
            <div className="space-y-2">
              {cart.map((l, i) => (
                <div key={`${l.productId}-${l.variant}-${i}`} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-2.5">
                  <div className="h-14 w-14 rounded-xl bg-muted/40 overflow-hidden flex-shrink-0">
                    {l.image_url ? (
                      <img src={l.image_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-xl text-muted-foreground/40">
                        {isRetailish ? "🛍️" : "✨"}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold leading-tight truncate">{l.product}</p>
                    {l.variant && <p className="text-[11px] text-muted-foreground truncate">{l.variant}</p>}
                    <p className="text-xs font-bold text-primary mt-0.5">
                      RM {(l.unit_price * (isRetailish ? l.quantity : 1)).toFixed(2)}
                    </p>
                  </div>
                  {isRetailish ? (
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => updateLineQty(i, -1)} className="h-7 w-7 rounded-full bg-muted text-sm font-bold">−</button>
                      <span className="w-6 text-center text-xs font-semibold">{l.quantity}</span>
                      <button type="button" onClick={() => updateLineQty(i, 1)} className="h-7 w-7 rounded-full bg-primary text-primary-foreground text-sm font-bold">+</button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setCart((p) => p.filter((_, j) => j !== i))}
                      className="text-[11px] text-rose-500 px-2"
                    >
                      {removeLabel}
                    </button>
                  )}
                </div>
              ))}
              <div className="flex items-center justify-between px-2 pt-1">
                <span className="text-sm font-semibold">{totalLabel}</span>
                <span className="text-lg font-bold text-primary">RM {cartTotal.toFixed(2)}</span>
              </div>
            </div>
          )}
        </section>

        <form onSubmit={onSubmit} className="space-y-4">
          <p className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground px-1">{detailsLabel}</p>
          <Field label={`${labels.name} *`}>
            <input
              required
              value={form.customer_name}
              onChange={upd("customer_name")}
              className="pof-input"
              maxLength={120}
            />
          </Field>
          <Field label={`${t("phone_number")} *`}>
            <PhoneInput
              value={form.phone}
              onChange={(full) => setForm((p) => ({ ...p, phone: full }))}
              placeholder="123456789"
            />
          </Field>

          {(bizType === "retail" || bizType === "fnb") && (
            <Field label={addressLabel}>
              <textarea rows={2} value={form.address} onChange={upd("address")} className="pof-input" maxLength={500} />
            </Field>
          )}

          {bizType === "education" && (
            <>
              <Field label={t("f_course_interest")}>
                <input value={form.course_interest} onChange={upd("course_interest")} className="pof-input" maxLength={160} />
              </Field>
              <Field label={t("f_university_preference")}>
                <input value={form.university_preference} onChange={upd("university_preference")} className="pof-input" maxLength={160} />
              </Field>
            </>
          )}

          {(bizType === "beauty" || bizType === "freelance") && (
            <Field label={t("f_date_time")}>
              <input
                type="datetime-local"
                value={form.date_time}
                onChange={upd("date_time")}
                className="pof-input"
              />
            </Field>
          )}

          {bizType === "property" && (
            <>
              <Field label={t("f_budget")}>
                <input value={form.budget} onChange={upd("budget")} className="pof-input" maxLength={64} />
              </Field>
              <Field label={t("f_location_interest")}>
                <input value={form.location_interest} onChange={upd("location_interest")} className="pof-input" maxLength={160} />
              </Field>
            </>
          )}

          {bizType === "freelance" && (
            <Field label={t("f_project_description")}>
              <textarea rows={3} value={form.project_description} onChange={upd("project_description")} className="pof-input" maxLength={2000} />
            </Field>
          )}

          <Field label={t("notes")}>
            <textarea rows={3} value={form.notes} onChange={upd("notes")} className="pof-input" maxLength={2000} />
          </Field>

          {isRetailish && (
            <Field label={`${t("pof_payment_method")} *`}>
              <div className="space-y-2">
                {(() => {
                  const methods = state.profile.payment_methods ?? [];
                  const allowCod = state.profile.allow_cod !== false;
                  return (
                    <>
                      <label
                        className={`flex items-start gap-3 p-3 rounded-2xl border cursor-pointer transition-colors ${paymentMethod === "bank_transfer" ? "border-primary bg-primary/5" : "border-border bg-card"}`}
                      >
                        <input
                          type="radio"
                          name="pof_payment"
                          value="bank_transfer"
                          checked={paymentMethod === "bank_transfer"}
                          onChange={() => setPaymentMethod("bank_transfer")}
                          className="mt-1 accent-primary"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold">🏦 {t("bank_transfer")}</p>
                          {methods.length > 0 ? (
                            <ul className="mt-1.5 space-y-1">
                              {methods.map((m, i) => (
                                <li key={i} className="text-[12px] text-muted-foreground leading-tight">
                                  <span className="font-medium text-foreground">{m.bank || m.type || "Bank"}</span>
                                  {m.number ? <span> · {m.number}</span> : null}
                                  {m.name ? <span> · {m.name}</span> : null}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-[11px] text-muted-foreground mt-1">{t("no_bank_set")}</p>
                          )}
                        </div>
                      </label>
                      {allowCod && (
                        <label
                          className={`flex items-start gap-3 p-3 rounded-2xl border cursor-pointer transition-colors ${paymentMethod === "cash_on_delivery" ? "border-primary bg-primary/5" : "border-border bg-card"}`}
                        >
                          <input
                            type="radio"
                            name="pof_payment"
                            value="cash_on_delivery"
                            checked={paymentMethod === "cash_on_delivery"}
                            onChange={() => setPaymentMethod("cash_on_delivery")}
                            className="mt-1 accent-primary"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold">💵 {t("cash_on_delivery")}</p>
                          </div>
                        </label>
                      )}
                    </>
                  );
                })()}
              </div>
            </Field>
          )}

          <button
            type="submit"
            disabled={submitting || cart.length === 0}
            className="w-full py-4 rounded-2xl bg-primary text-primary-foreground font-bold text-sm shadow-lg disabled:opacity-60 active:scale-[0.99] transition-transform"
          >
            {submitting ? t("saving") : t(submitLabelKey)}
          </button>

          <p className="text-[10px] text-center text-muted-foreground pt-2">
            {lang === "ms" ? "Dikuasakan oleh" : lang === "zh" ? "由" : "Powered by"} Bossify
          </p>
        </form>

        <PofStyles />
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground px-1">
        {label}
      </label>
      {children}
    </div>
  );
}

function CategoryChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
        active ? "bg-primary text-primary-foreground border-primary" : "bg-card text-foreground border-border"
      }`}
    >
      {label}
    </button>
  );
}

function LangSwitcher({
  lang,
  open,
  onToggle,
  onPick,
  variant,
}: {
  lang: Lang;
  open: boolean;
  onToggle: () => void;
  onPick: (l: Lang) => void;
  variant: "hero" | "plain";
}) {
  const label = lang === "ms" ? "BM" : lang === "zh" ? "中" : "EN";
  const btnClass =
    variant === "hero"
      ? "h-9 px-2.5 rounded-full bg-white/15 backdrop-blur ring-1 ring-white/30 text-white flex items-center gap-1.5 text-[11px] font-semibold"
      : "h-9 px-2.5 rounded-full bg-card border border-border flex items-center gap-1.5 text-[11px] font-semibold";
  return (
    <div className="relative">
      <button type="button" onClick={onToggle} className={btnClass} aria-label="Language">
        <Globe size={14} />
        <span>{label}</span>
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-label="Close language menu"
            className="fixed inset-0 z-40"
            onClick={onToggle}
          />
          <div className="absolute right-0 top-full mt-2 z-50 w-48 rounded-2xl bg-white border border-gray-200 shadow-xl overflow-hidden">
            {([
              { code: "en" as Lang, label: "English" },
              { code: "ms" as Lang, label: "Bahasa Malaysia" },
              { code: "zh" as Lang, label: "中文" },
            ]).map((opt) => (
              <button
                key={opt.code}
                type="button"
                onClick={() => onPick(opt.code)}
                className={`w-full px-4 py-3 text-left text-sm flex items-center justify-between transition-colors ${
                  lang === opt.code
                    ? "bg-[#f3f0ff] text-[#7C3AED] font-semibold"
                    : "text-[#1a1a1a] hover:bg-gray-50"
                }`}
              >
                <span>{opt.label}</span>
                {lang === opt.code && <Check size={16} />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function addToCartLabelFor(bizType: string, lang: "en" | "ms" | "zh") {
  const isRetailish = bizType === "retail" || bizType === "fnb";
  if (isRetailish) {
    return lang === "ms" ? "Tambah ke troli" : lang === "zh" ? "加入购物车" : "Add to cart";
  }
  if (bizType === "beauty") return lang === "ms" ? "Pilih perkhidmatan" : lang === "zh" ? "选择服务" : "Select service";
  if (bizType === "education" || bizType === "property")
    return lang === "ms" ? "Buat pertanyaan" : lang === "zh" ? "查询" : "Enquire";
  if (bizType === "freelance") return lang === "ms" ? "Tempah" : lang === "zh" ? "预订" : "Book";
  return lang === "ms" ? "Pilih" : lang === "zh" ? "选择" : "Select";
}

function DetailSheet({
  product,
  isRetailish,
  addLabel,
  onClose,
  onAdd,
  lang,
}: {
  product: Product;
  isRetailish: boolean;
  addLabel: string;
  onClose: () => void;
  onAdd: (line: CartLine) => void;
  lang: "en" | "ms" | "zh";
}) {
  const hasVariants = product.variants && product.variants.length > 0;
  const [selectedVariantIdx, setSelectedVariantIdx] = useState<number>(0);
  const [qty, setQty] = useState<number>(1);

  const variant = hasVariants ? product.variants[selectedVariantIdx] : null;
  const unitPrice = variant ? Number(variant.price) : Number(product.price ?? 0);

  const handleAdd = () => {
    onAdd({
      productId: product.id,
      product: product.name,
      variant: variant ? variant.name : "",
      unit_price: unitPrice,
      quantity: isRetailish ? Math.max(1, qty) : 1,
      image_url: product.image_url,
    });
  };

  const variantsLabel = lang === "ms" ? "Pilihan" : lang === "zh" ? "选项" : "Options";
  const qtyLabel = lang === "ms" ? "Kuantiti" : lang === "zh" ? "数量" : "Quantity";
  const durationLabel = lang === "ms" ? "Tempoh" : lang === "zh" ? "时长" : "Duration";
  const mins = lang === "ms" ? "minit" : lang === "zh" ? "分钟" : "min";

  const prop = product.property;
  const isProperty = !!prop;
  const gallery = (product.images && product.images.length > 0)
    ? product.images
    : (product.image_url ? [product.image_url] : []);
  const [galleryIdx, setGalleryIdx] = useState(0);
  const isRent = prop?.listing_type === "rent";
  const propStatusLabel = isRent
    ? (lang === "ms" ? "Untuk Disewa" : lang === "zh" ? "出租" : "For Rent")
    : (lang === "ms" ? "Untuk Dijual" : lang === "zh" ? "出售" : "For Sale");
  const bedLabel = lang === "ms" ? "Bilik" : lang === "zh" ? "卧室" : "Bed";
  const bathLabel = lang === "ms" ? "Bilik air" : lang === "zh" ? "浴室" : "Bath";
  const sizeLabel = lang === "ms" ? "Keluasan" : lang === "zh" ? "面积" : "Size";
  const typeLabel = lang === "ms" ? "Jenis" : lang === "zh" ? "类型" : "Type";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={onClose}>
      <div
        className="pof-scope w-full max-w-[420px] max-h-[92vh] bg-background rounded-t-3xl overflow-y-auto pb-6 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative">
          <div className={`${isProperty ? "aspect-[16/10]" : "aspect-square"} w-full bg-muted/40 overflow-hidden relative`}>
            {gallery.length > 0 ? (
              <img src={gallery[Math.min(galleryIdx, gallery.length - 1)]} alt={product.name} className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full flex items-center justify-center text-muted-foreground/30">
                <ShoppingBag size={64} />
              </div>
            )}
            {isProperty && gallery.length > 1 && (
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5 bg-black/40 px-2 py-1 rounded-full">
                {gallery.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setGalleryIdx(i)}
                    className={`h-1.5 w-1.5 rounded-full ${i === galleryIdx ? "bg-white" : "bg-white/50"}`}
                    aria-label={`Image ${i + 1}`}
                  />
                ))}
              </div>
            )}
          </div>
          {isProperty && gallery.length > 1 && (
            <div className="px-5 mt-2 flex gap-2 overflow-x-auto no-scrollbar">
              {gallery.map((src, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setGalleryIdx(i)}
                  className={`shrink-0 h-14 w-20 rounded-lg overflow-hidden border-2 ${i === galleryIdx ? "border-primary" : "border-transparent"}`}
                >
                  <img src={src} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={onClose}
            className="absolute top-3 right-3 h-9 w-9 rounded-full bg-background/95 backdrop-blur shadow flex items-center justify-center"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-5 pt-4 space-y-3">
          {isProperty ? (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${isRent ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"}`}>
                {propStatusLabel}
              </span>
              {prop?.property_type && (
                <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                  {prop.property_type}
                </span>
              )}
            </div>
          ) : product.category && (
            <p className="text-[10px] font-semibold tracking-wider uppercase text-primary/80">
              {product.category}
            </p>
          )}
          <h2 className="text-xl font-bold leading-tight">{product.name}</h2>
          {isProperty && (
            <>
              <p className="text-2xl font-bold text-primary">
                RM {Number(product.price || 0).toLocaleString("en-MY", { minimumFractionDigits: 0 })}
                {isRent && <span className="text-sm font-normal text-muted-foreground"> / {lang === "ms" ? "bln" : lang === "zh" ? "月" : "mo"}</span>}
              </p>
              {prop?.address && (
                <p className="text-sm text-muted-foreground">📍 {prop.address}</p>
              )}
              <div className="grid grid-cols-2 gap-2 pt-1">
                {prop?.bedrooms ? (
                  <div className="rounded-xl bg-muted/40 px-3 py-2 text-xs">
                    <p className="text-muted-foreground">🛏 {bedLabel}</p>
                    <p className="font-semibold">{prop.bedrooms}</p>
                  </div>
                ) : null}
                {prop?.bathrooms ? (
                  <div className="rounded-xl bg-muted/40 px-3 py-2 text-xs">
                    <p className="text-muted-foreground">🛁 {bathLabel}</p>
                    <p className="font-semibold">{prop.bathrooms}</p>
                  </div>
                ) : null}
                {prop?.size_sqft ? (
                  <div className="rounded-xl bg-muted/40 px-3 py-2 text-xs">
                    <p className="text-muted-foreground">📐 {sizeLabel}</p>
                    <p className="font-semibold">{prop.size_sqft} sqft</p>
                  </div>
                ) : null}
                {prop?.property_type ? (
                  <div className="rounded-xl bg-muted/40 px-3 py-2 text-xs">
                    <p className="text-muted-foreground">🏠 {typeLabel}</p>
                    <p className="font-semibold">{prop.property_type}</p>
                  </div>
                ) : null}
              </div>
            </>
          )}
          {product.duration_minutes ? (
            <p className="text-xs text-muted-foreground">
              {durationLabel}: {product.duration_minutes} {mins}
            </p>
          ) : null}
          {product.description && (
            <p className="text-sm text-foreground/80 whitespace-pre-wrap">{product.description}</p>
          )}

          {hasVariants && (
            <div className="space-y-2 pt-1">
              <p className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">
                {variantsLabel}
              </p>
              <div className="space-y-1.5">
                {product.variants.map((v, idx) => {
                  const active = idx === selectedVariantIdx;
                  return (
                    <button
                      type="button"
                      key={(v.id ?? "") + idx}
                      onClick={() => setSelectedVariantIdx(idx)}
                      className={`w-full flex items-center justify-between px-3.5 py-3 rounded-2xl border transition-colors ${
                        active ? "bg-primary/10 border-primary" : "bg-card border-border"
                      }`}
                    >
                      <span className="text-sm font-medium">{v.name}</span>
                      <span className="text-sm font-bold text-primary">RM {Number(v.price).toFixed(2)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {isRetailish && (
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs font-semibold text-muted-foreground">{qtyLabel}</span>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} className="h-9 w-9 rounded-full bg-muted flex items-center justify-center"><Minus size={16} /></button>
                <span className="w-8 text-center text-sm font-semibold">{qty}</span>
                <button type="button" onClick={() => setQty((q) => Math.min(99, q + 1))} className="h-9 w-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center"><Plus size={16} strokeWidth={3} /></button>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={handleAdd}
            className="w-full mt-3 py-3.5 rounded-2xl bg-primary text-primary-foreground font-bold text-sm shadow-lg flex items-center justify-between px-5 active:scale-[0.99] transition-transform"
          >
            <span>{addLabel}</span>
            {!isProperty && (
              <span>RM {(unitPrice * (isRetailish ? qty : 1)).toFixed(2)}</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function PofStyles() {
  return (
    <style>{`
      .pof-scope {
        --background: 0 0% 100%;
        --foreground: 222 47% 11%;
        --card: 0 0% 100%;
        --card-foreground: 222 47% 11%;
        --muted: 240 6% 96%;
        --muted-foreground: 215 16% 47%;
        --border: 240 6% 92%;
        --primary: 262 83% 58%;
        --primary-foreground: 0 0% 100%;
        background: hsl(var(--background));
        color: hsl(var(--foreground));
      }
      .pof-hero {
        background: linear-gradient(135deg, #7C3AED 0%, #6D28D9 100%);
      }
      .pof-card {
        border: 1px solid hsl(var(--border));
        box-shadow: 0 1px 2px rgba(15,23,42,0.04), 0 4px 12px rgba(15,23,42,0.04);
      }
      .pof-input {
        width: 100%;
        border-radius: 14px;
        background: hsl(var(--card));
        border: 1px solid hsl(var(--border));
        padding: 12px 14px;
        font-size: 14px;
        outline: none;
        color: hsl(var(--foreground));
      }
      .pof-input:focus { border-color: hsl(var(--primary)); box-shadow: 0 0 0 4px hsl(var(--primary) / 0.15); }
      .no-scrollbar::-webkit-scrollbar { display: none; }
      .no-scrollbar { scrollbar-width: none; }

      @keyframes pof-slide-up { from { transform: translateY(100%);} to { transform: translateY(0);} }
      .animate-slide-up { animation: pof-slide-up 0.28s ease-out; }

      @keyframes pof-scale-in { from { transform: scale(0.5); opacity: 0; } to { transform: scale(1); opacity: 1; } }
      .animate-scale-in { animation: pof-scale-in 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; }
    `}</style>
  );
}