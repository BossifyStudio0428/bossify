import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  DollarSign,
  PackageX,
  FileText,
  Send,
  RefreshCw,
  Smile,
  ArrowRight,
  Menu,
  X,
} from "lucide-react";
import { useI18n } from "@/contexts/I18nContext";
import bossifyLogo from "@/assets/bossify-logo.png";

const PRIMARY = "#3B1E6D";
const PRIMARY_LIGHT = "#6C4AB6";
const ACCENT = "#FF3B5C";
const INK = "#1E1730";
const INK_SOFT = "#5B5270";
const SURFACE = "#F7F5FA";
const LINE = "#E1DCEC";

type LandingCopy = {
  navFeatures: string;
  navReports: string;
  signIn: string;
  startFree: string;
  eyebrow: string;
  headline1: string;
  headline2: string;
  subhead: string;
  ctaPrimary: string;
  ctaSecondary: string;
  receiptTitle: string;
  receiptSub: string;
  gross: string;
  cost: string;
  fee: string;
  net: string;
  featuresTitle: string;
  featuresSub: string;
  features: { title: string; desc: string }[];
  reportsTitle: string;
  reportsSub: string;
  reports: { name: string; desc: string }[];
  finalTitle: string;
  finalSub: string;
  finalCta: string;
  footerTag: string;
};

