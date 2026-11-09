import { createFileRoute, Link } from "@tanstack/react-router";
import { Trash2, ChevronLeft, Mail, Clock, AlertCircle } from "lucide-react";

export const Route = createFileRoute("/data-deletion")({
  head: () => ({
    meta: [
      { title: "Data Deletion Request — Bossify" },
      { name: "description", content: "Request deletion of your Bossify account and personal data." },
    ],
  }),
  component: DataDeletionPage,
});

function DataDeletionPage() {
  return (
    <div className="min-h-screen w-full" style={{ background: "#FCFBFE", fontFamily: "DM Sans, system-ui, sans-serif" }}>
      <div className="w-full max-w-[640px] mx-auto px-5 pt-8 pb-12">
        {/* Header */}
        <header className="flex items-center gap-3 mb-8">
          <Link to="/" className="h-10 w-10 rounded-full bg-[#F7F5FA] border border-[#E4DEF0] flex items-center justify-center shrink-0">
            <ChevronLeft className="h-5 w-5" style={{ color: "#1A1225" }} />
          </Link>
          <div className="flex items-center gap-2">
            <Trash2 className="h-6 w-6" style={{ color: "#8B5CF6" }} />
            <h1 className="text-xl font-bold" style={{ color: "#1A1225" }}>Data Deletion Request</h1>
          </div>
        </header>

        {/* Hero Card */}
        <section className="bg-[#F7F5FA] rounded-2xl p-6 shadow-[0_4px_20px_rgba(124,58,237,0.06)] mb-5">
          <h2 className="text-lg font-bold mb-3" style={{ color: "#1A1225" }}>
            Delete Your Bossify Account &amp; Data
          </h2>
          <p className="text-sm leading-relaxed" style={{ color: "#5B5270" }}>
            You can request deletion of your Bossify account and all associated personal data at any time. 
            We take your privacy seriously and will process your request promptly after verification.
          </p>
        </section>

        {/* How to Request */}
        <section className="bg-[#F7F5FA] rounded-2xl p-6 shadow-[0_4px_20px_rgba(124,58,237,0.06)] mb-5">
          <div className="flex items-center gap-2 mb-4">
            <Mail className="h-5 w-5" style={{ color: "#8B5CF6" }} />
            <h3 className="text-sm font-bold" style={{ color: "#1A1225" }}>How to Request Deletion</h3>
          </div>
          <p className="text-sm leading-relaxed mb-4" style={{ color: "#5B5270" }}>
            Please send an email to us with the subject line <strong>"Bossify Data Deletion Request"</strong>.
          </p>

          <a
            href="mailto:zhstudioapp@gmail.com?subject=Bossify%20Data%20Deletion%20Request"
            className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl font-semibold text-sm text-white transition-colors hover:opacity-90"
            style={{ background: "#8B5CF6" }}
          >
            <Mail className="h-4 w-4" />
            zhstudioapp@gmail.com
          </a>
        </section>

        {/* Required Info */}
        <section className="bg-[#F7F5FA] rounded-2xl p-6 shadow-[0_4px_20px_rgba(124,58,237,0.06)] mb-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertCircle className="h-5 w-5" style={{ color: "#8B5CF6" }} />
            <h3 className="text-sm font-bold" style={{ color: "#1A1225" }}>Please Include</h3>
          </div>
          <ul className="space-y-3">
            {[
              "Your registered email address",
              "Your account name / business name",
              "Reason for deletion (optional)",
            ].map((item, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="mt-0.5 h-5 w-5 rounded-full bg-[#EFEAFA] flex items-center justify-center shrink-0 text-xs font-bold" style={{ color: "#8B5CF6" }}>
                  {i + 1}
                </span>
                <span className="text-sm" style={{ color: "#5B5270" }}>{item}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Timeline */}
        <section className="bg-[#F7F5FA] rounded-2xl p-6 shadow-[0_4px_20px_rgba(124,58,237,0.06)] mb-5">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="h-5 w-5" style={{ color: "#8B5CF6" }} />
            <h3 className="text-sm font-bold" style={{ color: "#1A1225" }}>Processing Timeline</h3>
          </div>
          <p className="text-sm leading-relaxed" style={{ color: "#5B5270" }}>
            After we verify your identity, all associated personal data will be permanently deleted within 
            <strong style={{ color: "#1A1225" }}> 30 days</strong>. 
            Some information may be retained where required for legal or compliance purposes.
          </p>
        </section>

        {/* Contact */}
        <section className="bg-[#F7F5FA] rounded-2xl p-6 shadow-[0_4px_20px_rgba(124,58,237,0.06)] mb-8">
          <h3 className="text-sm font-bold mb-3" style={{ color: "#1A1225" }}>Questions?</h3>
          <p className="text-sm leading-relaxed mb-3" style={{ color: "#5B5270" }}>
            If you have any questions about data deletion, feel free to contact us.
          </p>
          <a
            href="mailto:zhstudioapp@gmail.com"
            className="text-sm font-medium underline"
            style={{ color: "#8B5CF6" }}
          >
            zhstudioapp@gmail.com
          </a>
        </section>

        {/* Footer */}
        <footer className="text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <img src="/assets/bossify-logo.png" alt="Bossify" style={{ width: 28, height: 28 }} />
            <span className="text-sm font-bold" style={{ color: "#1A1225" }}>Bossify</span>
          </div>
          <p className="text-[11px]" style={{ color: "#5B5270" }}>© 2026 ZH Studio, Malaysia</p>
          <div className="flex items-center justify-center gap-3 mt-2">
            <Link to="/terms" className="text-[11px] underline" style={{ color: "#8B5CF6" }}>Terms &amp; Conditions</Link>
            <span style={{ color: "#D9D0EC" }}>|</span>
            <Link to="/privacy-policy" className="text-[11px] underline" style={{ color: "#8B5CF6" }}>Privacy Policy</Link>
          </div>
        </footer>
      </div>
    </div>
  );
}
