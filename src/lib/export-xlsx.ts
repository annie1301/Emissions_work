import * as XLSX from "xlsx";
import { cell, type ReportResult } from "./emissions";

export function buildWorkbook(reports: ReportResult[]): Blob {
  const wb = XLSX.utils.book_new();
  const years = Array.from(new Set(reports.flatMap((r) => r.years.map((y) => y.year)))).sort();
  const header = ["Company", "Metric", ...years, "Notes", "Source file"];
  const rows: (string | number)[][] = [header];

  for (const r of reports) {
    const byYear = new Map(r.years.map((y) => [y.year, y]));
    const metric = (label: string, pick: (y: (typeof r.years)[number]) => number | string | null, notes = "") => {
      rows.push([
        r.company,
        label,
        ...years.map((yr) => {
          const y = byYear.get(yr);
          if (!y) return "NOT IN REPORT";
          const v = pick(y);
          return v === null ? "MISSING" : typeof v === "number" ? cell(v) : v;
        }),
        notes,
        r.filename,
      ]);
    };
    const perYear = (label: string, items: { year: string | null; text: string }[]) => {
      const general = items.filter((i) => !i.year || !years.includes(i.year)).map((i) => (i.year ? `${i.year}: ` : "") + i.text);
      rows.push([
        r.company,
        label,
        ...years.map((yr) => items.filter((i) => i.year === yr).map((i) => i.text).join("; ")),
        general.join("; "),
        r.filename,
      ]);
    };

    metric("Unit", (y) => y.unit);
    metric("Scope 1", (y) => y.scope1);
    metric("Scope 2 (location-based)", (y) => y.scope2_location);
    metric("Scope 2 (market-based)", (y) => y.scope2_market);
    metric("Scope 2 (method not stated)", (y) => y.scope2_unspecified);
    metric("Scope 3", (y) => y.scope3);
    rows.push([r.company, "Scope 2 method", ...years.map(() => ""), `${r.scope2_method}${r.scope2_method_evidence ? ` — ${r.scope2_method_evidence}` : ""}`, r.filename]);
    perYear("Definition changes", r.definition_changes.length ? r.definition_changes.map((c) => ({ year: c.year, text: `${c.scope}: ${c.description}` })) : [{ year: null, text: "No changes reported" }]);
    perYear("Missing data", r.missing_data.map((m) => ({ year: m.year, text: `${m.field} — ${m.note}` })));
    metric("Pages", (y) => y.page_reference ?? "");
    rows.push([]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [{ wch: 22 }, { wch: 28 }, ...years.map(() => ({ wch: 18 })), { wch: 60 }, { wch: 24 }];
  XLSX.utils.book_append_sheet(wb, ws, "Emissions by year");

  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
