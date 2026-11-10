import { useState, useRef, useEffect, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Menu,
  X,
  ArrowRight,
  ArrowDown,
  Play,
  TrendingUp,
  DollarSign,
  Package,
  PackageX,
  FileText,
  Truck,
  Users,
  ClipboardCheck,
  MessageCircle,
  Check,
  Minus,
  ChevronDown,
  Layers,
  Archive,
  MoreHorizontal,
  ShoppingBag,
  Zap,
  CreditCard,
  Smartphone,
  RotateCcw,
} from "lucide-react";
import { useI18n } from "@/contexts/I18nContext";
import bossifyLogo from "@/assets/bossify-logo.png";

// ---------------------------------------------------------------------------
// Design tokens -- premium dark canvas. One consistent near-black-purple
// background for the whole page; depth comes from elevated card surfaces,
// hairline borders and a purple->pink gradient accent, not section banding.
// ---------------------------------------------------------------------------
// Light mode. Background/text/surface tokens flipped from the previous
// dark-only palette; the purple/pink brand accent (GRAD_FROM/GRAD_TO) is
// unchanged on purpose so the landing page still reads as the same product
// as the dark, logged-in app -- only the canvas flips from dark to light.
const BG = "#FCFBFE";
// Deepened from the original #F7F5FA/#EFEAFA/0.16/0.32 — those sat within
// ~1-2% lightness of BG and each other, so cards barely separated from the
// page and from one another ("too white/empty" feedback). Same hue, more
// contrast, still a light theme.
const CARD = "#F3EEFC";
const CARD_SOFT = "#EAE1FA";
const BORDER = "rgba(139,92,246,0.22)";
const BORDER_STRONG = "rgba(139,92,246,0.42)";
// A soft lavender wash used as a section-level background band (not a
// card), so a handful of otherwise-plain text sections visually separate
// from the page canvas instead of all sitting on identical flat BG.
const SECTION_TINT = "linear-gradient(180deg, #F6F1FD 0%, #FBF9FE 100%)";
const TEXT = "#1A1225";
const TEXT_MUTED = "#5B5270";
const GRAD_FROM = "#8B5CF6";
const GRAD_TO = "#D946EF";
const GRADIENT = `linear-gradient(135deg, ${GRAD_FROM} 0%, ${GRAD_TO} 100%)`;
// Status colors darkened a step from the dark-mode values for legible
// contrast on a light background (same hues, ~600-weight instead of ~400).
const GREEN = "#16A34A";
const RED = "#DC2626";
const BLUE = "#2563EB";

type ShowcaseItem = { title: string; desc: string };
type CostLine = { label: string; value: string };

type LandingCopy = {
  navFeatures: string;
  navReports: string;
  navPricing: string;
  signIn: string;
  startFree: string;

  eyebrow: string;
  headline1: string;
  headlineEmphasis: string;
  subhead: string;
  ctaPrimary: string;
  ctaSecondary: string;
  trustBullets: string[];
  capabilityStrip: string[];

  problemTitle: string;
  problemTitleEmphasis: string;
  problemDesc: string;
  problemSalesLabel: string;
  problemSalesValue: string;
  problemCostLines: CostLine[];
  problemProfitLabel: string;
  problemProfitValue: string;

  featuresTitle: string;
  featuresSub: string;
  showcaseProfit: ShowcaseItem;
  showcaseInventory: ShowcaseItem;
  showcaseReports: ShowcaseItem;
  showcaseOrders: ShowcaseItem;
  reports: string[];

  tiktokEyebrow: string;
  tiktokTitle: string;
  tiktokSub: string;
  tiktokComingSoon: string;
  tiktokOutcomes: string[];
  reportsGridTitle: string;

  compareTitle: string;
  compareSub: string;
  compareSpreadsheetLabel: string;
  compareBossifyLabel: string;
  compareSpreadsheetItems: string[];
  compareBossifyItems: string[];

  trustSectionTitle: string;
  trustItems: string[];

  finalTitle1: string;
  finalTitle2: string;
  finalSub: string;
  finalCtaPrimary: string;
  finalCtaSecondary: string;

  footerTag: string;
};

