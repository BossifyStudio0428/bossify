import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ChevronLeft,
  ChevronDown,
  ClipboardList,
  Settings2,
  FileDown,
  Bell,
  TrendingUp,
} from "lucide-react";
import { useI18n } from "@/contexts/I18nContext";

// Standalone step-by-step guide/help page, linked from More. Content is
// long-form instructional prose rather than short UI labels, so — like
// campaign.tsx's AI-suggestions copy — it's kept as inline per-language
// text in this file instead of adding ~150 new keys to the 275KB
// I18nContext.tsx. Uses the same `lang === "zh" ? ... : lang === "ms" ? ...
// : ...` convention already established there.

export const Route = createFileRoute("/guide")({ component: GuidePage });

function tr(lang: string, zh: string, ms: string, en: string) {
  return lang === "zh" ? zh : lang === "ms" ? ms : en;
}

type Section = {
  key: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  summary: string;
  steps: string[];
};

function GuidePage() {
  const { lang } = useI18n();
  const [open, setOpen] = useState<string | null>("orders");

  const pageTitle = tr(lang, "使用教学", "Panduan Penggunaan", "Guide");
  const pageSubtitle = tr(
    lang,
    "关于新增订单、下载报告、通知设定、查看利润的步骤说明",
    "Langkah untuk tambah pesanan, muat turun laporan, tetapan notifikasi dan lihat untung",
    "Step-by-step help for adding orders, downloading reports, notifications, and viewing profit",
  );

  const sections: Section[] = [
    {
      key: "orders",
      icon: ClipboardList,
      title: tr(lang, "怎样新增订单", "Cara tambah pesanan", "Ways to add an order"),
      summary: tr(
        lang,
        "手动输入、WhatsApp 订单确认、批量导入 Excel/CSV",
        "Input manual, pengesahan WhatsApp, import Excel/CSV pukal",
        "Manual entry, WhatsApp confirmation, bulk Excel/CSV import",
      ),
      steps: [
        tr(
          lang,
          "手动输入：在「订单」页面点击下方「+ 新增销售」，填写客人姓名、产品、数量、价格后保存。",
          "Input manual: Di halaman Pesanan, tekan \"+ Jualan baharu\" di bawah, isi nama pelanggan, produk, kuantiti dan harga, kemudian simpan.",
          "Manual entry: On the Orders page, tap \"+ New sale\" at the bottom, fill in customer name, product, quantity and price, then save.",
        ),
        tr(
          lang,
          "WhatsApp 订单确认：保存订单时点击「保存并 WhatsApp」，系统会用你设定好的消息模板自动发给客人确认订单。模板可在 更多 → WhatsApp 模板 自行修改。",
          "Pengesahan WhatsApp: Semasa simpan pesanan, tekan \"Simpan & WhatsApp\" — mesej pengesahan akan dihantar kepada pelanggan menggunakan templat anda sendiri. Boleh ubah templat di Lagi → Templat WhatsApp.",
          "WhatsApp confirmation: When saving an order, tap \"Save & WhatsApp\" and Bossify sends your customer an order confirmation using your own message template. Edit the template under More → WhatsApp Templates.",
        ),
        tr(
          lang,
          "批量导入：在「订单」页面右上角点击上传图标，上传 Excel/CSV 文件即可一次导入多笔订单，适合从 TikTok Shop 后台导出的订单记录。",
          "Import pukal: Di halaman Pesanan, tekan ikon muat naik di atas kanan, muat naik fail Excel/CSV untuk import banyak pesanan sekaligus — sesuai untuk rekod yang dieksport dari TikTok Shop.",
          "Bulk import: On the Orders page, tap the upload icon (top right) and upload an Excel/CSV file to import many orders at once — handy for records exported from TikTok Shop.",
        ),
        tr(
          lang,
          "TikTok Shop 自动同步：这功能还在开发中，之后上线后订单会自动同步进来，不需要手动输入或导入。",
          "Segerak automatik TikTok Shop: Ciri ini masih dalam pembangunan — apabila tersedia, pesanan akan disegerakkan secara automatik tanpa perlu input manual.",
          "Automatic TikTok Shop sync: this feature is still in development — once live, orders will sync in automatically with no manual entry or import needed.",
        ),
      ],
    },
    {
      key: "manage",
      icon: Settings2,
      title: tr(lang, "怎样管理订单状态", "Cara urus status pesanan", "Managing your orders"),
      summary: tr(
        lang,
        "标记已付款、编辑/删除订单、低库存与亏本提醒",
        "Tanda telah bayar, edit/padam pesanan, amaran stok rendah & rugi",
        "Mark as paid, edit/delete orders, low-stock & loss alerts",
      ),
      steps: [
        tr(
          lang,
          "点击订单卡片上的「标记已付款」可快速把订单改成「已付款」，或点开订单，用状态下拉选单在 已付款/未付款/待处理 之间切换。",
          "Tekan \"Tanda telah bayar\" pada kad pesanan untuk tukar status kepada Dibayar dengan cepat, atau buka pesanan dan guna menu status untuk tukar antara Dibayar/Belum bayar/Belum selesai.",
          "Tap \"Mark Paid\" on an order card to quickly change its status to Paid, or open the order and use the status dropdown to switch between Paid/Unpaid/Pending.",
        ),
        tr(
          lang,
          "点开任何一张订单卡片即可修改客人资料、产品、数量、价格，或直接删除该订单。",
          "Tekan mana-mana kad pesanan untuk edit maklumat pelanggan, produk, kuantiti, harga, atau padam pesanan tersebut.",
          "Tap any order card to edit customer details, product, quantity, price — or delete that order entirely.",
        ),
        tr(
          lang,
          "「提醒」页面（More → 提醒）会自动列出快缺货的产品和目前在亏本卖的产品，方便你提早处理，不必自己一直去翻库存。",
          "Halaman Amaran (Lagi → Amaran) secara automatik senaraikan produk yang stok rendah dan produk yang sedang dijual rugi, supaya anda boleh bertindak awal tanpa perlu semak stok setiap masa.",
          "The Alerts page (More → Alerts) automatically lists products running low on stock and products currently selling at a loss, so you can act early without manually checking inventory.",
        ),
      ],
    },
    {
      key: "reports",
      icon: FileDown,
      title: tr(lang, "怎样下载报告", "Cara muat turun laporan", "Downloading reports"),
      summary: tr(
        lang,
        "7 种 PDF 报告，可选日期范围",
        "7 jenis laporan PDF, boleh pilih julat tarikh",
        "7 PDF report types, with a date range picker",
      ),
      steps: [
        tr(
          lang,
          "去 More → 报告，选择日期范围（今天/本周/本月/自定义），再选想要的报告类型：销售、利润、库存、财务损益表、客户对账单、供应商、订单核对。",
          "Pergi ke Lagi → Laporan, pilih julat tarikh (hari ini/minggu ini/bulan ini/tersuai), kemudian pilih jenis laporan: Jualan, Untung, Stok, Untung Rugi Kewangan, Penyata Pelanggan, Pembekal, Penyesuaian Pesanan.",
          "Go to More → Reports, choose a date range (today/this week/this month/custom), then pick the report type: Sales, Profit, Stock, Financial P&L, Customer Statement, Supplier, or Order Reconciliation.",
        ),
        tr(
          lang,
          "点击报告卡片上的「打开 PDF」即可生成并打开该报告，可另存或分享给会计/客户。",
          "Tekan \"Buka PDF\" pada kad laporan untuk jana dan buka laporan tersebut — boleh simpan atau kongsi kepada akauntan/pelanggan.",
          "Tap \"Open PDF\" on a report card to generate and open it — you can save or share it with your accountant or a customer.",
        ),
        tr(
          lang,
          "PDF 导出是订阅用户的功能，如果没有有效订阅，点击后会提示升级。",
          "Eksport PDF adalah ciri untuk pengguna langganan — jika tiada langganan aktif, anda akan digesa untuk naik taraf.",
          "PDF export requires an active subscription — if you don't have one, you'll be prompted to upgrade.",
        ),
      ],
    },
    {
      key: "notifications",
      icon: Bell,
      title: tr(lang, "通知怎么用", "Cara guna notifikasi", "Using notifications"),
      summary: tr(
        lang,
        "动态提醒、通知设定、低库存/亏本/早晚总结提醒",
        "Notis aktiviti, tetapan notifikasi, amaran stok rendah/rugi/ringkasan harian",
        "Activity feed, notification settings, low-stock/loss/daily-summary alerts",
      ),
      steps: [
        tr(
          lang,
          "首页右上角的铃铛图标会显示未读订单动态数量，点进去（More → 通知）可以看到所有订单进来、状态变化等动态记录。",
          "Ikon loceng di atas kanan halaman utama tunjuk bilangan notis belum dibaca. Tekan untuk masuk (Lagi → Notifikasi) dan lihat semua aktiviti seperti pesanan baru dan perubahan status.",
          "The bell icon on the home page shows how many unread order-activity notifications you have. Tap it (More → Notifications) to see all activity — new orders coming in, status changes, and so on.",
        ),
        tr(
          lang,
          "在「通知设定」（More → 通知 → 齿轮/设定）可以开关：未付款提醒、低库存提醒、亏本产品提醒、每日早晚生意总结、达标提醒，也可以设定安静时段不打扰。",
          "Di \"Tetapan Notifikasi\" (Lagi → Notifikasi → tetapan), anda boleh hidup/matikan: amaran belum bayar, amaran stok rendah, amaran produk rugi, ringkasan perniagaan pagi/petang, notis pencapaian sasaran, dan tetapkan waktu senyap.",
          "In Notification Settings (More → Notifications → settings), you can turn on/off: unpaid-order reminders, low-stock alerts, loss-making product alerts, morning/evening business summaries, milestone alerts, and set quiet hours.",
        ),
      ],
    },
    {
      key: "profit",
      icon: TrendingUp,
      title: tr(lang, "哪里看利润", "Di mana nak tengok untung", "Where to see your profit"),
      summary: tr(
        lang,
        "首页卡片、底部导航「利润」标签、成本细分/单品利润/成本健康",
        "Kad halaman utama, tab \"Untung\" di navigasi bawah, pecahan kos/untung produk",
        "Home dashboard card, bottom-nav \"Profit\" tab, cost/profit breakdowns",
      ),
      steps: [
        tr(
          lang,
          "首页最上面的卡片会直接显示当前时间段的净利润（已扣除营业成本，不是毛销售额）。",
          "Kad paling atas di halaman utama terus tunjuk untung bersih untuk tempoh semasa (selepas tolak kos operasi, bukan jualan kasar).",
          "The card at the top of the home page shows your net profit for the current period directly — after operating costs, not just gross sales.",
        ),
        tr(
          lang,
          "底部导航第 4 个标签「利润」会直接带你去「成本细分」页面，可以看营收、成本、各项费用怎么组成利润。",
          "Tab ke-4 di navigasi bawah \"Untung\" akan bawa anda terus ke halaman Pecahan Kos, untuk lihat bagaimana hasil, kos dan perbelanjaan membentuk untung anda.",
          "The 4th tab in the bottom nav, \"Profit\", takes you straight to the Cost Breakdown page, showing how revenue, cost and expenses add up to your profit.",
        ),
        tr(
          lang,
          "More → 利润与成本 底下还有「单品利润」（每个产品各自赚多少）和「成本健康」（整体成本结构是否健康）可以细看。",
          "Di bawah Lagi → Untung & Kos, ada juga \"Untung Produk\" (untung setiap produk) dan \"Kesihatan Kos\" (sama ada struktur kos anda sihat) untuk semakan lanjut.",
          "Under More → Profit & Cost, there's also Product Profit (how much each product earns) and Cost Health (whether your overall cost structure is healthy) for a closer look.",
        ),
      ],
    },
  ];

  return (
    <div className="px-4 pt-4 pb-24 space-y-5">
      <div className="flex items-center gap-2">
        <Link to="/more" className="h-9 w-9 rounded-full flex items-center justify-center text-muted-foreground active:scale-95">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-lg font-bold text-foreground">{pageTitle}</h1>
      </div>
      <p className="text-xs text-muted-foreground -mt-3 ml-11">{pageSubtitle}</p>

      <div className="space-y-3">
        {sections.map((s) => {
          const isOpen = open === s.key;
          return (
            <div key={s.key} className="rounded-2xl border border-border/60 bg-card shadow-[var(--shadow-card)] overflow-hidden">
              <button
                onClick={() => setOpen(isOpen ? null : s.key)}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:scale-[0.99]"
              >
                <span className="h-10 w-10 shrink-0 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                  <s.icon className="h-5 w-5" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-bold text-foreground">{s.title}</span>
                  <span className="block text-xs text-muted-foreground mt-0.5">{s.summary}</span>
                </span>
                <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
              </button>

              {isOpen && (
                <div className="px-4 pb-4">
                  <ol className="space-y-2.5">
                    {s.steps.map((step, i) => (
                      <li key={i} className="flex gap-2.5 text-sm text-foreground leading-relaxed">
                        <span className="shrink-0 h-5 w-5 rounded-full bg-primary/10 text-primary text-[11px] font-bold flex items-center justify-center mt-0.5">
                          {i + 1}
                        </span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}