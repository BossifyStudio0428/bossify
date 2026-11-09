import { useState, useRef, useEffect, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Menu,
  X,
  ArrowRight,
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
  Maximize2,
  LayoutDashboard,
  ShoppingBag,
} from "lucide-react";
import { useI18n } from "@/contexts/I18nContext";
import bossifyLogo from "@/assets/bossify-logo.png";

// ---------------------------------------------------------------------------
// Design tokens — Bossify's own light brand palette. No dark cinematic theme:
// this is a premium, mostly-white SaaS page (Stripe/Linear/Vercel-adjacent),
// with purple as the single confident accent and one near-black section for
// contrast (the "sales vs. profit" moment and the closing CTA).
// ---------------------------------------------------------------------------
const PRIMARY = "#3B1E6D";
const PRIMARY_LIGHT = "#6C4AB6";
const ACCENT = "#FF3B5C";
const GOLD = "#D4A017";
const INK = "#1E1730";
const INK_SOFT = "#5B5270";
const SURFACE = "#F7F5FA";
const LINE = "#E1DCEC";
const NEARBLACK = "#0B0712";
const NEARBLACK_SOFT = "#1A1430";

type ShowcaseItem = { eyebrow: string; title: string; desc: string };
type FlowStep = { num: string; title: string; desc: string };
type CostLine = { label: string; value: string };