const COPY: Record<"en" | "zh" | "ms", LandingCopy> = {
  en: {
    navFeatures: "Features",
    navReports: "Reports",
    navPricing: "Pricing",
    signIn: "Sign In",
    startFree: "Start Free",

    eyebrow: "FOR TIKTOK SHOP SELLERS IN MALAYSIA",
    headline1: "Know what you",
    headlineEmphasis: "actually keep.",
    subhead:
      "Track real profit, inventory, orders and business performance — without complicated accounting.",
    ctaPrimary: "Start Free",
    ctaSecondary: "Watch Demo (2 min)",
    trustBullets: ["Set up in minutes", "No credit card", "Mobile & Web"],
    capabilityStrip: ["Real Profit Tracking", "Inventory Management", "7 Business Reports", "Order Management"],

    problemTitle: "Sales don't tell",
    problemTitleEmphasis: "the whole story.",
    problemDesc:
      "You may see good sales on TikTok Shop, but after product costs, platform fees, shipping and other expenses, your actual profit can be much lower.",
    problemSalesLabel: "Sales (GMV)",
    problemSalesValue: "RM10,000",
    problemCostLines: [
      { label: "Product Cost", value: "−RM5,000" },
      { label: "Platform Fees", value: "−RM800" },
      { label: "Shipping", value: "−RM600" },
      { label: "Packaging", value: "−RM300" },
      { label: "Other Expenses", value: "−RM450" },
    ],
    problemProfitLabel: "What you actually keep",
    problemProfitValue: "RM2,850",

    featuresTitle: "Everything you need to run the numbers.",
    featuresSub: "Manage your sales, profit, stock and reports in one place.",
    showcaseProfit: { title: "Real Profit", desc: "See profit after real business costs." },
    showcaseInventory: { title: "Inventory", desc: "Track stock levels and receive alerts." },
    showcaseReports: { title: "Business Reports", desc: "Generate 7 professional reports in PDF." },
    showcaseOrders: { title: "Orders", desc: "Record and manage orders quickly, with WhatsApp confirmation." },
    reports: [
      "Sales Report",
      "Profit Report",
      "Stock Report",
      "Financial P&L",
      "Customer Statement",
      "Supplier Report",
      "Order Reconciliation",
    ],

    tiktokEyebrow: "INTEGRATION",
    tiktokTitle: "From TikTok Shop to your real profit.",
    tiktokSub: "Connect your store, bring in orders and products, then see your profit, stock and reports in Bossify.",
    tiktokComingSoon: "Automatic TikTok Shop order sync — Coming soon",
    tiktokOutcomes: ["Profit Analysis", "Inventory Control", "Business Reports"],
    reportsGridTitle: "7 Professional Reports",

    compareTitle: "Spreadsheets vs. Bossify",
    compareSub: "What changes when you switch.",
    compareSpreadsheetLabel: "Spreadsheet",
    compareBossifyLabel: "Bossify",
    compareSpreadsheetItems: [
      "Manual data entry",
      "Easy to miss mistakes",
      "Separate calculations for every report",
      "No automatic alerts",
      "Hard to maintain as you grow",
    ],
    compareBossifyItems: [
      "Real profit tracking, automatically",
      "Smart low-stock and loss alerts",
      "All 7 reports in one place",
      "Built specifically for sellers",
      "Gets easier as your shop grows",
    ],

    trustSectionTitle: "Built to be trusted with your numbers.",
    trustItems: [
      "Built for small sellers, not accountants",
      "Simple enough to use on day one",
      "Every number traced back to a real order",
    ],

    finalTitle1: "Stop guessing.",
    finalTitle2: "Start knowing.",
    finalSub: "See what your business actually earns with Bossify.",
    finalCtaPrimary: "Start Free",
    finalCtaSecondary: "Watch Demo (2 min)",

    footerTag: "Manage your shop like a boss",
  },
  zh: {
    navFeatures: "功能",
    navReports: "报表",
    navPricing: "价格",
    signIn: "登录",
    startFree: "免费开始",

    eyebrow: "专为马来西亚 TIKTOK SHOP 卖家打造",
    headline1: "知道你",
    headlineEmphasis: "真正赚了多少。",
    subhead: "追踪真实利润、库存、订单和业绩表现——不需要会计知识。",
    ctaPrimary: "免费开始",
    ctaSecondary: "观看演示(2 分钟)",
    trustBullets: ["几分钟即可上手", "无需信用卡", "手机 & 网页皆可用"],
    capabilityStrip: ["真实利润追踪", "库存管理", "7 份业务报表", "订单管理"],

    problemTitle: "销售额不代表",
    problemTitleEmphasis: "真相。",
    problemDesc: "你在 TikTok Shop 上可能看到不错的销售额,但扣除产品成本、平台费用、运费和其他支出后,实际利润可能低很多。",
    problemSalesLabel: "销售额 (GMV)",
    problemSalesValue: "RM10,000",
    problemCostLines: [
      { label: "产品成本", value: "−RM5,000" },
      { label: "平台费用", value: "−RM800" },
      { label: "运费", value: "−RM600" },
      { label: "包装费", value: "−RM300" },
      { label: "其他支出", value: "−RM450" },
    ],
    problemProfitLabel: "你真正赚到的",
    problemProfitValue: "RM2,850",

    featuresTitle: "经营生意需要的一切,全都在这里。",
    featuresSub: "在同一个地方管理你的销售、利润、库存和报表。",
    showcaseProfit: { title: "真实利润", desc: "看清扣除真实成本后的利润。" },
    showcaseInventory: { title: "库存管理", desc: "追踪库存水平并接收提醒。" },
    showcaseReports: { title: "业务报表", desc: "生成 7 份专业 PDF 报表。" },
    showcaseOrders: { title: "订单管理", desc: "快速记录和管理订单,支持 WhatsApp 确认。" },
    reports: [
      "销售报表",
      "利润报表",
      "库存报表",
      "财务损益表",
      "客户对账单",
      "供应商报表",
      "订单核对表",
    ],

    tiktokEyebrow: "数据整合",
    tiktokTitle: "从 TikTok Shop 到你的真实利润。",
    tiktokSub: "连接你的商店,导入订单和产品,然后在 Bossify 查看利润、库存和报表。",
    tiktokComingSoon: "自动 TikTok Shop 订单同步——即将推出",
    tiktokOutcomes: ["利润分析", "库存管理", "业务报表"],
    reportsGridTitle: "7 份专业报表",

    compareTitle: "电子表格 vs. Bossify",
    compareSub: "换了之后会有什么不同。",
    compareSpreadsheetLabel: "电子表格",
    compareBossifyLabel: "Bossify",
    compareSpreadsheetItems: [
      "手动输入数据",
      "容易漏掉错误",
      "每份报表都要分开计算",
      "没有自动提醒",
      "生意越大越难维护",
    ],
    compareBossifyItems: [
      "自动追踪真实利润",
      "智能库存和亏损提醒",
      "7 份报表集中在一处",
      "专为卖家设计",
      "生意越大越好用",
    ],

    trustSectionTitle: "值得信赖的数字管理方式。",
    trustItems: ["专为小卖家设计,不是为会计师", "第一天就能轻松上手", "每一个数字都能追溯到真实订单"],

    finalTitle1: "别再猜测。",
    finalTitle2: "开始真正了解。",
    finalSub: "用 Bossify 看清你的生意真正赚到了多少。",
    finalCtaPrimary: "免费开始",
    finalCtaSecondary: "观看演示(2 分钟)",

    footerTag: "像老板一样管理你的生意",
  },
  ms: {
    navFeatures: "Ciri-ciri",
    navReports: "Laporan",
    navPricing: "Harga",
    signIn: "Log Masuk",
    startFree: "Mula Percuma",

    eyebrow: "UNTUK PENJUAL TIKTOK SHOP DI MALAYSIA",
    headline1: "Ketahui apa yang",
    headlineEmphasis: "anda benar-benar untung.",
    subhead: "Jejak keuntungan sebenar, inventori, pesanan dan prestasi perniagaan — tanpa perakaunan yang rumit.",
    ctaPrimary: "Mula Percuma",
    ctaSecondary: "Tonton Demo (2 min)",
    trustBullets: ["Sedia dalam beberapa minit", "Tidak perlu kad kredit", "Mudah alih & Web"],
    capabilityStrip: ["Penjejakan Keuntungan Sebenar", "Pengurusan Inventori", "7 Laporan Perniagaan", "Pengurusan Pesanan"],

    problemTitle: "Jualan tidak menunjukkan",
    problemTitleEmphasis: "keseluruhan cerita.",
    problemDesc:
      "Anda mungkin nampak jualan yang baik di TikTok Shop, tetapi selepas kos produk, yuran platform, penghantaran dan perbelanjaan lain, keuntungan sebenar anda mungkin jauh lebih rendah.",
    problemSalesLabel: "Jualan (GMV)",
    problemSalesValue: "RM10,000",
    problemCostLines: [
      { label: "Kos Produk", value: "−RM5,000" },
      { label: "Yuran Platform", value: "−RM800" },
      { label: "Penghantaran", value: "−RM600" },
      { label: "Pembungkusan", value: "−RM300" },
      { label: "Perbelanjaan Lain", value: "−RM450" },
    ],
    problemProfitLabel: "Apa yang anda benar-benar untung",
    problemProfitValue: "RM2,850",

    featuresTitle: "Semua yang anda perlukan untuk menguruskan nombor.",
    featuresSub: "Uruskan jualan, keuntungan, stok dan laporan anda di satu tempat.",
    showcaseProfit: { title: "Keuntungan Sebenar", desc: "Lihat keuntungan selepas kos perniagaan sebenar." },
    showcaseInventory: { title: "Inventori", desc: "Jejak tahap stok dan terima makluman." },
    showcaseReports: { title: "Laporan Perniagaan", desc: "Jana 7 laporan profesional dalam PDF." },
    showcaseOrders: { title: "Pesanan", desc: "Rekod dan uruskan pesanan dengan pantas, dengan pengesahan WhatsApp." },
    reports: [
      "Laporan Jualan",
      "Laporan Keuntungan",
      "Laporan Stok",
      "Penyata P&L",
      "Penyata Pelanggan",
      "Laporan Pembekal",
      "Penyesuaian Pesanan",
    ],

    tiktokEyebrow: "INTEGRASI",
    tiktokTitle: "Dari TikTok Shop kepada keuntungan sebenar anda.",
    tiktokSub: "Sambungkan kedai anda, bawa masuk pesanan dan produk, kemudian lihat keuntungan, stok dan laporan anda di Bossify.",
    tiktokComingSoon: "Penyegerakan pesanan TikTok Shop automatik — Akan datang",
    tiktokOutcomes: ["Analisis Keuntungan", "Kawalan Inventori", "Laporan Perniagaan"],
    reportsGridTitle: "7 Laporan Profesional",

    compareTitle: "Hamparan vs. Bossify",
    compareSub: "Apa yang berubah apabila anda bertukar.",
    compareSpreadsheetLabel: "Hamparan",
    compareBossifyLabel: "Bossify",
    compareSpreadsheetItems: [
      "Kemasukan data secara manual",
      "Mudah terlepas pandang kesilapan",
      "Pengiraan berasingan untuk setiap laporan",
      "Tiada makluman automatik",
      "Sukar diselenggara apabila berkembang",
    ],
    compareBossifyItems: [
      "Jejak keuntungan sebenar secara automatik",
      "Makluman stok rendah dan kerugian yang pintar",
      "Semua 7 laporan di satu tempat",
      "Dibina khusus untuk penjual",
      "Semakin mudah apabila kedai anda berkembang",
    ],

    trustSectionTitle: "Dibina untuk dipercayai dengan nombor anda.",
    trustItems: [
      "Dibina untuk penjual kecil, bukan akauntan",
      "Cukup mudah untuk digunakan pada hari pertama",
      "Setiap nombor boleh dijejaki kembali ke pesanan sebenar",
    ],

    finalTitle1: "Berhenti meneka.",
    finalTitle2: "Mula mengetahui.",
    finalSub: "Lihat apa yang perniagaan anda benar-benar peroleh dengan Bossify.",
    finalCtaPrimary: "Mula Percuma",
    finalCtaSecondary: "Tonton Demo (2 min)",

    footerTag: "Uruskan kedai anda seperti bos",
  },
};

