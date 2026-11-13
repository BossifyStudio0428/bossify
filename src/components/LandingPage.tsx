import { useState, useRef, useEffect, type ReactNode, type RefObject } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Menu,
  X,
  ArrowRight,
  Check,
  Zap,
  CreditCard,
  Smartphone,
} from "lucide-react";
import { useI18n } from "@/contexts/I18nContext";
import { FREE_LIMITS } from "@/contexts/SubscriptionContext";
import { FALLBACK_PRICES, BUSINESS_FALLBACK_PRICES } from "@/lib/billing";
import bossifyLogo from "@/assets/bossify-logo.png";
import heroTikTokScreenshot from "@/assets/hero-tiktok-screenshot.jpg";
import { OverviewScreen, OrdersScreen, ProductsScreen, ProfitScreen, ReportsScreen } from "@/components/LandingScreens";

// The screens cycled through in the hero phone. They are drawn live (see
// LandingScreens.tsx) in the app's current look, with sample figures, so
// they stay sharp at any size. Kept to the 4 most important screens so the
// loop stays tight.
const HERO_SCREENS: { alt: string; Screen: () => ReactNode }[] = [
  { alt: "Bossify overview showing revenue, costs and real profit for this month", Screen: OverviewScreen },
  { alt: "Bossify Orders page with TikTok Shop sync and 1-tap Send Receipt", Screen: OrdersScreen },
  { alt: "Bossify Cost Breakdown page listing gross sales, each cost, gross profit and net profit", Screen: ProfitScreen },
  { alt: "Bossify Reports page listing 7 exportable PDF business reports", Screen: ReportsScreen },
];

// ---------------------------------------------------------------------------
// Design tokens -- "ledger" look. White paper canvas, deep ink-purple for
// headlines / buttons / the dark bands, and ONE loud accent (coral) kept
// for the thing the product is about: the money you actually keep. No
// purple->pink gradients, no lavender-on-lavender cards -- contrast comes
// from white cards on a pale surface and from two full dark bands (the
// Problem section and the final CTA) that break up the page rhythm.
// Financial figures are always set in monospace, like a printed receipt.
// ---------------------------------------------------------------------------
const BG = "#FFFFFF";
const SURFACE = "#F7F5FA";
const LINE = "#E1DCEC";
const DASH = "#CDC5DE";
const INK = "#1E1730";
const INK_SOFT = "#5B5270";
const PRIMARY = "#3B1E6D";
const PRIMARY_LIGHT = "#6C4AB6";
const NIGHT = "#1C0F38";
const LAVENDER = "#C9B8F3";
const ACCENT = "#FF3B5C";
const GREEN = "#16A34A";
const RED = "#D92D4A";

const DISPLAY = '"Space Grotesk", system-ui, sans-serif';
const BODY = '"IBM Plex Sans", system-ui, sans-serif';
const MONO = '"IBM Plex Mono", ui-monospace, Consolas, monospace';

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
    tiktokComingSoon: "Automatic TikTok Shop order sync — Live",
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
    tiktokComingSoon: "自动 TikTok Shop 订单同步——已上线",
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
    tiktokComingSoon: "Penyegerakan pesanan TikTok Shop automatik — Sudah tersedia",
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

const TRUST_BULLET_ICONS = [Zap, CreditCard, Smartphone];

// Google Play listing for the Android app (appId from capacitor.config.ts).
const PLAY_URL = "https://play.google.com/store/apps/details?id=com.zhstudio.bossify";

// ---------------------------------------------------------------------------
// Second copy block: the longer "why" behind each feature, the pricing
// table and the labels used inside the sample reports. Plan limits and
// prices are read from the same constants the app itself uses
// (FREE_LIMITS / billing fallbacks) so this page cannot drift from /plans.
// ---------------------------------------------------------------------------
type FeatureRow = { quote: string; title: string; body: string; points: string[] };
type PlanCopy = { name: string; tagline: string; features: string[] };
type SampleLabels = Record<
  | "range" | "sample" | "revenue" | "orders" | "unpaid" | "product" | "qty" | "cost" | "profit" | "margin"
  | "items" | "lowStock" | "stockValue" | "item" | "stock" | "status" | "ok" | "low" | "out"
  | "cogs" | "gross" | "fees" | "shipping" | "opex" | "net" | "customer" | "spent" | "date" | "order"
  | "amount" | "paid" | "supplier" | "pos" | "spend" | "total" | "source" | "payment" | "transfer",
  string
>;
type ExtraCopy = {
  playSmall: string;
  featureRows: FeatureRow[];
  reportsSub: string;
  ownTitle: string;
  ownBody: string;
  ownPoints: string[];
  pricingTitle: string;
  pricingSub: string;
  monthly: string;
  annual: string;
  perMonth: string;
  perYear: string;
  popular: string;
  plans: [PlanCopy, PlanCopy, PlanCopy];
  pricingNote: string;
  labels: SampleLabels;
};

