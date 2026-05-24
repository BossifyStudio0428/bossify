import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useI18n, type Lang } from "@/contexts/I18nContext";
import {
  getPublicOrderForm,
  submitPublicOrder,
} from "@/lib/public-order.functions";
import { ShoppingBag, ShoppingCart, ArrowLeft, X, Plus, Minus, Check, Globe } from "lucide-react";
import bossifyLogo from "@/assets/bossify-logo.png";

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
        language?: "en" | "ms" | "zh";
      };
      products: Product[];
    };

function PublicOrderFormPage() {
  const { code } = Route.useParams();
  const { t, lang } = useI18n();
  const loadFn = useServerFn(getPublicOrderForm);
  const submitFn = useServerFn(submitPublicOrder);
  const { setLang } = useI18n();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<null | { name: string; code: string; business: string }>(null);

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
  const [openProduct, setOpenProduct] = useState<Product | null>(null);
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
  const upd =
    (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((p) => ({ ...p, [k]: e.target.value }));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await loadFn({ data: { code } });
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
  }, [code, loadFn, setLang]);

  const categories = useMemo(() => {
    if (state.status !== "ready") return [] as string[];
    const set = new Set<string>();
    for (const p of state.products) if (p.category) set.add(p.category);
    return Array.from(set).sort();
  }, [state]);

  const filteredProducts = useMemo(() => {
    if (state.status !== "ready") return [] as Product[];
    if (activeCategory === "__all") return state.products;
    return state.products.filter((p) => (p.category ?? "") === activeCategory);
  }, [state, activeCategory]);

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
    setSubmitting(true);
    try {
      const res = await submitFn({
        data: {
          code,
          customer_name: form.customer_name.trim(),
          phone: form.phone.trim(),
          items: cart.map((l) => ({
            product: l.product,
            variant: l.variant,
            quantity: l.quantity,
            unit_price: l.unit_price,
          })),
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
        },
      });
      if (res.ok) {
        setDone({
          name: form.customer_name.trim(),
          code: res.code,
          business: res.business_name || state.profile.business_name,
        });
      } else {
        const reason = (res as any).error || (res as any).reason || "";
        alert(`${t("order_save_failed")}${reason ? `\n\n${reason}` : ""}`);
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

          {noProducts ? (
            <div className="rounded-2xl border border-dashed border-border bg-muted/40 px-4 py-8 text-center text-xs text-muted-foreground">
              {isRetailish
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
            </>
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
            <input
              required
              type="tel"
              inputMode="tel"
              value={form.phone}
              onChange={upd("phone")}
              placeholder="01X-XXX XXXX"
              className="pof-input"
              maxLength={32}
            />
          </Field>

          {bizType === "fnb" && (
            <Field label={fulfilmentLabel}>
              <div className="grid grid-cols-3 gap-2">
                {([
                  ["dine_in", dineIn],
                  ["takeaway", takeaway],
                  ["delivery", delivery],
                ] as const).map(([val, label]) => (
                  <button
                    type="button"
                    key={val}
                    onClick={() => setForm((p) => ({ ...p, fulfilment: val }))}
                    className={`py-2.5 rounded-xl text-xs font-semibold border ${form.fulfilment === val ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </Field>
          )}

          {(bizType === "retail" || (bizType === "fnb" && form.fulfilment === "delivery")) && (
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
          <div className="absolute right-0 top-full mt-2 z-50 w-44 rounded-2xl bg-card border border-border shadow-lg overflow-hidden">
            {([
              { code: "en" as Lang, label: "English" },
              { code: "ms" as Lang, label: "Bahasa Malaysia" },
              { code: "zh" as Lang, label: "中文" },
            ]).map((opt) => (
              <button
                key={opt.code}
                type="button"
                onClick={() => onPick(opt.code)}
                className={`w-full px-4 py-2.5 text-left text-sm flex items-center justify-between ${
                  lang === opt.code ? "bg-primary/10 text-primary font-semibold" : "text-foreground"
                }`}
              >
                <span>{opt.label}</span>
                {lang === opt.code && <Check size={14} />}
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

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={onClose}>
      <div
        className="pof-scope w-full max-w-[420px] max-h-[92vh] bg-background rounded-t-3xl overflow-y-auto pb-6 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative">
          <div className="aspect-square w-full bg-muted/40 overflow-hidden">
            {product.image_url ? (
              <img src={product.image_url} alt={product.name} className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full flex items-center justify-center text-muted-foreground/30">
                <ShoppingBag size={64} />
              </div>
            )}
          </div>
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
          {product.category && (
            <p className="text-[10px] font-semibold tracking-wider uppercase text-primary/80">
              {product.category}
            </p>
          )}
          <h2 className="text-xl font-bold leading-tight">{product.name}</h2>
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
            <span>RM {(unitPrice * (isRetailish ? qty : 1)).toFixed(2)}</span>
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

      .pof-check-wrap { width: 96px; height: 96px; border-radius: 50%; background: hsl(142 72% 95%); display:flex; align-items:center; justify-content:center; }
      .pof-check { width: 64px; height: 64px; }
      .pof-check-circle { stroke: hsl(142 71% 45%); stroke-width: 3; stroke-dasharray: 166; stroke-dashoffset: 166; animation: pof-stroke 0.6s cubic-bezier(0.65,0,0.45,1) forwards; }
      .pof-check-path { stroke: hsl(142 71% 45%); stroke-width: 5; stroke-linecap: round; stroke-linejoin: round; stroke-dasharray: 48; stroke-dashoffset: 48; animation: pof-stroke 0.4s 0.5s cubic-bezier(0.65,0,0.45,1) forwards; }
      @keyframes pof-stroke { to { stroke-dashoffset: 0; } }
    `}</style>
  );
}