const REPORT_ICONS = [DollarSign, TrendingUp, Package, FileText, Users, Truck, ClipboardCheck];
const FEATURE_ICONS = [TrendingUp, Package, FileText, ShoppingBag];
const COST_ICONS = [Package, Layers, Truck, Archive, MoreHorizontal];
const CAPABILITY_ICONS = [TrendingUp, Package, FileText, ShoppingBag];
const TRUST_BULLET_ICONS = [Zap, CreditCard, Smartphone];

// ---------------------------------------------------------------------------
// Motion: lightweight scroll-reveal + cursor-follow tilt. No animation
// libraries -- just IntersectionObserver and pointermove, both skipped
// entirely under prefers-reduced-motion.
// ---------------------------------------------------------------------------
function Reveal({
  children,
  delay = 0,
  mode = "scroll",
}: {
  children: ReactNode;
  delay?: number;
  mode?: "scroll" | "mount";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      setVisible(true);
      return;
    }
    if (mode === "mount") {
      const t = setTimeout(() => setVisible(true), 60);
      return () => clearTimeout(t);
    }
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -60px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [mode]);

  return (
    <div
      ref={ref}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(26px)",
        transition: `opacity 0.7s cubic-bezier(0.16,1,0.3,1) ${delay}ms, transform 0.7s cubic-bezier(0.16,1,0.3,1) ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

function TiltWrap({ children, max = 6 }: { children: ReactNode; max?: number }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!window.matchMedia("(pointer: fine)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    const onMove = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width - 0.5;
      const py = (e.clientY - rect.top) / rect.height - 0.5;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        el.style.transform = `rotateX(${(-py * max).toFixed(2)}deg) rotateY(${(px * max).toFixed(2)}deg)`;
      });
    };
    const onLeave = () => {
      cancelAnimationFrame(frame);
      el.style.transform = "rotateX(0deg) rotateY(0deg)";
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      cancelAnimationFrame(frame);
    };
  }, [max]);

  return (
    <div ref={ref} style={{ transition: "transform 0.25s ease-out", willChange: "transform" }}>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Count-up number animation -- animates 0 -> target once `start` flips true
// (mount, or IntersectionObserver visibility), using an eased RAF loop.
// Jumps straight to the final value under prefers-reduced-motion.
// ---------------------------------------------------------------------------
function useCountUp(target: number, start: boolean, durationMs = 1400) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!start) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setValue(target);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const ease = (x: number) => 1 - Math.pow(1 - x, 3);
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / durationMs);
      setValue(Math.round(target * ease(p)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, start, durationMs]);
  return value;
}

const fmtRM = (n: number) => `RM${n.toLocaleString("en-US")}`;
const fmtInt = (n: number) => n.toLocaleString("en-US");

function polylineLength(coords: number[][]) {
  let len = 0;
  for (let i = 1; i < coords.length; i++) {
    const [x1, y1] = coords[i - 1];
    const [x2, y2] = coords[i];
    len += Math.hypot(x2 - x1, y2 - y1);
  }
  return len;
}

// ---------------------------------------------------------------------------
// Hero product mockup -- a tilted "laptop screen" showing the real Bossify
// dashboard: sidebar, stat tiles, a two-series profit/sales chart with a
// decorative play button, plus two floating cards for depth. Entirely
// hand-built illustration -- no real data, no screenshots. Runs as a live
// "product is working" showcase: the chart draws itself in, the KPI
// numbers count up, the low-stock badge pulses occasionally, and the two
// floating cards slide in with a stagger once the hero mounts.
// ---------------------------------------------------------------------------
function LaptopMockup({ onPlay }: { onPlay: () => void }) {
  const [started, setStarted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setStarted(true), 300);
    return () => clearTimeout(t);
  }, []);
  const sales = useCountUp(12480, started);
  const profit = useCountUp(3842, started);
  const orders = useCountUp(428, started);
  const salesPts = [30, 42, 38, 52, 46, 60, 54, 68, 62, 76, 70, 84];
  const profitPts = [10, 16, 13, 20, 17, 24, 20, 28, 24, 32, 28, 36];
  const w = 520;
  const h = 150;
  const build = (pts: number[]) => {
    const step = w / (pts.length - 1);
    const max = 90;
    return pts.map((p, i) => [i * step, h - (p / max) * (h - 20) - 8]);
  };
  const salesCoords = build(salesPts);
  const profitCoords = build(profitPts);
  const toPath = (coords: number[][]) => coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const profitArea = `${toPath(profitCoords)} L${w},${h} L0,${h} Z`;
  const salesLen = polylineLength(salesCoords);
  const profitLen = polylineLength(profitCoords);

  const sidebarItems = [
    { icon: TrendingUp, label: "Dashboard", active: true },
    { icon: ShoppingBag, label: "Orders", active: false },
    { icon: Package, label: "Products", active: false },
    { icon: Archive, label: "Inventory", active: false },
    { icon: FileText, label: "Profit & Analytics", active: false },
    { icon: CreditCard, label: "Expenses", active: false },
    { icon: ClipboardCheck, label: "Reports", active: false },
  ];

  const dateLabels = ["1 Oct", "9 Oct", "17 Oct", "25 Oct"];

  return (
    <div className="relative w-full max-w-[640px] mx-auto">
      <div
        className="bf-shine bossify-animate-float-sm relative rounded-[20px] overflow-hidden border"
        style={{
          background: CARD,
          borderColor: BORDER_STRONG,
          boxShadow: `0 10px 0 0 #08051000, 0 60px 120px -30px rgba(139,92,246,0.35), 0 0 0 1px rgba(139,92,246,0.08)`,
        }}
      >
        <div className="flex">
          <div className="hidden sm:flex flex-col gap-1 p-3 w-[168px] shrink-0 border-r" style={{ borderColor: BORDER }}>
            <div className="flex items-center gap-1.5 px-2 py-2 mb-2">
              <img src={bossifyLogo} alt="" className="w-5 h-5 rounded" />
              <span className="text-[12px] font-bold" style={{ color: TEXT }}>Bossify</span>
            </div>
            {sidebarItems.map((it) => (
              <div
                key={it.label}
                className="flex items-center gap-2 px-2.5 py-2 rounded-lg"
                style={{ background: it.active ? GRADIENT : "transparent" }}
              >
                <it.icon className="w-3.5 h-3.5 shrink-0" style={{ color: it.active ? "#FFFFFF" : TEXT_MUTED }} />
                <span className="text-[10.5px] font-medium truncate" style={{ color: it.active ? "#FFFFFF" : TEXT_MUTED }}>
                  {it.label}
                </span>
              </div>
            ))}
          </div>

          <div className="flex-1 p-4 sm:p-5 min-w-0">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[14px] font-bold" style={{ color: TEXT }}>Dashboard</span>
              <span
                className="flex items-center gap-1 text-[10.5px] font-medium px-2.5 py-1 rounded-full border"
                style={{ color: TEXT_MUTED, borderColor: BORDER }}
              >
                This Month
                <ChevronDown className="w-3 h-3" />
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4">
              <div className="rounded-xl p-2.5" style={{ background: CARD_SOFT }}>
                <p className="text-[9px] font-semibold" style={{ color: TEXT_MUTED }}>SALES (GMV)</p>
                <p className="text-[14px] font-bold tabular-nums" style={{ color: TEXT }}>{fmtRM(sales)}</p>
                <p className="text-[9.5px] font-semibold" style={{ color: GREEN }}>+18.4%</p>
              </div>
              <div className="rounded-xl p-2.5" style={{ background: CARD_SOFT }}>
                <p className="text-[9px] font-semibold" style={{ color: TEXT_MUTED }}>NET PROFIT</p>
                <p className="text-[14px] font-bold tabular-nums" style={{ color: TEXT }}>{fmtRM(profit)}</p>
                <p className="text-[9.5px] font-semibold" style={{ color: GREEN }}>+20.1%</p>
              </div>
              <div className="rounded-xl p-2.5" style={{ background: CARD_SOFT }}>
                <p className="text-[9px] font-semibold" style={{ color: TEXT_MUTED }}>ORDERS</p>
                <p className="text-[14px] font-bold tabular-nums" style={{ color: TEXT }}>{fmtInt(orders)}</p>
                <p className="text-[9.5px] font-semibold" style={{ color: GREEN }}>+12.7%</p>
              </div>
              <div className="rounded-xl p-2.5" style={{ background: "rgba(248,113,113,0.1)" }}>
                <p className="text-[9px] font-semibold" style={{ color: RED }}>LOW STOCK</p>
                <p className="text-[14px] font-bold" style={{ color: TEXT }}>7</p>
                <p className="text-[9.5px] font-semibold" style={{ color: RED }}>needs action</p>
              </div>
            </div>

            <div className="rounded-xl p-3.5" style={{ background: CARD_SOFT }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold" style={{ color: TEXT }}>Sales &amp; Profit Trend</span>
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1 text-[9.5px]" style={{ color: TEXT_MUTED }}>
                    <span className="w-2 h-2 rounded-full" style={{ background: GRAD_TO }} />
                    Sales (RM)
                  </span>
                  <span className="flex items-center gap-1 text-[9.5px]" style={{ color: TEXT_MUTED }}>
                    <span className="w-2 h-2 rounded-full" style={{ background: GRAD_FROM }} />
                    Net Profit (RM)
                  </span>
                </div>
              </div>
              <div className="relative">
                <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-[110px]" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="bf-profit-area" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={GRAD_FROM} stopOpacity="0.35" />
                      <stop offset="100%" stopColor={GRAD_FROM} stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path
                    d={profitArea}
                    fill="url(#bf-profit-area)"
                    style={{ opacity: started ? 1 : 0, transition: "opacity 0.9s ease-out 1.1s" }}
                  />
                  <path
                    d={toPath(salesCoords)}
                    fill="none"
                    stroke={GRAD_TO}
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity="0.85"
                    style={{
                      strokeDasharray: salesLen,
                      strokeDashoffset: started ? 0 : salesLen,
                      transition: "stroke-dashoffset 1.3s cubic-bezier(0.16,1,0.3,1) 0.25s",
                    }}
                  />
                  <path
                    d={toPath(profitCoords)}
                    fill="none"
                    stroke={GRAD_FROM}
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{
                      strokeDasharray: profitLen,
                      strokeDashoffset: started ? 0 : profitLen,
                      transition: "stroke-dashoffset 1.3s cubic-bezier(0.16,1,0.3,1) 0.45s",
                    }}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <button
                    type="button"
                    onClick={onPlay}
                    aria-label="Watch demo"
                    className="w-11 h-11 rounded-full flex items-center justify-center border transition-transform hover:scale-110"
                    style={{ background: "rgba(10,6,20,0.55)", borderColor: "rgba(255,255,255,0.3)", backdropFilter: "blur(2px)" }}
                  >
                    <Play className="w-4 h-4 ml-0.5" style={{ color: "#FFFFFF" }} fill="#FFFFFF" />
                  </button>
                </div>
              </div>
              <div className="flex justify-between mt-1.5">
                {dateLabels.map((d) => (
                  <span key={d} className="text-[9px]" style={{ color: TEXT_MUTED }}>{d}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div
        className="absolute -top-5 -left-4 sm:-left-8"
        style={{
          opacity: started ? 1 : 0,
          transform: started ? "translate(0,0)" : "translate(-14px,-10px)",
          transition: "opacity 0.6s ease-out 0.7s, transform 0.6s cubic-bezier(0.16,1,0.3,1) 0.7s",
        }}
      >
        <div
          className="rounded-2xl border px-3.5 py-3 flex items-center gap-2.5"
          style={{ background: CARD, borderColor: BORDER_STRONG, boxShadow: "0 20px 50px -15px rgba(0,0,0,0.6)" }}
        >
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "#000000" }}>
            <ShoppingBag className="w-4 h-4" style={{ color: "#FFFFFF" }} />
          </div>
          <div>
            <p className="text-[11px] font-bold flex items-center gap-1.5" style={{ color: TEXT }}>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 bossify-animate-status-dot" />
              TikTok Shop
            </p>
            <p className="text-[9px]" style={{ color: TEXT_MUTED }}>Synced</p>
          </div>
        </div>
      </div>

      <div
        className="absolute -bottom-6 -right-4 sm:-right-10 rounded-2xl"
        style={{
          opacity: started ? 1 : 0,
          transform: started ? "translate(0,0)" : "translate(14px,10px)",
          transition: "opacity 0.6s ease-out 0.9s, transform 0.6s cubic-bezier(0.16,1,0.3,1) 0.9s",
        }}
      >
        <div
          className="rounded-2xl border px-4 py-3.5"
          style={{ background: CARD, borderColor: BORDER_STRONG }}
        >
          <p className="text-[10px] font-semibold" style={{ color: TEXT_MUTED }}>Real Profit</p>
          <p className="text-[18px] font-bold tabular-nums" style={{ color: TEXT }}>{fmtRM(profit)}</p>
          <p className="text-[10.5px] font-bold flex items-center gap-0.5" style={{ color: GREEN }}><TrendingUp className="h-3 w-3" /> +20.1%</p>
        </div>
      </div>
    </div>
  );
}