const EXTRA: Record<"en" | "zh" | "ms", ExtraCopy> = {
  en: {
    playSmall: "Get it on",
    featureRows: [
      {
        quote: "“Sales look good. So where did the money go?”",
        title: "Real profit on every order",
        body: "Bossify takes each order and subtracts what it really cost you — product, packaging, platform fee, shipping and affiliate commission. The number left is the money you keep.",
        points: [
          "Profit and margin for every product",
          "Loss-making products get flagged",
          "Cost breakdown shows where the money goes",
        ],
      },
      {
        quote: "“Sold out again — and I found out from a customer.”",
        title: "Stock that warns you first",
        body: "See every product's stock in one list. Set your own low-stock level and Bossify tells you before you run out, not after.",
        points: [
          "Low-stock and out-of-stock alerts",
          "Stock take to match what is on the shelf",
          "Supplier purchase orders in the same place",
        ],
      },
      {
        quote: "“My accountant asked for a report. I had a spreadsheet.”",
        title: "7 reports, one tap each",
        body: "Pick a date range, tap once, and get a clean PDF with your shop name on it — ready for your accountant, your bank, or just for you.",
        points: [
          "Today, this week, this month or any custom range",
          "From daily sales to a full Profit & Loss",
          "Raw orders CSV export for tax time",
        ],
      },
      {
        quote: "“I was still typing orders into a notebook at midnight.”",
        title: "Orders in seconds",
        body: "Add an order in a few taps, or let TikTok Shop sync bring them in for you. Then send the customer a WhatsApp confirmation with one tap.",
        points: [
          "TikTok Shop orders sync in automatically",
          "1-tap WhatsApp receipt and confirmation",
          "Remind every unpaid customer at once",
        ],
      },
    ],
    reportsSub: "Tap a report to see a sample of what you get.",
    ownTitle: "Not on TikTok Shop? It works for your own shop too.",
    ownBody: "Selling on WhatsApp, Instagram or from a physical shop? You do not need TikTok Shop to use Bossify.",
    ownPoints: [
      "Record orders yourself, manage products and stock",
      "Stock checks and supplier purchase orders",
      "Send a customer their receipt on WhatsApp in 1 tap",
      "WhatsApp message templates to remind unpaid customers in 1 tap",
    ],
    pricingTitle: "Simple pricing. Start free.",
    pricingSub: "Every account starts on Free. Upgrade inside the app only when your shop needs it.",
    monthly: "Monthly",
    annual: "Annual",
    perMonth: "/ month",
    perYear: "/ year",
    popular: "Most popular",
    plans: [
      {
        name: "Free",
        tagline: "Try it with your real orders.",
        features: [
          `${FREE_LIMITS.ordersPerMonth} orders a month`,
          `${FREE_LIMITS.inventory} products`,
          "1 device",
          "Basic dashboard",
          "WhatsApp order confirmation",
        ],
      },
      {
        name: "Pro",
        tagline: "For sellers who sell every day.",
        features: [
          "Unlimited orders and products",
          "3 devices",
          "Sales, Profit and Stock reports in PDF",
          "3 months of history",
          "WhatsApp templates and remind-all-unpaid",
          "Priority support",
        ],
      },
      {
        name: "Business",
        tagline: "For shops with staff or an accountant.",
        features: ["Everything in Pro", "5 devices", "All 7 PDF reports", "Unlimited history"],
      },
    ],
    pricingNote: "Prices in Malaysian Ringgit (MYR).",
    labels: {
      range: "1–30 Nov 2026", sample: "Sample", revenue: "Revenue", orders: "Orders", unpaid: "Unpaid",
      product: "Product", qty: "Qty", cost: "Cost", profit: "Profit", margin: "Margin",
      items: "Items", lowStock: "Low stock", stockValue: "Stock value", item: "Item", stock: "Stock",
      status: "Status", ok: "OK", low: "Low", out: "Out",
      cogs: "Cost of goods", gross: "Gross profit", fees: "Platform fees", shipping: "Shipping",
      opex: "Operating expenses", net: "Net profit", customer: "Customer", spent: "Total spent",
      date: "Date", order: "Order", amount: "Amount", paid: "Paid", supplier: "Supplier",
      pos: "Purchase orders", spend: "Total spend", total: "Total", source: "Source", payment: "Payment",
      transfer: "Bank transfer",
    },
  },
  zh: {
    playSmall: "立即下载",
    featureRows: [
      {
        quote: "“销售额看起来很好,钱到底去哪了?”",
        title: "每一张订单的真实利润",
        body: "Bossify 会把每张订单的真实成本一项一项扣掉——产品、包装、平台费、运费和联盟佣金。剩下的数字,才是你真正赚到的钱。",
        points: ["每个产品的利润和利润率", "亏钱的产品会被标出来", "成本明细告诉你钱花在哪里"],
      },
      {
        quote: "“又卖断货了——还是顾客告诉我的。”",
        title: "库存快没了,先提醒你",
        body: "所有产品的库存都在同一个列表里。自己设定低库存数量,快卖完之前 Bossify 就会提醒你,而不是卖完之后。",
        points: ["低库存和缺货提醒", "库存盘点,对上货架上的实际数量", "供应商采购单也在同一个地方"],
      },
      {
        quote: "“会计跟我要报表,我只有一份 Excel。”",
        title: "7 份报表,各按一下",
        body: "选好日期范围,按一下,就得到一份印有你店名的整洁 PDF——可以交给会计、银行,或者自己留着看。",
        points: ["今天、本周、本月或任何自订日期", "从每日销售到完整的损益表", "可导出原始订单 CSV,报税时用"],
      },
      {
        quote: "“半夜还在把订单抄进笔记本。”",
        title: "几秒钟记好一张订单",
        body: "点几下就能新增订单,也可以让 TikTok Shop 自动同步进来。再按一下,就把 WhatsApp 确认信息发给顾客。",
        points: ["TikTok Shop 订单自动同步", "一键发送 WhatsApp 收据和确认", "一次提醒所有未付款的顾客"],
      },
    ],
    reportsSub: "点一份报表,看看你会拿到什么样的内容。",
    ownTitle: "不是 TikTok Shop 卖家?自己的店也可以用。",
    ownBody: "在 WhatsApp、Instagram 或实体店卖东西?不需要 TikTok Shop 也能用 Bossify。",
    ownPoints: [
      "自己记录订单,管理产品和库存",
      "库存盘点和供应商采购单",
      "一键用 WhatsApp 发收据给顾客",
      "WhatsApp 信息模板,一键提醒未付款的顾客",
    ],
    pricingTitle: "价格简单,免费开始。",
    pricingSub: "每个账号都从免费版开始。等生意需要了,再在 App 里升级。",
    monthly: "月付",
    annual: "年付",
    perMonth: "/ 月",
    perYear: "/ 年",
    popular: "最受欢迎",
    plans: [
      {
        name: "免费版",
        tagline: "先用真实订单试试看。",
        features: [
          `每月 ${FREE_LIMITS.ordersPerMonth} 张订单`,
          `${FREE_LIMITS.inventory} 个产品`,
          "1 台设备",
          "基本仪表板",
          "WhatsApp 订单确认",
        ],
      },
      {
        name: "专业版 Pro",
        tagline: "适合每天都在出单的卖家。",
        features: [
          "订单和产品数量无限",
          "3 台设备",
          "销售、利润、库存 PDF 报表",
          "3 个月历史数据",
          "WhatsApp 模板和一键催款",
          "优先支持",
        ],
      },
      {
        name: "商业版 Business",
        tagline: "适合有员工或有会计的店。",
        features: ["包含专业版全部功能", "5 台设备", "全部 7 份 PDF 报表", "历史数据无限"],
      },
    ],
    pricingNote: "价格以马币 (MYR) 计算。",
    labels: {
      range: "2026 年 11 月 1–30 日", sample: "样本", revenue: "营收", orders: "订单", unpaid: "未付款",
      product: "产品", qty: "数量", cost: "成本", profit: "利润", margin: "利润率",
      items: "产品数", lowStock: "低库存", stockValue: "库存价值", item: "产品", stock: "库存",
      status: "状态", ok: "正常", low: "偏低", out: "缺货",
      cogs: "货品成本", gross: "毛利", fees: "平台费用", shipping: "运费",
      opex: "营运支出", net: "净利润", customer: "客户", spent: "总消费",
      date: "日期", order: "订单", amount: "金额", paid: "已付款", supplier: "供应商",
      pos: "采购单", spend: "总支出", total: "合计", source: "来源", payment: "付款方式",
      transfer: "银行转账",
    },
  },
  ms: {
    playSmall: "Dapatkan di",
    featureRows: [
      {
        quote: "“Jualan nampak bagus. Jadi ke mana perginya duit?”",
        title: "Untung sebenar setiap pesanan",
        body: "Bossify ambil setiap pesanan dan tolak kos sebenarnya — produk, pembungkusan, yuran platform, penghantaran dan komisen affiliate. Baki itulah duit yang anda simpan.",
        points: [
          "Untung dan margin setiap produk",
          "Produk yang rugi akan ditanda",
          "Pecahan kos tunjuk ke mana duit pergi",
        ],
      },
      {
        quote: "“Habis stok lagi — dan pelanggan yang beritahu saya.”",
        title: "Stok yang beri amaran dahulu",
        body: "Lihat stok semua produk dalam satu senarai. Tetapkan paras stok rendah anda sendiri dan Bossify beritahu sebelum habis, bukan selepas.",
        points: [
          "Makluman stok rendah dan habis stok",
          "Kiraan stok untuk padankan dengan rak",
          "Pesanan belian pembekal di tempat yang sama",
        ],
      },
      {
        quote: "“Akauntan minta laporan. Saya cuma ada hamparan.”",
        title: "7 laporan, satu ketik setiap satu",
        body: "Pilih julat tarikh, ketik sekali, dan dapat PDF kemas dengan nama kedai anda — sedia untuk akauntan, bank, atau untuk anda sendiri.",
        points: [
          "Hari ini, minggu ini, bulan ini atau julat pilihan",
          "Dari jualan harian hingga Untung & Rugi penuh",
          "Eksport CSV pesanan mentah untuk musim cukai",
        ],
      },
      {
        quote: "“Tengah malam pun masih salin pesanan dalam buku.”",
        title: "Pesanan dalam beberapa saat",
        body: "Tambah pesanan dengan beberapa ketikan, atau biar TikTok Shop segerakkan untuk anda. Kemudian hantar pengesahan WhatsApp kepada pelanggan dengan satu ketik.",
        points: [
          "Pesanan TikTok Shop disegerakkan automatik",
          "Resit dan pengesahan WhatsApp 1 ketik",
          "Ingatkan semua pelanggan belum bayar sekali gus",
        ],
      },
    ],
    reportsSub: "Ketik satu laporan untuk lihat contoh yang anda akan dapat.",
    ownTitle: "Bukan penjual TikTok Shop? Kedai sendiri pun boleh.",
    ownBody: "Menjual di WhatsApp, Instagram atau kedai fizikal? Anda tidak perlukan TikTok Shop untuk guna Bossify.",
    ownPoints: [
      "Rekod pesanan sendiri, urus produk dan stok",
      "Kiraan stok dan pesanan belian pembekal",
      "Hantar resit kepada pelanggan melalui WhatsApp dengan 1 ketik",
      "Templat mesej WhatsApp untuk ingatkan pelanggan belum bayar dengan 1 ketik",
    ],
    pricingTitle: "Harga mudah. Mula percuma.",
    pricingSub: "Setiap akaun bermula dengan Percuma. Naik taraf dalam app hanya apabila kedai anda perlukannya.",
    monthly: "Bulanan",
    annual: "Tahunan",
    perMonth: "/ bulan",
    perYear: "/ tahun",
    popular: "Paling popular",
    plans: [
      {
        name: "Percuma",
        tagline: "Cuba dengan pesanan sebenar anda.",
        features: [
          `${FREE_LIMITS.ordersPerMonth} pesanan sebulan`,
          `${FREE_LIMITS.inventory} produk`,
          "1 peranti",
          "Papan pemuka asas",
          "Pengesahan pesanan WhatsApp",
        ],
      },
      {
        name: "Pro",
        tagline: "Untuk penjual yang menjual setiap hari.",
        features: [
          "Pesanan dan produk tanpa had",
          "3 peranti",
          "Laporan Jualan, Untung dan Stok dalam PDF",
          "Sejarah 3 bulan",
          "Templat WhatsApp dan ingatkan semua belum bayar",
          "Sokongan keutamaan",
        ],
      },
      {
        name: "Business",
        tagline: "Untuk kedai yang ada staf atau akauntan.",
        features: ["Semua dalam Pro", "5 peranti", "Semua 7 laporan PDF", "Sejarah tanpa had"],
      },
    ],
    pricingNote: "Harga dalam Ringgit Malaysia (MYR).",
    labels: {
      range: "1–30 Nov 2026", sample: "Contoh", revenue: "Hasil", orders: "Pesanan", unpaid: "Belum bayar",
      product: "Produk", qty: "Kuantiti", cost: "Kos", profit: "Untung", margin: "Margin",
      items: "Item", lowStock: "Stok rendah", stockValue: "Nilai stok", item: "Item", stock: "Stok",
      status: "Status", ok: "OK", low: "Rendah", out: "Habis",
      cogs: "Kos barang", gross: "Untung kasar", fees: "Yuran platform", shipping: "Penghantaran",
      opex: "Perbelanjaan operasi", net: "Untung bersih", customer: "Pelanggan", spent: "Jumlah belanja",
      date: "Tarikh", order: "Pesanan", amount: "Jumlah", paid: "Dibayar", supplier: "Pembekal",
      pos: "Pesanan belian", spend: "Jumlah belanja", total: "Jumlah", source: "Sumber", payment: "Bayaran",
      transfer: "Pindahan bank",
    },
  },
};

// Sample data shown inside each report preview. Numbers line up with the
// "RM10,000 in sales -> RM2,850 kept" story told higher up the page.
// Cell prefixes: "!" = red (a cost / a problem), "^" = the coral bottom line.
type ReportSampleData = {
  meta?: string;
  stats: [string, string][];
  head: string[];
  rows: string[][];
};

