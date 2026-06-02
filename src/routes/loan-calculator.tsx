import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, MessageCircle } from "lucide-react";
import { useI18n } from "@/contexts/I18nContext";

export const Route = createFileRoute("/loan-calculator")({ component: LoanCalculatorPage });

const TENURE_OPTIONS = [10, 15, 20, 25, 30, 35];

function fmt(n: number): string {
  if (!isFinite(n)) return "0.00";
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function LoanCalculatorPage() {
  const { t } = useI18n();
  const [price, setPrice] = useState("500000");
  const [downPct, setDownPct] = useState("10");
  const [tenure, setTenure] = useState(30);
  const [rate, setRate] = useState("4.5");

  const calc = useMemo(() => {
    const P = Number(price) || 0;
    const dp = Math.min(100, Math.max(0, Number(downPct) || 0));
    const r = (Number(rate) || 0) / 100 / 12;
    const n = tenure * 12;
    const downAmt = P * (dp / 100);
    const loan = P - downAmt;
    let monthly = 0;
    if (n > 0 && loan > 0) {
      monthly = r === 0 ? loan / n : (loan * r) / (1 - Math.pow(1 + r, -n));
    }
    const totalPayment = monthly * n;
    const totalInterest = totalPayment - loan;
    return { loan, downAmt, monthly, totalPayment, totalInterest };
  }, [price, downPct, tenure, rate]);

  const shareWa = () => {
    const lines = [
      `🏠 ${t("loan_calc_title")}`,
      "",
      `${t("lc_price")}: RM ${fmt(Number(price) || 0)}`,
      `${t("lc_down_pct")}: ${downPct}% (RM ${fmt(calc.downAmt)})`,
      `${t("lc_tenure")}: ${tenure}`,
      `${t("lc_rate")}: ${rate}%`,
      "",
      `💰 ${t("lc_loan_amount")}: RM ${fmt(calc.loan)}`,
      `📅 ${t("lc_monthly")}: RM ${fmt(calc.monthly)}`,
      `💵 ${t("lc_total_payment")}: RM ${fmt(calc.totalPayment)}`,
      `📊 ${t("lc_total_interest")}: RM ${fmt(calc.totalInterest)}`,
    ];
    const text = encodeURIComponent(lines.join("\n"));
    window.open(`https://wa.me/?text=${text}`, "_blank");
  };

  const inputCls = "w-full px-3 py-3 rounded-2xl bg-background border border-border text-sm outline-none focus:border-primary";
  const labelCls = "text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1";

  return (
    <div className="px-5 pt-10 pb-28 space-y-4">
      <header className="flex items-center gap-2">
        <Link to="/" className="-ml-2 p-2 rounded-full active:bg-muted">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">{t("loan_calc_title")}</h1>
      </header>

      <div className="space-y-1.5">
        <p className={labelCls}>{t("lc_price")}</p>
        <input type="number" value={price} onChange={(e) => setPrice(e.target.value)} className={inputCls} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <p className={labelCls}>{t("lc_down_pct")}</p>
          <input type="number" min={0} max={100} value={downPct} onChange={(e) => setDownPct(e.target.value)} className={inputCls} />
        </div>
        <div className="space-y-1.5">
          <p className={labelCls}>{t("lc_rate")}</p>
          <input type="number" step="0.01" min={0} value={rate} onChange={(e) => setRate(e.target.value)} className={inputCls} />
        </div>
      </div>

      <div className="space-y-1.5">
        <p className={labelCls}>{t("lc_tenure")}</p>
        <div className="grid grid-cols-6 gap-2">
          {TENURE_OPTIONS.map((y) => (
            <button key={y} type="button" onClick={() => setTenure(y)}
              className={`py-2.5 rounded-xl text-xs font-semibold border ${tenure === y ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border"}`}>
              {y}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 p-5 space-y-4">
        <div className="text-center">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">{t("lc_monthly")}</p>
          <p className="text-3xl font-bold text-primary mt-1">RM {fmt(calc.monthly)}</p>
        </div>
        <div className="grid grid-cols-2 gap-3 pt-3 border-t border-border/40">
          <Row label={t("lc_down_amount")} value={`RM ${fmt(calc.downAmt)}`} />
          <Row label={t("lc_loan_amount")} value={`RM ${fmt(calc.loan)}`} />
          <Row label={t("lc_total_payment")} value={`RM ${fmt(calc.totalPayment)}`} />
          <Row label={t("lc_total_interest")} value={`RM ${fmt(calc.totalInterest)}`} />
        </div>
      </div>

      <button onClick={shareWa}
        className="w-full py-3.5 rounded-2xl bg-emerald-500 text-white font-semibold flex items-center justify-center gap-2 active:scale-[0.99] transition-transform">
        <MessageCircle className="h-5 w-5" />
        {t("lc_share_wa")}
      </button>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-sm font-bold text-foreground">{value}</p>
    </div>
  );
}