function MiniProfitPreview() {
  const pts = [18, 28, 22, 34, 28, 40, 34, 46];
  const w = 220;
  const h = 70;
  const step = w / (pts.length - 1);
  const max = Math.max(...pts);
  const coords = pts.map((p, i) => [i * step, h - (p / max) * (h - 12) - 4]);
  const linePath = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${w},${h} L0,${h} Z`;
  return (
    <div className="rounded-xl p-3" style={{ background: CARD_SOFT }}>
      <p className="text-[9.5px] font-semibold" style={{ color: TEXT_MUTED }}>Net Profit</p>
      <div className="flex items-end gap-2 mb-1.5">
        <p className="text-[15px] font-bold" style={{ color: TEXT }}>RM3,842</p>
        <span className="text-[10px] font-bold mb-0.5" style={{ color: GREEN }}>+20.4%</span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-[48px]" preserveAspectRatio="none">
        <defs>
          <linearGradient id="bf-mini-profit" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={GRAD_FROM} stopOpacity="0.35" />
            <stop offset="100%" stopColor={GRAD_FROM} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#bf-mini-profit)" />
        <path d={linePath} fill="none" stroke={GRAD_FROM} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function MiniInventoryPreview() {
  const items = [
    { name: "Wireless Mouse", stock: 5 },
    { name: "Phone Stand", stock: 8 },
  ];
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: CARD_SOFT }}>
      <div className="flex items-center gap-1.5 px-3 py-2" style={{ background: "rgba(248,113,113,0.12)" }}>
        <PackageX className="w-3 h-3" style={{ color: RED }} />
        <span className="text-[9.5px] font-bold" style={{ color: RED }}>Low Stock (7)</span>
      </div>
      {items.map((it) => (
        <div key={it.name} className="flex items-center justify-between px-3 py-1.5">
          <span className="text-[10.5px] truncate" style={{ color: TEXT }}>{it.name}</span>
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ color: RED, background: "rgba(248,113,113,0.12)" }}>{it.stock}</span>
        </div>
      ))}
    </div>
  );
}

function MiniReportsPreview({ reports }: { reports: string[] }) {
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: CARD_SOFT }}>
      {reports.slice(0, 3).map((name, i) => (
        <div key={name} className="flex items-center justify-between px-3 py-2" style={{ borderTop: i === 0 ? "none" : `1px solid ${BORDER}` }}>
          <span className="flex items-center gap-1.5 text-[10.5px] truncate" style={{ color: TEXT }}>
            <FileText className="w-3 h-3 shrink-0" style={{ color: GRAD_FROM }} />
            {name}
          </span>
          <span className="text-[8.5px] font-bold px-1.5 py-0.5 rounded shrink-0" style={{ color: GRAD_FROM, background: "rgba(139,92,246,0.14)" }}>PDF</span>
        </div>
      ))}
    </div>
  );
}

function MiniOrdersPreview() {
  const rows: { code: string; amount: string; status: "Completed" | "Processing" | "Pending" }[] = [
    { code: "#10482", amount: "RM129.00", status: "Completed" },
    { code: "#10481", amount: "RM89.00", status: "Processing" },
    { code: "#10480", amount: "RM159.00", status: "Pending" },
  ];
  const style: Record<string, { fg: string; bg: string }> = {
    Completed: { fg: GREEN, bg: "rgba(74,222,128,0.14)" },
    Processing: { fg: BLUE, bg: "rgba(96,165,250,0.14)" },
    Pending: { fg: TEXT_MUTED, bg: "rgba(157,147,181,0.14)" },
  };
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: CARD_SOFT }}>
      {rows.map((r, i) => (
        <div key={r.code} className="flex items-center justify-between px-3 py-2" style={{ borderTop: i === 0 ? "none" : `1px solid ${BORDER}` }}>
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[9.5px] font-mono shrink-0" style={{ color: TEXT_MUTED }}>{r.code}</span>
            <span className="text-[10px] font-semibold" style={{ color: TEXT }}>{r.amount}</span>
          </div>
          <span className="text-[8.5px] font-bold px-1.5 py-0.5 rounded shrink-0" style={{ color: style[r.status].fg, background: style[r.status].bg }}>
            {r.status}
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Scroll-driven profit waterfall -- "Sales don't tell the whole story" made
// visual: Sales appears, then each real cost slides in one at a time as
// the section scrolls into view, ending on an emphasized Real Profit
// reveal. Triggers once via IntersectionObserver (not continuously
// scroll-scrubbed) so it stays smooth on mobile and doesn't fight the
// user's scroll direction.
// ---------------------------------------------------------------------------
function ProfitWaterfall({ copy }: { copy: LandingCopy }) {
  const ref = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(0);
  const totalSteps = copy.problemCostLines.length + 1;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      setStep(totalSteps);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        const timers: number[] = [];
        for (let i = 1; i <= totalSteps; i++) {
          timers.push(window.setTimeout(() => setStep(i), i * 420));
        }
      },
      { threshold: 0.35 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [totalSteps]);

  const finalReached = step > copy.problemCostLines.length;

  return (
    <div ref={ref} className="rounded-2xl border overflow-hidden" style={{ background: CARD, borderColor: BORDER }}>
      <div
        className="px-5 py-4 flex items-center justify-between"
        style={{
          opacity: step > 0 ? 1 : 0,
          transform: step > 0 ? "translateY(0)" : "translateY(10px)",
          transition: "opacity 0.5s ease-out, transform 0.5s cubic-bezier(0.16,1,0.3,1)",
        }}
      >
        <span className="text-[11px] font-semibold" style={{ color: TEXT_MUTED }}>{copy.problemSalesLabel}</span>
        <span className="text-[20px] font-bold tabular-nums" style={{ color: TEXT, fontFamily: "Space Grotesk, system-ui, sans-serif" }}>
          {copy.problemSalesValue}
        </span>
      </div>
      {copy.problemCostLines.map((line, i) => {
        const Icon = COST_ICONS[i] ?? Minus;
        const revealed = step > i + 1;
        return (
          <div
            key={line.label}
            className="flex items-center justify-between gap-3 px-5 py-3 border-t"
            style={{
              borderColor: BORDER,
              opacity: revealed ? 1 : 0,
              transform: revealed ? "translateX(0)" : "translateX(-16px)",
              transition: "opacity 0.45s ease-out, transform 0.45s cubic-bezier(0.16,1,0.3,1)",
            }}
          >
            <span className="flex items-center gap-2 text-[12.5px]" style={{ color: TEXT_MUTED }}>
              <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: TEXT_MUTED }} />
              {line.label}
            </span>
            <span className="text-[13px] font-bold shrink-0 tabular-nums" style={{ color: RED }}>{line.value}</span>
          </div>
        );
      })}
      <div
        className="mx-4 my-4 rounded-xl px-5 py-4 flex items-center justify-between"
        style={{
          background: finalReached ? GRADIENT : "rgba(139,92,246,0.1)",
          transition: "background 0.6s ease-out, transform 0.5s cubic-bezier(0.16,1,0.3,1)",
          transform: finalReached ? "scale(1.02)" : "scale(1)",
          boxShadow: finalReached ? "0 20px 50px -15px rgba(139,92,246,0.5)" : "none",
        }}
      >
        <span
          className="text-[11px] font-bold uppercase tracking-wide"
          style={{ color: finalReached ? "rgba(255,255,255,0.85)" : TEXT_MUTED }}
        >
          {copy.problemProfitLabel}
        </span>
        <span
          className="text-[22px] font-bold tabular-nums"
          style={{
            color: finalReached ? "#FFFFFF" : TEXT,
            fontFamily: "Space Grotesk, system-ui, sans-serif",
            textShadow: finalReached ? "0 0 20px rgba(255,255,255,0.4)" : "none",
          }}
        >
          {copy.problemProfitValue}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Demo video modal -- since there's no recorded demo video yet, this is a
// simulated product walkthrough built from the same copy as the Problem
// section: Sales appears, each real cost is subtracted one at a time with
// a running total, and the sequence lands on Real Profit with emphasis.
// Auto-plays on open, replayable, closes on Escape/backdrop/X.
// ---------------------------------------------------------------------------
function DemoVideoModal({ open, onClose, copy }: { open: boolean; onClose: () => void; copy: LandingCopy }) {
  const [step, setStep] = useState(0);
  const [replayKey, setReplayKey] = useState(0);
  const totalSteps = copy.problemCostLines.length + 1; // + final profit reveal

  useEffect(() => {
    if (!open) return;
    setStep(0);
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      setStep(totalSteps);
      return;
    }
    const timers: number[] = [];
    for (let i = 1; i <= totalSteps; i++) {
      timers.push(window.setTimeout(() => setStep(i), 500 + i * 650));
    }
    return () => timers.forEach(clearTimeout);
  }, [open, totalSteps, replayKey]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const parseRM = (s: string) => Number(s.replace(/[^0-9.-]/g, ""));
  const salesN = parseRM(copy.problemSalesValue);
  let runningTotal = salesN;
  const linesWithRunning = copy.problemCostLines.map((line) => {
    runningTotal += parseRM(line.value); // values are already negative, e.g. "-RM5,000"
    return { ...line, runningAfter: runningTotal };
  });
  const finalReached = step > copy.problemCostLines.length;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Bossify profit demo"
      className="fixed inset-0 z-[100] flex items-center justify-center px-4"
      style={{ background: "rgba(5,3,10,0.82)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-[24px] border overflow-hidden"
        style={{ background: CARD, borderColor: BORDER_STRONG, boxShadow: "0 40px 100px -20px rgba(139,92,246,0.5)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close demo"
          className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full flex items-center justify-center border transition-transform hover:scale-110"
          style={{ background: "rgba(10,6,20,0.6)", borderColor: BORDER, color: TEXT }}
        >
          <X className="w-4 h-4" />
        </button>

        <div className="px-6 pt-8 pb-3 text-center">
          <p className="text-[11px] font-bold tracking-wide uppercase mb-1" style={{ color: TEXT_MUTED }}>
            {copy.problemSalesLabel}
          </p>
          <p
            className="text-[34px] font-bold tabular-nums tracking-tight"
            style={{ color: TEXT, fontFamily: "Space Grotesk, system-ui, sans-serif" }}
          >
            {copy.problemSalesValue}
          </p>
        </div>

        <div className="px-6 pb-2">
          {linesWithRunning.map((line, i) => {
            const revealed = step > i;
            return (
              <div
                key={line.label}
                className="flex items-center justify-between gap-3 py-2.5 border-t"
                style={{
                  borderColor: BORDER,
                  opacity: revealed ? 1 : 0,
                  transform: revealed ? "translateX(0)" : "translateX(-10px)",
                  transition: "opacity 0.4s ease-out, transform 0.4s cubic-bezier(0.16,1,0.3,1)",
                }}
              >
                <span className="text-[13px]" style={{ color: TEXT_MUTED }}>{line.label}</span>
                <span className="text-[13.5px] font-bold tabular-nums shrink-0" style={{ color: RED }}>{line.value}</span>
              </div>
            );
          })}
        </div>

        <div
          className="mx-6 my-4 rounded-2xl p-5 text-center"
          style={{
            background: finalReached ? GRADIENT : "rgba(139,92,246,0.1)",
            transition: "background 0.6s ease-out",
            transform: finalReached ? "scale(1.03)" : "scale(1)",
            boxShadow: finalReached ? "0 20px 50px -15px rgba(139,92,246,0.55)" : "none",
          }}
        >
          <p
            className="text-[11px] font-bold tracking-wide uppercase mb-1"
            style={{ color: finalReached ? "rgba(255,255,255,0.85)" : TEXT_MUTED }}
          >
            {copy.problemProfitLabel}
          </p>
          <p
            className="text-[30px] font-bold tabular-nums tracking-tight"
            style={{
              color: finalReached ? "#FFFFFF" : TEXT,
              fontFamily: "Space Grotesk, system-ui, sans-serif",
              textShadow: finalReached ? "0 0 24px rgba(255,255,255,0.4)" : "none",
            }}
          >
            {copy.problemProfitValue}
          </p>
        </div>

        <div className="px-6 pb-6 flex items-center justify-center">
          <button
            type="button"
            onClick={() => setReplayKey((k) => k + 1)}
            className="text-[12.5px] font-semibold px-4 py-2 rounded-full border transition-colors hover:border-[rgba(168,124,255,0.5)]"
            style={{ color: TEXT_MUTED, borderColor: BORDER }}
          >
            <RotateCcw className="inline h-3 w-3 mr-1 -mt-0.5" />Replay
          </button>
        </div>
      </div>
    </div>
  );
}

export function LandingPage() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);
  const c = COPY[lang] ?? COPY.en;

  const goAuth = (mode: "login" | "register") => {
    navigate({ to: "/auth", search: mode === "register" ? { mode: "reg" } : undefined } as never);
  };

  const trustIcons = TRUST_BULLET_ICONS;
  const featureCards = [c.showcaseProfit, c.showcaseInventory, c.showcaseReports, c.showcaseOrders];
  const featureMinis = [<MiniProfitPreview key="p" />, <MiniInventoryPreview key="i" />, <MiniReportsPreview key="r" reports={c.reports} />, <MiniOrdersPreview key="o" />];

  return (
    <div
      className="relative isolate"
      style={{
        // A faint dot-grid texture under everything — the plain sections
        // (hero left column, Trust, the tinted bands) were a single flat
        // fill with nothing happening between the cards, which is most of
        // what reads as "empty" on a mostly-light page. This is cheap
        // texture, not a layout change.
        backgroundColor: BG,
        backgroundImage: "radial-gradient(circle, rgba(139,92,246,0.14) 1px, transparent 1px)",
        backgroundSize: "28px 28px",
        fontFamily: "IBM Plex Sans, system-ui, sans-serif",
      }}
    >
      <div className="relative z-10">
      {/* Header */}
      <header className="sticky top-0 z-30 backdrop-blur border-b" style={{ background: "rgba(252,251,254,0.85)", borderColor: BORDER }}>
        <div className="max-w-6xl mx-auto px-5 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src={bossifyLogo} alt="Bossify" className="h-9 w-9 rounded-lg object-contain" />
            <span className="text-lg font-bold tracking-tight" style={{ color: TEXT, fontFamily: "Space Grotesk, system-ui, sans-serif" }}>
              Bossify
            </span>
          </div>
          <nav className="hidden lg:flex items-center gap-8">
            <a href="#features" className="bf-text-live text-sm font-medium" style={{ color: TEXT_MUTED }}>{c.navFeatures}</a>
            <a href="#reports" className="bf-text-live text-sm font-medium" style={{ color: TEXT_MUTED }}>{c.navReports}</a>
            <a href="#pricing" className="bf-text-live text-sm font-medium" style={{ color: TEXT_MUTED }}>{c.navPricing}</a>
          </nav>
          <div className="hidden lg:flex items-center gap-3">
            <button onClick={() => goAuth("login")} className="text-sm font-semibold px-4 py-2 rounded-full border" style={{ color: TEXT, borderColor: BORDER }}>
              {c.signIn}
            </button>
            <button
              onClick={() => goAuth("register")}
              className="text-sm font-semibold px-5 py-2.5 rounded-full text-white flex items-center gap-1.5"
              style={{ background: GRADIENT }}
            >
              {c.startFree}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
          <button className="lg:hidden p-2 -mr-2" onClick={() => setMenuOpen((v) => !v)} aria-label="Menu" style={{ color: TEXT }}>
            {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
        {menuOpen && (
          <div className="lg:hidden border-t px-5 py-4 flex flex-col gap-3" style={{ borderColor: BORDER, background: BG }}>
            <a href="#features" onClick={() => setMenuOpen(false)} className="bf-text-live text-sm font-medium" style={{ color: TEXT_MUTED }}>{c.navFeatures}</a>
            <a href="#reports" onClick={() => setMenuOpen(false)} className="bf-text-live text-sm font-medium" style={{ color: TEXT_MUTED }}>{c.navReports}</a>
            <a href="#pricing" onClick={() => setMenuOpen(false)} className="bf-text-live text-sm font-medium" style={{ color: TEXT_MUTED }}>{c.navPricing}</a>
            <button onClick={() => goAuth("login")} className="text-sm font-semibold px-4 py-2.5 rounded-full border text-left" style={{ color: TEXT, borderColor: BORDER }}>
              {c.signIn}
            </button>
            <button onClick={() => goAuth("register")} className="text-sm font-semibold px-4 py-2.5 rounded-full text-white text-left" style={{ background: GRADIENT }}>
              {c.startFree}
            </button>
          </div>
        )}
      </header>

      {/* Hero */}
      <section className="relative px-5 lg:px-8 pt-16 pb-20 lg:pt-20 lg:pb-28 overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 820px 480px at 18% 15%, rgba(139,92,246,0.16) 0%, transparent 60%), " +
              "radial-gradient(ellipse 900px 460px at 85% 10%, rgba(217,70,239,0.12) 0%, transparent 65%)",
          }}
        />
        <div className="relative max-w-6xl mx-auto grid lg:grid-cols-[0.85fr_1.15fr] gap-12 items-center">
          <Reveal mode="mount">
            <div>
              <span
                className="inline-block text-[11px] font-bold tracking-wide px-3 py-1.5 rounded-full border mb-5"
                style={{ color: TEXT_MUTED, borderColor: BORDER, background: CARD }}
              >
                {c.eyebrow}
              </span>
              <h1 className="text-[40px] leading-[1.05] lg:text-[58px] font-bold tracking-tight mb-5" style={{ color: TEXT, fontFamily: "Space Grotesk, system-ui, sans-serif" }}>
                {c.headline1}
                <br />
                <span className="bf-gradient-live" style={{ background: GRADIENT, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>
                  {c.headlineEmphasis}
                </span>
              </h1>
              <p className="text-[15px] leading-relaxed mb-7" style={{ color: TEXT_MUTED }}>{c.subhead}</p>
              <div className="flex flex-wrap items-center gap-3 mb-6">
                <button
                  onClick={() => goAuth("register")}
                  className="group text-[14.5px] font-semibold px-6 py-3 rounded-full text-white flex items-center gap-2 transition-all hover:-translate-y-0.5 hover:shadow-[0_12px_30px_-8px_rgba(139,92,246,0.6)]"
                  style={{ background: GRADIENT }}
                >
                  {c.ctaPrimary}
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setDemoOpen(true)}
                  className="text-[14.5px] font-semibold px-6 py-3 rounded-full border flex items-center gap-2 transition-all hover:-translate-y-0.5 hover:border-[rgba(168,124,255,0.5)]"
                  style={{ color: TEXT, borderColor: BORDER }}
                >
                  <Play className="w-3.5 h-3.5" style={{ color: TEXT }} fill={TEXT} />
                  {c.ctaSecondary}
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                {c.trustBullets.map((t, i) => {
                  const Icon = trustIcons[i] ?? Check;
                  return (
                    <span key={t} className="inline-flex items-center gap-1.5 text-[12.5px] font-medium" style={{ color: TEXT_MUTED }}>
                      <Icon className="w-3.5 h-3.5" style={{ color: GRAD_FROM }} />
                      {t}
                    </span>
                  );
                })}
              </div>
            </div>
          </Reveal>
          <Reveal mode="mount" delay={150}>
            <div style={{ transform: "perspective(1600px) rotateY(-10deg) rotateX(5deg)", transformStyle: "preserve-3d" }}>
              <TiltWrap max={4}>
                <LaptopMockup onPlay={() => setDemoOpen(true)} />
              </TiltWrap>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Capability strip -- plain typography + a dot separator, not an
          icon-in-gradient-box for every single item. */}
      <section className="px-5 lg:px-8 py-5 border-y" style={{ borderColor: BORDER, background: SECTION_TINT }}>
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-center gap-x-8 gap-y-2.5">
          {c.capabilityStrip.map((label, i) => (
            <span key={label} className="inline-flex items-center gap-2.5 text-[12.5px] font-semibold" style={{ color: TEXT_MUTED }}>
              {i > 0 && <span className="hidden sm:inline w-1 h-1 rounded-full -ml-5" style={{ background: BORDER_STRONG }} />}
              {label}
            </span>
          ))}
        </div>
      </section>

      {/* Problem -- scroll-driven profit waterfall */}
      <section className="px-5 lg:px-8 py-20 lg:py-28" style={{ background: SECTION_TINT }}>
        <div className="max-w-5xl mx-auto grid lg:grid-cols-[0.9fr_1fr] gap-10 lg:gap-14 items-center">
          <Reveal>
            <div>
              <h2 className="text-[28px] lg:text-[32px] font-bold tracking-tight leading-tight mb-4" style={{ color: TEXT, fontFamily: "Space Grotesk, system-ui, sans-serif" }}>
                {c.problemTitle}
                <br />
                <span style={{ background: GRADIENT, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>
                  {c.problemTitleEmphasis}
                </span>
              </h2>
              <p className="text-[14px] leading-relaxed" style={{ color: TEXT_MUTED }}>{c.problemDesc}</p>
            </div>
          </Reveal>
          <Reveal delay={100}>
            <ProfitWaterfall copy={c} />
          </Reveal>
        </div>
      </section>

      {/* Feature grid */}
      <section id="features" className="px-5 lg:px-8 py-20 lg:py-28">
        <div className="max-w-6xl mx-auto">
          <Reveal>
            <div className="text-center max-w-xl mx-auto mb-12">
              <h2 className="text-[26px] lg:text-[32px] font-bold tracking-tight mb-3" style={{ color: TEXT, fontFamily: "Space Grotesk, system-ui, sans-serif" }}>
                {c.featuresTitle}
              </h2>
              <p className="text-[14.5px]" style={{ color: TEXT_MUTED }}>{c.featuresSub}</p>
            </div>
          </Reveal>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {featureCards.map((f, i) => (
              <Reveal key={f.title} delay={i * 80}>
                <TiltWrap max={3}>
                  <div className="rounded-2xl p-5 border h-full" style={{ background: CARD, borderColor: BORDER }}>
                    <div className="flex items-baseline gap-2 mb-1">
                      <span className="text-[11px] font-bold tabular-nums" style={{ color: GRAD_FROM }}>0{i + 1}</span>
                      <h3 className="bf-text-live text-[14.5px] font-bold" style={{ color: TEXT }}>{f.title}</h3>
                    </div>
                    <p className="text-[12.5px] leading-relaxed mb-4" style={{ color: TEXT_MUTED }}>{f.desc}</p>
                    {featureMinis[i]}
                  </div>
                </TiltWrap>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* TikTok integration + reports grid */}
      <section id="reports" className="px-5 lg:px-8 py-20 lg:py-28">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-10 items-start">
          <Reveal>
            <div className="rounded-2xl border p-7" style={{ background: CARD, borderColor: BORDER }}>
              <p className="text-[11px] font-bold tracking-wider mb-3" style={{ color: GRAD_FROM }}>{c.tiktokEyebrow}</p>
              <h2 className="text-[24px] lg:text-[28px] font-bold tracking-tight mb-3 leading-tight" style={{ color: TEXT, fontFamily: "Space Grotesk, system-ui, sans-serif" }}>
                {c.tiktokTitle}
              </h2>
              <p className="text-[13.5px] leading-relaxed mb-6" style={{ color: TEXT_MUTED }}>{c.tiktokSub}</p>
              <div className="flex items-center gap-2.5 flex-wrap mb-4">
                <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl border" style={{ background: "#000000", borderColor: BORDER }}>
                  <ShoppingBag className="w-4 h-4 text-white" />
                  <span className="text-[12px] font-bold text-white">TikTok Shop</span>
                </div>
                <ArrowRight className="w-4 h-4 shrink-0" style={{ color: TEXT_MUTED }} />
                <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl" style={{ background: GRADIENT }}>
                  <img src={bossifyLogo} alt="" className="w-4 h-4 rounded" />
                  <span className="text-[12px] font-bold text-white">Bossify</span>
                </div>
                <ArrowRight className="w-4 h-4 shrink-0" style={{ color: TEXT_MUTED }} />
                <div className="flex flex-col gap-1.5">
                  {c.tiktokOutcomes.map((o) => (
                    <span key={o} className="text-[11.5px] font-medium" style={{ color: TEXT }}>
                      {o}
                    </span>
                  ))}
                </div>
              </div>
              <span
                className="inline-flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-full"
                style={{ color: "#D4A017", background: "rgba(212,160,23,0.12)" }}
              >
                {c.tiktokComingSoon}
              </span>
            </div>
          </Reveal>
          <Reveal delay={150}>
            <div className="rounded-2xl border p-7" style={{ background: CARD, borderColor: BORDER }}>
              <h3 className="text-[15px] font-bold mb-3" style={{ color: TEXT }}>{c.reportsGridTitle}</h3>
              <div className="flex flex-col">
                {c.reports.map((name, i) => (
                  <div
                    key={name}
                    className="flex items-center gap-3 py-2.5"
                    style={{ borderTop: i > 0 ? `1px solid ${BORDER}` : "none" }}
                  >
                    <span className="text-[11px] font-bold tabular-nums w-5" style={{ color: TEXT_MUTED, opacity: 0.6 }}>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="text-[13px] font-medium flex-1" style={{ color: TEXT }}>{name}</span>
                    <span
                      className="text-[9.5px] font-bold px-2 py-0.5 rounded-full tracking-wide"
                      style={{ color: GRAD_FROM, background: "rgba(139,92,246,0.12)" }}
                    >
                      PDF
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Spreadsheet vs Bossify */}
      <section className="px-5 lg:px-8 py-20 lg:py-28">
        <div className="max-w-5xl mx-auto">
          <Reveal>
            <div className="text-center max-w-xl mx-auto mb-14">
              <h2 className="text-[26px] lg:text-[32px] font-bold tracking-tight mb-3" style={{ color: TEXT, fontFamily: "Space Grotesk, system-ui, sans-serif" }}>
                {c.compareTitle}
              </h2>
              <p className="text-[14.5px]" style={{ color: TEXT_MUTED }}>{c.compareSub}</p>
            </div>
          </Reveal>
          <div className="grid md:grid-cols-2 gap-6 md:gap-0 items-center">
            <Reveal>
              <div className="rounded-2xl p-7 md:mr-[-12px] border" style={{ background: CARD, borderColor: BORDER }}>
                <p className="text-[12.5px] font-bold uppercase tracking-wide mb-5" style={{ color: TEXT_MUTED }}>{c.compareSpreadsheetLabel}</p>
                <ul className="space-y-3.5">
                  {c.compareSpreadsheetItems.map((item) => (
                    <li key={item} className="flex items-start gap-2.5 text-[13px]" style={{ color: TEXT_MUTED }}>
                      <Minus className="w-4 h-4 mt-0.5 shrink-0" style={{ color: TEXT_MUTED }} />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
            <Reveal delay={120}>
              <div
                className="relative rounded-2xl p-7 md:scale-[1.04] border"
                style={{ background: CARD_SOFT, borderColor: BORDER_STRONG, boxShadow: "0 30px 70px -20px rgba(139,92,246,0.3)" }}
              >
                <div className="absolute top-0 left-0 right-0 h-1.5 rounded-t-2xl" style={{ background: GRADIENT }} />
                <p
                  className="text-[12.5px] font-bold uppercase tracking-wide mb-5"
                  style={{ background: GRADIENT, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}
                >
                  {c.compareBossifyLabel}
                </p>
                <ul className="space-y-3.5">
                  {c.compareBossifyItems.map((item) => (
                    <li key={item} className="flex items-start gap-2.5 text-[13px] font-medium" style={{ color: TEXT }}>
                      <Check className="w-4 h-4 mt-0.5 shrink-0" style={{ color: GRAD_FROM }} />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* Trust */}
      <section className="px-5 lg:px-8 py-16 lg:py-20" style={{ background: SECTION_TINT }}>
        <Reveal>
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-[19px] lg:text-[22px] font-bold tracking-tight mb-10" style={{ color: TEXT, fontFamily: "Space Grotesk, system-ui, sans-serif" }}>
              {c.trustSectionTitle}
            </h2>
            <div className="grid sm:grid-cols-3 gap-8 sm:divide-x" style={{ borderColor: BORDER }}>
              {c.trustItems.map((t) => (
                <div key={t} className="flex flex-col items-center gap-2 sm:px-6">
                  <span className="w-5 h-px" style={{ background: GRAD_FROM }} />
                  <p className="text-[13px] font-medium max-w-[220px]" style={{ color: TEXT_MUTED }}>{t}</p>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </section>

      {/* Final CTA */}
      <section id="pricing" className="relative overflow-hidden px-5 lg:px-8 pt-24 pb-32 lg:pt-28 lg:pb-40">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{ background: "radial-gradient(ellipse 800px 380px at 50% 20%, rgba(139,92,246,0.22) 0%, transparent 70%)" }}
        />
        <svg aria-hidden="true" className="pointer-events-none absolute bottom-0 left-0 w-full h-[220px]" viewBox="0 0 1200 220" preserveAspectRatio="none">
          <defs>
            <linearGradient id="bf-ridge-1" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={GRAD_FROM} stopOpacity="0.28" />
              <stop offset="100%" stopColor={GRAD_FROM} stopOpacity="0" />
            </linearGradient>
            <linearGradient id="bf-ridge-2" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={GRAD_TO} stopOpacity="0.22" />
              <stop offset="100%" stopColor={GRAD_TO} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d="M0,160 C250,90 420,190 650,120 C850,60 1000,150 1200,100 L1200,220 L0,220 Z" fill="url(#bf-ridge-1)" />
          <path d="M0,200 C300,150 500,210 750,160 C950,120 1050,190 1200,150 L1200,220 L0,220 Z" fill="url(#bf-ridge-2)" />
        </svg>
        <Reveal>
          <div className="relative max-w-2xl mx-auto text-center">
            <h2 className="text-[32px] lg:text-[44px] font-bold tracking-tight leading-[1.1] mb-4" style={{ color: TEXT, fontFamily: "Space Grotesk, system-ui, sans-serif" }}>
              {c.finalTitle1}
              <br />
              <span className="bf-gradient-live" style={{ background: GRADIENT, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>{c.finalTitle2}</span>
            </h2>
            <p className="text-[14.5px] lg:text-[15.5px] mb-9" style={{ color: TEXT_MUTED }}>{c.finalSub}</p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button onClick={() => goAuth("register")} className="group text-[15px] font-semibold px-7 py-3.5 rounded-full text-white flex items-center gap-2 transition-all hover:-translate-y-0.5 hover:shadow-[0_12px_30px_-8px_rgba(139,92,246,0.6)]" style={{ background: GRADIENT }}>
                {c.finalCtaPrimary}
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
              </button>
              <button type="button" onClick={() => setDemoOpen(true)} className="text-[15px] font-semibold px-7 py-3.5 rounded-full border flex items-center gap-2 transition-all hover:-translate-y-0.5 hover:border-[rgba(168,124,255,0.5)]" style={{ color: TEXT, borderColor: BORDER }}>
                <Play className="w-4 h-4" fill={TEXT} style={{ color: TEXT }} />
                {c.finalCtaSecondary}
              </button>
            </div>
          </div>
        </Reveal>
      </section>

      {/* Footer */}
      <footer className="px-5 lg:px-8 py-10 border-t" style={{ borderColor: BORDER }}>
        <div className="max-w-6xl mx-auto space-y-5">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <img src={bossifyLogo} alt="Bossify" className="h-6 w-6 rounded object-cover" />
              <span className="text-sm font-bold" style={{ color: TEXT }}>Bossify</span>
              <span className="text-[13px]" style={{ color: TEXT_MUTED }}>· {c.footerTag}</span>
            </div>
            <nav className="flex items-center gap-4 text-[12.5px]" style={{ color: TEXT_MUTED }}>
              <a href="mailto:zhstudioapp@gmail.com" className="hover:underline">
                {lang === "zh" ? "联系我们" : lang === "ms" ? "Hubungi Kami" : "Contact"}
              </a>
              <Link to="/privacy-policy" className="hover:underline">{t("privacy_policy")}</Link>
              <Link to="/terms" className="hover:underline">{t("terms_conditions")}</Link>
            </nav>
          </div>
          <div className="pt-4 border-t text-center sm:text-left" style={{ borderColor: BORDER }}>
            <p className="text-[12.5px]" style={{ color: TEXT_MUTED }}>
              {lang === "zh"
                ? `由 ZH Studio 打造 · © ${new Date().getFullYear()}`
                : lang === "ms"
                  ? `Dikuasakan oleh ZH Studio · © ${new Date().getFullYear()}`
                  : `Powered by ZH Studio · © ${new Date().getFullYear()}`}
            </p>
          </div>
        </div>
      </footer>
      </div>
      <DemoVideoModal open={demoOpen} onClose={() => setDemoOpen(false)} copy={c} />
    </div>
  );
}
