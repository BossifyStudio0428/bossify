import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, FileDown, Share2 } from "lucide-react";
import { supabase, type CustomerRow } from "@/integrations/supabase/client";
import { useI18n, type TKey } from "@/contexts/I18nContext";
import { toast } from "sonner";
import {
  incomeLabelKey, statusLabelKey, type EducationDetails,
} from "@/components/EducationDetailsForm";
import { STAGE_DEFS } from "@/components/FollowupPipeline";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { applyCjkFont, CJK_FONT_FAMILY } from "@/lib/pdfCjk";
import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { FileOpener } from "@capacitor-community/file-opener";

export const Route = createFileRoute("/clients-compare")({ component: ComparePage });

type Stage = { client_id: string; stage_number: number; is_completed: boolean };
type Svc = { client_id: string; service_type: string; is_needed: boolean; status: string };

function ComparePage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [details, setDetails] = useState<Record<string, EducationDetails | null>>({});
  const [stages, setStages] = useState<Record<string, Stage[]>>({});
  const [services, setServices] = useState<Record<string, Svc[]>>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: cs } = await supabase.from("customers").select("*").order("name");
      const list = (cs ?? []) as CustomerRow[];
      setCustomers(list);
      if (list.length) {
        const ids = list.map((c) => c.id);
        const { data: ds } = await (supabase as any)
          .from("client_education_details").select("*").in("client_id", ids);
        const map: Record<string, EducationDetails | null> = {};
        for (const d of (ds ?? []) as EducationDetails[]) map[d.client_id] = d;
        setDetails(map);
        const { data: stData } = await (supabase as any)
          .from("education_followup_stages").select("client_id,stage_number,is_completed").in("client_id", ids);
        const sMap: Record<string, Stage[]> = {};
        for (const s of (stData ?? []) as Stage[]) {
          (sMap[s.client_id] ||= []).push(s);
        }
        setStages(sMap);
        const { data: svcData } = await (supabase as any)
          .from("education_additional_services").select("client_id,service_type,is_needed,status").in("client_id", ids);
        const vMap: Record<string, Svc[]> = {};
        for (const v of (svcData ?? []) as Svc[]) {
          (vMap[v.client_id] ||= []).push(v);
        }
        setServices(vMap);
      }
      setLoading(false);
    })();
  }, []);

  const toggle = (id: string) => {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 4) { toast.error("Max 4"); return prev; }
      return [...prev, id];
    });
  };

  const picked = useMemo(
    () => selected.map((id) => customers.find((c) => c.id === id)).filter(Boolean) as CustomerRow[],
    [selected, customers],
  );

  const stageProgress = (cid: string) => {
    const done = (stages[cid] ?? []).filter((s) => s.is_completed).length;
    return { done, total: 10 };
  };
  const currentStageLabel = (cid: string) => {
    const map = new Map((stages[cid] ?? []).map((s) => [s.stage_number, s.is_completed]));
    const next = STAGE_DEFS.find((s) => !map.get(s.num));
    return next ? `${next.num}. ${t(next.key)}` : t("edu_stage_10");
  };
  const activeServices = (cid: string) =>
    (services[cid] ?? []).filter((s) => s.is_needed).map((s) => s.service_type);

  const rows: { key: TKey; render: (c: CustomerRow) => string }[] = [
    { key: "edu_field_phone",       render: (c) => c.phone || "—" },
    { key: "edu_field_course",      render: (c) => details[c.id]?.course_interest || "—" },
    { key: "edu_field_university",  render: (c) => details[c.id]?.university_preference || "—" },
    { key: "edu_field_result",      render: (c) => details[c.id]?.academic_result || "—" },
    { key: "edu_field_income",      render: (c) => { const k = incomeLabelKey(details[c.id]?.family_income ?? null); return k ? t(k) : "—"; } },
    { key: "edu_field_scholarship", render: (c) => details[c.id]?.scholarship_interest ? `✅ ${t("edu_yes")}` : `⭕ ${t("edu_no")}` },
    { key: "edu_field_status",      render: (c) => t(statusLabelKey(details[c.id]?.application_status)) },
    { key: "edu_field_pipeline_stage", render: (c) => {
        const p = stageProgress(c.id);
        return `${p.done}/10 · ${currentStageLabel(c.id)}`;
      } },
    { key: "edu_field_services", render: (c) => {
        const list = activeServices(c.id);
        if (!list.length) return "—";
        return list.map((k) => t((`edu_svc_${k}`) as TKey)).join(", ");
      } },
    { key: "edu_field_remarks", render: (c) => (c as any).remarks || "—" },
  ];

  const exportPDF = async () => {
    setExporting(true);
    try {
      const doc = new jsPDF({ orientation: "landscape" });
      await applyCjkFont(doc);
      const PURPLE: [number, number, number] = [108, 63, 214];
      doc.setFillColor(...PURPLE);
      doc.rect(0, 0, 297, 22, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont(CJK_FONT_FAMILY, "bold");
      doc.setFontSize(14);
      doc.text(`Bossify — ${t("edu_comparison_report")}`, 14, 14);
      doc.setTextColor(0, 0, 0);
      doc.setFont(CJK_FONT_FAMILY, "normal");
      doc.setFontSize(10);
      doc.text(new Date().toLocaleString("en-MY"), 14, 28);

      const head = [["Field", ...picked.map((c) => c.name)]];
      const body = rows.map((r) => [t(r.key), ...picked.map((c) => r.render(c))]);
      autoTable(doc, {
        startY: 34, head, body, theme: "grid",
        headStyles: { fillColor: PURPLE, textColor: 255, font: CJK_FONT_FAMILY, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [240, 238, 248] },
        styles: { fontSize: 9, cellPadding: 3, font: CJK_FONT_FAMILY },
      });

      let y = (doc as any).lastAutoTable.finalY + 8;
      doc.setFont(CJK_FONT_FAMILY, "normal");
      doc.setFontSize(11);
      doc.text(t("edu_pipeline"), 14, y);
      y += 5;
      for (const c of picked) {
        const p = stageProgress(c.id);
        const pct = (p.done / 10) * 100;
        doc.setFontSize(9);
        doc.text(`${c.name} — ${p.done}/10`, 14, y);
        doc.setDrawColor(220);
        doc.setFillColor(230, 230, 230);
        doc.rect(70, y - 4, 150, 5, "F");
        doc.setFillColor(...PURPLE);
        doc.rect(70, y - 4, (150 * pct) / 100, 5, "F");
        y += 8;
      }

      const filename = `Bossify_Comparison_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}.pdf`;

      if (Capacitor.isNativePlatform()) {
        const base64 = doc.output("datauristring").split(",")[1];
        const res = await Filesystem.writeFile({
          path: filename, data: base64, directory: Directory.Documents, recursive: true,
        });
        try {
          await FileOpener.open({ filePath: res.uri, contentType: "application/pdf", openWithDefault: true });
        } catch {
          await Share.share({ title: filename, url: res.uri, dialogTitle: filename });
        }
      } else {
        doc.save(filename);
      }
      toast.success("PDF ✓");
    } catch (e: any) {
      toast.error(e?.message ?? "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const shareWA = () => {
    const header = `📊 ${t("edu_comparison_report")}\n${new Date().toLocaleDateString("en-MY")}\n\n`;
    const blocks = picked.map((c) => {
      const p = stageProgress(c.id);
      const lines = rows.map((r) => `• ${t(r.key)}: ${r.render(c)}`).join("\n");
      return `👤 ${c.name}\n${t("edu_pipeline")}: ${p.done}/10\n${lines}`;
    }).join("\n\n");
    const url = `https://wa.me/?text=${encodeURIComponent(header + blocks)}`;
    window.open(url, "_blank");
  };

  return (
    <div className="px-5 pt-10 pb-6 space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate({ to: "/customers" })} className="p-2 -ml-2 rounded-full hover:bg-muted">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-xl font-bold">{t("edu_compare")}</h1>
      </div>
      <p className="text-xs text-muted-foreground">{t("edu_compare_pick")}</p>

      <div className="space-y-2">
        {loading && <p className="text-sm text-muted-foreground text-center py-6">{t("loading")}</p>}
        {customers.map((c) => {
          const isSel = selected.includes(c.id);
          return (
            <button key={c.id} onClick={() => toggle(c.id)}
              className={`w-full flex items-center gap-3 p-3 rounded-2xl border ${isSel ? "border-primary bg-primary/5" : "border-border/60 bg-card"} active:scale-[0.99]`}>
              <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center ${isSel ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>
                {isSel && <span className="text-[10px]">✓</span>}
              </div>
              <div className="h-9 w-9 rounded-full bg-primary/15 text-primary flex items-center justify-center font-semibold">
                {c.name.charAt(0).toUpperCase()}
              </div>
              <p className="text-sm font-semibold text-foreground flex-1 text-left truncate">{c.name}</p>
            </button>
          );
        })}
      </div>

      {picked.length >= 2 ? (
        <section className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <p className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">
              {t("edu_compare")}
            </p>
          </div>

          {/* Progress chart */}
          <div className="rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] p-3 space-y-2">
            <p className="text-[11px] font-semibold text-muted-foreground">{t("edu_pipeline")}</p>
            {picked.map((c) => {
              const p = stageProgress(c.id);
              return (
                <div key={c.id} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="font-semibold truncate">{c.name}</span>
                    <span className="text-muted-foreground">{p.done}/10</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-primary transition-all" style={{ width: `${(p.done / 10) * 100}%` }} />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="overflow-x-auto rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)]">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/40">
                  <th className="text-left px-3 py-2 font-semibold">Field</th>
                  {picked.map((c) => (
                    <th key={c.id} className="text-left px-3 py-2 font-semibold">{c.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className="border-t border-border/60">
                    <td className="px-3 py-2 font-semibold text-muted-foreground">{t(r.key)}</td>
                    {picked.map((c) => (
                      <td key={c.id} className="px-3 py-2 text-foreground">{r.render(c)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              onClick={exportPDF}
              disabled={exporting}
              className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-60 active:scale-[0.99]"
            >
              <FileDown className="h-4 w-4" /> {t("edu_export_comparison")}
            </button>
            <button
              onClick={shareWA}
              className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-500 text-white text-sm font-semibold active:scale-[0.99]"
            >
              <Share2 className="h-4 w-4" /> {t("edu_share_wa")}
            </button>
          </div>
        </section>
      ) : (
        <p className="text-xs text-muted-foreground text-center py-4">{t("edu_compare_min")}</p>
      )}
    </div>
  );
}