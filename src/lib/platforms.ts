import type { Lang } from "@/contexts/I18nContext";

export type PlatformKey = "tiktok" | "shopee" | "lazada" | "instagram" | "facebook";

export type PlatformConfig = {
  key: PlatformKey;
  emoji: string;
  name: string; // brand name, same across locales
  description: Record<Lang, string>;
  benefits: Record<Lang, string[]>;
  connectLabel: Record<Lang, string>;
  comingSoonMsg: Record<Lang, string>;
};

export const PLATFORMS: PlatformConfig[] = [
  {
    key: "tiktok",
    emoji: "📱",
    name: "TikTok Shop",
    description: {
      en: "Connect your TikTok Shop account to automatically sync all orders to Bossify.",
      ms: "Sambungkan akaun TikTok Shop anda untuk menyegerakkan pesanan secara automatik ke Bossify.",
      zh: "连接您的 TikTok Shop 账号，自动同步所有订单到 Bossify。",
    },
    benefits: {
      en: [
        "TikTok orders recorded automatically",
        "Receive notification for every new order",
        "Manage all platforms in one app",
      ],
      ms: [
        "Pesanan TikTok direkod secara automatik",
        "Terima notifikasi untuk setiap pesanan baru",
        "Urus semua platform dalam satu aplikasi",
      ],
      zh: [
        "TikTok 订单自动记录",
        "每个新订单都收到通知",
        "在一个 app 管理所有平台",
      ],
    },
    connectLabel: {
      en: "Connect TikTok Shop",
      ms: "Sambung TikTok Shop",
      zh: "连接 TikTok Shop",
    },
    comingSoonMsg: {
      en: "TikTok Shop integration is currently pending API approval. We will notify you when it becomes available!",
      ms: "Integrasi TikTok Shop sedang dalam proses kelulusan API. Kami akan memberitahu anda apabila ia tersedia!",
      zh: "TikTok Shop 集成正在等待 API 审批。功能开放时我们将通知您！",
    },
  },
  {
    key: "shopee",
    emoji: "🛒",
    name: "Shopee",
    description: {
      en: "Connect your Shopee account to automatically sync all orders to Bossify.",
      ms: "Sambungkan akaun Shopee anda untuk menyegerakkan pesanan secara automatik ke Bossify.",
      zh: "连接您的 Shopee 账号，自动同步所有订单到 Bossify。",
    },
    benefits: {
      en: [
        "Auto sync Shopee orders",
        "Real-time inventory update",
        "Manage Shopee & other platforms together",
      ],
      ms: [
        "Penyegerakan automatik pesanan Shopee",
        "Kemas kini inventori secara masa nyata",
        "Urus Shopee & platform lain bersama",
      ],
      zh: [
        "自动同步 Shopee 订单",
        "实时库存更新",
        "一起管理 Shopee 与其他平台",
      ],
    },
    connectLabel: {
      en: "Connect Shopee",
      ms: "Sambung Shopee",
      zh: "连接 Shopee",
    },
    comingSoonMsg: {
      en: "Shopee integration is currently pending API approval. We will notify you when it becomes available!",
      ms: "Integrasi Shopee sedang dalam proses kelulusan API. Kami akan memberitahu anda apabila ia tersedia!",
      zh: "Shopee 集成正在等待 API 审批。功能开放时我们将通知您！",
    },
  },
  {
    key: "lazada",
    emoji: "🛍️",
    name: "Lazada",
    description: {
      en: "Connect your Lazada account to automatically sync all orders to Bossify.",
      ms: "Sambungkan akaun Lazada anda untuk menyegerakkan pesanan secara automatik ke Bossify.",
      zh: "连接您的 Lazada 账号，自动同步所有订单到 Bossify。",
    },
    benefits: {
      en: [
        "Auto sync Lazada orders",
        "Track all Lazada payments",
        "One app for all platforms",
      ],
      ms: [
        "Penyegerakan automatik pesanan Lazada",
        "Jejaki semua bayaran Lazada",
        "Satu aplikasi untuk semua platform",
      ],
      zh: [
        "自动同步 Lazada 订单",
        "追踪所有 Lazada 付款",
        "一个 app 管理所有平台",
      ],
    },
    connectLabel: {
      en: "Connect Lazada",
      ms: "Sambung Lazada",
      zh: "连接 Lazada",
    },
    comingSoonMsg: {
      en: "Lazada integration is currently pending API approval. We will notify you when it becomes available!",
      ms: "Integrasi Lazada sedang dalam proses kelulusan API. Kami akan memberitahu anda apabila ia tersedia!",
      zh: "Lazada 集成正在等待 API 审批。功能开放时我们将通知您！",
    },
  },
  {
    key: "instagram",
    emoji: "📸",
    name: "Instagram Shop",
    description: {
      en: "Connect your Instagram Shop account to automatically sync all orders to Bossify.",
      ms: "Sambungkan akaun Instagram Shop anda untuk menyegerakkan pesanan secara automatik ke Bossify.",
      zh: "连接您的 Instagram Shop 账号，自动同步所有订单到 Bossify。",
    },
    benefits: {
      en: [
        "Auto sync Instagram Shop orders",
        "Track customer enquiries",
        "Manage DM orders automatically",
      ],
      ms: [
        "Penyegerakan automatik pesanan Instagram Shop",
        "Jejaki pertanyaan pelanggan",
        "Urus pesanan DM secara automatik",
      ],
      zh: [
        "自动同步 Instagram Shop 订单",
        "追踪客户咨询",
        "自动管理 DM 订单",
      ],
    },
    connectLabel: {
      en: "Connect Instagram Shop",
      ms: "Sambung Instagram Shop",
      zh: "连接 Instagram Shop",
    },
    comingSoonMsg: {
      en: "Instagram Shop integration is currently pending API approval. We will notify you when it becomes available!",
      ms: "Integrasi Instagram Shop sedang dalam proses kelulusan API. Kami akan memberitahu anda apabila ia tersedia!",
      zh: "Instagram Shop 集成正在等待 API 审批。功能开放时我们将通知您！",
    },
  },
  {
    key: "facebook",
    emoji: "📘",
    name: "Facebook Shop",
    description: {
      en: "Connect your Facebook Shop account to automatically sync all orders to Bossify.",
      ms: "Sambungkan akaun Facebook Shop anda untuk menyegerakkan pesanan secara automatik ke Bossify.",
      zh: "连接您的 Facebook Shop 账号，自动同步所有订单到 Bossify。",
    },
    benefits: {
      en: [
        "Auto sync Facebook Shop orders",
        "Track Facebook marketplace orders",
        "Manage all social commerce in one place",
      ],
      ms: [
        "Penyegerakan automatik pesanan Facebook Shop",
        "Jejaki pesanan Facebook Marketplace",
        "Urus semua perdagangan sosial di satu tempat",
      ],
      zh: [
        "自动同步 Facebook Shop 订单",
        "追踪 Facebook Marketplace 订单",
        "在一个地方管理所有社交电商",
      ],
    },
    connectLabel: {
      en: "Connect Facebook Shop",
      ms: "Sambung Facebook Shop",
      zh: "连接 Facebook Shop",
    },
    comingSoonMsg: {
      en: "Facebook Shop integration is currently pending API approval. We will notify you when it becomes available!",
      ms: "Integrasi Facebook Shop sedang dalam proses kelulusan API. Kami akan memberitahu anda apabila ia tersedia!",
      zh: "Facebook Shop 集成正在等待 API 审批。功能开放时我们将通知您！",
    },
  },
];

export const getPlatform = (key: string): PlatformConfig | undefined =>
  PLATFORMS.find((p) => p.key === key);