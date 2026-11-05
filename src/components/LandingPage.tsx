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
  Play,
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
  statStrip: string[];
  stepsTitle: string;
  stepsSub: string;
  steps: { title: string; desc: string }[];
  compareTitle: string;
  compareSub: string;
  compareSpreadsheet: string;
  compareBossify: string;
  compareRows: { label: string; spreadsheet: string; bossify: string }[];
  videoTitle: string;
  videoSub: string;
  videoBadge: string;
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
    statStrip: ["7 PDF reports", "3 languages", "WhatsApp confirmations", "Real-time alerts"],
    stepsTitle: "How Bossify works",
    stepsSub: "Three steps from chaos to clarity.",
    steps: [
      { title: "Log your orders", desc: "Add orders in seconds — or let TikTok Shop auto-sync do it for you soon." },
      { title: "Bossify does the math", desc: "Cost, fees and ads are subtracted automatically. No spreadsheet formulas." },
      { title: "See your real numbers", desc: "Check real profit any time, export reports, get alerted before stock runs out." },
    ],
    compareTitle: "Spreadsheet vs. Bossify",
    compareSub: "Same job, very different experience.",
    compareSpreadsheet: "Spreadsheet",
    compareBossify: "Bossify",
    compareRows: [
      { label: "Real profit after cost & fees", spreadsheet: "Manual, easy to miss", bossify: "Automatic, always accurate" },
      { label: "Low stock alerts", spreadsheet: "None", bossify: "Built in, automatic" },
      { label: "PDF reports", spreadsheet: "Build it yourself", bossify: "7 reports, one tap" },
      { label: "WhatsApp order confirmation", spreadsheet: "Copy-paste manually", bossify: "1-tap send" },
      { label: "Works on your phone", spreadsheet: "Awkward", bossify: "Built for mobile" },
    ],
    videoBadge: "DEMO",
    videoTitle: "See Bossify in action",
    videoSub: "A 2-minute walkthrough of real profit tracking, alerts and reports. Coming soon.",
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
    statStrip: ["7份PDF报表", "支持3种语言", "WhatsApp订单确认", "实时提醒"],
    stepsTitle: "Bossify怎么运作",
    stepsSub: "三个步骤，从一团乱到一目了然。",
    steps: [
      { title: "记录你的订单", desc: "几秒钟就能输入订单，之后TikTok Shop还能自动同步。" },
      { title: "Bossify自动帮你算", desc: "成本、平台费、广告费自动扣除，不用自己写Excel公式。" },
      { title: "看到真实数字", desc: "随时查看真实利润，一键导出报表，库存不够之前就提醒你。" },
    ],
    compareTitle: "Excel vs. Bossify",
    compareSub: "同样的工作，体验完全不一样。",
    compareSpreadsheet: "Excel/手写",
    compareBossify: "Bossify",
    compareRows: [
      { label: "追踪真实利润（扣成本+费用后）", spreadsheet: "手动算，容易漏算", bossify: "自动算，永远准确" },
      { label: "低库存提醒", spreadsheet: "没有", bossify: "内建，自动提醒" },
      { label: "PDF报表", spreadsheet: "自己做", bossify: "7份报表，一键导出" },
      { label: "WhatsApp订单确认", spreadsheet: "手动复制贴上", bossify: "一键发送" },
      { label: "手机上使用", spreadsheet: "不方便", bossify: "专为手机设计" },
    ],
    videoBadge: "演示",
    videoTitle: "看看 Bossify 实际怎么用",
    videoSub: "2分钟看懂真实利润追踪、智能提醒跟报表功能。即将推出。",
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
    statStrip: ["7 laporan PDF", "3 bahasa", "Pengesahan WhatsApp", "Amaran masa nyata"],
    stepsTitle: "Cara Bossify berfungsi",
    stepsSub: "Tiga langkah dari kekeliruan kepada kejelasan.",
    steps: [
      { title: "Catat pesanan anda", desc: "Tambah pesanan dalam beberapa saat — atau biar segerak TikTok Shop buat untuk anda nanti." },
      { title: "Bossify kira untuk anda", desc: "Kos, yuran dan iklan ditolak secara automatik. Tiada formula spreadsheet." },
      { title: "Lihat angka sebenar anda", desc: "Semak untung sebenar bila-bila masa, eksport laporan, dapat amaran sebelum stok habis." },
    ],
    compareTitle: "Spreadsheet vs. Bossify",
    compareSub: "Kerja yang sama, pengalaman yang sangat berbeza.",
    compareSpreadsheet: "Spreadsheet",
    compareBossify: "Bossify",
    compareRows: [
      { label: "Untung sebenar selepas kos & yuran", spreadsheet: "Manual, mudah tersilap", bossify: "Automatik, sentiasa tepat" },
      { label: "Amaran stok rendah", spreadsheet: "Tiada", bossify: "Terbina dalam, automatik" },
      { label: "Laporan PDF", spreadsheet: "Buat sendiri", bossify: "7 laporan, satu ketukan" },
      { label: "Pengesahan pesanan WhatsApp", spreadsheet: "Salin-tampal manual", bossify: "Hantar satu ketukan" },
      { label: "Berfungsi di telefon anda", spreadsheet: "Janggal", bossify: "Direka untuk mudah alih" },
    ],
    videoBadge: "DEMO",
    videoTitle: "Lihat Bossify beraksi",
    videoSub: "Tonton 2 minit cara jejak untung sebenar, amaran dan laporan berfungsi. Akan datang.",
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
      <style>{`
        @keyframes bf-float {
          0%, 100% { transform: translate3d(0, 0, 0); }
          50% { transform: translate3d(0, -18px, 0); }
        }
        @keyframes bf-pulse-glow {
          0%, 100% { box-shadow: 0 12px 28px rgba(59,30,109,0.28), 0 0 0 0 rgba(255,59,92,0.0); }
          50% { box-shadow: 0 12px 32px rgba(59,30,109,0.34), 0 0 0 6px rgba(255,59,92,0.08); }
        }
        .bf-glow-blob { animation: bf-float 7s ease-in-out infinite; }
        .bf-glow-blob-slow { animation: bf-float 9s ease-in-out infinite; animation-delay: -3s; }
        .bf-cta-pulse { animation: bf-pulse-glow 2.8s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .bf-glow-blob, .bf-glow-blob-slow, .bf-cta-pulse { animation: none; }
        }
      `}</style>
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
        {/* Ambient glow blobs — purely decorative, behind the content */}
        <div
          aria-hidden="true"
          className="bf-glow-blob pointer-events-none absolute -top-24 -right-16 w-[420px] h-[420px] rounded-full opacity-40"
          style={{ background: PRIMARY_LIGHT, filter: "blur(90px)" }}
        />
        <div
          aria-hidden="true"
          className="bf-glow-blob-slow pointer-events-none absolute -bottom-32 -left-20 w-[380px] h-[380px] rounded-full opacity-30"
          style={{ background: ACCENT, filter: "blur(100px)" }}
        />
        <div className="relative max-w-6xl mx-auto grid lg:grid-cols-2 gap-12 items-center">
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
                className="bf-cta-pulse text-[15px] font-semibold px-6 py-3.5 rounded-xl text-white flex items-center gap-2"
                style={{ background: PRIMARY }}
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

      {/* Stat strip */}
      <section className="px-5 lg:px-8 py-5" style={{ background: PRIMARY }}>
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-center gap-x-10 gap-y-2">
          {c.statStrip.map((s) => (
            <span key={s} className="text-[12.5px] font-semibold text-white/85">
              {s}
            </span>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="px-5 lg:px-8 py-16 lg:py-24" style={{ background: SURFACE }}>
        <div className="max-w-5xl mx-auto">
          <div className="text-center max-w-xl mx-auto mb-12">
            <h2
              className="text-[26px] lg:text-[34px] font-bold tracking-tight mb-3"
              style={{ color: INK, fontFamily: "Space Grotesk, system-ui, sans-serif" }}
            >
              {c.stepsTitle}
            </h2>
            <p className="text-[15px]" style={{ color: INK_SOFT }}>
              {c.stepsSub}
            </p>
          </div>
          <div className="grid sm:grid-cols-3 gap-6 relative">
            {c.steps.map((s, i) => (
              <div key={s.title} className="relative">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-[15px] mb-4"
                  style={{ background: PRIMARY, color: "#FFFFFF" }}
                >
                  {i + 1}
                </div>
                <h3 className="text-[15px] font-bold mb-1.5" style={{ color: INK }}>
                  {s.title}
                </h3>
                <p className="text-[13.5px] leading-relaxed" style={{ color: INK_SOFT }}>
                  {s.desc}
                </p>
              </div>
            ))}
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

      {/* Comparison */}
      <section className="px-5 lg:px-8 py-16 lg:py-24" style={{ background: SURFACE }}>
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-10">
            <h2
              className="text-[26px] lg:text-[34px] font-bold tracking-tight mb-3"
              style={{ color: INK, fontFamily: "Space Grotesk, system-ui, sans-serif" }}
            >
              {c.compareTitle}
            </h2>
            <p className="text-[15px]" style={{ color: INK_SOFT }}>
              {c.compareSub}
            </p>
          </div>
          <div className="rounded-2xl bg-white border overflow-hidden" style={{ borderColor: LINE }}>
            <div className="grid grid-cols-[1.4fr_1fr_1fr]" style={{ borderBottom: `1px solid ${LINE}` }}>
              <div className="px-4 py-3" />
              <div className="px-4 py-3 text-center text-[12.5px] font-semibold" style={{ color: INK_SOFT }}>
                {c.compareSpreadsheet}
              </div>
              <div
                className="px-4 py-3 text-center text-[12.5px] font-bold rounded-t-lg"
                style={{ color: "#FFFFFF", background: PRIMARY }}
              >
                {c.compareBossify}
              </div>
            </div>
            {c.compareRows.map((row, i) => (
              <div
                key={row.label}
                className="grid grid-cols-[1.4fr_1fr_1fr] items-center"
                style={{ borderTop: i === 0 ? "none" : `1px solid ${LINE}` }}
              >
                <div className="px-4 py-3.5 text-[13px] font-medium" style={{ color: INK }}>
                  {row.label}
                </div>
                <div className="px-4 py-3.5 text-center text-[12px]" style={{ color: INK_SOFT }}>
                  {row.spreadsheet}
                </div>
                <div
                  className="px-4 py-3.5 text-center text-[12px] font-bold"
                  style={{ color: PRIMARY, background: "rgba(59,30,109,0.05)" }}
                >
                  {row.bossify}
                </div>
              </div>
            ))}
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

      {/* Video */}
      <section className="px-5 lg:px-8 py-16 lg:py-24" style={{ background: "#FFFFFF" }}>
        <div className="max-w-3xl mx-auto text-center">
          <span
            className="inline-block text-[11px] font-bold tracking-wider px-2.5 py-1 rounded-full mb-4"
            style={{ color: ACCENT, background: "rgba(255,59,92,0.1)" }}
          >
            {c.videoBadge}
          </span>
          <h2
            className="text-[26px] lg:text-[34px] font-bold tracking-tight mb-3"
            style={{ color: INK, fontFamily: "Space Grotesk, system-ui, sans-serif" }}
          >
            {c.videoTitle}
          </h2>
          <p className="text-[15px] mb-8" style={{ color: INK_SOFT }}>
            {c.videoSub}
          </p>
          {/* TODO(John): once the demo video is ready, replace this
              placeholder with a real <video> tag or a YouTube/TikTok
              embed inside the same rounded, glowing frame below. */}
          <div
            className="relative mx-auto max-w-3xl aspect-video rounded-2xl overflow-hidden border flex items-center justify-center"
            style={{
              borderColor: LINE,
              background: `linear-gradient(135deg, ${PRIMARY} 0%, ${PRIMARY_LIGHT} 100%)`,
              boxShadow: "0 20px 60px rgba(59,30,109,0.25)",
            }}
          >
            <div
              aria-hidden="true"
              className="bf-glow-blob pointer-events-none absolute -top-10 -left-10 w-64 h-64 rounded-full opacity-30"
              style={{ background: ACCENT, filter: "blur(70px)" }}
            />
            <button
              type="button"
              aria-label={c.videoTitle}
              className="bf-cta-pulse relative z-10 w-16 h-16 lg:w-20 lg:h-20 rounded-full bg-white/95 flex items-center justify-center"
            >
              <Play className="w-6 h-6 lg:w-8 lg:h-8 ml-1" style={{ color: PRIMARY }} fill={PRIMARY} />
            </button>
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