function buildSamples(L: SampleLabels): ReportSampleData[] {
  const P = ["Tudung Bawal Premium", "Serum Vitamin C", "Baju Kurung Moden", "Lip Tint Set"];
  return [
    {
      stats: [[L.revenue, "RM 10,000"], [L.orders, "128"], [L.unpaid, "!RM 420"]],
      head: [L.product, L.qty, L.revenue],
      rows: [[P[0], "46", "RM 3,220"], [P[1], "31", "RM 2,759"], [P[2], "18", "RM 2,322"], [P[3], "33", "RM 1,699"]],
    },
    {
      stats: [[L.revenue, "RM 10,000"], [L.cost, "!RM 7,150"], [L.profit, "^RM 2,850"]],
      head: [L.product, L.profit, L.margin],
      rows: [[P[0], "RM 1,288", "40%"], [P[1], "RM 965", "35%"], [P[2], "RM 697", "30%"], [P[3], "!− RM 100", "!−6%"]],
    },
    {
      stats: [[L.items, "42"], [L.lowStock, "!3"], [L.stockValue, "RM 6,480"]],
      head: [L.item, L.stock, L.status],
      rows: [[P[0], "64", L.ok], [P[1], "4", `!${L.low}`], [P[2], "12", L.ok], [P[3], "0", `!${L.out}`]],
    },
    {
      stats: [],
      head: ["", "RM"],
      rows: [
        [L.revenue, "10,000"],
        [L.cogs, "!− 5,300"],
        [L.gross, "4,700"],
        [L.fees, "!− 800"],
        [L.shipping, "!− 600"],
        [L.opex, "!− 450"],
        [L.net, "^2,850"],
      ],
    },
    {
      meta: `${L.customer}: Nur Aisyah`,
      stats: [[L.orders, "4"], [L.spent, "RM 742"], [L.unpaid, "!RM 89"]],
      head: [L.date, L.order, L.amount, L.status],
      rows: [
        ["03 Nov", "#A1042", "RM 129", L.paid],
        ["11 Nov", "#A1077", "RM 250", L.paid],
        ["19 Nov", "#A1103", "RM 89", `!${L.unpaid}`],
        ["27 Nov", "#A1131", "RM 363", L.paid],
      ],
    },
    {
      meta: `${L.supplier}: Kain Maju Enterprise`,
      stats: [[L.pos, "3"], [L.spend, "RM 3,240"]],
      head: [L.date, L.item, L.qty, L.total],
      rows: [
        ["02 Nov", "Kain Bawal", "200", "RM 1,400"],
        ["12 Nov", "Bubble Mailer", "500", "RM 440"],
        ["21 Nov", "Kain Bawal", "200", "RM 1,400"],
      ],
    },
    {
      stats: [[L.orders, "128"], [L.paid, "121"], [L.unpaid, "!7"]],
      head: [L.order, L.source, L.payment, L.status],
      rows: [
        ["#A1131", "TikTok Shop", "TikTok", L.paid],
        ["#A1130", "WhatsApp", "DuitNow", L.paid],
        ["#A1129", "WhatsApp", L.transfer, `!${L.unpaid}`],
        ["#A1128", "TikTok Shop", "TikTok", L.paid],
      ],
    },
  ];
}

// ---------------------------------------------------------------------------
// Motion: lightweight scroll-reveal. No animation libraries -- just
// IntersectionObserver, skipped entirely under prefers-reduced-motion.
// ---------------------------------------------------------------------------
function Reveal({
  children,
  delay = 0,
  y = 22,
  className,
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
}) {
  const [ref, visible] = useInView<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        // "none" (not translateY(0)) once shown: a leftover transform keeps
        // the content on its own GPU layer, which resamples images and
        // makes the screenshots inside look soft.
        transform: visible ? "none" : `translateY(${y}px)`,
        // No transition on the way OUT: the element is already off screen
        // when it resets, so it snaps back to its start pose and is ready to
        // play again the next time it scrolls in.
        transition: visible
          ? `opacity 0.7s cubic-bezier(0.16,1,0.3,1) ${delay}ms, transform 0.7s cubic-bezier(0.16,1,0.3,1) ${delay}ms`
          : "none",
      }}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The "receipt" -- Bossify's signature motif. White paper, monospace type,
// dashed dividers and a torn zig-zag bottom edge (a CSS mask, so the shadow
// has to come from a drop-shadow filter on the wrapper rather than a
// box-shadow, which the mask would clip).
// ---------------------------------------------------------------------------
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

// Drives the "Sales don't tell the whole story" receipt.
// - Desktop (wide + tall enough viewport): the section is pinned and its
//   progress is tied directly to scroll position, so the visitor scrubs the
//   costs off the balance themselves -- forwards and backwards.
// - Phones / short windows: no pinning; the same sequence just plays once
//   on a timer when the receipt scrolls into view.
function useStoryProgress(sectionRef: RefObject<HTMLElement | null>, triggerRef: RefObject<HTMLElement | null>) {
  const [scrub, setScrub] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const section = sectionRef.current;
    const trigger = triggerRef.current;
    if (!section || !trigger) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setProgress(1);
      return;
    }
    const mq = window.matchMedia("(min-width: 1024px) and (min-height: 640px)");
    let raf = 0;
    let cleanup = () => {};

    const setup = () => {
      cleanup();
      if (mq.matches) {
        setScrub(true);
        const measure = () => {
          const r = section.getBoundingClientRect();
          const span = r.height - window.innerHeight;
          const p = span > 0 ? clamp01(-r.top / span) : 0;
          setProgress((prev) => (Math.abs(prev - p) > 0.001 ? p : prev));
        };
        const onScroll = () => {
          cancelAnimationFrame(raf);
          raf = requestAnimationFrame(measure);
        };
        onScroll();
        window.addEventListener("scroll", onScroll, { passive: true });
        window.addEventListener("resize", onScroll);
        cleanup = () => {
          window.removeEventListener("scroll", onScroll);
          window.removeEventListener("resize", onScroll);
          cancelAnimationFrame(raf);
        };
      } else {
        setScrub(false);
        setProgress(0);
        let playing = false;
        const observer = new IntersectionObserver(
          ([entry]) => {
            if (!entry.isIntersecting) {
              // fully off screen: rewind so it plays again next time
              cancelAnimationFrame(raf);
              playing = false;
              setProgress(0);
              return;
            }
            if (playing || entry.intersectionRatio < 0.4) return;
            playing = true;
            const t0 = performance.now();
            const tick = (now: number) => {
              const p = Math.min(1, (now - t0) / 3600);
              setProgress(p);
              if (p < 1) raf = requestAnimationFrame(tick);
            };
            raf = requestAnimationFrame(tick);
          },
          { threshold: [0, 0.4] },
        );
        observer.observe(trigger);
        cleanup = () => {
          observer.disconnect();
          cancelAnimationFrame(raf);
        };
      }
    };
    setup();
    mq.addEventListener("change", setup);
    return () => {
      mq.removeEventListener("change", setup);
      cleanup();
    };
  }, [sectionRef, triggerRef]);

  return { scrub, progress };
}

// Scroll-linked touches, written straight to element styles (no re-render):
// - [data-pan] screenshots: once a frame is fully on screen, the real
//   screenshot inside it pans downward as you keep scrolling.
// - [data-parallax="k"]: hero layers drift at slightly different speeds.
function useScrollFx(rootRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const update = () => {
      const vh = window.innerHeight;
      root.querySelectorAll<HTMLElement>("[data-pan]").forEach((img) => {
        const r = img.getBoundingClientRect();
        if (r.bottom < -80 || r.top > vh + 80) return;
        const q = clamp01(((vh - r.bottom) / vh) * 1.4);
        img.style.objectPosition = `50% ${(q * 100).toFixed(1)}%`;
      });
      // Dark bands dissolve in from the white page as they scroll up into
      // view, and ("both") dissolve back to white as they leave -- so the
      // page slides from dark to light instead of cutting at a hard edge.
      // --nk drives the background mix, --no the opacity of the content.
      root.querySelectorAll<HTMLElement>("[data-night]").forEach((el) => {
        const r = el.getBoundingClientRect();
        const both = el.dataset.night === "both";
        const enter = clamp01((vh * 0.95 - r.top) / (vh * 0.55));
        const exit = both ? 1 - clamp01((vh * 0.75 - r.bottom) / (vh * 0.55)) : 1;
        const k = (enter * exit).toFixed(3);
        el.style.setProperty("--nk", k);
        el.style.setProperty("--no", k);
        // The "both" band also drives the whole page: --pk darkens the page
        // background and fades out the light sections either side of it
        // ([data-day]), so the entire screen goes dark and then light again.
        if (both) root.style.setProperty("--pk", k);
      });
      const y = window.scrollY;
      if (y < vh * 1.6) {
        root.querySelectorAll<HTMLElement>("[data-parallax]").forEach((el) => {
          el.style.transform = `translate3d(0, ${(y * Number(el.dataset.parallax)).toFixed(1)}px, 0)`;
        });
      }
    };
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [rootRef]);
}

// Eased 0 -> target count-up once `start` flips true. Jumps straight to the
// final value under prefers-reduced-motion.
function useCountUp(target: number, start: boolean, durationMs = 1100) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!start) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setValue(target);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / durationMs);
      setValue(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, start, durationMs]);
  return value;
}

