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
  Store,
  Package,
  Receipt,
  Users,
  RotateCcw,
  TriangleAlert,
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
  const [activeSection, setActiveSection] = useState<string>("orders");

  const pageTitle = tr(lang, "使用教学", "Panduan Penggunaan", "Guide");
  const pageSubtitle = tr(
    lang,
    "订单、TikTok、产品库存、成本、客户、退款、报告、提醒，一步步说明",
    "Langkah demi langkah: pesanan, TikTok, produk & stok, kos, pelanggan, bayaran balik, laporan dan amaran",
    "Step by step: orders, TikTok, products & stock, costs, customers, refunds, reports and alerts",
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
          "TikTok Shop 自动同步：连接 TikTok Shop 后，TikTok 的订单会自动进来，不用手动输入。详情看下面「TikTok Shop 连接与同步」。",
          "Segerak automatik TikTok Shop: Selepas sambung TikTok Shop, pesanan TikTok masuk sendiri tanpa input manual. Lihat \"Sambungan & segerak TikTok Shop\" di bawah.",
          "Automatic TikTok Shop sync: once TikTok Shop is connected, TikTok orders come in by themselves. See \"TikTok Shop connection & sync\" below.",
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

    {
      key: "tiktok",
      icon: Store,
      title: tr(lang, "TikTok Shop 连接与同步", "Sambungan & segerak TikTok Shop", "TikTok Shop connection & sync"),
      summary: tr(
        lang,
        "连接一次，商品、订单、买家自动进来",
        "Sambung sekali, produk, pesanan dan pembeli masuk sendiri",
        "Connect once; products, orders and buyers come in by themselves",
      ),
      steps: [
        tr(lang,
          "连接：到「个人资料」页点「连接 TikTok Shop」，登录 TikTok 卖家账号并同意授权。连接好后，产品页和订单页上方会出现 TikTok 同步按钮和「上次同步」时间。",
          "Sambung: Di halaman Profil, tekan \"Sambung TikTok Shop\", log masuk akaun penjual TikTok dan benarkan akses. Selepas itu, butang segerak TikTok dan masa \"segerak terakhir\" muncul di halaman Produk dan Pesanan.",
          "Connect: on the Profile page tap \"Connect TikTok Shop\", sign in to your TikTok seller account and allow access. After that, a TikTok sync button and the last-sync time appear on the Products and Orders pages."),
        tr(lang,
          "商品：在产品页点「同步 TikTok 商品」。TikTok 上的商品会进来，每个规格（尺寸、颜色）各一行，标着黑色「TikTok」。成本 TikTok 不会给，要自己填。",
          "Produk: Di halaman Produk tekan \"Segerak produk TikTok\". Produk TikTok masuk, setiap varian (saiz, warna) satu baris, bertanda \"TikTok\" hitam. Kos tidak diberi oleh TikTok — isi sendiri.",
          "Products: on the Products page tap \"Sync TikTok products\". Your TikTok products come in, one row per variant (size, colour), marked with a black \"TikTok\" badge. TikTok doesn't share cost — fill that in yourself."),
        tr(lang,
          "库存怎么跟 TikTok：同步时只把 TikTok 那边库存「变了多少」加到 Bossify，不会整个覆盖。所以你在别的渠道（线下、WhatsApp）卖掉后手动扣的库存会保留。",
          "Stok mengikut TikTok: Segerak hanya menambah PERUBAHAN stok di TikTok, bukan menulis ganti. Jadi stok yang anda tolak sendiri untuk jualan saluran lain (kedai, WhatsApp) kekal.",
          "How stock follows TikTok: a sync only applies how much TikTok's stock CHANGED, it never overwrites. So stock you took off by hand for sales elsewhere (shop, WhatsApp) stays taken off."),
        tr(lang,
          "订单：在订单页点「同步 TikTok 订单」（打开页面时也会自动同步）。订单会带上真实的金额、成本和平台费；TikTok 结算后，估算的平台费会自动换成真实数字。",
          "Pesanan: Di halaman Pesanan tekan \"Segerak pesanan TikTok\" (ia juga segerak sendiri bila halaman dibuka). Pesanan datang dengan jumlah, kos dan yuran platform sebenar; selepas TikTok selesaikan bayaran, anggaran yuran ditukar kepada angka sebenar.",
          "Orders: on the Orders page tap \"Sync TikTok orders\" (it also syncs when the page opens). Orders come with real amounts, costs and platform fees; once TikTok settles, an estimated fee is replaced with the real one."),
        tr(lang,
          "订单对不上商品：如果 TikTok 订单里的商品在 Bossify 找不到，这张订单会先停着，「提醒」页会列出来。先同步 TikTok 商品，或把产品名字改成和 TikTok 一样，下次同步就会完成。",
          "Pesanan tak sepadan: Jika produk dalam pesanan TikTok tiada di Bossify, pesanan itu ditahan dan disenaraikan di halaman Amaran. Segerak produk TikTok dahulu, atau tukar nama produk supaya sama dengan TikTok — segerak seterusnya akan selesaikannya.",
          "Orders that don't match: if a TikTok order has a product Bossify can't find, that order waits and is listed on the Alerts page. Sync TikTok products first, or rename the product to match TikTok; the next sync finishes it."),
        tr(lang,
          "买家：每个 TikTok 买家会自动变成一个客户，标着「TikTok」。TikTok 给了收件人名字、电话、地址的话会一起存；没给的话名字显示成「TikTok #xxxxxx」，你可以自己改名。",
          "Pembeli: Setiap pembeli TikTok menjadi pelanggan secara automatik, bertanda \"TikTok\". Jika TikTok beri nama, telefon dan alamat penerima, ia disimpan; jika tidak, nama dipapar sebagai \"TikTok #xxxxxx\" dan anda boleh tukar.",
          "Buyers: every TikTok buyer becomes a customer automatically, marked \"TikTok\". If TikTok shares the recipient's name, phone and address they're saved too; if not, the name shows as \"TikTok #xxxxxx\" and you can rename it."),
      ],
    },
    {
      key: "products",
      icon: Package,
      title: tr(lang, "产品与库存", "Produk & stok", "Products & stock"),
      summary: tr(lang, "加产品、补货、库存记录、库存怎么自动变", "Tambah produk, tambah stok, sejarah stok, bagaimana stok bergerak sendiri", "Adding products, restocking, stock history, how stock moves by itself"),
      steps: [
        tr(lang,
          "加产品：产品页点「+ 新增产品」，填名字、售价、库存；成本和包装费也最好一起填，利润才算得准。",
          "Tambah produk: Di halaman Produk tekan \"+ Tambah produk\", isi nama, harga dan stok; isi kos dan kos bungkusan sekali supaya untung tepat.",
          "Add a product: on the Products page tap \"+ Add product\" and fill in name, price and stock; add the cost and packaging cost too so profit is right."),
        tr(lang,
          "来源：每个产品都标着「TikTok」或「手动添加」。上方可以按来源筛选。",
          "Sumber: Setiap produk bertanda \"TikTok\" atau \"Tambah manual\". Anda boleh tapis ikut sumber di atas.",
          "Source: every product is marked \"TikTok\" or \"Manual\". Filter by source at the top."),
        tr(lang,
          "补货 / 减少：卡片下方的「+ 补货」「– 减少」改库存。两部手机同时改也不会互相盖掉。",
          "Tambah / kurang: Guna \"+ Tambah stok\" dan \"– Kurang\" di bawah kad. Dua telefon mengubah serentak pun tidak akan saling tindih.",
          "Restock / remove: use \"+ Restock\" and \"– Remove\" under each card. Two phones changing it at the same time won't overwrite each other."),
        tr(lang,
          "库存自动变：订单变成「已付款 / 已发货 / 已送达」时自动扣库存；改回「未付款」或「已取消」、或删除已付款订单时，会自动加回去。改已付款订单的商品或数量，库存也会跟着调整。",
          "Stok bergerak sendiri: Stok ditolak bila pesanan jadi \"Sudah bayar / Dihantar / Diterima\"; ia ditambah semula bila pesanan ditukar ke \"Belum bayar\" atau \"Dibatalkan\", atau pesanan berbayar dipadam. Edit produk atau kuantiti pesanan berbayar pun akan laraskan stok.",
          "Stock moves by itself: it goes down when an order becomes Paid / Shipped / Delivered, and comes back when the order goes back to Unpaid or Cancelled, or a paid order is deleted. Editing a paid order's product or quantity adjusts stock too."),
        tr(lang,
          "库存记录：点进任何产品 → 「查看变更记录」，可以看到每一次变动是谁改的：卖出、手动调整、收货、退货、TikTok 同步。",
          "Sejarah stok: Buka mana-mana produk → \"Lihat sejarah perubahan\" untuk lihat setiap perubahan: jualan, ubah manual, terima stok, pulangan, segerak TikTok.",
          "Stock history: open any product → \"View change history\" to see every change and why: a sale, a manual change, a receipt, a return or a TikTok sync."),
        tr(lang,
          "库存低的提醒数量可以在通知设定里改。",
          "Had amaran stok rendah boleh ditukar dalam tetapan notifikasi.",
          "The low-stock warning level can be changed in notification settings."),
      ],
    },
    {
      key: "costs",
      icon: Receipt,
      title: tr(lang, "成本与费用", "Kos & perbelanjaan", "Costs & expenses"),
      summary: tr(lang, "最快的填成本方法、进货成本、营业费用", "Cara paling cepat isi kos, kos belian, perbelanjaan operasi", "Fastest way to fill costs, purchase cost, operating expenses"),
      steps: [
        tr(lang,
          "最快填成本：产品页直接点产品卡上「售价 / 成本 / 利润」那一排，就能改成本和包装费，下面马上显示每件利润。没填成本的会是浅黄色，写着「+ 填成本」。",
          "Cara paling cepat: Di halaman Produk tekan baris \"Harga / Kos / Untung\" pada kad produk untuk ubah kos dan kos bungkusan; untung seunit dipapar terus. Yang belum ada kos berwarna kuning dengan \"+ Isi kos\".",
          "Fastest: on the Products page tap the \"Price / Cost / Profit\" row on a card to set cost and packaging; profit per unit shows right away. Products with no cost are yellow with \"+ Add cost\"."),
        tr(lang,
          "「记一笔成本」页最上面也会列出所有还没填成本的商品，可以一个个直接填。",
          "Halaman \"Rekod Kos\" juga menyenaraikan semua produk tanpa kos di bahagian atas — isi terus satu demi satu.",
          "The \"Add a Cost\" page also lists every product with no cost at the top — fill them in one by one."),
        tr(lang,
          "进了新一批货、价钱不一样：用「记一笔成本」→「商品进货成本」，填数量和这批的总价。系统会按数量算加权平均成本，并加库存。",
          "Stok baharu dengan harga berbeza: Guna \"Rekod Kos\" → \"Kos produk\", isi kuantiti dan jumlah harga kumpulan itu. Kos purata berwajaran dikira dan stok ditambah.",
          "A new batch at a different price: use \"Add a Cost\" → \"Product purchase cost\" with the quantity and the batch total. Bossify works out the weighted-average cost and adds the stock."),
        tr(lang,
          "营业费用：广告费、订阅费、AI 费用等用「记一笔成本」→「营业费用」记下。这些会从净利润扣掉，但不算进每个产品的成本。",
          "Perbelanjaan operasi: Iklan, langganan, kos AI dan lain-lain direkod di \"Rekod Kos\" → \"Perbelanjaan operasi\". Ia ditolak dari untung bersih, tetapi bukan dari kos setiap produk.",
          "Operating expenses: ads, subscriptions, AI fees and so on go under \"Add a Cost\" → \"Operating expense\". They come off net profit, not off each product's cost."),
      ],
    },
    {
      key: "customers",
      icon: Users,
      title: tr(lang, "客户", "Pelanggan", "Customers"),
      summary: tr(lang, "客户怎么来、快速选客户、TikTok 买家", "Dari mana pelanggan datang, pilih pelanggan cepat, pembeli TikTok", "Where customers come from, picking one fast, TikTok buyers"),
      steps: [
        tr(lang,
          "客户会自动建立：手动订单、下单表单的订单、TikTok 订单都会自动把客户加进客户页。",
          "Pelanggan dicipta sendiri: pesanan manual, pesanan borang dan pesanan TikTok semuanya menambah pelanggan ke halaman Pelanggan.",
          "Customers are created for you: manual orders, order-form orders and TikTok orders all add the customer to the Customers page."),
        tr(lang,
          "新建订单时打客户名字的前几个字（或电话的几个数字），下面会出现已有客户；点一下，名字和电话自动填好。",
          "Semasa buat pesanan baharu, taip beberapa huruf nama (atau nombor telefon) — pelanggan sedia ada akan muncul; tekan sekali dan nama serta telefon diisi.",
          "When making a new order, type the first letters of a name (or a few phone digits) and existing customers appear; tap one to fill in name and phone."),
        tr(lang,
          "TikTok 买家标着黑色「TikTok」，可以看到 TikTok 买家编号（点一下复制）和地址。上方可以按「TikTok / 自己的客户」筛选。",
          "Pembeli TikTok bertanda \"TikTok\" hitam, dengan ID pembeli TikTok (tekan untuk salin) dan alamat. Tapis \"TikTok / Pelanggan sendiri\" di atas.",
          "TikTok buyers are marked with a black \"TikTok\" badge and show their TikTok buyer ID (tap to copy) and address. Filter \"TikTok / Own customers\" at the top."),
        tr(lang,
          "删除客户只会删掉客户资料和跟进记录，订单会保留。TikTok 客户不能删除（下次同步会再出现），但可以改名和加备注。",
          "Memadam pelanggan hanya membuang rekod pelanggan dan susulan; pesanan kekal. Pelanggan TikTok tidak boleh dipadam (akan muncul semula semasa segerak), tetapi boleh ditukar nama dan diberi nota.",
          "Deleting a customer only removes the customer record and follow-ups; orders stay. TikTok customers can't be deleted (the next sync would bring them back) but you can rename them and add notes."),
      ],
    },
    {
      key: "refunds",
      icon: RotateCcw,
      title: tr(lang, "退款与退货", "Bayaran balik & pulangan", "Refunds & returns"),
      summary: tr(lang, "怎样记退款，库存和利润怎么变", "Cara rekod bayaran balik, kesan pada stok dan untung", "How to record a refund and what it does to stock and profit"),
      steps: [
        tr(lang,
          "打开订单 → 「记录退款 / 退货」，选情况：发货前取消、退款不退货、退货能再卖、退货坏了，或只退一部分金额。",
          "Buka pesanan → \"Rekod bayaran balik / pemulangan\", pilih keadaan: batal sebelum hantar, bayar balik tanpa pulangan, pulangan boleh dijual semula, pulangan rosak, atau bayar balik sebahagian.",
          "Open the order → \"Record refund / return\" and pick what happened: cancelled before shipping, refund without return, returned and resellable, returned damaged, or a partial refund."),
        tr(lang,
          "勾选要退的商品和数量。能再卖的会自动加回库存；坏了的不加。",
          "Pilih produk dan kuantiti. Yang boleh dijual semula akan ditambah ke stok; yang rosak tidak.",
          "Tick the items and quantities. Resellable returns go back into stock; damaged ones don't."),
        tr(lang,
          "同一件商品不能重复退，已经全部退过的会变灰。部分退款最多只能退到订单剩下的金额。",
          "Barang yang sama tidak boleh dipulangkan dua kali; yang sudah dipulangkan sepenuhnya menjadi kelabu. Bayaran balik sebahagian dihadkan kepada baki pesanan.",
          "The same item can't be refunded twice; fully refunded items are greyed out. A partial refund can't exceed what's left on the order."),
        tr(lang,
          "退款会记在退款当天，那个时段的营业额和利润会扣掉，报表也一样；原本那张订单的数字不会被改。",
          "Bayaran balik direkod pada hari ia berlaku; jualan dan untung tempoh itu ditolak, begitu juga laporan. Angka pesanan asal tidak diubah.",
          "A refund is dated on the day it happened; that period's sales and profit go down, and so do the reports. The original order's numbers aren't changed."),
      ],
    },
    {
      key: "alerts",
      icon: TriangleAlert,
      title: tr(lang, "提醒页面", "Halaman Amaran", "The Alerts page"),
      summary: tr(lang, "一个地方看完所有要处理的事", "Semua yang perlu diurus di satu tempat", "Everything that needs you, in one place"),
      steps: [
        tr(lang,
          "在「更多」→「提醒」打开。最上面写着有几件事要处理，红色的比较急。",
          "Buka di Lagi → Amaran. Bahagian atas menunjukkan berapa perkara perlu diurus; yang merah lebih segera.",
          "Open it from More → Alerts. The top shows how many things need you; red ones are more urgent."),
        tr(lang,
          "会列出：TikTok 连接或订单配对问题、断货、亏本商品（算上成本、包装和平台费）、超过 1 天未付款的订单、库存低、还没填成本、TikTok 已下架的商品。",
          "Ia menyenaraikan: masalah sambungan atau padanan pesanan TikTok, kehabisan stok, produk rugi (selepas kos, bungkusan dan yuran platform), pesanan belum bayar lebih sehari, stok rendah, tiada kos, dan produk yang dinyahsenarai di TikTok.",
          "It lists: TikTok connection or order-matching problems, out of stock, products losing money (after cost, packaging and platform fee), orders unpaid for over a day, low stock, missing costs, and products delisted on TikTok."),
        tr(lang,
          "每一行右边都有按钮直接处理：补货、改成本、查看订单。",
          "Setiap baris ada butang di sebelah kanan untuk terus bertindak: tambah stok, ubah kos, lihat pesanan.",
          "Each row has a button on the right to deal with it straight away: restock, edit cost, view the order."),
      ],
    },
  ];

  const active = sections.find((s) => s.key === activeSection) ?? sections[0];

  return (
    <div className="px-4 pt-4 pb-24 space-y-5 lg:max-w-6xl lg:mx-auto lg:px-8 lg:pt-8 lg:pb-10">
      {/* Desktop: a proper help-center layout — topic list on the left,
          the selected topic's full steps always shown on the right (no
          accordion), so it reads like a knowledge-base article instead
          of a stack of mobile cards. */}
      <div className="hidden lg:block space-y-1 mb-2">
        <h1 className="text-2xl font-bold text-foreground">{pageTitle}</h1>
        <p className="text-sm text-muted-foreground">{pageSubtitle}</p>
      </div>
      <div className="hidden lg:grid lg:grid-cols-[280px_1fr] lg:gap-6 lg:items-start">
        <nav className="rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] p-2 space-y-1">
          {sections.map((s) => {
            const isActive = activeSection === s.key;
            return (
              <button
                key={s.key}
                onClick={() => setActiveSection(s.key)}
                className={`w-full flex items-start gap-3 px-3 py-3 rounded-xl text-left transition ${
                  isActive ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted"
                }`}
              >
                <span className={`h-9 w-9 shrink-0 rounded-lg flex items-center justify-center ${isActive ? "bg-white/15" : "bg-primary/10 text-primary"}`}>
                  <s.icon className="h-4.5 w-4.5" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-bold">{s.title}</span>
                  <span className={`block text-xs mt-0.5 truncate ${isActive ? "text-primary-foreground/80" : "text-muted-foreground"}`}>{s.summary}</span>
                </span>
              </button>
            );
          })}
        </nav>

        <div className="rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] p-6 space-y-5">
          <div className="flex items-center gap-3">
            <span className="h-11 w-11 shrink-0 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <active.icon className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-lg font-bold text-foreground">{active.title}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">{active.summary}</p>
            </div>
          </div>
          <ol className="space-y-4">
            {active.steps.map((step, i) => (
              <li key={i} className="flex gap-3 text-sm text-foreground leading-relaxed">
                <span className="shrink-0 h-6 w-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center mt-0.5">
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <div className="lg:hidden space-y-5">
      <div className="flex items-center gap-2">
        <Link to="/more" className="h-9 w-9 rounded-full flex items-center justify-center text-muted-foreground active:scale-95 transition-transform">
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
                className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:scale-[0.99] transition-transform"
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
    </div>
  );
}