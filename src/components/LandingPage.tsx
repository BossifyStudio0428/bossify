import { useState, useRef, useEffect, type ReactNode, type RefObject } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Menu,
  X,
  ArrowRight,
  ArrowDown,
  Check,
  Zap,
  CreditCard,
  Smartphone,
} from "lucide-react";
import { useI18n } from "@/contexts/I18nContext";
import bossifyLogo from "@/assets/bossify-logo.png";
import heroOverviewScreenshot from "@/assets/hero-dashboard-screenshot.jpg";
import heroOrdersScreenshot from "@/assets/hero-orders-screenshot.jpg";
import heroCostBreakdownScreenshot from "@/assets/hero-cost-breakdown-screenshot.jpg";
import heroCustomerScreenshot from "@/assets/hero-customer-screenshot.jpg";
import heroPricingScreenshot from "@/assets/hero-pricing-screenshot.jpg";
import heroReportsScreenshot from "@/assets/hero-reports-screenshot.jpg";
import heroInventoryScreenshot from "@/assets/hero-inventory-screenshot.jpg";
import heroTikTokScreenshot from "@/assets/hero-tiktok-screenshot.jpg";

// Real app screenshots cycled through in the hero mockup -- no fabricated
// UI, every slide is an actual screen from the live app. Kept to the 4
// most important screens (profit overview, orders, real cost breakdown,
// reports) so the hero loop stays tight and fast rather than cycling
// through everything the app does.
const HERO_SCREENSHOTS: { src: string; alt: string }[] = [
  { src: heroOverviewScreenshot, alt: "Bossify dashboard showing real profit, revenue, costs and profit breakdown for this month" },
  { src: heroOrdersScreenshot, alt: "Bossify Orders page with TikTok Shop sync and 1-tap Send Receipt" },
  { src: heroCostBreakdownScreenshot, alt: "Bossify Cost Breakdown page with cost comparison and cost share charts" },
  { src: heroReportsScreenshot, alt: "Bossify Reports page listing 7 exportable PDF business reports" },
];
// heroCustomerScreenshot / heroInventoryScreenshot / heroTikTokScreenshot /
// heroPricingScreenshot are imported above but not used in the hero loop
// right now -- kept as-is in case other marketing material wants them.

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
        transform: visible ? "translateY(0)" : `translateY(${y}px)`,
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
  const n = HERO_SCREENSHOTS.length;

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

      <div className="relative ml-auto mr-3 sm:mr-14 w-[206px] sm:w-[268px]">
        <div
          className="rounded-[32px] sm:rounded-[38px] p-[7px] sm:p-[9px]"
          style={{ background: "#120A24", boxShadow: "0 40px 70px -28px rgba(18,10,36,0.75)" }}
        >
          <div
            className="relative rounded-[25px] sm:rounded-[29px] overflow-hidden"
            style={{ aspectRatio: "663 / 1460", background: "#F4F3F8" }}
          >
            {HERO_SCREENSHOTS.map((shot, i) => (
              <img
                key={shot.src}
                src={shot.src}
                alt={shot.alt}
                aria-hidden={i !== index}
                className="absolute inset-0 w-full h-full object-contain object-top"
                style={{ opacity: i === index ? 1 : 0, transition: "opacity 0.7s ease" }}
              />
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
        {HERO_SCREENSHOTS.map((shot, i) => (
          <button
            key={shot.src}
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

  const features = [
    { ...c.showcaseProfit, src: heroOverviewScreenshot },
    { ...c.showcaseInventory, src: heroInventoryScreenshot },
    { ...c.showcaseReports, src: heroReportsScreenshot },
    { ...c.showcaseOrders, src: heroOrdersScreenshot },
  ];

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
    <div ref={rootRef} className="relative isolate" style={{ backgroundColor: BG, color: INK, fontFamily: BODY }}>
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
      <section className="relative px-5 lg:px-8 pt-12 pb-16 lg:pt-20 lg:pb-24 overflow-hidden">
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
                <a href="#features" className="group inline-flex items-center gap-1.5 text-[16px] font-semibold" style={{ color: PRIMARY }}>
                  {c.navFeatures}
                  <ArrowDown className="w-4 h-4 transition-transform group-hover:translate-y-0.5" />
                </a>
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
        className={`px-5 lg:px-8 ${scrub ? "" : "py-20 lg:py-28 overflow-hidden"}`}
        style={{ background: NIGHT, height: scrub ? "230vh" : undefined }}
      >
        <div className={scrub ? "sticky top-16 h-[calc(100vh-4rem)] flex items-center" : ""}>
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
      <section id="features" className="px-5 lg:px-8 pt-20 lg:pt-28 pb-16 lg:pb-24 scroll-mt-16">
        <div className="max-w-6xl mx-auto">
          <Reveal className="max-w-2xl mb-10 lg:mb-14">
            <h2 className={`${H2_CLASS} mb-4`} style={{ color: INK, fontFamily: DISPLAY }}>{c.featuresTitle}</h2>
            <p className="text-[17px] lg:text-[18px]" style={{ color: INK_SOFT }}>{c.featuresSub}</p>
          </Reveal>
          <div
            className="flex gap-4 overflow-x-auto snap-x snap-mandatory scroll-px-5 -mx-5 px-5 pb-2 lg:grid lg:grid-cols-4 lg:gap-7 lg:overflow-visible lg:mx-0 lg:px-0 lg:pb-0"
            style={{ scrollbarWidth: "none" }}
          >
            {features.map((f, i) => (
              <Reveal key={f.title} delay={i * 90} className="shrink-0 w-[66%] sm:w-[38%] lg:w-auto snap-start">
                <div className="bf-shot rounded-[20px] overflow-hidden border mb-5" style={{ borderColor: LINE, background: "#F4F3F8", aspectRatio: "51 / 100" }}>
                  <img data-pan="" src={f.src} alt={f.title} loading="lazy" className="w-full h-full object-cover object-top" />
                </div>
                <h3 className="text-[19px] font-bold tracking-tight mb-1" style={{ color: INK, fontFamily: DISPLAY }}>{f.title}</h3>
                <p className="text-[15.5px] leading-relaxed" style={{ color: INK_SOFT }}>{f.desc}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Reports -- a plain ruled list, like a ledger page */}
      <section id="reports" className="px-5 lg:px-8 py-16 lg:py-24 scroll-mt-16">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-[0.8fr_1.2fr] gap-8 lg:gap-16 items-start">
          <Reveal>
            <h2 className={`${H2_CLASS} mb-4`} style={{ color: INK, fontFamily: DISPLAY }}>{c.reportsGridTitle}</h2>
            <p className="text-[17px] lg:text-[18px] leading-relaxed" style={{ color: INK_SOFT }}>{c.showcaseReports.desc}</p>
          </Reveal>
          <div className="border-t-2" style={{ borderColor: INK }}>
            {c.reports.map((name, i) => (
              <Reveal key={name} delay={i * 70} y={12}>
              <div className="flex items-baseline gap-5 py-4 border-b" style={{ borderColor: LINE }}>
                <span className="text-[14px] w-6 shrink-0" style={{ color: INK_SOFT, fontFamily: MONO }}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="text-[17px] sm:text-[18px] font-semibold flex-1" style={{ color: INK }}>{name}</span>
                <span className="text-[13px]" style={{ color: INK_SOFT, fontFamily: MONO }}>PDF</span>
              </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* TikTok integration -- the real connect screen */}
      <section className="px-5 lg:px-8 pt-16 lg:pt-24 border-y overflow-hidden" style={{ background: SURFACE, borderColor: LINE }}>
        <div className="max-w-6xl mx-auto grid lg:grid-cols-[1.1fr_0.9fr] gap-10 lg:gap-16 items-center">
          <Reveal className="pb-4 lg:pb-24">
            <h2 className={`${H2_CLASS} mb-4`} style={{ color: INK, fontFamily: DISPLAY }}>{c.tiktokTitle}</h2>
            <p className="text-[17px] lg:text-[18px] leading-relaxed mb-6 max-w-[34rem]" style={{ color: INK_SOFT }}>{c.tiktokSub}</p>
            <p className="inline-flex items-center gap-2 text-[15px] font-semibold" style={{ color: GREEN }}>
              <span className="w-2 h-2 rounded-full bg-emerald-500 bossify-animate-status-dot" />
              {c.tiktokComingSoon}
            </p>
          </Reveal>
          <Reveal y={80} delay={100} className="w-full max-w-[340px] mx-auto lg:ml-auto lg:mr-6 self-end">
            <div
              className="rounded-t-[26px] overflow-hidden border border-b-0"
              style={{ borderColor: LINE, background: "#FCFBFE", aspectRatio: "4 / 5", boxShadow: "0 -10px 50px -20px rgba(59,30,109,0.35)" }}
            >
              <img data-pan="" src={heroTikTokScreenshot} alt="Bossify TikTok Shop connection screen" loading="lazy" className="w-full h-full object-cover object-top" />
            </div>
          </Reveal>
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

      {/* Final CTA -- flat dark band; the three trust lines sit beside it
          as plain sentences rather than a separate icon row. */}
      <section id="pricing" className="px-5 lg:px-8 py-20 lg:py-28 scroll-mt-16" style={{ background: NIGHT }}>
        <div className="max-w-6xl mx-auto grid lg:grid-cols-[1.15fr_0.85fr] gap-12 lg:gap-16 items-end">
          <Reveal>
            <h2 ref={finalRef} className="text-[40px] sm:text-[52px] lg:text-[68px] font-bold tracking-[-0.03em] leading-[1.02] mb-5" style={{ color: "#FFFFFF", fontFamily: DISPLAY }}>
              <span className={`bf-strike ${finalIn ? "bf-on" : ""}`}>{c.finalTitle1}</span>
              <br />
              <span className={`bf-after-strike ${finalIn ? "bf-on" : ""}`}>{c.finalTitle2}</span>
            </h2>
            <p className="text-[17px] lg:text-[19px] mb-8" style={{ color: "rgba(255,255,255,0.74)" }}>{c.finalSub}</p>
            <button
              data-cta="register"
              onClick={() => goAuth("register")}
              className="group inline-flex items-center gap-2 text-[16px] font-semibold px-9 py-4 rounded-full transition-transform hover:-translate-y-0.5"
              style={{ background: "#FFFFFF", color: PRIMARY }}
            >
              {c.finalCtaPrimary}
              <ArrowRight className="w-[18px] h-[18px] transition-transform group-hover:translate-x-0.5" />
            </button>
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
