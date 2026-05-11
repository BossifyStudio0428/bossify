import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import PaymentDetailsSection from "@/components/PaymentDetailsSection";
import { useI18n } from "@/contexts/I18nContext";

export const Route = createFileRoute("/payment-details")({ component: PaymentDetailsPage });

function PaymentDetailsPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  return (
    <div className="px-5 pt-10 pb-10 space-y-5">
      <header className="flex items-center gap-2">
        <button
          onClick={() => navigate({ to: "/profile" })}
          className="-ml-2 p-2 rounded-full active:bg-muted"
          aria-label={t("back")}
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("pay_details")}</h1>
          <p className="text-xs text-muted-foreground">{t("setup_payment_subtitle")}</p>
        </div>
      </header>

      <PaymentDetailsSection />

      <Link
        to="/"
        className="block text-center text-xs text-muted-foreground underline pt-2"
      >
        {t("back_to_dashboard")}
      </Link>
    </div>
  );
}
