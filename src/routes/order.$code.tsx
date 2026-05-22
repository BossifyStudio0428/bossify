import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useI18n } from "@/contexts/I18nContext";
import {
  getPublicOrderForm,
  submitPublicOrder,
} from "@/lib/public-order.functions";

export const Route = createFileRoute("/order/$code")({
  component: PublicOrderFormPage,
});

type LoadState =
  | { status: "loading" }
  | { status: "error"; reason: "not_found" | "disabled" | "network" }
  | {
      status: "ready";
      profile: {
        business_name: string;
        avatar_url: string | null;
        business_type: string;
        whatsapp_number: string | null;
      };
      products: Array<{ id: string; name: string; price: number }>;
    };

function PublicOrderFormPage() {
  const { code } = Route.useParams();
  const { t, lang } = useI18n();
  const loadFn = useServerFn(getPublicOrderForm);
  const submitFn = useServerFn(submitPublicOrder);
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<null | { name: string; code: string; business: string }>(null);

  const [form, setForm] = useState({
    customer_name: "",
    phone: "",
    product: "",
    quantity: "1",
    notes: "",
    course_interest: "",
    university_preference: "",
    date_time: "",
    budget: "",
    location_interest: "",
    project_description: "",
    deadline: "",
  });
  const upd =
    (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((p) => ({ ...p, [k]: e.target.value }));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await loadFn({ data: { code } });
        if (cancelled) return;
        if (!res.ok) {
          setState({ status: "error", reason: res.reason });
          return;
        }
        setState({
          status: "ready",
          profile: res.profile,
          products: res.products,
        });
      } catch {
        if (!cancelled) setState({ status: "error", reason: "network" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, loadFn]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (state.status !== "ready") return;
    if (!form.customer_name.trim() || !form.phone.trim() || !form.product.trim()) return;
    setSubmitting(true);
    const bizType = state.profile.business_type;
    const matched = state.products.find((p) => p.name === form.product);
    const unit = matched?.price ?? 0;
    const qty = Number(form.quantity) || 1;
    const amount = (bizType === "retail" || bizType === "fnb") ? unit * qty : unit;
    try {
      const res = await submitFn({
        data: {
          code,
          customer_name: form.customer_name.trim(),
          phone: form.phone.trim(),
          product: form.product.trim(),
          quantity: qty,
          amount,
          notes: form.notes,
          course_interest: form.course_interest,
          university_preference: form.university_preference,
          date_time: form.date_time,
          budget: form.budget,
          location_interest: form.location_interest,
          project_description: form.project_description,
          deadline: form.deadline,
        },
      });
      if (res.ok) {
        setDone({
          name: form.customer_name.trim(),
          code: res.code,
          business: res.business_name || state.profile.business_name,
        });
      } else {
        alert(t("order_save_failed"));
      }
    } catch {
      alert(t("order_save_failed"));
    } finally {
      setSubmitting(false);
    }
  };

  if (state.status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">{t("loading")}</p>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 bg-background">
        <div className="text-center max-w-sm">
          <div className="text-5xl mb-3">😢</div>
          <h1 className="text-xl font-bold">
            {state.reason === "disabled" ? t("pof_form_disabled") : t("pof_not_found")}
          </h1>
          <p className="text-sm text-muted-foreground mt-2">
            {state.reason === "disabled" ? t("pof_form_disabled_sub") : t("pof_not_found_sub")}
          </p>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-background">
        <div className="text-center max-w-sm">
          <div className="mx-auto h-20 w-20 rounded-full bg-emerald-500/15 flex items-center justify-center text-5xl mb-5">
            ✅
          </div>
          <h1 className="text-2xl font-bold">
            {t("pof_thanks").replace("{name}", done.name)} 🎉
          </h1>
          <p className="text-sm text-muted-foreground mt-3">{t("pof_will_contact")}</p>
          <p className="text-sm font-semibold text-foreground mt-4">— {done.business}</p>
          <p className="text-[11px] text-muted-foreground mt-2 font-mono">{done.code}</p>
        </div>
        <p className="text-[11px] text-muted-foreground mt-10">
          {lang === "ms" ? "Dikuasakan oleh" : lang === "zh" ? "由" : "Powered by"} Bossify 💜
        </p>
      </div>
    );
  }

  const { profile, products } = state;
  const bizType = profile.business_type;
  const initials = (profile.business_name || "?").slice(0, 2).toUpperCase();

  const submitLabelKey =
    bizType === "education" || bizType === "property"
      ? "pof_submit_enquiry"
      : bizType === "beauty"
        ? "pof_book_appt"
        : bizType === "freelance"
          ? "pof_submit_project"
          : "pof_submit";

  const labels = (() => {
    switch (bizType) {
      case "education":
        return { name: t("f_client_name"), product: t("f_service") };
      case "beauty":
        return { name: t("f_client_name"), product: t("f_service") };
      case "property":
        return { name: t("f_client_name"), product: t("packages_title") };
      case "freelance":
        return { name: t("f_client_name"), product: t("f_service") };
      default:
        return { name: t("customer_name"), product: t("product") };
    }
  })();

  return (
    <div className="min-h-screen bg-background flex justify-center">
      <div className="w-full max-w-[420px] px-5 pt-10 pb-10 space-y-5">
        <header className="flex flex-col items-center text-center">
          <div className="h-20 w-20 rounded-full bg-gradient-to-br from-primary to-primary/70 text-primary-foreground flex items-center justify-center text-2xl font-bold shadow-[var(--shadow-soft)] overflow-hidden">
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
            ) : (
              initials
            )}
          </div>
          <h1 className="mt-3 text-xl font-bold">{profile.business_name}</h1>
          <p className="text-xs text-muted-foreground mt-1">{t("pof_place_order_below")}</p>
        </header>

        <form onSubmit={onSubmit} className="space-y-4">
          <Field label={`${labels.name} *`}>
            <input
              required
              value={form.customer_name}
              onChange={upd("customer_name")}
              className="pof-input"
              maxLength={120}
            />
          </Field>
          <Field label={`${t("phone_number")} *`}>
            <input
              required
              type="tel"
              inputMode="tel"
              value={form.phone}
              onChange={upd("phone")}
              placeholder="01X-XXX XXXX"
              className="pof-input"
              maxLength={32}
            />
          </Field>

          <Field label={`${labels.product} *`}>
            {products.length > 0 ? (
              <select required value={form.product} onChange={upd("product")} className="pof-input">
                <option value="">{t("select_product")}</option>
                {products.map((p) => (
                  <option key={p.id} value={p.name}>
                    {p.name}
                    {p.price > 0 ? ` — RM ${p.price.toFixed(2)}` : ""}
                  </option>
                ))}
              </select>
            ) : (
              <input
                required
                value={form.product}
                onChange={upd("product")}
                className="pof-input"
                maxLength={160}
              />
            )}
          </Field>

          {(bizType === "retail" || bizType === "fnb") && (
            <Field label={t("quantity")}>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                value={form.quantity}
                onChange={upd("quantity")}
                className="pof-input"
              />
            </Field>
          )}

          {bizType === "education" && (
            <>
              <Field label={t("f_course_interest")}>
                <input value={form.course_interest} onChange={upd("course_interest")} className="pof-input" maxLength={160} />
              </Field>
              <Field label={t("f_university_preference")}>
                <input value={form.university_preference} onChange={upd("university_preference")} className="pof-input" maxLength={160} />
              </Field>
            </>
          )}

          {bizType === "beauty" && (
            <Field label={t("f_date_time")}>
              <input
                type="datetime-local"
                value={form.date_time}
                onChange={upd("date_time")}
                className="pof-input"
              />
            </Field>
          )}

          {bizType === "property" && (
            <>
              <Field label={t("f_budget")}>
                <input value={form.budget} onChange={upd("budget")} className="pof-input" maxLength={64} />
              </Field>
              <Field label={t("f_location_interest")}>
                <input value={form.location_interest} onChange={upd("location_interest")} className="pof-input" maxLength={160} />
              </Field>
            </>
          )}

          {bizType === "freelance" && (
            <>
              <Field label={t("f_project_description")}>
                <textarea rows={3} value={form.project_description} onChange={upd("project_description")} className="pof-input" maxLength={2000} />
              </Field>
              <Field label={t("f_deadline_date")}>
                <input type="date" value={form.deadline} onChange={upd("deadline")} className="pof-input" />
              </Field>
            </>
          )}

          <Field label={t("notes")}>
            <textarea rows={3} value={form.notes} onChange={upd("notes")} className="pof-input" maxLength={2000} />
          </Field>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-primary to-primary/80 text-primary-foreground font-bold text-sm shadow-[var(--shadow-soft)] disabled:opacity-60"
          >
            {submitting ? t("saving") : t(submitLabelKey)}
          </button>

          <p className="text-[10px] text-center text-muted-foreground pt-2">
            {lang === "ms" ? "Dikuasakan oleh" : lang === "zh" ? "由" : "Powered by"} Bossify
          </p>
        </form>

        <style>{`
          .pof-input {
            width: 100%;
            border-radius: 14px;
            background: hsl(var(--card));
            border: 1px solid hsl(var(--border));
            padding: 12px 14px;
            font-size: 14px;
            outline: none;
            color: hsl(var(--foreground));
          }
          .pof-input:focus { border-color: hsl(var(--primary)); box-shadow: 0 0 0 4px hsl(var(--primary) / 0.15); }
        `}</style>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground px-1">
        {label}
      </label>
      {children}
    </div>
  );
}