type LandingCopy = {
  navFeatures: string;
  navHowItWorks: string;
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

  demoBadge: string;
  demoTitle: string;
  demoSub: string;

  problemEyebrow: string;
  problemTitle: string;
  problemSalesLabel: string;
  problemSalesValue: string;
  problemCostLines: CostLine[];
  problemProfitLabel: string;
  problemProfitValue: string;

  showcaseProfit: ShowcaseItem;
  showcaseInventory: ShowcaseItem;
  showcaseOrders: ShowcaseItem;
  showcaseReports: ShowcaseItem;
  reports: string[];

  tiktokEyebrow: string;
  tiktokTitle: string;
  tiktokSub: string;
  tiktokComingSoon: string;
  tiktokDestinations: string[];

  stepsTitle: string;
  stepsSub: string;
  steps: FlowStep[];

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
    navHowItWorks: "How it works",
    navReports: "Reports",
    navPricing: "Pricing",
    signIn: "Sign In",
    startFree: "Start Free",

    eyebrow: "BUILT FOR TIKTOK SHOP SELLERS",
    headline1: "Know what you",
    headlineEmphasis: "actually keep.",
    subhead:
      "Track real profit, inventory, orders and business performance — without complicated accounting.",
    ctaPrimary: "Start Free",
    ctaSecondary: "Watch 2-min Demo",
    trustBullets: ["No credit card required", "Set up in minutes", "Built for small sellers"],

    demoBadge: "PRODUCT DEMO",
    demoTitle: "See your business clearly.",
    demoSub: "From every order to your actual profit.",

    problemEyebrow: "THE PROBLEM",
    problemTitle: "Sales don't tell the whole story.",
    problemSalesLabel: "Sales",
    problemSalesValue: "RM10,000",
    problemCostLines: [
      { label: "Product Cost", value: "−RM5,000" },
      { label: "Platform Fees", value: "−RM800" },
      { label: "Shipping", value: "−RM600" },
      { label: "Packaging", value: "−RM300" },
      { label: "Other Expenses", value: "−RM450" },
    ],
    problemProfitLabel: "Actual Profit",
    problemProfitValue: "RM2,850",

    showcaseProfit: {
      eyebrow: "REAL PROFIT",
      title: "See what you actually keep.",
      desc: "Know your profit after product costs, platform fees and other business expenses — not just what TikTok Shop shows you.",
    },
    showcaseInventory: {
      eyebrow: "INVENTORY",
      title: "Know what needs attention.",
      desc: "Get alerted on low stock and loss-making products before they hurt your business — no more guessing what to restock.",
    },
    showcaseOrders: {
      eyebrow: "ORDERS",
      title: "Enter orders in seconds.",
      desc: "Add orders fast and confirm them with your customer over WhatsApp in one tap — no switching between apps.",
    },
    showcaseReports: {
      eyebrow: "REPORTS",
      title: "7 reports, always ready.",
      desc: "Export real business documents whenever you need them — ready to send, file, or hand to your accountant.",
    },
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
    tiktokTitle: "Bring your TikTok Shop data into one place.",
    tiktokSub: "Connect your shop and let Bossify organize your orders, products and profit automatically.",
    tiktokComingSoon: "Automatic order sync — coming soon",
    tiktokDestinations: ["Orders", "Products", "Inventory", "Profit", "Reports"],

    stepsTitle: "From order to real profit.",
    stepsSub: "Three steps. No accounting background needed.",
    steps: [
      { num: "01", title: "Add your orders", desc: "Enter orders manually in seconds, or sync automatically once TikTok Shop sync is live." },
      { num: "02", title: "Bossify calculates the numbers", desc: "Product cost, platform fees and expenses are deducted automatically — no spreadsheet formulas." },
      { num: "03", title: "See your real profit", desc: "Track performance, get alerts, and export reports whenever you need them." },
    ],

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
    finalSub: "See what your business actually keeps with Bossify.",
    finalCtaPrimary: "Start Free",
    finalCtaSecondary: "Watch Demo",

    footerTag: "Manage your shop like a boss",
  },
  zh: {
    navFeatures: "功能",
    navHowItWorks: "使用流程",
    navReports: "报表",
    navPricing: "价格",
    signIn: "登录",
    startFree: "免费开始",

    eyebrow: "专为 TIKTOK SHOP 卖家打造",
    headline1: "知道你",
    headlineEmphasis: "真正赚了多少。",
    subhead: "追踪真实利润、库存、订单和业绩表现——不需要会计知识。",
    ctaPrimary: "免费开始",
    ctaSecondary: "观看 2 分钟演示",
    trustBullets: ["无需信用卡", "几分钟即可上手", "专为小卖家设计"],

    demoBadge: "产品演示",
    demoTitle: "让你的生意一目了然。",
    demoSub: "从每一笔订单,到你真正赚到的利润。",

    problemEyebrow: "问题所在",
    problemTitle: "销售额不代表真相。",
    problemSalesLabel: "销售额",
    problemSalesValue: "RM10,000",
    problemCostLines: [
      { label: "产品成本", value: "−RM5,000" },
      { label: "平台费用", value: "−RM800" },
      { label: "运费", value: "−RM600" },
      { label: "包装费", value: "−RM300" },
      { label: "其他支出", value: "−RM450" },
    ],
    problemProfitLabel: "实际利润",
    problemProfitValue: "RM2,850",

    showcaseProfit: {
      eyebrow: "真实利润",
      title: "看清你真正赚到的钱。",
      desc: "扣除产品成本、平台费用和其他支出后的真实利润——不只是 TikTok Shop 显示的数字。",
    },
    showcaseInventory: {
      eyebrow: "库存管理",
      title: "知道哪里需要注意。",
      desc: "在库存不足或亏本商品影响生意之前就收到提醒——不用再靠猜测补货。",
    },
    showcaseOrders: {
      eyebrow: "订单管理",
      title: "几秒钟完成订单输入。",
      desc: "快速添加订单,一键通过 WhatsApp 跟客户确认订单——不用在不同 App 之间切换。",
    },
    showcaseReports: {
      eyebrow: "报表",
      title: "7 份报表,随时可用。",
      desc: "随时导出真实的商业文件——方便发送、存档,或交给你的会计。",
    },
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
    tiktokTitle: "把你的 TikTok Shop 数据整合到一个地方。",
    tiktokSub: "连接你的商店,让 Bossify 自动整理订单、产品和利润。",
    tiktokComingSoon: "自动订单同步——即将推出",
    tiktokDestinations: ["订单", "产品", "库存", "利润", "报表"],

    stepsTitle: "从订单到真实利润。",
    stepsSub: "三个步骤,不需要会计背景。",
    steps: [
      { num: "01", title: "添加你的订单", desc: "几秒钟手动输入订单,TikTok Shop 同步上线后也可以自动同步。" },
      { num: "02", title: "Bossify 自动计算数字", desc: "自动扣除产品成本、平台费用和支出——不用再写电子表格公式。" },
      { num: "03", title: "查看你的真实利润", desc: "追踪业绩、接收提醒,随时导出报表。" },
    ],

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
    finalCtaSecondary: "观看演示",

    footerTag: "像老板一样管理你的生意",
  },
  ms: {
    navFeatures: "Ciri-ciri",
    navHowItWorks: "Cara ia berfungsi",
    navReports: "Laporan",
    navPricing: "Harga",
    signIn: "Log Masuk",
    startFree: "Mula Percuma",

    eyebrow: "DIBINA UNTUK PENJUAL TIKTOK SHOP",
    headline1: "Ketahui apa yang",
    headlineEmphasis: "anda benar-benar untung.",
    subhead: "Jejak keuntungan sebenar, inventori, pesanan dan prestasi perniagaan — tanpa perakaunan yang rumit.",
    ctaPrimary: "Mula Percuma",
    ctaSecondary: "Tonton Demo 2 Minit",
    trustBullets: ["Tidak perlu kad kredit", "Sedia dalam beberapa minit", "Dibina untuk penjual kecil"],

    demoBadge: "DEMO PRODUK",
    demoTitle: "Lihat perniagaan anda dengan jelas.",
    demoSub: "Dari setiap pesanan, kepada keuntungan sebenar anda.",

    problemEyebrow: "MASALAHNYA",
    problemTitle: "Jualan tidak menunjukkan keseluruhan cerita.",
    problemSalesLabel: "Jualan",
    problemSalesValue: "RM10,000",
    problemCostLines: [
      { label: "Kos Produk", value: "−RM5,000" },
      { label: "Yuran Platform", value: "−RM800" },
      { label: "Penghantaran", value: "−RM600" },
      { label: "Pembungkusan", value: "−RM300" },
      { label: "Perbelanjaan Lain", value: "−RM450" },
    ],
    problemProfitLabel: "Keuntungan Sebenar",
    problemProfitValue: "RM2,850",

    showcaseProfit: {
      eyebrow: "KEUNTUNGAN SEBENAR",
      title: "Lihat apa yang anda benar-benar untung.",
      desc: "Ketahui keuntungan selepas kos produk, yuran platform dan perbelanjaan lain — bukan sekadar apa yang ditunjukkan TikTok Shop.",
    },
    showcaseInventory: {
      eyebrow: "INVENTORI",
      title: "Ketahui apa yang perlu diberi perhatian.",
      desc: "Dapat makluman stok rendah dan produk rugi sebelum ia menjejaskan perniagaan anda — tidak perlu meneka lagi.",
    },
    showcaseOrders: {
      eyebrow: "PESANAN",
      title: "Masukkan pesanan dalam beberapa saat.",
      desc: "Tambah pesanan dengan pantas dan sahkan dengan pelanggan melalui WhatsApp sekali tekan.",
    },
    showcaseReports: {
      eyebrow: "LAPORAN",
      title: "7 laporan, sedia bila-bila masa.",
      desc: "Eksport dokumen perniagaan sebenar bila-bila masa — sedia untuk dihantar, difailkan, atau diberikan kepada akauntan anda.",
    },
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
    tiktokTitle: "Bawa data TikTok Shop anda ke satu tempat.",
    tiktokSub: "Sambungkan kedai anda dan biarkan Bossify menyusun pesanan, produk dan keuntungan secara automatik.",
    tiktokComingSoon: "Penyegerakan pesanan automatik — akan datang",
    tiktokDestinations: ["Pesanan", "Produk", "Inventori", "Keuntungan", "Laporan"],

    stepsTitle: "Dari pesanan kepada keuntungan sebenar.",
    stepsSub: "Tiga langkah. Tidak perlu latar belakang perakaunan.",
    steps: [
      { num: "01", title: "Tambah pesanan anda", desc: "Masukkan pesanan secara manual dalam beberapa saat, atau segerak secara automatik sebaik sahaja penyegerakan TikTok Shop aktif." },
      { num: "02", title: "Bossify mengira nombor", desc: "Kos produk, yuran platform dan perbelanjaan ditolak secara automatik — tanpa formula hamparan." },
      { num: "03", title: "Lihat keuntungan sebenar anda", desc: "Jejak prestasi, terima makluman, dan eksport laporan bila-bila masa." },
    ],

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
    finalSub: "Lihat apa yang perniagaan anda benar-benar untung dengan Bossify.",
    finalCtaPrimary: "Mula Percuma",
    finalCtaSecondary: "Tonton Demo",

    footerTag: "Uruskan kedai anda seperti bos",
  },
};

