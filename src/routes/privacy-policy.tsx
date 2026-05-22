import { createFileRoute, Link } from "@tanstack/react-router";
import { useI18n } from "@/contexts/I18nContext";
import { Shield, ChevronLeft } from "lucide-react";

export const Route = createFileRoute("/privacy-policy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Bossify" },
      { name: "description", content: "Bossify Privacy Policy. Learn how we collect, use, store and protect your personal information." },
    ],
  }),
  component: PrivacyPolicyPage,
});

function PrivacyPolicyPage() {
  const { t } = useI18n();

  const sections = [
    { title: t("pp_s1_title"), body: t("pp_s1_body") },
    { title: t("pp_s2_title"), body: t("pp_s2_body") },
    { title: t("pp_s3_title"), body: t("pp_s3_body") },
    { title: t("pp_s4_title"), body: t("pp_s4_body") },
    { title: t("pp_s5_title"), body: t("pp_s5_body") },
    { title: t("pp_s6_title"), body: t("pp_s6_body") },
    { title: t("pp_s7_title"), body: t("pp_s7_body") },
    { title: t("pp_s8_title"), body: t("pp_s8_body") },
    { title: t("pp_s9_title"), body: t("pp_s9_body") },
    { title: t("pp_s10_title"), body: t("pp_s10_body") },
    { title: t("pp_s11_title"), body: t("pp_s11_body") },
  ];

  return (
    <div className="min-h-screen w-full" style={{ background: "#F4F3F8", fontFamily: "DM Sans, system-ui, sans-serif" }}>
      <div className="w-full max-w-[640px] mx-auto px-5 pt-8 pb-12">
        {/* Header */}
        <header className="flex items-center gap-3 mb-6">
          <Link to="/" className="h-10 w-10 rounded-full bg-white border border-[#E0DCF0] flex items-center justify-center shrink-0">
            <ChevronLeft className="h-5 w-5" style={{ color: "#1E1333" }} />
          </Link>
          <div className="flex items-center gap-2">
            <Shield className="h-6 w-6" style={{ color: "#7C3AED" }} />
            <h1 className="text-xl font-bold" style={{ color: "#1E1333" }}>{t("pp_title")}</h1>
          </div>
        </header>

        <p className="text-xs mb-6" style={{ color: "#6B7280" }}>{t("pp_updated")}</p>

        {/* Sections */}
        <div className="space-y-4">
          {sections.map((s, i) => (
            <section
              key={i}
              className="bg-white rounded-2xl p-5 shadow-[0_4px_20px_rgba(124,58,237,0.06)]"
            >
              <h2 className="text-sm font-bold mb-2" style={{ color: "#1E1333" }}>{s.title}</h2>
              <p className="text-sm leading-relaxed whitespace-pre-line" style={{ color: "#4B5563" }}>{s.body}</p>
            </section>
          ))}
        </div>

        {/* Footer */}
        <footer className="mt-10 text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <img src="/assets/bossify-logo.png" alt="Bossify" style={{ width: 28, height: 28 }} />
            <span className="text-sm font-bold" style={{ color: "#1E1333" }}>Bossify</span>
          </div>
          <p className="text-[11px]" style={{ color: "#9CA3AF" }}>© 2026 ZH Studio, Malaysia</p>
          <div className="flex items-center justify-center gap-3 mt-2">
            <Link to="/terms" className="text-[11px] underline" style={{ color: "#7C3AED" }}>{t("terms_conditions")}</Link>
            <span style={{ color: "#D1D5DB" }}>|</span>
            <Link to="/privacy-policy" className="text-[11px] underline" style={{ color: "#7C3AED" }}>{t("privacy_policy")}</Link>
          </div>
        </footer>
      </div>
    </div>
  );
}