const COPY: Record<"en" | "zh" | "ms", LandingCopy> = {
  en: {
    navFeatures: "Features",
    navReports: "Reports",
    signIn: "Sign In",
    startFree: "Start Free",
    eyebrow: "FOR TIKTOK SHOP SELLERS IN MALAYSIA",
    headline1: "Know what you",
    headline2: "actually keep.",
    subhead:
      "Bossify tracks your real net profit after product cost and fees — not just gross sales. Built for sellers who don't have an accounting background.",
    ctaPrimary: "Start Free",
    ctaSecondary: "See how it works",
    receiptTitle: "ORDER #A1042",
    receiptSub: "Bossify · Real Profit Slip",
    gross: "Gross sales",
    cost: "Product cost",
    fee: "Platform fee",
    net: "Net profit",
    featuresTitle: "Everything you need to run your shop",
    featuresSub: "No spreadsheets. No guesswork. Just your real numbers.",
    features: [
      { title: "Real profit tracking", desc: "Net profit after cost, not just gross sales." },
      { title: "Smart alerts", desc: "Low stock and loss-making products, flagged automatically." },
      { title: "7 exportable PDF reports", desc: "Sales, Profit, Stock, P&L, Customer, Supplier, Reconciliation." },
      { title: "Fast order entry", desc: "1-tap WhatsApp order confirmation to your customers." },
      { title: "TikTok Shop auto-sync", desc: "Coming soon — orders sync automatically." },
      { title: "Built for non-accountants", desc: "Clean, simple interface. No jargon." },
    ],
    reportsTitle: "7 reports, ready to export",
    reportsSub: "Every report you need to run and prove your business — one tap to PDF.",
    reports: [
      { name: "Sales Report", desc: "Every order, every period, at a glance." },
      { name: "Profit Report", desc: "Real net profit after all your costs." },
      { name: "Stock Report", desc: "What's left, what's low, what's moving." },
      { name: "Financial P&L", desc: "Profit & loss statement for your business." },
      { name: "Customer Statement", desc: "Full order history per customer." },
      { name: "Supplier Report", desc: "What you owe and what you've paid." },
      { name: "Order Reconciliation", desc: "Match orders against payouts, cleanly." },
    ],
    finalTitle: "Ready to know your real numbers?",
    finalSub: "Set up your shop in minutes. No credit card required.",
    finalCta: "Start Free",
    footerTag: "Manage your shop like a boss.",
  },
  zh: {
    navFeatures: "功能",
    navReports: "报表",
    signIn: "登入",
    startFree: "免费开始",
    eyebrow: "专为马来西亚 TIKTOK SHOP 卖家打造",
    headline1: "清楚知道",
    headline2: "你到底赚多少。",
    subhead:
      "Bossify 帮你追踪扣除成本与平台费用后的「真实净利润」，不只是销售额。专为没有会计背景的卖家设计。",
    ctaPrimary: "免费开始使用",
    ctaSecondary: "看看怎么运作",
    receiptTitle: "订单 #A1042",
    receiptSub: "Bossify · 真实利润单",
    gross: "销售额",
    cost: "产品成本",
    fee: "平台费用",
    net: "净利润",
    featuresTitle: "经营你的网店所需要的一切",
    featuresSub: "不用 Excel，不用猜。只看真实数字。",
    features: [
      { title: "真实利润追踪", desc: "扣除成本后的净利润，不只是销售额。" },
      { title: "智能提醒", desc: "低库存与亏本产品，自动标示出来。" },
      { title: "7 份可导出 PDF 报表", desc: "销售、利润、库存、损益表、客户、供应商、对账单。" },
      { title: "快速下单", desc: "一键发送 WhatsApp 订单确认给顾客。" },
      { title: "TikTok Shop 自动同步", desc: "即将推出 — 订单自动同步。" },
      { title: "非会计人士也能上手", desc: "界面简单清楚，没有专业术语。" },
    ],
    reportsTitle: "7 份报表，随时可导出",
    reportsSub: "经营与证明生意所需的每一份报表 — 一键导出 PDF。",
    reports: [
      { name: "销售报表", desc: "每一笔订单、每个时间段，一目了然。" },
      { name: "利润报表", desc: "扣除所有成本后的真实净利润。" },
      { name: "库存报表", desc: "剩多少、哪些库存低、哪些卖得快。" },
      { name: "财务损益表", desc: "你生意的损益表。" },
      { name: "客户对账单", desc: "每位客户的完整订单记录。" },
      { name: "供应商报表", desc: "你欠多少、已付多少。" },
      { name: "订单对账单", desc: "清楚核对订单与款项。" },
    ],
    finalTitle: "准备好搞清楚你的真实数字了吗？",
    finalSub: "几分钟内设置好你的店铺，不需要信用卡。",
    finalCta: "免费开始使用",
    footerTag: "像老板一样经营你的网店。",
  },
  ms: {
    navFeatures: "Ciri-ciri",
    navReports: "Laporan",
    signIn: "Log Masuk",
    startFree: "Mula Percuma",
    eyebrow: "UNTUK PENJUAL TIKTOK SHOP DI MALAYSIA",
    headline1: "Tahu untung",
    headline2: "sebenar anda.",
    subhead:
      "Bossify menjejak untung bersih sebenar selepas kos produk dan yuran — bukan sekadar jualan kasar. Direka untuk penjual tanpa latar belakang perakaunan.",
    ctaPrimary: "Mula Percuma",
    ctaSecondary: "Lihat cara ia berfungsi",
    receiptTitle: "PESANAN #A1042",
    receiptSub: "Bossify · Slip Untung Sebenar",
    gross: "Jualan kasar",
    cost: "Kos produk",
    fee: "Yuran platform",
    net: "Untung bersih",
    featuresTitle: "Semua yang anda perlukan untuk uruskan kedai",
    featuresSub: "Tiada spreadsheet. Tiada teka-teki. Angka sebenar sahaja.",
    features: [
      { title: "Jejak untung sebenar", desc: "Untung bersih selepas kos, bukan sekadar jualan kasar." },
      { title: "Amaran pintar", desc: "Stok rendah dan produk rugi, dikesan automatik." },
      { title: "7 laporan PDF boleh eksport", desc: "Jualan, Untung, Stok, Untung Rugi, Pelanggan, Pembekal, Penyesuaian." },
      { title: "Kemasukan pesanan pantas", desc: "Pengesahan pesanan WhatsApp satu ketukan." },
      { title: "Segerak automatik TikTok Shop", desc: "Akan datang — pesanan segerak automatik." },
      { title: "Direka untuk bukan akauntan", desc: "Antara muka ringkas dan jelas." },
    ],
    reportsTitle: "7 laporan, sedia untuk dieksport",
    reportsSub: "Setiap laporan yang anda perlukan untuk uruskan perniagaan — satu ketukan ke PDF.",
    reports: [
      { name: "Laporan Jualan", desc: "Setiap pesanan, setiap tempoh, sekali imbas." },
      { name: "Laporan Untung", desc: "Untung bersih sebenar selepas semua kos." },
      { name: "Laporan Stok", desc: "Apa yang tinggal, rendah, dan laju." },
      { name: "Untung Rugi Kewangan", desc: "Penyata untung rugi perniagaan anda." },
      { name: "Penyata Pelanggan", desc: "Sejarah pesanan penuh setiap pelanggan." },
      { name: "Laporan Pembekal", desc: "Apa yang anda hutang dan telah bayar." },
      { name: "Penyesuaian Pesanan", desc: "Padankan pesanan dengan bayaran, dengan kemas." },
    ],
    finalTitle: "Bersedia untuk tahu angka sebenar anda?",
    finalSub: "Sediakan kedai anda dalam beberapa minit. Tiada kad kredit diperlukan.",
    finalCta: "Mula Percuma",
    footerTag: "Uruskan kedai anda seperti bos.",
  },
};