const REPORT_ICONS = [DollarSign, TrendingUp, Package, FileText, Users, Truck, ClipboardCheck];

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
        el.style.transform = `perspective(1200px) rotateX(${(-py * max).toFixed(2)}deg) rotateY(${(px * max).toFixed(2)}deg)`;
      });
    };
    const onLeave = () => {
      cancelAnimationFrame(frame);
      el.style.transform = "perspective(1200px) rotateX(0deg) rotateY(0deg)";
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
    <div ref={ref} style={{ transition: "transform 0.2s ease-out", willChange: "transform" }}>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Product mockups — hand-built, data-free illustrations of the real Bossify
// UI (sidebar, stat tiles, profit chart, orders list). No stock photos, no
// screenshots pretending to be real data — these are clearly illustrative.
// ---------------------------------------------------------------------------
function DashboardMockup({ idPrefix = "hero" }: { idPrefix?: string }) {
  const points = [22, 30, 26, 38, 34, 46, 40, 52, 48, 60, 56, 68];
  const w = 460;
  const h = 150;
  const step = w / (points.length - 1);
  const max = Math.max(...points);
  const coords = points.map((p, i) => [i * step, h - (p / max) * (h - 24) - 10]);
  const linePath = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${w},${h} L0,${h} Z`;

  const orders = [
    { code: "#A1042", customer: "Aina R.", amount: "RM128.00", status: "Paid" },
    { code: "#A1041", customer: "Faris K.", amount: "RM64.50", status: "Paid" },
    { code: "#A1040", customer: "Mei Ling", amount: "RM212.00", status: "Pending" },
  ];

  const navItems = [
    { Icon: LayoutDashboard, active: true },
    { Icon: ShoppingBag, active: false },
    { Icon: Package, active: false },
    { Icon: FileText, active: false },
    { Icon: Users, active: false },
  ];

  return (
    <div
      className="relative w-full max-w-[680px] rounded-[22px] overflow-hidden border bg-white"
      style={{ borderColor: LINE, boxShadow: "0 50px 100px -24px rgba(59,30,109,0.3), 0 2px 10px rgba(30,23,48,0.06)" }}
    >
      <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: LINE, background: SURFACE }}>
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: LINE }} />
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: LINE }} />
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: LINE }} />
        <span
          className="ml-2 text-[10.5px] font-medium px-2.5 py-1 rounded-full bg-white"
          style={{ color: INK_SOFT, border: `1px solid ${LINE}` }}
        >
          app.bossifyapp.com/dashboard
        </span>
      </div>
      <div className="flex">
        <div className="hidden sm:flex flex-col items-center gap-1.5 px-3 py-4 border-r" style={{ borderColor: LINE }}>
          {navItems.map(({ Icon, active }, i) => (
            <div
              key={i}
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: active ? PRIMARY : "transparent" }}
            >
              <Icon className="w-4 h-4" style={{ color: active ? "#FFFFFF" : INK_SOFT }} />
            </div>
          ))}
        </div>
        <div className="flex-1 p-5">
          <div className="grid grid-cols-3 gap-3 mb-5">
            <div className="rounded-xl p-3" style={{ background: SURFACE }}>
              <p className="text-[10px] font-semibold" style={{ color: INK_SOFT }}>NET PROFIT</p>
              <p className="text-[18px] font-bold" style={{ color: INK }}>RM4,218</p>
              <p className="text-[10.5px] font-semibold flex items-center gap-0.5" style={{ color: "#16A34A" }}>
                <TrendingUp className="w-3 h-3" /> +18%
              </p>
            </div>
            <div className="rounded-xl p-3" style={{ background: SURFACE }}>
              <p className="text-[10px] font-semibold" style={{ color: INK_SOFT }}>SALES</p>
              <p className="text-[18px] font-bold" style={{ color: INK }}>RM12,480</p>
              <p className="text-[10.5px]" style={{ color: INK_SOFT }}>128 orders</p>
            </div>
            <div className="rounded-xl p-3" style={{ background: "rgba(255,59,92,0.07)" }}>
              <p className="text-[10px] font-semibold" style={{ color: ACCENT }}>LOW STOCK</p>
              <p className="text-[18px] font-bold" style={{ color: INK }}>3 items</p>
              <p className="text-[10.5px]" style={{ color: ACCENT }}>needs attention</p>
            </div>
          </div>
          <div className="mb-5">
            <p className="text-[11px] font-semibold mb-2" style={{ color: INK_SOFT }}>NET PROFIT — LAST 30 DAYS</p>
            <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-[90px]" preserveAspectRatio="none">
              <defs>
                <linearGradient id={`bf-area-${idPrefix}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={PRIMARY_LIGHT} stopOpacity="0.22" />
                  <stop offset="100%" stopColor={PRIMARY_LIGHT} stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={areaPath} fill={`url(#bf-area-${idPrefix})`} />
              <path d={linePath} fill="none" stroke={PRIMARY} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx={coords[coords.length - 1][0]} cy={coords[coords.length - 1][1]} r="4" fill={PRIMARY} />
            </svg>
          </div>
          <div>
            <p className="text-[11px] font-semibold mb-2" style={{ color: INK_SOFT }}>RECENT ORDERS</p>
            <div className="rounded-xl border overflow-hidden" style={{ borderColor: LINE }}>
              {orders.map((o, i) => (
                <div
                  key={o.code}
                  className="flex items-center justify-between px-3 py-2.5"
                  style={{ borderTop: i === 0 ? "none" : `1px solid ${LINE}` }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[11px] font-mono font-semibold shrink-0" style={{ color: INK_SOFT }}>{o.code}</span>
                    <span className="text-[12px] truncate" style={{ color: INK }}>{o.customer}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[12px] font-semibold" style={{ color: INK }}>{o.amount}</span>
                    <span
                      className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                      style={{
                        color: o.status === "Paid" ? "#16A34A" : "#B45309",
                        background: o.status === "Paid" ? "rgba(22,163,74,0.1)" : "rgba(180,83,9,0.1)",
                      }}
                    >
                      {o.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DemoPlayer() {
  return (
    <div
      className="relative mx-auto max-w-4xl rounded-2xl overflow-hidden border"
      style={{ borderColor: LINE, boxShadow: "0 60px 110px -30px rgba(11,7,18,0.35)" }}
    >
      <div className="relative aspect-video overflow-hidden flex items-center justify-center" style={{ background: SURFACE }}>
        <div className="absolute inset-0 flex items-center justify-center scale-[1.5]">
          <DashboardMockup idPrefix="demo" />
        </div>
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{ background: "linear-gradient(180deg, rgba(11,7,18,0.1) 0%, rgba(11,7,18,0.38) 100%)" }}
        />
        <button type="button" aria-label="Watch demo" className="absolute inset-0 flex items-center justify-center group">
          <span className="w-16 h-16 lg:w-20 lg:h-20 rounded-full bg-white flex items-center justify-center shadow-lg transition-transform group-hover:scale-105">
            <Play className="w-6 h-6 lg:w-7 lg:h-7 ml-0.5" style={{ color: PRIMARY }} fill={PRIMARY} />
          </span>
        </button>
        <button type="button" aria-label="Fullscreen" className="absolute top-4 right-4 w-8 h-8 rounded-lg bg-black/30 flex items-center justify-center">
          <Maximize2 className="w-4 h-4 text-white" />
        </button>
        <div className="absolute left-5 right-5 bottom-4">
          <div className="h-1 rounded-full bg-white/30 overflow-hidden">
            <div className="h-full w-[28%] rounded-full bg-white" />
          </div>
        </div>
      </div>
    </div>
  );
}

function ProfitPanel() {
  const points = [20, 34, 28, 46, 38, 56, 50, 64, 58, 72];
  const w = 380;
  const h = 140;
  const step = w / (points.length - 1);
  const max = Math.max(...points);
  const coords = points.map((p, i) => [i * step, h - (p / max) * (h - 20) - 8]);
  const linePath = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${w},${h} L0,${h} Z`;

  return (
    <div
      className="w-full max-w-[420px] rounded-[20px] border bg-white p-6"
      style={{ borderColor: LINE, boxShadow: "0 30px 70px -20px rgba(59,30,109,0.22)" }}
    >
      <p className="text-[11px] font-semibold mb-1" style={{ color: INK_SOFT }}>NET PROFIT</p>
      <div className="flex items-end gap-3 mb-5">
        <p className="text-[32px] font-bold leading-none" style={{ color: INK, fontFamily: "Space Grotesk, system-ui, sans-serif" }}>RM4,218.50</p>
        <span className="text-[12px] font-bold flex items-center gap-0.5 mb-1" style={{ color: "#16A34A" }}>
          <TrendingUp className="w-3.5 h-3.5" />
          +18%
        </span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-[100px]" preserveAspectRatio="none">
        <defs>
          <linearGradient id="bf-profit-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={PRIMARY_LIGHT} stopOpacity="0.25" />
            <stop offset="100%" stopColor={PRIMARY_LIGHT} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#bf-profit-area)" />
        <path d={linePath} fill="none" stroke={PRIMARY} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className="flex items-center justify-between mt-4 pt-4" style={{ borderTop: `1px solid ${LINE}` }}>
        <div>
          <p className="text-[10px] font-semibold" style={{ color: INK_SOFT }}>GROSS SALES</p>
          <p className="text-[14px] font-bold" style={{ color: INK }}>RM12,480</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold" style={{ color: INK_SOFT }}>COSTS &amp; FEES</p>
          <p className="text-[14px] font-bold" style={{ color: ACCENT }}>−RM8,261</p>
        </div>
      </div>
    </div>
  );
}

function InventoryPanel() {
  const items = [
    { name: "Matte Lip Tint — Coral", stock: 2, level: "critical" as const },
    { name: "Phone Case — Clear", stock: 5, level: "low" as const },
    { name: "Bluetooth Earbuds Pro", stock: 0, level: "critical" as const },
  ];
  return (
    <div
      className="relative w-full max-w-[420px] rounded-[20px] overflow-hidden border bg-white"
      style={{ borderColor: LINE, boxShadow: "0 30px 70px -20px rgba(59,30,109,0.22)" }}
    >
      <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: LINE }}>
        <p className="text-[13px] font-bold" style={{ color: INK }}>Low Stock Alerts</p>
        <span className="text-[10px] font-bold px-2 py-1 rounded-full" style={{ color: ACCENT, background: "rgba(255,59,92,0.1)" }}>
          3 need attention
        </span>
      </div>
      <div>
        {items.map((it, i) => (
          <div key={it.name} className="flex items-center justify-between px-5 py-3.5" style={{ borderTop: i === 0 ? "none" : `1px solid ${LINE}` }}>
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: it.level === "critical" ? "rgba(255,59,92,0.1)" : "rgba(212,160,23,0.12)" }}
              >
                <PackageX className="w-4 h-4" style={{ color: it.level === "critical" ? ACCENT : GOLD }} />
              </div>
              <span className="text-[12.5px] font-medium truncate" style={{ color: INK }}>{it.name}</span>
            </div>
            <span className="text-[11px] font-bold shrink-0" style={{ color: it.level === "critical" ? ACCENT : GOLD }}>
              {it.stock === 0 ? "Out of stock" : `${it.stock} left`}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function OrdersPanel() {
  const rows: { code: string; customer: string; product: string; status: "confirmed" | "paid" | "pending" }[] = [
    { code: "#A1042", customer: "Aina R.", product: "Matte Lip Tint", status: "confirmed" },
    { code: "#A1041", customer: "Faris K.", product: "Phone Case", status: "paid" },
    { code: "#A1040", customer: "Mei Ling", product: "Earbuds Pro", status: "pending" },
  ];
  const statusStyle: Record<string, { bg: string; fg: string; label: string }> = {
    confirmed: { bg: "rgba(59,30,109,0.08)", fg: PRIMARY, label: "Confirmed" },
    paid: { bg: "rgba(22,163,74,0.1)", fg: "#16A34A", label: "Paid" },
    pending: { bg: "rgba(180,83,9,0.1)", fg: "#B45309", label: "Pending" },
  };
  return (
    <div
      className="relative w-full max-w-[420px] rounded-[20px] overflow-hidden border bg-white"
      style={{ borderColor: LINE, boxShadow: "0 30px 70px -20px rgba(59,30,109,0.22)" }}
    >
      <div className="px-5 py-4 border-b" style={{ borderColor: LINE }}>
        <p className="text-[13px] font-bold" style={{ color: INK }}>New Order</p>
      </div>
      {rows.map((r, i) => (
        <div key={r.code} className="px-5 py-3.5 flex items-center justify-between gap-3" style={{ borderTop: i === 0 ? "none" : `1px solid ${LINE}` }}>
          <div className="min-w-0">
            <p className="text-[12.5px] font-semibold truncate" style={{ color: INK }}>{r.customer} · {r.product}</p>
            <p className="text-[11px] font-mono" style={{ color: INK_SOFT }}>{r.code}</p>
          </div>
          <span
            className="text-[10.5px] font-bold px-2.5 py-1 rounded-full shrink-0"
            style={{ color: statusStyle[r.status].fg, background: statusStyle[r.status].bg }}
          >
            {statusStyle[r.status].label}
          </span>
        </div>
      ))}
      <div className="px-5 py-3.5 flex items-center gap-2" style={{ borderTop: `1px solid ${LINE}`, background: SURFACE }}>
        <MessageCircle className="w-4 h-4" style={{ color: "#16A34A" }} />
        <span className="text-[11.5px] font-semibold" style={{ color: INK }}>Confirm via WhatsApp</span>
        <ArrowRight className="w-3.5 h-3.5 ml-auto" style={{ color: INK_SOFT }} />
      </div>
    </div>
  );
}

function ReportsStack({ reports }: { reports: string[] }) {
  const shown = reports.slice(0, 4);
  const rest = reports.slice(4);
  const rotations = [-8, -3, 3, 8];
  const offsets = [20, 6, 6, 20];

  return (
    <div className="relative w-full max-w-[460px] mx-auto">
      <div className="relative h-[230px]">
        {shown.map((name, i) => {
          const Icon = REPORT_ICONS[i] ?? FileText;
          return (
            <div
              key={name}
              className="absolute left-1/2 w-[220px] rounded-xl border bg-white px-4 py-3.5"
              style={{
                borderColor: LINE,
                transform: `translateX(-50%) rotate(${rotations[i]}deg)`,
                top: offsets[i],
                boxShadow: "0 20px 40px -15px rgba(59,30,109,0.25)",
                zIndex: i,
              }}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <Icon className="w-3.5 h-3.5" style={{ color: PRIMARY }} />
                <span className="text-[10px] font-bold tracking-wide" style={{ color: PRIMARY }}>PDF</span>
              </div>
              <p className="text-[12.5px] font-bold" style={{ color: INK, fontFamily: "IBM Plex Mono, ui-monospace, monospace" }}>{name}</p>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap justify-center gap-2 mt-3">
        {rest.map((name) => (
          <span key={name} className="text-[11px] font-semibold px-3 py-1.5 rounded-full border" style={{ color: INK_SOFT, borderColor: LINE }}>
            {name}
          </span>
        ))}
      </div>
    </div>
  );
}

function ProblemWaterfall({ c }: { c: LandingCopy }) {
  return (
    <div
      className="relative max-w-md mx-auto rounded-[24px] border overflow-hidden"
      style={{ borderColor: "rgba(255,255,255,0.1)", background: NEARBLACK_SOFT }}
    >
      <div className="px-7 py-8 text-center" style={{ fontFamily: "IBM Plex Mono, ui-monospace, monospace" }}>
        <p className="text-[11px] font-bold tracking-widest mb-2" style={{ color: "rgba(255,255,255,0.5)" }}>
          {c.problemSalesLabel.toUpperCase()}
        </p>
        <p className="text-[40px] font-bold mb-5" style={{ color: "#FFFFFF" }}>{c.problemSalesValue}</p>
        <div>
          {c.problemCostLines.map((line) => (
            <div key={line.label} className="flex items-center justify-between py-2.5" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
              <span className="text-[12.5px]" style={{ color: "rgba(255,255,255,0.65)" }}>{line.label}</span>
              <span className="text-[13px] font-semibold" style={{ color: "#F87171" }}>{line.value}</span>
            </div>
          ))}
        </div>
        <div className="mt-5 pt-5" style={{ borderTop: `2px solid ${ACCENT}` }}>
          <p className="text-[11px] font-bold tracking-widest mb-2" style={{ color: GOLD }}>{c.problemProfitLabel.toUpperCase()}</p>
          <p className="text-[44px] font-bold" style={{ color: GOLD }}>{c.problemProfitValue}</p>
        </div>
      </div>
    </div>
  );
}

function TikTokFlow({ c }: { c: LandingCopy }) {
  return (
    <div className="flex flex-col items-center">
      <div
        className="px-6 py-3 rounded-xl border text-[13px] font-bold"
        style={{ borderColor: LINE, color: INK, background: "#FFFFFF", boxShadow: "0 10px 24px -10px rgba(30,23,48,0.12)" }}
      >
        TikTok Shop
      </div>
      <div className="w-px h-8" style={{ background: LINE }} />
      <div
        className="px-6 py-3 rounded-xl text-[13px] font-bold text-white flex items-center gap-2"
        style={{ background: PRIMARY, boxShadow: "0 16px 32px -12px rgba(59,30,109,0.4)" }}
      >
        <img src={bossifyLogo} alt="" className="w-4 h-4 rounded" />
        Bossify
      </div>
      <span className="mt-2 text-[10.5px] font-bold px-2.5 py-1 rounded-full" style={{ color: GOLD, background: "rgba(212,160,23,0.12)" }}>
        {c.tiktokComingSoon}
      </span>
      <div className="w-px h-8" style={{ background: LINE }} />
      <div className="flex flex-wrap justify-center gap-2.5 max-w-sm">
        {c.tiktokDestinations.map((d) => (
          <span
            key={d}
            className="text-[12px] font-semibold px-3.5 py-2 rounded-full border"
            style={{ color: INK_SOFT, borderColor: LINE, background: SURFACE }}
          >
            {d}
          </span>
        ))}
      </div>
    </div>
  );
}

export function LandingPage() {
  const { lang } = useI18n();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const c = COPY[lang] ?? COPY.en;

  const goAuth = (mode: "login" | "register") => {
    navigate({ to: "/auth", search: mode === "register" ? { mode: "reg" } : undefined } as never);
  };

  return (
    <div style={{ fontFamily: "IBM Plex Sans, system-ui, sans-serif" }}>
      {/* Header */}
      <header className="sticky top-0 z-30 backdrop-blur border-b" style={{ background: "rgba(255,255,255,0.85)", borderColor: LINE }}>
        <div className="max-w-6xl mx-auto px-5 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src={bossifyLogo} alt="Bossify" className="h-8 w-8 rounded-lg object-cover" />
            <span className="text-lg font-bold tracking-tight" style={{ color: INK, fontFamily: "Space Grotesk, system-ui, sans-serif" }}>
              Bossify
            </span>
          </div>
          <nav className="hidden lg:flex items-center gap-8">
            <a href="#features" className="text-sm font-medium" style={{ color: INK_SOFT }}>{c.navFeatures}</a>
            <a href="#how-it-works" className="text-sm font-medium" style={{ color: INK_SOFT }}>{c.navHowItWorks}</a>
            <a href="#reports" className="text-sm font-medium" style={{ color: INK_SOFT }}>{c.navReports}</a>
            <a href="#pricing" className="text-sm font-medium" style={{ color: INK_SOFT }}>{c.navPricing}</a>
          </nav>
          <div className="hidden lg:flex items-center gap-3">
            <button onClick={() => goAuth("login")} className="text-sm font-semibold px-4 py-2 rounded-lg" style={{ color: INK }}>
              {c.signIn}
            </button>
            <button
              onClick={() => goAuth("register")}
              className="text-sm font-semibold px-5 py-2.5 rounded-lg text-white flex items-center gap-1.5"
              style={{ background: PRIMARY }}
            >
              {c.startFree}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
          <button className="lg:hidden p-2 -mr-2" onClick={() => setMenuOpen((v) => !v)} aria-label="Menu" style={{ color: INK }}>
            {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
        {menuOpen && (
          <div className="lg:hidden border-t px-5 py-4 flex flex-col gap-3 bg-white" style={{ borderColor: LINE }}>
            <a href="#features" onClick={() => setMenuOpen(false)} className="text-sm font-medium" style={{ color: INK_SOFT }}>{c.navFeatures}</a>
            <a href="#how-it-works" onClick={() => setMenuOpen(false)} className="text-sm font-medium" style={{ color: INK_SOFT }}>{c.navHowItWorks}</a>
            <a href="#reports" onClick={() => setMenuOpen(false)} className="text-sm font-medium" style={{ color: INK_SOFT }}>{c.navReports}</a>
            <a href="#pricing" onClick={() => setMenuOpen(false)} className="text-sm font-medium" style={{ color: INK_SOFT }}>{c.navPricing}</a>
            <button onClick={() => goAuth("login")} className="text-sm font-semibold px-4 py-2.5 rounded-lg border text-left" style={{ color: INK, borderColor: LINE }}>
              {c.signIn}
            </button>
            <button onClick={() => goAuth("register")} className="text-sm font-semibold px-4 py-2.5 rounded-lg text-white text-left" style={{ background: PRIMARY }}>
              {c.startFree}
            </button>
          </div>
        )}
      </header>

      {/* Hero */}
      <section className="relative px-5 lg:px-8 pt-20 pb-20 lg:pt-28 lg:pb-28 overflow-hidden bg-white">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{ background: "radial-gradient(ellipse 700px 380px at 50% -5%, rgba(108,74,182,0.08) 0%, transparent 65%)" }}
        />
        <Reveal mode="mount">
        <div className="relative max-w-3xl mx-auto text-center">
          <p className="text-[12px] font-bold tracking-wider mb-5" style={{ color: PRIMARY_LIGHT }}>{c.eyebrow}</p>
          <h1 className="text-[38px] leading-[1.08] lg:text-[60px] font-bold tracking-tight mb-6" style={{ color: INK, fontFamily: "Space Grotesk, system-ui, sans-serif" }}>
            {c.headline1}
            <br />
            <span style={{ color: ACCENT }}>{c.headlineEmphasis}</span>
          </h1>
          <p className="text-[15px] lg:text-[18px] leading-relaxed mb-9 max-w-xl mx-auto" style={{ color: INK_SOFT }}>{c.subhead}</p>
          <div className="flex flex-wrap items-center justify-center gap-3 mb-6">
            <button
              onClick={() => goAuth("register")}
              className="text-[15px] font-semibold px-7 py-3.5 rounded-xl text-white flex items-center gap-2"
              style={{ background: PRIMARY }}
            >
              {c.ctaPrimary}
              <ArrowRight className="w-4 h-4" />
            </button>
            <a href="#demo" className="text-[15px] font-semibold px-7 py-3.5 rounded-xl border flex items-center gap-2" style={{ color: INK, borderColor: LINE }}>
              <Play className="w-3.5 h-3.5" style={{ color: INK }} fill={INK} />
              {c.ctaSecondary}
            </a>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5">
            {c.trustBullets.map((t) => (
              <span key={t} className="inline-flex items-center gap-1.5 text-[12.5px] font-medium" style={{ color: INK_SOFT }}>
                <Check className="w-3.5 h-3.5" style={{ color: PRIMARY_LIGHT }} />
                {t}
              </span>
            ))}
          </div>
        </div>
        </Reveal>
        <Reveal mode="mount" delay={150}>
        <div className="relative mt-16 lg:mt-20">
          <div className="flex justify-center">
            <TiltWrap max={5}>
              <DashboardMockup />
            </TiltWrap>
          </div>
          <div className="flex justify-center mt-[-28px] relative z-10">
            <a
              href="#demo"
              className="flex items-center gap-3 pl-2 pr-5 py-2 rounded-full bg-white border shadow-lg hover:scale-[1.03] transition-transform"
              style={{ borderColor: LINE }}
            >
              <span className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: PRIMARY }}>
                <Play className="w-3.5 h-3.5 ml-0.5" fill="#FFFFFF" style={{ color: "#FFFFFF" }} />
              </span>
              <span className="text-[13px] font-bold" style={{ color: INK }}>{c.ctaSecondary}</span>
            </a>
          </div>
        </div>
        </Reveal>
      </section>

      {/* Product demo */}
      <section id="demo" className="px-5 lg:px-8 py-20 lg:py-28" style={{ background: SURFACE }}>
        <Reveal>
        <div className="max-w-3xl mx-auto text-center mb-10">
          <span className="inline-block text-[11px] font-bold tracking-wider px-2.5 py-1 rounded-full mb-4" style={{ color: PRIMARY, background: "rgba(59,30,109,0.08)" }}>
            {c.demoBadge}
          </span>
          <h2 className="text-[28px] lg:text-[38px] font-bold tracking-tight mb-3" style={{ color: INK, fontFamily: "Space Grotesk, system-ui, sans-serif" }}>
            {c.demoTitle}
          </h2>
          <p className="text-[15px]" style={{ color: INK_SOFT }}>{c.demoSub}</p>
        </div>
        </Reveal>
        {/* TODO(John): once the real demo video is ready, replace DemoPlayer's
            mockup poster with an actual <video> tag or an embed, inside the
            same rounded, bordered frame. */}
        <Reveal delay={120}>
          <DemoPlayer />
        </Reveal>
      </section>

      {/* Problem: sales vs profit */}
      <section className="px-5 lg:px-8 py-20 lg:py-28 bg-white">
        <div className="max-w-5xl mx-auto grid lg:grid-cols-2 gap-12 items-center">
          <Reveal>
          <div>
            <p className="text-[12px] font-bold tracking-wider mb-4" style={{ color: ACCENT }}>{c.problemEyebrow}</p>
            <h2 className="text-[28px] lg:text-[38px] font-bold tracking-tight leading-tight" style={{ color: INK, fontFamily: "Space Grotesk, system-ui, sans-serif" }}>
              {c.problemTitle}
            </h2>
          </div>
          </Reveal>
          <Reveal delay={150}>
            <TiltWrap max={4}>
              <ProblemWaterfall c={c} />
            </TiltWrap>
          </Reveal>
        </div>
      </section>

      {/* Showcase A: Real profit */}
      <section id="features" className="px-5 lg:px-8 py-20 lg:py-28 bg-white">
        <div className="max-w-5xl mx-auto grid lg:grid-cols-2 gap-14 items-center">
          <Reveal>
          <div className="order-2 lg:order-1 flex justify-center">
            <TiltWrap max={5}>
              <ProfitPanel />
            </TiltWrap>
          </div>
          </Reveal>
          <Reveal>
          <div className="order-1 lg:order-2">
            <p className="text-[12px] font-bold tracking-wider mb-4" style={{ color: PRIMARY_LIGHT }}>{c.showcaseProfit.eyebrow}</p>
            <h2 className="text-[26px] lg:text-[34px] font-bold tracking-tight mb-4 leading-tight" style={{ color: INK, fontFamily: "Space Grotesk, system-ui, sans-serif" }}>
              {c.showcaseProfit.title}
            </h2>
            <p className="text-[15px] leading-relaxed" style={{ color: INK_SOFT }}>{c.showcaseProfit.desc}</p>
          </div>
          </Reveal>
        </div>
      </section>

      {/* Showcase B: Inventory */}
      <section className="px-5 lg:px-8 py-20 lg:py-28" style={{ background: SURFACE }}>
        <div className="max-w-5xl mx-auto grid lg:grid-cols-2 gap-14 items-center">
          <Reveal>
          <div>
            <p className="text-[12px] font-bold tracking-wider mb-4" style={{ color: PRIMARY_LIGHT }}>{c.showcaseInventory.eyebrow}</p>
            <h2 className="text-[26px] lg:text-[34px] font-bold tracking-tight mb-4 leading-tight" style={{ color: INK, fontFamily: "Space Grotesk, system-ui, sans-serif" }}>
              {c.showcaseInventory.title}
            </h2>
            <p className="text-[15px] leading-relaxed" style={{ color: INK_SOFT }}>{c.showcaseInventory.desc}</p>
          </div>
          </Reveal>
          <div className="flex justify-center">
            <Reveal>
              <TiltWrap max={5}>
                <InventoryPanel />
              </TiltWrap>
            </Reveal>
          </div>
        </div>
      </section>

      {/* Showcase C: Orders */}
      <section className="px-5 lg:px-8 py-20 lg:py-28 bg-white">
        <div className="max-w-5xl mx-auto grid lg:grid-cols-2 gap-14 items-center">
          <Reveal>
          <div className="order-2 lg:order-1 flex justify-center">
            <TiltWrap max={5}>
              <OrdersPanel />
            </TiltWrap>
          </div>
          </Reveal>
          <Reveal>
          <div className="order-1 lg:order-2">
            <p className="text-[12px] font-bold tracking-wider mb-4" style={{ color: PRIMARY_LIGHT }}>{c.showcaseOrders.eyebrow}</p>
            <h2 className="text-[26px] lg:text-[34px] font-bold tracking-tight mb-4 leading-tight" style={{ color: INK, fontFamily: "Space Grotesk, system-ui, sans-serif" }}>
              {c.showcaseOrders.title}
            </h2>
            <p className="text-[15px] leading-relaxed" style={{ color: INK_SOFT }}>{c.showcaseOrders.desc}</p>
          </div>
          </Reveal>
        </div>
      </section>

      {/* Showcase D: Reports */}
      <section id="reports" className="px-5 lg:px-8 py-20 lg:py-28" style={{ background: SURFACE }}>
        <div className="max-w-5xl mx-auto grid lg:grid-cols-2 gap-14 items-center">
          <Reveal>
          <div>
            <p className="text-[12px] font-bold tracking-wider mb-4" style={{ color: PRIMARY_LIGHT }}>{c.showcaseReports.eyebrow}</p>
            <h2 className="text-[26px] lg:text-[34px] font-bold tracking-tight mb-4 leading-tight" style={{ color: INK, fontFamily: "Space Grotesk, system-ui, sans-serif" }}>
              {c.showcaseReports.title}
            </h2>
            <p className="text-[15px] leading-relaxed" style={{ color: INK_SOFT }}>{c.showcaseReports.desc}</p>
          </div>
          </Reveal>
          <Reveal delay={100}>
            <ReportsStack reports={c.reports} />
          </Reveal>
        </div>
      </section>

      {/* TikTok Shop integration */}
      <section className="px-5 lg:px-8 py-20 lg:py-28 bg-white">
        <Reveal>
        <div className="max-w-3xl mx-auto text-center mb-14">
          <p className="text-[12px] font-bold tracking-wider mb-4" style={{ color: PRIMARY_LIGHT }}>{c.tiktokEyebrow}</p>
          <h2 className="text-[26px] lg:text-[34px] font-bold tracking-tight mb-3" style={{ color: INK, fontFamily: "Space Grotesk, system-ui, sans-serif" }}>
            {c.tiktokTitle}
          </h2>
          <p className="text-[15px]" style={{ color: INK_SOFT }}>{c.tiktokSub}</p>
        </div>
        </Reveal>
        <Reveal delay={150}>
          <TikTokFlow c={c} />
        </Reveal>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="px-5 lg:px-8 py-20 lg:py-28" style={{ background: SURFACE }}>
        <div className="max-w-5xl mx-auto">
          <div className="text-center max-w-xl mx-auto mb-16">
            <h2 className="text-[26px] lg:text-[34px] font-bold tracking-tight mb-3" style={{ color: INK, fontFamily: "Space Grotesk, system-ui, sans-serif" }}>
              {c.stepsTitle}
            </h2>
            <p className="text-[15px]" style={{ color: INK_SOFT }}>{c.stepsSub}</p>
          </div>
          <div className="relative grid sm:grid-cols-3 gap-10">
            <div aria-hidden="true" className="hidden sm:block absolute top-6 left-[16%] right-[16%] h-px" style={{ background: LINE }} />
            {c.steps.map((s, i) => (
              <Reveal key={s.num} delay={i * 100}>
                <div className="relative text-center sm:text-left">
                  <p
                    className="text-[52px] font-bold leading-none mb-4"
                    style={{
                      color: "transparent",
                      fontFamily: "Space Grotesk, system-ui, sans-serif",
                      WebkitTextStroke: `1.5px ${PRIMARY_LIGHT}`,
                    }}
                  >
                    {s.num}
                  </p>
                  <h3 className="text-[16px] font-bold mb-2" style={{ color: INK }}>{s.title}</h3>
                  <p className="text-[13.5px] leading-relaxed" style={{ color: INK_SOFT }}>{s.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Spreadsheet vs Bossify */}
      <section className="px-5 lg:px-8 py-20 lg:py-28 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center max-w-xl mx-auto mb-14">
            <h2 className="text-[26px] lg:text-[34px] font-bold tracking-tight mb-3" style={{ color: INK, fontFamily: "Space Grotesk, system-ui, sans-serif" }}>
              {c.compareTitle}
            </h2>
            <p className="text-[15px]" style={{ color: INK_SOFT }}>{c.compareSub}</p>
          </div>
          <div className="grid md:grid-cols-2 gap-6 md:gap-0 items-center">
            <Reveal>
            <div className="rounded-2xl p-7 md:mr-[-12px]" style={{ background: SURFACE }}>
              <p className="text-[13px] font-bold uppercase tracking-wide mb-5" style={{ color: INK_SOFT }}>{c.compareSpreadsheetLabel}</p>
              <ul className="space-y-3.5">
                {c.compareSpreadsheetItems.map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-[13.5px]" style={{ color: INK_SOFT }}>
                    <Minus className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "#9A90B5" }} />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            </Reveal>
            <Reveal delay={120}>
            <div
              className="relative rounded-2xl p-7 md:scale-[1.04] bg-white"
              style={{ boxShadow: "0 30px 70px -20px rgba(59,30,109,0.3)", border: `1px solid ${LINE}` }}
            >
              <div className="absolute top-0 left-0 right-0 h-1.5 rounded-t-2xl" style={{ background: PRIMARY }} />
              <p className="text-[13px] font-bold uppercase tracking-wide mb-5" style={{ color: PRIMARY }}>{c.compareBossifyLabel}</p>
              <ul className="space-y-3.5">
                {c.compareBossifyItems.map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-[13.5px] font-medium" style={{ color: INK }}>
                    <Check className="w-4 h-4 mt-0.5 shrink-0" style={{ color: PRIMARY }} />
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
      <section className="px-5 lg:px-8 py-16 lg:py-20" style={{ background: SURFACE }}>
        <Reveal>
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-[20px] lg:text-[24px] font-bold tracking-tight mb-10" style={{ color: INK, fontFamily: "Space Grotesk, system-ui, sans-serif" }}>
            {c.trustSectionTitle}
          </h2>
          <div className="grid sm:grid-cols-3 gap-8">
            {c.trustItems.map((t) => (
              <div key={t} className="flex flex-col items-center gap-3">
                <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "rgba(59,30,109,0.08)" }}>
                  <Check className="w-4 h-4" style={{ color: PRIMARY }} />
                </div>
                <p className="text-[13.5px] font-medium max-w-[220px]" style={{ color: INK_SOFT }}>{t}</p>
              </div>
            ))}
          </div>
        </div>
        </Reveal>
      </section>

      {/* Final CTA */}
      <section id="pricing" className="relative overflow-hidden px-5 lg:px-8 py-24 lg:py-32" style={{ background: NEARBLACK }}>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{ background: "radial-gradient(ellipse 800px 400px at 50% 0%, rgba(108,74,182,0.25) 0%, transparent 70%)" }}
        />
        <Reveal>
        <div className="relative max-w-2xl mx-auto text-center">
          <h2 className="text-[34px] lg:text-[46px] font-bold tracking-tight leading-[1.1] mb-4" style={{ color: "#FFFFFF", fontFamily: "Space Grotesk, system-ui, sans-serif" }}>
            {c.finalTitle1}
            <br />
            {c.finalTitle2}
          </h2>
          <p className="text-[15px] lg:text-[16px] mb-3" style={{ color: "rgba(255,255,255,0.65)" }}>{c.finalSub}</p>
          <p className="text-[12.5px] mb-9" style={{ color: "rgba(255,255,255,0.4)" }}>{c.trustBullets.join(" · ")}</p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button onClick={() => goAuth("register")} className="text-[15px] font-semibold px-7 py-3.5 rounded-xl text-white" style={{ background: PRIMARY_LIGHT }}>
              {c.finalCtaPrimary}
            </button>
            <a href="#demo" className="text-[15px] font-semibold px-7 py-3.5 rounded-xl border flex items-center gap-2" style={{ color: "#FFFFFF", borderColor: "rgba(255,255,255,0.25)" }}>
              <Play className="w-4 h-4" fill="#FFFFFF" style={{ color: "#FFFFFF" }} />
              {c.finalCtaSecondary}
            </a>
          </div>
        </div>
        </Reveal>
      </section>

      {/* Footer */}
      <footer className="px-5 lg:px-8 py-10 bg-white border-t" style={{ borderColor: LINE }}>
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img src={bossifyLogo} alt="Bossify" className="h-6 w-6 rounded object-cover" />
            <span className="text-sm font-bold" style={{ color: INK }}>Bossify</span>
            <span className="text-[13px]" style={{ color: INK_SOFT }}>· {c.footerTag}</span>
          </div>
          <p className="text-[12.5px]" style={{ color: INK_SOFT }}>© {new Date().getFullYear()} ZH Studio</p>
        </div>
      </footer>
    </div>
  );
}
