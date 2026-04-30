import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

export type Lang = "en" | "ms" | "zh";

const dict = {
  en: {
    continue: "Continue", back: "Back", save: "Save", cancel: "Cancel", delete: "Delete",
    edit: "Edit", search: "Search", loading: "Loading...", logout: "Log Out",
    login_title: "Welcome Back", login_subtitle: "Log in to your account",
    email: "Email", password: "Password", login_btn: "Log In",
    no_account: "Don't have an account?", register: "Sign Up",
    register_title: "Create Account", already_account: "Already have an account?",
    good_morning: "Good morning", good_afternoon: "Good afternoon", good_evening: "Good evening",
    welcome: "Welcome",
    todays_revenue: "Today's Revenue", new_orders: "New Orders", unpaid: "Unpaid",
    low_stock: "Low Stock", weekly_sales: "Weekly Sales (RM)", recent_orders: "Recent Orders",
    no_orders_yet: "No orders yet.",
    orders: "Orders", all: "All", paid: "Paid", pending: "Pending",
    today_count: "today", mark_paid: "Mark Paid ✓", no_orders_here: "No orders here.",
    new_order: "New Order", customer_name: "Customer Name", phone_number: "Phone Number",
    product: "Product", quantity: "Quantity", price: "Price (RM)", notes: "Notes (Optional)",
    save_order: "Save Order", save_whatsapp: "Save & Send WhatsApp Confirmation",
    payment_status: "Payment Status", saving: "Saving...",
    fill_details: "Fill in the details below", add_special: "Add special instructions...",
    inventory: "Inventory", items: "items", restock: "Restock", remove: "Remove",
    low_stock_alert: "items running low", restock_before: "Restock before you run out",
    search_products: "Search products...", left: "left", no_products: "No products found.",
    customers: "Customers", total: "total", search_customers: "Search customers...",
    orders_word: "orders", last: "Last", today_word: "Today", yesterday: "Yesterday",
    days_ago: "days ago", never: "Never", no_customers: "No customers found.",
    profile: "Profile", business_profile: "Business Profile", notifications: "Notifications",
    language: "Language", subscription: "Subscription Plan", whatsapp: "WhatsApp Integration",
    privacy: "Privacy & Security", member_since: "Member since",
    revenue: "Revenue", back_to_dashboard: "Back to dashboard",
    welcome_title: "Welcome to Bossify!",
    welcome_sub: "Let's set up your profile so we can personalise your experience.",
    takes_1min: "Takes 1 min", q7: "7 quick questions",
    get_started: "Let's Get Started", skip: "Skip for now",
    youre_set: "You're all set, Boss!", go_dashboard: "Go to Dashboard",
    choose_language: "Choose Your Language",
    slogan: "Manage your shop like a boss.",
    required_field: "This field is required",
    order_saved: "Order saved!",
    order_save_failed: "Failed to save order. Please try again.",
    order_updated: "Order updated",
    update_failed: "Failed to update",
    order_deleted: "Order deleted",
    delete_confirm: "Delete this order? This cannot be undone.",
    no_phone_for_wa: "No phone number saved for this customer",
    enter_phone_for_wa: "Please enter customer phone number to send WhatsApp",
    remind: "📲 Remind",
    order_details: "Order Details",
    edit_status: "Edit Status",
    delete_order: "Delete Order",
    pull_refresh: "Pull to refresh",
    no_orders_create: "No orders yet. Tap + to create your first order!",
    suggestions: "Suggestions",
    add_product: "Add Product", new_product: "New Product",
    product_name: "Product Name", initial_stock: "Initial Stock", unit_label: "Unit", max_stock_label: "Max Stock",
    save_product: "Save Product", product_added: "Product added!",
    no_products_create: "No products yet. Tap + to add your first product!",
    add_quantity: "Add quantity", remove_quantity: "Remove quantity",
    current_stock: "Current stock", confirm: "Confirm",
    stock_updated: "Stock updated!", cant_remove_more: "Cannot remove more than current stock",
    delete_product_confirm: "Delete this product? This cannot be undone.",
    product_deleted: "Product deleted",
    no_customers_create: "No customers yet. Customers are added automatically when you create orders!",
    customer_detail: "Customer Detail", total_orders: "Total Orders", total_spent: "Total Spent",
    order_history: "Order History", no_orders_found: "No orders found",
    send_whatsapp: "Send WhatsApp", edit_customer: "Edit Customer", delete_customer: "Delete Customer",
    delete_customer_confirm: "Delete this customer? Their orders will remain.",
    customer_deleted: "Customer deleted", customer_updated: "Customer updated",
    top_customers: "Top Customers", inventory_alert: "items low on stock — Check Inventory",
  },
  ms: {
    continue: "Teruskan", back: "Kembali", save: "Simpan", cancel: "Batal", delete: "Padam",
    edit: "Edit", search: "Cari", loading: "Memuatkan...", logout: "Log Keluar",
    login_title: "Selamat Kembali", login_subtitle: "Log masuk ke akaun anda",
    email: "E-mel", password: "Kata Laluan", login_btn: "Log Masuk",
    no_account: "Tiada akaun?", register: "Daftar",
    register_title: "Buat Akaun", already_account: "Sudah ada akaun?",
    good_morning: "Selamat pagi", good_afternoon: "Selamat tengahari", good_evening: "Selamat petang",
    welcome: "Selamat Datang",
    todays_revenue: "Hasil Hari Ini", new_orders: "Pesanan Baru", unpaid: "Belum Bayar",
    low_stock: "Stok Rendah", weekly_sales: "Jualan Mingguan (RM)", recent_orders: "Pesanan Terkini",
    no_orders_yet: "Tiada pesanan lagi.",
    orders: "Pesanan", all: "Semua", paid: "Bayar", pending: "Tertunda",
    today_count: "hari ini", mark_paid: "Tandakan Bayar ✓", no_orders_here: "Tiada pesanan.",
    new_order: "Pesanan Baru", customer_name: "Nama Pelanggan", phone_number: "Nombor Telefon",
    product: "Produk", quantity: "Kuantiti", price: "Harga (RM)", notes: "Nota (Pilihan)",
    save_order: "Simpan Pesanan", save_whatsapp: "Simpan & Hantar WhatsApp",
    payment_status: "Status Pembayaran", saving: "Menyimpan...",
    fill_details: "Isi butiran di bawah", add_special: "Tambah arahan khas...",
    inventory: "Inventori", items: "item", restock: "Tambah Stok", remove: "Kurangkan",
    low_stock_alert: "item stok rendah", restock_before: "Tambah stok sebelum habis",
    search_products: "Cari produk...", left: "tinggal", no_products: "Tiada produk dijumpai.",
    customers: "Pelanggan", total: "jumlah", search_customers: "Cari pelanggan...",
    orders_word: "pesanan", last: "Terakhir", today_word: "Hari ini", yesterday: "Semalam",
    days_ago: "hari lalu", never: "Tiada", no_customers: "Tiada pelanggan dijumpai.",
    profile: "Profil", business_profile: "Profil Perniagaan", notifications: "Pemberitahuan",
    language: "Bahasa", subscription: "Pelan Langganan", whatsapp: "Integrasi WhatsApp",
    privacy: "Privasi & Keselamatan", member_since: "Ahli sejak",
    revenue: "Hasil", back_to_dashboard: "Kembali ke dashboard",
    welcome_title: "Selamat Datang ke Bossify!",
    welcome_sub: "Mari sediakan profil anda untuk pengalaman yang lebih baik.",
    takes_1min: "1 minit sahaja", q7: "7 soalan ringkas",
    get_started: "Mari Mulakan", skip: "Langkau buat masa ini",
    youre_set: "Anda sudah bersedia, Boss!", go_dashboard: "Pergi ke Dashboard",
    choose_language: "Pilih Bahasa Anda",
    slogan: "Urus kedai anda seperti bos.",
    required_field: "Medan ini diperlukan",
    order_saved: "Pesanan disimpan!",
    order_save_failed: "Gagal menyimpan pesanan. Sila cuba lagi.",
    order_updated: "Pesanan dikemaskini",
    update_failed: "Gagal mengemaskini",
    order_deleted: "Pesanan dipadam",
    delete_confirm: "Padam pesanan ini? Tidak boleh diundur.",
    no_phone_for_wa: "Tiada nombor telefon disimpan untuk pelanggan ini",
    enter_phone_for_wa: "Sila masukkan nombor telefon pelanggan untuk hantar WhatsApp",
    remind: "📲 Ingatkan",
    order_details: "Butiran Pesanan",
    edit_status: "Edit Status",
    delete_order: "Padam Pesanan",
    pull_refresh: "Tarik untuk muat semula",
    no_orders_create: "Tiada pesanan lagi. Ketik + untuk mula!",
    suggestions: "Cadangan",
    add_product: "Tambah Produk", new_product: "Produk Baru",
    product_name: "Nama Produk", initial_stock: "Stok Awal", unit_label: "Unit", max_stock_label: "Stok Maksimum",
    save_product: "Simpan Produk", product_added: "Produk ditambah!",
    no_products_create: "Tiada produk lagi. Ketik + untuk tambah produk pertama!",
    add_quantity: "Tambah kuantiti", remove_quantity: "Kurangkan kuantiti",
    current_stock: "Stok semasa", confirm: "Sahkan",
    stock_updated: "Stok dikemaskini!", cant_remove_more: "Tidak boleh kurangkan lebih dari stok semasa",
    delete_product_confirm: "Padam produk ini? Tidak boleh diundur.",
    product_deleted: "Produk dipadam",
    no_customers_create: "Tiada pelanggan lagi. Pelanggan ditambah secara automatik apabila anda buat pesanan!",
    customer_detail: "Butiran Pelanggan", total_orders: "Jumlah Pesanan", total_spent: "Jumlah Belanja",
    order_history: "Sejarah Pesanan", no_orders_found: "Tiada pesanan dijumpai",
    send_whatsapp: "Hantar WhatsApp", edit_customer: "Edit Pelanggan", delete_customer: "Padam Pelanggan",
    delete_customer_confirm: "Padam pelanggan ini? Pesanan mereka akan kekal.",
    customer_deleted: "Pelanggan dipadam", customer_updated: "Pelanggan dikemaskini",
    top_customers: "Pelanggan Teratas", inventory_alert: "item stok rendah — Semak Inventori",
  },
  zh: {
    continue: "继续", back: "返回", save: "保存", cancel: "取消", delete: "删除",
    edit: "编辑", search: "搜索", loading: "加载中...", logout: "登出",
    login_title: "欢迎回来", login_subtitle: "登录您的账号",
    email: "电子邮件", password: "密码", login_btn: "登录",
    no_account: "没有账号？", register: "注册",
    register_title: "创建账号", already_account: "已有账号？",
    good_morning: "早上好", good_afternoon: "下午好", good_evening: "晚上好",
    welcome: "欢迎",
    todays_revenue: "今日收入", new_orders: "新订单", unpaid: "未付款",
    low_stock: "库存不足", weekly_sales: "本周销售 (RM)", recent_orders: "最近订单",
    no_orders_yet: "暂无订单。",
    orders: "订单", all: "全部", paid: "已付款", pending: "待处理",
    today_count: "今日", mark_paid: "标记已付 ✓", no_orders_here: "暂无订单。",
    new_order: "新订单", customer_name: "客户姓名", phone_number: "电话号码",
    product: "产品", quantity: "数量", price: "价格 (RM)", notes: "备注（可选）",
    save_order: "保存订单", save_whatsapp: "保存并发送WhatsApp",
    payment_status: "付款状态", saving: "保存中...",
    fill_details: "请填写以下详情", add_special: "添加特殊说明...",
    inventory: "库存", items: "件", restock: "补货", remove: "减少",
    low_stock_alert: "件库存不足", restock_before: "请尽快补货",
    search_products: "搜索产品...", left: "剩余", no_products: "未找到产品。",
    customers: "客户", total: "总数", search_customers: "搜索客户...",
    orders_word: "订单", last: "最后", today_word: "今天", yesterday: "昨天",
    days_ago: "天前", never: "从未", no_customers: "未找到客户。",
    profile: "个人资料", business_profile: "商业资料", notifications: "通知",
    language: "语言", subscription: "订阅计划", whatsapp: "WhatsApp集成",
    privacy: "隐私与安全", member_since: "注册于",
    revenue: "收入", back_to_dashboard: "返回主页",
    welcome_title: "欢迎使用 Bossify！",
    welcome_sub: "让我们设置您的个人资料，为您提供个性化体验。",
    takes_1min: "只需1分钟", q7: "7个简单问题",
    get_started: "开始吧", skip: "暂时跳过",
    youre_set: "一切准备就绪，老板！", go_dashboard: "前往主页",
    choose_language: "选择您的语言",
    slogan: "像老板一样管理您的店铺。",
    required_field: "此字段为必填项",
    order_saved: "订单已保存！",
    order_save_failed: "保存订单失败，请重试。",
    order_updated: "订单已更新",
    update_failed: "更新失败",
    order_deleted: "订单已删除",
    delete_confirm: "删除此订单？此操作无法撤销。",
    no_phone_for_wa: "此客户没有保存的电话号码",
    enter_phone_for_wa: "请输入客户电话号码以发送WhatsApp",
    remind: "📲 提醒",
    order_details: "订单详情",
    edit_status: "修改状态",
    delete_order: "删除订单",
    pull_refresh: "下拉刷新",
    no_orders_create: "暂无订单。点击 + 创建您的第一个订单！",
    suggestions: "建议",
    add_product: "添加产品", new_product: "新产品",
    product_name: "产品名称", initial_stock: "初始库存", unit_label: "单位", max_stock_label: "最大库存",
    save_product: "保存产品", product_added: "产品已添加！",
    no_products_create: "暂无产品。点击 + 添加您的第一个产品！",
    add_quantity: "添加数量", remove_quantity: "减少数量",
    current_stock: "当前库存", confirm: "确认",
    stock_updated: "库存已更新！", cant_remove_more: "不能减少超过当前库存",
    delete_product_confirm: "删除此产品？此操作无法撤销。",
    product_deleted: "产品已删除",
    no_customers_create: "暂无客户。当您创建订单时，客户会自动添加！",
    customer_detail: "客户详情", total_orders: "总订单", total_spent: "总消费",
    order_history: "订单历史", no_orders_found: "未找到订单",
    send_whatsapp: "发送 WhatsApp", edit_customer: "编辑客户", delete_customer: "删除客户",
    delete_customer_confirm: "删除此客户？他们的订单将保留。",
    customer_deleted: "客户已删除", customer_updated: "客户已更新",
    top_customers: "顶级客户", inventory_alert: "件库存不足 — 查看库存",
  },
} as const;

export type TKey = keyof typeof dict.en;

type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: (k: TKey) => string };
const I18nContext = createContext<Ctx | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    if (typeof window === "undefined") return "en";
    return (localStorage.getItem("bossify_lang") as Lang) || "en";
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("bossify_lang", lang);
    }
  }, [lang]);

  const setLang = (l: Lang) => {
    setLangState(l);
    if (typeof window !== "undefined") localStorage.setItem("bossify_lang", l);
    // best-effort sync to supabase
    (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id;
      if (uid) {
        await supabase.from("user_preferences").upsert(
          { user_id: uid, language: l, updated_at: new Date().toISOString() },
          { onConflict: "user_id" }
        );
      }
    })();
  };

  const t = (k: TKey) => (dict[lang] as any)[k] ?? (dict.en as any)[k] ?? k;

  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