function ReceiptCard({ c }: { c: LandingCopy }) {
  const rows: [string, string, boolean][] = [
    [c.gross, "RM 250.00", false],
    [c.cost, "− RM 180.00", false],
    [c.fee, "− RM 12.50", false],
  ];
  return (
    <div
      className="w-full max-w-[320px] rounded-xl bg-white shadow-[0_20px_50px_rgba(59,30,109,0.18)] border"
      style={{ borderColor: LINE, fontFamily: "IBM Plex Mono, ui-monospace, monospace" }}
    >
      <div className="px-5 pt-5 pb-3">
        <p className="text-[11px] tracking-wide" style={{ color: INK_SOFT }}>
          {c.receiptTitle}
        </p>
        <p className="text-[11px] tracking-wide" style={{ color: INK_SOFT }}>
          {c.receiptSub}
        </p>
      </div>
      <div
        className="mx-5 border-t border-dashed"
        style={{ borderColor: LINE }}
      />
      <div className="px-5 py-3 space-y-2">
        {rows.map(([label, val]) => (
          <div key={label} className="flex items-center justify-between text-[12.5px]" style={{ color: INK }}>
            <span>{label}</span>
            <span>{val}</span>
          </div>
        ))}
      </div>
      <div
        className="mx-5 border-t border-dashed"
        style={{ borderColor: LINE }}
      />
      <div className="px-5 py-4 flex items-center justify-between">
        <span className="text-[13px] font-semibold" style={{ color: INK }}>
          {c.net}
        </span>
        <span className="text-[19px] font-bold" style={{ color: ACCENT }}>
          RM 57.50
        </span>
      </div>
      <div
        className="h-3 rounded-b-xl"
        style={{
          backgroundImage: `radial-gradient(circle at 10px 0, transparent 5px, white 5.5px)`,
          backgroundSize: "20px 10px",
          backgroundRepeat: "repeat-x",
          backgroundPosition: "top",
        }}
      />
    </div>
  );
}

const FEATURE_ICONS = [DollarSign, PackageX, FileText, Send, RefreshCw, Smile];