// True while the element is on screen; flips back to false only once it has
// left the viewport completely, so anything keyed off it replays on every
// visit without flickering at the edge. Always true under reduced motion.
function useInView<T extends Element>() {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setInView(true);
      return;
    }
    const show = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setInView(true);
      },
      { threshold: 0.15, rootMargin: "0px 0px -60px 0px" },
    );
    const hide = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) setInView(false);
    });
    show.observe(el);
    hide.observe(el);
    return () => {
      show.disconnect();
      hide.disconnect();
    };
  }, []);
  return [ref, inView] as const;
}

// Counter that bumps each time `inView` turns true -- used as a React key
// to restart CSS keyframe animations (and remount count-ups) on every visit.
function useReplayKey(inView: boolean) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (inView) setN((v) => v + 1);
  }, [inView]);
  return n;
}

const ZIGZAG_MASK =
  "conic-gradient(from -45deg at bottom, #0000, #000 1deg 89deg, #0000 90deg) 50% / 14px 100%";

function ReceiptPaper({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={className} style={{ filter: "drop-shadow(0 22px 34px rgba(20,8,48,0.3))" }}>
      <div
        style={{
          background: "#FFFFFF",
          color: INK,
          fontFamily: MONO,
          borderRadius: "8px 8px 0 0",
          paddingBottom: 14,
          WebkitMask: ZIGZAG_MASK,
          mask: ZIGZAG_MASK,
        }}
      >
        {children}
      </div>
    </div>
  );
}

function Dash() {
  return <div className="my-2.5" style={{ borderTop: `1.5px dashed ${DASH}` }} />;
}

// Small single-order slip that overlaps the hero phone. Labels reuse the
// Problem-section copy so it is translated in all three languages.
function HeroSlip({ copy }: { copy: LandingCopy }) {
  // Net figure counts up just as the slip finishes "printing" (see .bf-slip-print).
  const [go, setGo] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setGo(true), 1300);
    return () => window.clearTimeout(t);
  }, []);
  const net = useCountUp(57.5, go, 900);
  const rows = [
    { label: copy.problemSalesLabel, value: "RM 250.00", neg: false },
    { label: copy.problemCostLines[0]?.label ?? "", value: "− RM 180.00", neg: true },
    { label: copy.problemCostLines[1]?.label ?? "", value: "− RM 12.50", neg: true },
  ];
  return (
    <ReceiptPaper>
      <div className="px-3.5 sm:px-4 pt-3.5 sm:pt-4 pb-2 text-[10px] sm:text-[11.5px]">
        <p style={{ color: INK_SOFT }}>ORDER #A1042</p>
        <p className="font-semibold">Bossify · Real Profit Slip</p>
        <Dash />
        <div className="space-y-1">
          {rows.map((r) => (
            <div key={r.label} className="flex items-baseline justify-between gap-2">
              <span className="truncate" style={{ color: INK_SOFT }}>{r.label}</span>
              <span className="shrink-0 tabular-nums" style={{ color: r.neg ? RED : INK }}>{r.value}</span>
            </div>
          ))}
        </div>
        <Dash />
        <p className="text-[9px] sm:text-[10px] uppercase tracking-wider" style={{ color: INK_SOFT }}>
          {copy.problemProfitLabel}
        </p>
        <p className="text-[20px] sm:text-[26px] font-semibold tabular-nums leading-tight" style={{ color: ACCENT }}>
          RM {net.toFixed(2)}
        </p>
      </div>
    </ReceiptPaper>
  );
}