export function LandingPage() {
  const { lang } = useI18n();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const c = COPY[lang] ?? COPY.en;

  const goAuth = (mode: "login" | "register") => {
    navigate({ to: "/auth", search: mode === "register" ? { mode: "reg" } : undefined } as never);
  };

  return (
    <div style={{ background: "#FFFFFF", fontFamily: "IBM Plex Sans, system-ui, sans-serif" }}>
      {/* Header */}
      <header
        className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b"
        style={{ borderColor: LINE }}
      >
        <div className="max-w-6xl mx-auto px-5 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src={bossifyLogo} alt="Bossify" className="h-8 w-8 rounded-lg object-cover" />
            <span
              className="text-lg font-bold tracking-tight"
              style={{ color: PRIMARY, fontFamily: "Space Grotesk, system-ui, sans-serif" }}
            >
              Bossify
            </span>
          </div>
          <nav className="hidden lg:flex items-center gap-8">
            <a href="#features" className="text-sm font-medium" style={{ color: INK_SOFT }}>
              {c.navFeatures}
            </a>
            <a href="#reports" className="text-sm font-medium" style={{ color: INK_SOFT }}>
              {c.navReports}
            </a>
          </nav>
          <div className="hidden lg:flex items-center gap-3">
            <button
              onClick={() => goAuth("login")}
              className="text-sm font-semibold px-4 py-2 rounded-lg"
              style={{ color: PRIMARY }}
            >
              {c.signIn}
            </button>
            <button
              onClick={() => goAuth("register")}
              className="text-sm font-semibold px-4 py-2.5 rounded-lg text-white flex items-center gap-1.5"
              style={{ background: PRIMARY }}
            >
              {c.startFree}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
          <button
            className="lg:hidden p-2 -mr-2"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Menu"
          >
            {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
        {menuOpen && (
          <div className="lg:hidden border-t px-5 py-4 flex flex-col gap-3" style={{ borderColor: LINE }}>
            <a href="#features" className="text-sm font-medium" onClick={() => setMenuOpen(false)} style={{ color: INK_SOFT }}>
              {c.navFeatures}
            </a>
            <a href="#reports" className="text-sm font-medium" onClick={() => setMenuOpen(false)} style={{ color: INK_SOFT }}>
              {c.navReports}
            </a>
            <button
              onClick={() => goAuth("login")}
              className="text-sm font-semibold px-4 py-2.5 rounded-lg border text-left"
              style={{ color: PRIMARY, borderColor: LINE }}
            >
              {c.signIn}
            </button>
            <button
              onClick={() => goAuth("register")}
              className="text-sm font-semibold px-4 py-2.5 rounded-lg text-white text-left"
              style={{ background: PRIMARY }}
            >
              {c.startFree}
            </button>
          </div>
        )}
      </header>

      {/* Hero */}
      <section
        className="relative overflow-hidden px-5 lg:px-8 pt-14 pb-16 lg:pt-24 lg:pb-24"
        style={{ background: `linear-gradient(180deg, ${SURFACE} 0%, #FFFFFF 100%)` }}
      >
        <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <p
              className="text-[12px] font-bold tracking-wider mb-4"
              style={{ color: PRIMARY_LIGHT }}
            >
              {c.eyebrow}
            </p>
            <h1
              className="text-[34px] leading-[1.1] lg:text-[52px] font-bold tracking-tight mb-5"
              style={{ color: INK, fontFamily: "Space Grotesk, system-ui, sans-serif" }}
            >
              {c.headline1}
              <br />
              <span style={{ color: ACCENT }}>{c.headline2}</span>
            </h1>
            <p className="text-[15px] lg:text-[17px] leading-relaxed mb-8 max-w-[480px]" style={{ color: INK_SOFT }}>
              {c.subhead}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => goAuth("register")}
                className="text-[15px] font-semibold px-6 py-3.5 rounded-xl text-white flex items-center gap-2 shadow-lg"
                style={{ background: PRIMARY, boxShadow: `0 12px 28px rgba(59,30,109,0.28)` }}
              >
                {c.ctaPrimary}
                <ArrowRight className="w-4 h-4" />
              </button>
              <a
                href="#features"
                className="text-[15px] font-semibold px-6 py-3.5 rounded-xl"
                style={{ color: PRIMARY }}
              >
                {c.ctaSecondary}
              </a>
            </div>
          </div>
          <div className="flex justify-center lg:justify-end">
            <ReceiptCard c={c} />
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="px-5 lg:px-8 py-16 lg:py-24" style={{ background: "#FFFFFF" }}>
        <div className="max-w-6xl mx-auto">
          <div className="text-center max-w-xl mx-auto mb-12">
            <h2
              className="text-[26px] lg:text-[34px] font-bold tracking-tight mb-3"
              style={{ color: INK, fontFamily: "Space Grotesk, system-ui, sans-serif" }}
            >
              {c.featuresTitle}
            </h2>
            <p className="text-[15px]" style={{ color: INK_SOFT }}>
              {c.featuresSub}
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {c.features.map((f, i) => {
              const Icon = FEATURE_ICONS[i] ?? DollarSign;
              return (
                <div
                  key={f.title}
                  className="rounded-2xl p-6 border"
                  style={{ borderColor: LINE, background: SURFACE }}
                >
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center mb-4"
                    style={{ background: "rgba(59,30,109,0.08)" }}
                  >
                    <Icon className="w-5 h-5" style={{ color: PRIMARY }} />
                  </div>
                  <h3 className="text-[15px] font-bold mb-1.5" style={{ color: INK }}>
                    {f.title}
                  </h3>
                  <p className="text-[13.5px] leading-relaxed" style={{ color: INK_SOFT }}>
                    {f.desc}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Reports ledger */}
      <section id="reports" className="px-5 lg:px-8 py-16 lg:py-24" style={{ background: SURFACE }}>
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-10">
            <h2
              className="text-[26px] lg:text-[34px] font-bold tracking-tight mb-3"
              style={{ color: INK, fontFamily: "Space Grotesk, system-ui, sans-serif" }}
            >
              {c.reportsTitle}
            </h2>
            <p className="text-[15px]" style={{ color: INK_SOFT }}>
              {c.reportsSub}
            </p>
          </div>
          <div className="rounded-2xl bg-white border overflow-hidden" style={{ borderColor: LINE }}>
            {c.reports.map((r, i) => (
              <div
                key={r.name}
                className="flex items-center gap-4 px-5 py-4"
                style={{ borderTop: i === 0 ? "none" : `1px solid ${LINE}` }}
              >
                <span
                  className="text-[12px] font-bold w-6 shrink-0"
                  style={{ color: PRIMARY_LIGHT, fontFamily: "IBM Plex Mono, ui-monospace, monospace" }}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-bold" style={{ color: INK }}>
                    {r.name}
                  </p>
                  <p className="text-[12.5px] truncate" style={{ color: INK_SOFT }}>
                    {r.desc}
                  </p>
                </div>
                <span
                  className="text-[10px] font-bold px-2 py-1 rounded shrink-0"
                  style={{ color: PRIMARY, background: "rgba(59,30,109,0.08)" }}
                >
                  PDF
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="px-5 lg:px-8 py-16 lg:py-20" style={{ background: PRIMARY }}>
        <div className="max-w-2xl mx-auto text-center">
          <h2
            className="text-[26px] lg:text-[32px] font-bold tracking-tight mb-3 text-white"
            style={{ fontFamily: "Space Grotesk, system-ui, sans-serif" }}
          >
            {c.finalTitle}
          </h2>
          <p className="text-[15px] mb-8" style={{ color: "rgba(255,255,255,0.75)" }}>
            {c.finalSub}
          </p>
          <button
            onClick={() => goAuth("register")}
            className="text-[15px] font-semibold px-7 py-3.5 rounded-xl inline-flex items-center gap-2"
            style={{ background: "#FFFFFF", color: PRIMARY }}
          >
            {c.finalCta}
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-5 lg:px-8 py-10" style={{ background: "#FFFFFF" }}>
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img src={bossifyLogo} alt="Bossify" className="h-6 w-6 rounded object-cover" />
            <span className="text-sm font-bold" style={{ color: PRIMARY }}>
              Bossify
            </span>
            <span className="text-[13px]" style={{ color: INK_SOFT }}>
              · {c.footerTag}
            </span>
          </div>
          <p className="text-[12.5px]" style={{ color: INK_SOFT }}>
            © {new Date().getFullYear()} ZH Studio
          </p>
        </div>
      </footer>
    </div>
  );
}