// ---------------------------------------------------------------------------
// Hero visual -- ONE solid phone showing real app screenshots (crossfading,
// never cropped: object-contain), sitting on a deep-purple panel, with the
// receipt slip overlapping its lower-left corner. Every slide is an actual
// screen from the live app.
// ---------------------------------------------------------------------------
function HeroVisual({ copy }: { copy: LandingCopy }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [visRef, visIn] = useInView<HTMLDivElement>();
  const run = useReplayKey(visIn);
  const n = HERO_SCREENS.length;

  useEffect(() => {
    if (paused) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => setIndex((i) => (i + 1) % n), 3600);
    return () => window.clearInterval(id);
  }, [n, paused]);

  return (
    <div ref={visRef} className="relative mx-auto w-full max-w-[540px]">
      <div
        aria-hidden="true"
        className="absolute inset-x-0 sm:left-[14%] top-[5%] bottom-[11%] rounded-[32px] sm:rounded-[40px] overflow-hidden"
        style={{ background: `linear-gradient(155deg, ${PRIMARY} 0%, ${PRIMARY_LIGHT} 110%)` }}
      >
        {/* faint ledger rules on the panel */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: "repeating-linear-gradient(0deg, rgba(255,255,255,0.07) 0 1px, transparent 1px 34px)",
          }}
        />
      </div>

      <div className="relative ml-auto mr-3 sm:mr-10 w-[224px] sm:w-[304px]">
        <div
          className="rounded-[32px] sm:rounded-[38px] p-[7px] sm:p-[9px]"
          style={{ background: "#120A24", boxShadow: "0 40px 70px -28px rgba(18,10,36,0.75)" }}
        >
          <div
            className="relative rounded-[25px] sm:rounded-[29px] overflow-hidden"
            style={{ aspectRatio: "663 / 1460", background: "#F4F3F8" }}
          >
            {HERO_SCREENS.map(({ alt, Screen }, i) => (
              <div
                key={alt}
                role="img"
                aria-label={alt}
                aria-hidden={i !== index}
                className="absolute inset-0"
                style={{ opacity: i === index ? 1 : 0, transition: "opacity 0.7s ease" }}
              >
                <Screen />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div data-parallax="-0.13" className="absolute left-0 sm:left-[4%] bottom-[17%] w-[192px] sm:w-[228px]">
        <div className="bf-slip-float" style={{ transform: "rotate(-4deg)" }}>
          <div key={run} className="bf-slip-print">
            <HeroSlip copy={copy} />
          </div>
        </div>
      </div>

      <div className="relative flex items-center justify-center gap-2 mt-6 sm:pl-[14%]">
        {HERO_SCREENS.map((shot, i) => (
          <button
            key={shot.alt}
            type="button"
            aria-label={`Screenshot ${i + 1}`}
            aria-current={i === index}
            onClick={() => {
              setIndex(i);
              setPaused(true);
            }}
            className="h-2 rounded-full transition-all duration-300"
            style={{ width: i === index ? 22 : 8, background: i === index ? PRIMARY : LINE }}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Scroll-triggered profit statement -- "Sales don't tell the whole story"
// printed as a receipt: Sales appears, then each real cost prints in one
// line at a time as the section scrolls into view, ending on the number
// you actually keep. Triggers once via IntersectionObserver (not
// continuously scroll-scrubbed) so it stays smooth on mobile.
// ---------------------------------------------------------------------------
function ProfitStatement({ copy, progress, stamp }: { copy: LandingCopy; progress: number; stamp: string }) {
  const costs = copy.problemCostLines;
  const n = costs.length;
  const parse = (v: string) => Number(v.replace(/[^0-9.]/g, "")) || 0;
  const sales = parse(copy.problemSalesValue);

  // progress 0..1 is spread over one "unit" per cost line plus a hold at the
  // end. Each cost prints at the start of its unit and is deducted from the
  // running balance over the first ~2/3 of it.
  const u = progress * (n + 1.2);
  let running = sales;
  costs.forEach((l, i) => {
    running -= parse(l.value) * clamp01((u - (i + 0.2)) / 0.65);
  });
  const finalReached = u >= n + 0.35;
  if (finalReached) running = parse(copy.problemProfitValue);
  const runningText = copy.problemProfitValue.replace(/[0-9][0-9,.]*/, Math.round(running).toLocaleString("en-US"));

  const line = (shown: boolean) => ({
    opacity: shown ? 1 : 0,
    transform: shown ? "translateY(0)" : "translateY(8px)",
    transition: "opacity 0.35s ease-out, transform 0.35s cubic-bezier(0.16,1,0.3,1)",
  });

  return (
    <ReceiptPaper>
      <div className="relative px-6 sm:px-8 pt-7 pb-5">
        <div className="flex items-baseline justify-between gap-3 text-[12px]" style={{ color: INK_SOFT }}>
          <span>Bossify · Real Profit Slip</span>
          <span>TikTok Shop</span>
        </div>
        <Dash />
        <div className="flex items-baseline justify-between gap-3 py-1">
          <span className="text-[14px]" style={{ color: INK }}>{copy.problemSalesLabel}</span>
          <span className="text-[22px] sm:text-[24px] font-semibold tabular-nums" style={{ color: INK }}>{copy.problemSalesValue}</span>
        </div>
        <Dash />
        <div className="space-y-2.5 py-1">
          {costs.map((l, i) => (
            <div key={l.label} className="flex items-baseline justify-between gap-3" style={line(u > i + 0.2)}>
              <span className="text-[14px]" style={{ color: INK_SOFT }}>{l.label}</span>
              <span className="text-[14.5px] font-medium tabular-nums shrink-0" style={{ color: RED }}>{l.value}</span>
            </div>
          ))}
        </div>
        <Dash />
        <div className="pt-1">
          <p
            className="text-[11.5px] uppercase tracking-wider mb-1"
            style={{ color: INK_SOFT, opacity: finalReached ? 1 : 0, transition: "opacity 0.4s ease-out" }}
          >
            {copy.problemProfitLabel}
          </p>
          <p
            className="text-[40px] sm:text-[48px] font-semibold tabular-nums leading-none"
            style={{ color: finalReached ? ACCENT : INK, transition: "color 0.35s ease-out" }}
          >
            {runningText}
          </p>
        </div>
        {/* Rubber stamp that thumps down once the real number is reached */}
        <div
          aria-hidden="true"
          className={`bf-stamp ${finalReached ? "bf-stamp-on" : ""} absolute right-5 sm:right-7 bottom-6 max-w-[132px] px-2.5 py-1.5 text-center text-[12px] font-semibold uppercase tracking-[0.12em] leading-tight rounded-md`}
          style={{ color: ACCENT, border: `3px solid ${ACCENT}` }}
        >
          {stamp}
        </div>
      </div>
    </ReceiptPaper>
  );
}

// A purple line that follows the mouse and fades out behind it, like a pen
// stroke across the page. Mouse only (never on touch), off under reduced
// motion, drawn on a fixed canvas that ignores clicks.
function CursorTrail() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const LIFE = 900; // ms a point stays visible
    let pts: { x: number; y: number; t: number }[] = [];
    let raf = 0;
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const draw = () => {
      raf = 0;
      const now = performance.now();
      pts = pts.filter((p) => now - p.t < LIFE);
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        if (b.t - a.t > 140) continue; // the mouse paused: start a new stroke
        const age = 1 - (now - b.t) / LIFE;
        ctx.strokeStyle = `rgba(150, 122, 232, ${(age * 0.5).toFixed(3)})`;
        ctx.lineWidth = 0.6 + age * 1.2;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      if (pts.length) raf = requestAnimationFrame(draw);
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType && e.pointerType !== "mouse") return;
      pts.push({ x: e.clientX, y: e.clientY, t: performance.now() });
      if (!raf) raf = requestAnimationFrame(draw);
    };
    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
    };
  }, []);
  return <canvas ref={ref} aria-hidden="true" className="fixed inset-0 w-full h-full pointer-events-none z-20" />;
}

const nightBg =`color-mix(in srgb, ${NIGHT} calc(var(--nk, 1) * 100%), #FFFFFF)`;

// "Get it on Google Play" -- a real link to the store listing, opens in a
// new tab. Deliberately NOT marked data-cta, so the sign-up click fallback
// leaves it alone.
function PlayButton({ small, onDark = false }: { small: string; onDark?: boolean }) {
  return (
    <a
      href={PLAY_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${small} Google Play`}
      className="inline-flex items-center gap-3 rounded-full pl-5 pr-6 py-2.5 transition-transform hover:-translate-y-0.5"
      style={{
        background: onDark ? "rgba(255,255,255,0.08)" : INK,
        color: "#FFFFFF",
        border: `1px solid ${onDark ? "rgba(255,255,255,0.32)" : INK}`,
      }}
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" className="w-5 h-5 shrink-0" fill="currentColor">
        <path d="M4 2.6v18.8a1 1 0 0 0 1.5.86l16-9.4a1 1 0 0 0 0-1.72l-16-9.4A1 1 0 0 0 4 2.6z" />
      </svg>
      <span className="text-left leading-tight">
        <span className="block text-[10px] uppercase tracking-[0.12em] opacity-75" style={{ fontFamily: MONO }}>{small}</span>
        <span className="block text-[16px] font-semibold" style={{ fontFamily: DISPLAY }}>Google Play</span>
      </span>
    </a>
  );
}

function Cell({ v }: { v: string }) {
  const tone = v[0] === "!" ? RED : v[0] === "^" ? ACCENT : undefined;
  return <span style={{ color: tone, fontWeight: v[0] === "^" ? 600 : undefined }}>{tone ? v.slice(1) : v}</span>;
}

// One sample report, drawn as a sheet of paper. Sample data only -- the
// "Sample" tag in the corner says so.
function ReportSample({ title, data, L }: { title: string; data: ReportSampleData; L: SampleLabels }) {
  return (
    <div
      className="bf-paper-in rounded-lg border p-5 sm:p-6"
      style={{ background: "#FFFFFF", borderColor: LINE, fontFamily: MONO, color: INK, boxShadow: "0 24px 50px -30px rgba(59,30,109,0.45)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px]" style={{ color: INK_SOFT }}>Kedai Aina · {L.range}</p>
          <p className="text-[17px] font-bold mt-0.5" style={{ fontFamily: DISPLAY }}>{title}</p>
          {data.meta && <p className="text-[12px] mt-1" style={{ color: INK_SOFT }}>{data.meta}</p>}
        </div>
        <span className="shrink-0 text-[10px] uppercase tracking-[0.14em] px-2 py-1 rounded border" style={{ color: ACCENT, borderColor: ACCENT }}>
          {L.sample}
        </span>
      </div>
      {data.stats.length > 0 && (
        <div
          className="grid gap-3 mt-4 pt-4"
          style={{ gridTemplateColumns: `repeat(${data.stats.length}, minmax(0, 1fr))`, borderTop: `1.5px dashed ${DASH}` }}
        >
          {data.stats.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <p className="text-[10px] uppercase tracking-wider truncate" style={{ color: INK_SOFT }}>{label}</p>
              <p className="text-[14.5px] sm:text-[17px] font-semibold tabular-nums"><Cell v={value} /></p>
            </div>
          ))}
        </div>
      )}
      <table className="w-full mt-4 text-[12px] sm:text-[13px] border-collapse">
        <thead>
          <tr>
            {data.head.map((h, i) => (
              <th key={i} className={`py-2 font-medium border-b ${i === 0 ? "text-left" : "text-right"}`} style={{ color: INK_SOFT, borderColor: INK }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((v, i) => (
                <td key={i} className={`py-2 border-b tabular-nums ${i === 0 ? "text-left pr-2" : "text-right pl-2"}`} style={{ borderColor: LINE }}>
                  <Cell v={v} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const REPORT_DESC_KEYS = [
  "reports_sales_desc",
  "reports_profit_desc",
  "reports_stock_desc",
  "reports_financial_desc",
  "reports_customer_desc",
  "reports_supplier_desc",
  "reports_recon_desc",
] as const;

function Eyebrow({ children, onDark = false }: { children: ReactNode; onDark?: boolean }) {
  return (
    <p
      className="inline-flex items-center gap-2 text-[12px] font-medium tracking-[0.14em] uppercase mb-4"
      style={{ color: onDark ? LAVENDER : PRIMARY_LIGHT, fontFamily: MONO }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: ACCENT }} />
      {children}
    </p>
  );
}

const H2_CLASS = "text-[30px] sm:text-[36px] lg:text-[44px] font-bold tracking-tight leading-[1.08]";

export function LandingPage() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const c = COPY[lang] ?? COPY.en;

  const lastGoAuthRef = useRef(0);
  const goAuth = (mode: "login" | "register") => {
    // Dedupe: this can now be triggered twice for the same physical click
    // (React's onClick below, AND the native document-level fallback
    // listener further down) when React's synthetic event system is
    // working normally -- harmless either way since both calls navigate
    // to the same place, but skip the second call so we don't double-fire
    // navigate()/analytics for everyone whose browser was never broken.
    const now = Date.now();
    if (now - lastGoAuthRef.current < 600) return;
    lastGoAuthRef.current = now;
    const target = mode === "register" ? "/auth?mode=reg" : "/auth";
    // Belt-and-braces navigation: the SPA router's navigate() can go
    // silently nowhere if its lazily-loaded /auth route chunk fails to
    // fetch (stale CDN cache pointing at a filename that no longer
    // exists after a deploy, a flaky connection, etc.) — the click just
    // looks like it did nothing, with no visible error anywhere. If
    // we're still on this same page shortly after trying, force a real
    // browser navigation instead, which re-fetches a fresh HTML document
    // and current asset filenames rather than relying on already-loaded
    // JS. Cleared the moment the SPA navigation actually lands.
    const startPath = window.location.pathname + window.location.search;
    const fallback = window.setTimeout(() => {
      const nowPath = window.location.pathname + window.location.search;
      if (nowPath === startPath) {
        window.location.href = target;
      }
    }, 800);
    try {
      const result = navigate({ to: "/auth", search: mode === "register" ? { mode: "reg" } : undefined } as never);
      Promise.resolve(result)
        .then(() => window.clearTimeout(fallback))
        .catch(() => {
          window.clearTimeout(fallback);
          window.location.href = target;
        });
    } catch {
      window.clearTimeout(fallback);
      window.location.href = target;
    }
  };

  // Belt-and-braces #2 -- independent of React entirely this time. We've
  // confirmed (via a raw addEventListener test run directly in a user's
  // browser) that a native click handler attached straight to one of
  // these buttons fires correctly even when NOTHING downstream of
  // React's own onClick (neither the SPA navigate() above nor its
  // window.location.href fallback) ever runs -- i.e. the click reaches
  // the DOM fine, but React's synthetic event system never gets it to
  // this component's onClick at all for that visitor/browser. Rather
  // than depend on figuring out why for every possible browser, attach
  // a second, totally native listener at the document level that finds
  // any element marked data-cta and calls goAuth directly -- no React
  // event delegation involved, so it still works even if React's own
  // click handling is broken for someone. Capture phase so it's not at
  // the mercy of anything calling stopPropagation() during bubbling.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest?.("[data-cta]");
      if (!el) return;
      const mode = el.getAttribute("data-cta") === "register" ? "register" : "login";
      goAuth(mode);
    };
    document.addEventListener("click", handler, true);
    return () => document.removeEventListener("click", handler, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const x = EXTRA[lang] ?? EXTRA.en;
  const featureScreens = [ProfitScreen, ProductsScreen, ReportsScreen, OrdersScreen];
  const features = x.featureRows.map((f, i) => ({ ...f, Screen: featureScreens[i] }));

  // Reports: the selected report's sample sheet. On desktop it steps through
  // the seven on its own until the visitor picks one.
  const samples = buildSamples(x.labels);
  const [rep, setRep] = useState(0);
  const [repTouched, setRepTouched] = useState(false);
  const [repRef, repIn] = useInView<HTMLDivElement>();
  useEffect(() => {
    if (!repIn || repTouched) return;
    if (!window.matchMedia("(min-width: 1024px)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => setRep((v) => (v + 1) % 7), 3200);
    return () => window.clearInterval(id);
  }, [repIn, repTouched]);

  // Pricing
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");
  const planPrices = ["RM 0", FALLBACK_PRICES[billing], BUSINESS_FALLBACK_PRICES[billing]];

  const rootRef = useRef<HTMLDivElement>(null);
  const storyRef = useRef<HTMLElement>(null);
  const receiptRef = useRef<HTMLDivElement>(null);
  const { scrub, progress } = useStoryProgress(storyRef, receiptRef);
  useScrollFx(rootRef);
  const [finalRef, finalIn] = useInView<HTMLHeadingElement>();
  const [h1Ref, h1In] = useInView<HTMLHeadingElement>();
  const h1Run = useReplayKey(h1In);

  // Comparison table: rows fade up one after another once the table scrolls in.
  const [tableRef, tableIn] = useInView<HTMLTableElement>();
  const rowStyle = (i: number) => ({
    opacity: tableIn ? 1 : 0,
    transform: tableIn ? "translateY(0)" : "translateY(12px)",
    transition: `opacity 0.5s ease-out ${i * 90}ms, transform 0.5s cubic-bezier(0.16,1,0.3,1) ${i * 90}ms`,
  });

  const primaryBtn =
    "group inline-flex items-center justify-center gap-2 font-semibold rounded-full text-white transition-all hover:-translate-y-0.5 hover:shadow-[0_14px_30px_-10px_rgba(59,30,109,0.65)]";

  return (
    <div
      ref={rootRef}
      className="relative isolate"
      style={{ background: `color-mix(in srgb, ${NIGHT} calc(var(--pk, 0) * 100%), ${BG})`, color: INK, fontFamily: BODY }}
    >
      <CursorTrail />
      {/* Header */}
      <header className="sticky top-0 z-30 backdrop-blur border-b" style={{ background: "rgba(255,255,255,0.88)", borderColor: LINE }}>
        <div className="max-w-6xl mx-auto px-5 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img src={bossifyLogo} alt="Bossify" className="h-9 w-9 rounded-lg object-contain" />
            <span className="text-[19px] font-bold tracking-tight" style={{ color: INK, fontFamily: DISPLAY }}>
              Bossify
            </span>
          </div>
          <nav className="hidden lg:flex items-center gap-9">
            <a href="#features" className="bf-text-live text-[15px] font-medium" style={{ color: INK_SOFT }}>{c.navFeatures}</a>
            <a href="#reports" className="bf-text-live text-[15px] font-medium" style={{ color: INK_SOFT }}>{c.navReports}</a>
            <a href="#pricing" className="bf-text-live text-[15px] font-medium" style={{ color: INK_SOFT }}>{c.navPricing}</a>
          </nav>
          <div className="hidden lg:flex items-center gap-2">
            <button data-cta="login" onClick={() => goAuth("login")} className="text-[15px] font-semibold px-4 py-2 rounded-full transition-colors hover:bg-[#F7F5FA]" style={{ color: INK }}>
              {c.signIn}
            </button>
            <button data-cta="register" onClick={() => goAuth("register")} className={`${primaryBtn} text-[15px] px-5 py-2.5`} style={{ background: PRIMARY }}>
              {c.startFree}
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
            </button>
          </div>
          <button className="lg:hidden p-2 -mr-2" onClick={() => setMenuOpen((v) => !v)} aria-label="Menu" style={{ color: INK }}>
            {menuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
        {menuOpen && (
          <div className="lg:hidden border-t px-5 py-4 flex flex-col gap-1" style={{ borderColor: LINE, background: BG }}>
            <a href="#features" onClick={() => setMenuOpen(false)} className="text-[16px] font-medium py-2.5" style={{ color: INK }}>{c.navFeatures}</a>
            <a href="#reports" onClick={() => setMenuOpen(false)} className="text-[16px] font-medium py-2.5" style={{ color: INK }}>{c.navReports}</a>
            <a href="#pricing" onClick={() => setMenuOpen(false)} className="text-[16px] font-medium py-2.5" style={{ color: INK }}>{c.navPricing}</a>
            <div className="grid grid-cols-2 gap-3 pt-3">
              <button data-cta="login" onClick={() => goAuth("login")} className="text-[15px] font-semibold px-4 py-3 rounded-full border" style={{ color: INK, borderColor: LINE }}>
                {c.signIn}
              </button>
              <button data-cta="register" onClick={() => goAuth("register")} className="text-[15px] font-semibold px-4 py-3 rounded-full text-white" style={{ background: PRIMARY }}>
                {c.startFree}
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Hero */}
      <section data-day="" className="relative px-5 lg:px-8 pt-12 pb-16 lg:pt-20 lg:pb-24 overflow-hidden" style={{ opacity: "calc(1 - var(--pk, 0))" }}>
        <div className="relative max-w-6xl mx-auto grid lg:grid-cols-[1.05fr_0.95fr] gap-14 lg:gap-12 items-center">
          <Reveal>
            <div>
              <Eyebrow>{c.eyebrow}</Eyebrow>
              <h1
                ref={h1Ref}
                className="text-[44px] leading-[1.02] sm:text-[58px] lg:text-[56px] xl:text-[68px] font-bold tracking-[-0.03em] mb-6"
                style={{ color: INK, fontFamily: DISPLAY }}
              >
                {c.headline1}
                <br />
                <span className="relative inline-block" style={{ color: ACCENT }}>
                  {c.headlineEmphasis}
                  <svg
                    key={h1Run}
                    aria-hidden="true"
                    className="bf-marker absolute left-0 w-full"
                    style={{ bottom: "-0.2em", height: "0.2em" }}
                    viewBox="0 0 300 14"
                    preserveAspectRatio="none"
                    fill="none"
                  >
                    <path d="M3,9 C45,3 88,12 138,7 S236,3 297,8" stroke={ACCENT} strokeWidth="4" strokeLinecap="round" pathLength={1} />
                  </svg>
                </span>
              </h1>
              <p className="text-[17px] lg:text-[19px] leading-relaxed mb-8 max-w-[30rem]" style={{ color: INK_SOFT }}>
                {c.subhead}
              </p>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-4 mb-9">
                <button data-cta="register" onClick={() => goAuth("register")} className={`${primaryBtn} text-[16px] px-8 py-4`} style={{ background: PRIMARY }}>
                  {c.ctaPrimary}
                  <ArrowRight className="w-[18px] h-[18px] transition-transform group-hover:translate-x-0.5" />
                </button>
                <PlayButton small={x.playSmall} />
              </div>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2.5">
                {c.trustBullets.map((label, i) => {
                  const Icon = TRUST_BULLET_ICONS[i] ?? Check;
                  return (
                    <span key={label} className="inline-flex items-center gap-2 text-[14px] font-medium" style={{ color: INK_SOFT }}>
                      <Icon className="w-4 h-4" style={{ color: PRIMARY_LIGHT }} />
                      {label}
                    </span>
                  );
                })}
              </div>
            </div>
          </Reveal>
          <Reveal delay={150}>
            <HeroVisual copy={c} />
          </Reveal>
        </div>
      </section>

      {/* Problem -- flat dark band, profit statement receipt */}
      <section
        ref={storyRef}
        data-night="both"
        className={`px-5 lg:px-8 ${scrub ? "" : "py-20 lg:py-28 overflow-hidden"}`}
        style={{ background: nightBg, height: scrub ? "230vh" : undefined }}
      >
        <div className={scrub ? "sticky top-16 h-[calc(100vh-4rem)] flex items-center" : ""} style={{ opacity: "var(--no, 1)" }}>
          <div className="w-full max-w-6xl mx-auto grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <Reveal>
              <div>
                <h2 className="text-[34px] sm:text-[42px] lg:text-[52px] font-bold tracking-tight leading-[1.05] mb-6" style={{ color: "#FFFFFF", fontFamily: DISPLAY }}>
                  {c.problemTitle}
                  <br />
                  <span style={{ color: LAVENDER }}>{c.problemTitleEmphasis}</span>
                </h2>
                <p className="text-[16.5px] lg:text-[18px] leading-relaxed max-w-[30rem]" style={{ color: "rgba(255,255,255,0.74)" }}>
                  {c.problemDesc}
                </p>
                {scrub && (
                  <div aria-hidden="true" className="mt-9 h-[3px] w-44 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.16)" }}>
                    <div className="h-full rounded-full" style={{ width: `${(progress * 100).toFixed(1)}%`, background: progress > 0.86 ? ACCENT : LAVENDER }} />
                  </div>
                )}
              </div>
            </Reveal>
            <div ref={receiptRef} className="w-full max-w-[440px] mx-auto lg:ml-auto lg:mr-0" style={{ transform: "rotate(1.5deg)" }}>
              <ProfitStatement copy={c} progress={progress} stamp={c.showcaseProfit.title} />
            </div>
          </div>
        </div>
      </section>

      {/* Features -- the real app, not drawings of it. Four actual screens,
          each with one line under it. Side-scrolls on phones. */}
      <section id="features" data-day="" className="px-5 lg:px-8 pt-20 lg:pt-28 pb-16 lg:pb-24 scroll-mt-16" style={{ opacity: "calc(1 - var(--pk, 0))" }}>
        <div className="max-w-6xl mx-auto">
          <Reveal className="max-w-2xl mb-10 lg:mb-14">
            <h2 className={`${H2_CLASS} mb-4`} style={{ color: INK, fontFamily: DISPLAY }}>{c.featuresTitle}</h2>
            <p className="text-[17px] lg:text-[18px]" style={{ color: INK_SOFT }}>{c.featuresSub}</p>
          </Reveal>
          {features.map((f, i) => (
            <div key={f.title} className={`grid lg:grid-cols-2 gap-8 lg:gap-20 items-center ${i > 0 ? "mt-16 lg:mt-28" : ""}`}>
              <Reveal className={i % 2 === 1 ? "lg:order-2" : ""}>
                {/* Coloured panel behind each screenshot (deep purple / lavender
                    alternating) with faint ledger rules, so the lower page
                    is not a wall of white. */}
                <div
                  className="relative mx-auto w-full max-w-[460px] rounded-[30px] overflow-hidden px-8 pt-9 sm:px-12 lg:px-16 lg:pt-12"
                  style={{
                    background:
                      i % 2 === 0
                        ? `linear-gradient(155deg, ${PRIMARY} 0%, ${PRIMARY_LIGHT} 115%)`
                        : `linear-gradient(155deg, #E7DDFB 0%, ${LAVENDER} 115%)`,
                  }}
                >
                  <div
                    aria-hidden="true"
                    className="absolute inset-0"
                    style={{
                      backgroundImage: `repeating-linear-gradient(0deg, ${i % 2 === 0 ? "rgba(255,255,255,0.08)" : "rgba(59,30,109,0.08)"} 0 1px, transparent 1px 34px)`,
                    }}
                  />
                  <div
                    className="bf-shot relative aspect-[4/5] lg:aspect-[51/88] rounded-t-[22px] overflow-hidden"
                    style={{ background: "#F4F3F8", boxShadow: "0 -6px 40px -12px rgba(18,10,36,0.45)" }}
                  >
                    <f.Screen />
                  </div>
                </div>
              </Reveal>
              <Reveal delay={120}>
                <p className="text-[14px] sm:text-[15px] mb-3" style={{ color: PRIMARY_LIGHT, fontFamily: MONO }}>{f.quote}</p>
                <h3 className="text-[26px] sm:text-[32px] font-bold tracking-tight leading-[1.1] mb-4" style={{ color: INK, fontFamily: DISPLAY }}>{f.title}</h3>
                <p className="text-[16.5px] lg:text-[17.5px] leading-relaxed mb-6 max-w-[32rem]" style={{ color: INK_SOFT }}>{f.body}</p>
                <ul className="border-t max-w-[32rem]" style={{ borderColor: LINE }}>
                  {f.points.map((p) => (
                    <li key={p} className="flex items-start gap-3 py-3 border-b text-[15.5px] sm:text-[16px] font-medium" style={{ borderColor: LINE, color: INK }}>
                      <Check className="w-[18px] h-[18px] mt-0.5 shrink-0" style={{ color: ACCENT }} />
                      {p}
                    </li>
                  ))}
                </ul>
              </Reveal>
            </div>
          ))}
        </div>
      </section>

      {/* Reports -- a plain ruled list, like a ledger page */}
      <section
        id="reports"
        className="px-5 lg:px-8 py-16 lg:py-24 scroll-mt-16 border-y"
        style={{
          borderColor: LINE,
          backgroundColor: "#EFE8FB",
          backgroundImage: "repeating-linear-gradient(0deg, rgba(108,74,182,0.09) 0 1px, transparent 1px 34px)",
        }}
      >
        <div className="max-w-6xl mx-auto">
          <Reveal className="max-w-2xl mb-8 lg:mb-12">
            <h2 className={`${H2_CLASS} mb-4`} style={{ color: INK, fontFamily: DISPLAY }}>{c.reportsGridTitle}</h2>
            <p className="text-[17px] lg:text-[18px] leading-relaxed" style={{ color: INK_SOFT }}>{x.reportsSub}</p>
          </Reveal>
          <div ref={repRef} className="grid lg:grid-cols-2 gap-8 lg:gap-16 items-start">
            <div className="border-t-2" style={{ borderColor: INK }}>
              {c.reports.map((name, i) => {
                const active = i === rep;
                return (
                  <Reveal key={name} delay={i * 70} y={12}>
                    <button
                      type="button"
                      aria-expanded={active}
                      onClick={() => {
                        setRep(i);
                        setRepTouched(true);
                      }}
                      className="w-full text-left flex items-baseline gap-4 sm:gap-5 py-4 px-3 -mx-3 border-b transition-colors"
                      style={{ borderColor: "rgba(59,30,109,0.18)", background: active ? "#FFFFFF" : "transparent", width: "calc(100% + 1.5rem)" }}
                    >
                      <span className="text-[14px] w-6 shrink-0" style={{ color: active ? ACCENT : INK_SOFT, fontFamily: MONO }}>
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-[17px] sm:text-[18px] font-semibold" style={{ color: active ? PRIMARY : INK }}>{name}</span>
                        <span className="block text-[14.5px] mt-0.5" style={{ color: INK_SOFT }}>{t(REPORT_DESC_KEYS[i])}</span>
                      </span>
                      <span className="text-[13px]" style={{ color: INK_SOFT, fontFamily: MONO }}>PDF</span>
                    </button>
                    {active && (
                      <div className="lg:hidden py-5">
                        <ReportSample key={i} title={name} data={samples[i]} L={x.labels} />
                      </div>
                    )}
                  </Reveal>
                );
              })}
            </div>
            <div className="hidden lg:block sticky top-24" style={{ transform: "rotate(0.6deg)" }}>
              <ReportSample key={rep} title={c.reports[rep]} data={samples[rep]} L={x.labels} />
            </div>
          </div>
        </div>
      </section>

      {/* TikTok integration -- the real connect screen */}
      <section
        className="relative px-5 lg:px-8 pt-16 lg:pt-24 overflow-hidden"
        style={{ background: `linear-gradient(155deg, ${PRIMARY} 0%, ${PRIMARY_LIGHT} 130%)` }}
      >
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{ backgroundImage: "repeating-linear-gradient(0deg, rgba(255,255,255,0.06) 0 1px, transparent 1px 34px)" }}
        />
        <div className="relative max-w-6xl mx-auto grid lg:grid-cols-[1.1fr_0.9fr] gap-10 lg:gap-16 items-center">
          <Reveal className="pb-4 lg:pb-24">
            <h2 className={`${H2_CLASS} mb-4`} style={{ color: "#FFFFFF", fontFamily: DISPLAY }}>{c.tiktokTitle}</h2>
            <p className="text-[17px] lg:text-[18px] leading-relaxed mb-6 max-w-[34rem]" style={{ color: "rgba(255,255,255,0.8)" }}>{c.tiktokSub}</p>
            <p className="inline-flex items-center gap-2 text-[15px] font-semibold" style={{ color: "#86EFAC" }}>
              <span className="w-2 h-2 rounded-full bg-emerald-500 bossify-animate-status-dot" />
              {c.tiktokComingSoon}
            </p>
          </Reveal>
          <Reveal y={80} delay={100} className="w-full max-w-[340px] mx-auto lg:ml-auto lg:mr-6 self-end">
            <div
              className="rounded-t-[26px] overflow-hidden border border-b-0"
              style={{ borderColor: "rgba(255,255,255,0.25)", background: "#FCFBFE", aspectRatio: "4 / 5", boxShadow: "0 -10px 50px -16px rgba(18,10,36,0.6)" }}
            >
              <img data-pan="" src={heroTikTokScreenshot} alt="Bossify TikTok Shop connection screen" loading="lazy" className="w-full h-full object-cover object-top" />
            </div>
          </Reveal>
        </div>
      </section>

      {/* Not a TikTok seller -- Bossify also works as a plain shop ledger */}
      <section className="px-5 lg:px-8 py-16 lg:py-24 border-b" style={{ background: SURFACE, borderColor: LINE }}>
        <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-8 lg:gap-16 items-center">
          <Reveal>
            <h2 className={`${H2_CLASS} mb-4`} style={{ color: INK, fontFamily: DISPLAY }}>{x.ownTitle}</h2>
            <p className="text-[17px] lg:text-[18px] leading-relaxed mb-7 max-w-[32rem]" style={{ color: INK_SOFT }}>{x.ownBody}</p>
            <button data-cta="register" onClick={() => goAuth("register")} className={`${primaryBtn} text-[16px] px-8 py-4`} style={{ background: PRIMARY }}>
              {c.startFree}
              <ArrowRight className="w-[18px] h-[18px] transition-transform group-hover:translate-x-0.5" />
            </button>
          </Reveal>
          <ul className="border-t-2" style={{ borderColor: INK }}>
            {x.ownPoints.map((p, i) => (
              <Reveal key={p} delay={i * 80} y={12}>
                <li className="flex items-start gap-3 py-4 border-b text-[16.5px] sm:text-[17.5px] font-semibold list-none" style={{ borderColor: LINE, color: INK }}>
                  <Check className="w-5 h-5 mt-0.5 shrink-0" style={{ color: ACCENT }} />
                  {p}
                </li>
              </Reveal>
            ))}
          </ul>
        </div>
      </section>

      {/* Spreadsheet vs Bossify -- an actual table */}
      <section className="px-5 lg:px-8 py-20 lg:py-28">
        <div className="max-w-4xl mx-auto">
          <Reveal className="mb-10">
            <h2 className={`${H2_CLASS} mb-3`} style={{ color: INK, fontFamily: DISPLAY }}>{c.compareTitle}</h2>
            <p className="text-[17px] lg:text-[18px]" style={{ color: INK_SOFT }}>{c.compareSub}</p>
          </Reveal>
          <table ref={tableRef} className="w-full border-collapse text-left">
            <thead>
              <tr>
                <th className="w-1/2 py-3.5 pr-4 text-[14px] font-semibold border-b-2" style={{ color: INK_SOFT, borderColor: INK }}>
                  {c.compareSpreadsheetLabel}
                </th>
                <th className="w-1/2 py-3.5 px-4 sm:px-6 text-[14px] font-bold border-b-2" style={{ color: PRIMARY, borderColor: INK, background: "rgba(108,74,182,0.09)" }}>
                  {c.compareBossifyLabel}
                </th>
              </tr>
            </thead>
            <tbody>
              {c.compareSpreadsheetItems.map((item, i) => (
                <tr key={item} style={rowStyle(i)}>
                  <td className="py-4 pr-4 align-top text-[15.5px] sm:text-[16.5px] border-b" style={{ color: INK_SOFT, borderColor: LINE }}>
                    {item}
                  </td>
                  <td className="py-4 px-4 sm:px-6 align-top text-[15.5px] sm:text-[16.5px] font-semibold border-b" style={{ color: INK, borderColor: LINE, background: "rgba(108,74,182,0.09)" }}>
                    {c.compareBossifyItems[i] ?? ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Pricing -- three columns ruled like a ledger page. Prices come from
          the same constants as the in-app /plans screen. */}
      <section id="pricing" className="px-5 lg:px-8 py-20 lg:py-28 border-t scroll-mt-16" style={{ background: SURFACE, borderColor: LINE }}>
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 mb-10">
            <Reveal className="max-w-2xl">
              <h2 className={`${H2_CLASS} mb-3`} style={{ color: INK, fontFamily: DISPLAY }}>{x.pricingTitle}</h2>
              <p className="text-[17px] lg:text-[18px]" style={{ color: INK_SOFT }}>{x.pricingSub}</p>
            </Reveal>
            <div className="inline-flex self-start lg:self-auto p-1 rounded-full border" style={{ borderColor: LINE, background: BG }}>
              {(["monthly", "annual"] as const).map((b) => (
                <button
                  key={b}
                  type="button"
                  aria-pressed={billing === b}
                  onClick={() => setBilling(b)}
                  className="px-5 py-2 rounded-full text-[14.5px] font-semibold transition-colors"
                  style={{ background: billing === b ? PRIMARY : "transparent", color: billing === b ? "#FFFFFF" : INK_SOFT }}
                >
                  {b === "monthly" ? x.monthly : x.annual}
                </button>
              ))}
            </div>
          </div>
          <div className="grid lg:grid-cols-3 border-t-2" style={{ borderColor: INK, background: BG }}>
            {x.plans.map((p, i) => {
              const featured = i === 1;
              return (
                <Reveal key={p.name} delay={i * 110} className="h-full">
                  <div
                    className={`h-full flex flex-col p-6 sm:p-8 border-b border-x ${i > 0 ? "lg:border-l-0" : ""}`}
                    style={{ borderColor: LINE, background: featured ? "rgba(108,74,182,0.09)" : "transparent" }}
                  >
                    <div className="flex items-center justify-between gap-3 mb-1">
                      <h3 className="text-[21px] font-bold tracking-tight" style={{ color: featured ? PRIMARY : INK, fontFamily: DISPLAY }}>{p.name}</h3>
                      {featured && (
                        <span className="text-[10.5px] uppercase tracking-[0.12em] px-2 py-1 rounded" style={{ background: PRIMARY, color: "#FFFFFF", fontFamily: MONO }}>
                          {x.popular}
                        </span>
                      )}
                    </div>
                    <p className="text-[15px] mb-6" style={{ color: INK_SOFT }}>{p.tagline}</p>
                    <p className="mb-6" style={{ fontFamily: MONO }}>
                      <span key={billing} className="bf-paper-in inline-block text-[38px] sm:text-[42px] font-semibold tabular-nums leading-none" style={{ color: INK }}>
                        {planPrices[i]}
                      </span>
                      <span className="text-[14px] ml-2" style={{ color: INK_SOFT }}>
                        {i === 0 || billing === "monthly" ? x.perMonth : x.perYear}
                      </span>
                    </p>
                    <ul className="border-t mb-8 flex-1" style={{ borderColor: LINE }}>
                      {p.features.map((f) => (
                        <li key={f} className="flex items-start gap-2.5 py-2.5 border-b text-[15px]" style={{ borderColor: LINE, color: INK }}>
                          <Check className="w-4 h-4 mt-1 shrink-0" style={{ color: featured ? ACCENT : PRIMARY_LIGHT }} />
                          {f}
                        </li>
                      ))}
                    </ul>
                    <button
                      data-cta="register"
                      onClick={() => goAuth("register")}
                      className="w-full inline-flex items-center justify-center gap-2 text-[15.5px] font-semibold px-6 py-3.5 rounded-full border transition-transform hover:-translate-y-0.5"
                      style={{
                        background: featured ? PRIMARY : "transparent",
                        color: featured ? "#FFFFFF" : PRIMARY,
                        borderColor: PRIMARY,
                      }}
                    >
                      {c.startFree}
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </Reveal>
              );
            })}
          </div>
          <p className="text-[13.5px] mt-4" style={{ color: INK_SOFT, fontFamily: MONO }}>{x.pricingNote}</p>
        </div>
      </section>

      {/* Final CTA -- flat dark band; the three trust lines sit beside it
          as plain sentences rather than a separate icon row. */}
      <section data-night="in" className="px-5 lg:px-8 py-20 lg:py-28" style={{ background: nightBg }}>
        <div className="max-w-6xl mx-auto grid lg:grid-cols-[1.15fr_0.85fr] gap-12 lg:gap-16 items-end" style={{ opacity: "var(--no, 1)" }}>
          <Reveal>
            <h2 ref={finalRef} className="text-[40px] sm:text-[52px] lg:text-[68px] font-bold tracking-[-0.03em] leading-[1.02] mb-5" style={{ color: "#FFFFFF", fontFamily: DISPLAY }}>
              <span className={`bf-strike ${finalIn ? "bf-on" : ""}`}>{c.finalTitle1}</span>
              <br />
              <span className={`bf-after-strike ${finalIn ? "bf-on" : ""}`}>{c.finalTitle2}</span>
            </h2>
            <p className="text-[17px] lg:text-[19px] mb-8" style={{ color: "rgba(255,255,255,0.74)" }}>{c.finalSub}</p>
            <div className="flex flex-wrap items-center gap-4">
              <button
                data-cta="register"
                onClick={() => goAuth("register")}
                className="group inline-flex items-center gap-2 text-[16px] font-semibold px-9 py-4 rounded-full transition-transform hover:-translate-y-0.5"
                style={{ background: "#FFFFFF", color: PRIMARY }}
              >
                {c.finalCtaPrimary}
                <ArrowRight className="w-[18px] h-[18px] transition-transform group-hover:translate-x-0.5" />
              </button>
              <PlayButton small={x.playSmall} onDark />
            </div>
          </Reveal>
          <Reveal delay={150}>
            <p className="text-[14px] font-semibold mb-3" style={{ color: LAVENDER }}>{c.trustSectionTitle}</p>
            <ul className="border-t" style={{ borderColor: "rgba(255,255,255,0.18)" }}>
              {c.trustItems.map((item) => (
                <li key={item} className="py-3.5 text-[16.5px] border-b" style={{ color: "rgba(255,255,255,0.9)", borderColor: "rgba(255,255,255,0.18)" }}>
                  {item}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-5 lg:px-8 py-10 border-t" style={{ borderColor: LINE }}>
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-5">
          <div className="flex flex-col items-center sm:items-start gap-1.5">
            <div className="flex items-center gap-2">
              <img src={bossifyLogo} alt="Bossify" className="h-7 w-7 rounded-md object-cover" />
              <span className="text-[16px] font-bold" style={{ color: INK, fontFamily: DISPLAY }}>Bossify</span>
              <span className="text-[14px]" style={{ color: INK_SOFT }}>· {c.footerTag}</span>
            </div>
            <p className="text-[13.5px]" style={{ color: INK_SOFT }}>
              {lang === "zh"
                ? `由 ZH Studio 打造 · © ${new Date().getFullYear()}`
                : lang === "ms"
                  ? `Dikuasakan oleh ZH Studio · © ${new Date().getFullYear()}`
                  : `Powered by ZH Studio · © ${new Date().getFullYear()}`}
            </p>
          </div>
          <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[14px]" style={{ color: INK_SOFT }}>
            <a href="mailto:zhstudioapp@gmail.com" className="hover:underline">
              {lang === "zh" ? "联系我们" : lang === "ms" ? "Hubungi Kami" : "Contact"}
            </a>
            <Link to="/privacy-policy" className="hover:underline">{t("privacy_policy")}</Link>
            <Link to="/terms" className="hover:underline">{t("terms_conditions")}</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
