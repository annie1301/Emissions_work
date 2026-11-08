import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { extractEmissions } from "@/lib/extract.functions";
import { findMissing, mergeMissing, type ReportResult } from "@/lib/emissions";
import { buildWorkbook, downloadBlob } from "@/lib/export-xlsx";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Emissions Ledger — Scope 1, 2 & 3 from company reports" },
      { name: "description", content: "Upload company sustainability PDFs and get a spreadsheet of Scope 1, 2 and 3 emissions, Scope 2 method, definition changes and missing data." },
      { property: "og:title", content: "Emissions Ledger" },
      { property: "og:description", content: "Turn sustainability report PDFs into a clean emissions spreadsheet." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

type Job = { id: string; filename: string; status: "queued" | "reading" | "done" | "error"; error?: string };
const STORE = "emissions-ledger-v1";

function fmt(v: number | null) {
  return v === null ? <span className="missing">missing</span> : v.toLocaleString();
}

function toBase64(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1] ?? "");
    r.onerror = () => rej(r.error);
    r.readAsDataURL(file);
  });
}

function Index() {
  const extract = useServerFn(extractEmissions);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [reports, setReports] = useState<ReportResult[]>([]);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORE);
      if (saved) setReports(JSON.parse(saved));
    } catch {}
  }, []);
  useEffect(() => {
    localStorage.setItem(STORE, JSON.stringify(reports));
  }, [reports]);

  const update = (id: string, p: Partial<Job>) => setJobs((j) => j.map((x) => (x.id === id ? { ...x, ...p } : x)));

  async function addFiles(list: FileList | null) {
    if (!list) return;
    const files = Array.from(list).filter((f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"));
    const newJobs = files.map((f) => ({ id: crypto.randomUUID(), filename: f.name, status: "queued" as const }));
    setJobs((j) => [...newJobs, ...j]);
    await Promise.all(
      files.map(async (file, i) => {
        const job = newJobs[i]!;
        if (file.size > 40 * 1024 * 1024) return update(job.id, { status: "error", error: "File is larger than 40 MB." });
        update(job.id, { status: "reading" });
        try {
          const base64 = await toBase64(file);
          const res = await extract({ data: { filename: file.name, base64 } });
          if (!res.ok) return update(job.id, { status: "error", error: res.error });
          const r = res.result;
          const report: ReportResult = { ...r, id: job.id, filename: file.name, missing_data: mergeMissing(r.missing_data, findMissing(r.years)) };
          setReports((rs) => [...rs, report]);
          update(job.id, { status: "done" });
        } catch {
          update(job.id, { status: "error", error: "Upload failed. Try again." });
        }
      }),
    );
  }

  const busy = jobs.some((j) => j.status === "reading" || j.status === "queued");

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-6 px-6 py-10">
          <div>
            <p className="eyebrow">Emissions Ledger</p>
            <h1 className="font-display text-4xl md:text-5xl">Reports in, numbers out.</h1>
            <p className="mt-3 max-w-xl text-muted-foreground">
              Drop in sustainability or annual report PDFs. Each one becomes rows of Scope 1, 2 and 3 emissions — gaps flagged, never zero-filled.
            </p>
          </div>
          <div className="flex gap-3">
            {reports.length > 0 && (
              <button className="btn-ghost" onClick={() => confirm("Remove all extracted reports?") && setReports([])}>
                Clear all
              </button>
            )}
            <button
              className="btn-primary"
              disabled={!reports.length}
              onClick={() => downloadBlob(buildWorkbook(reports), "emissions-ledger.xlsx")}
            >
              Download spreadsheet
            </button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-8">
        <div
          className={`dropzone ${drag ? "dropzone-active" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}
          onClick={() => inputRef.current?.click()}
          role="button"
          aria-label="Upload PDF reports"
        >
          <input ref={inputRef} type="file" accept="application/pdf" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
          <p className="font-display text-2xl">Drop PDFs here</p>
          <p className="text-sm text-muted-foreground">or click to choose — several companies at once is fine</p>
        </div>

        {jobs.length > 0 && (
          <ul className="mt-6 divide-y divide-border rounded-md border border-border bg-card">
            {jobs.map((j) => (
              <li key={j.id} className="flex items-center justify-between gap-4 px-4 py-2 text-sm">
                <span className="truncate">{j.filename}</span>
                <span className={`status status-${j.status}`}>
                  {j.status === "reading" ? "Reading…" : j.status === "queued" ? "Waiting" : j.status === "done" ? "Done" : j.error}
                </span>
              </li>
            ))}
          </ul>
        )}
        {busy && <p className="mt-3 text-sm text-muted-foreground">Long reports can take a minute or two each.</p>}
      </section>

      <section className="mx-auto max-w-6xl space-y-8 px-6 pb-20">
        {reports.map((r) => (
          <article key={r.id} className="rounded-md border border-border bg-card">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border px-5 py-4">
              <div>
                <h2 className="font-display text-2xl">{r.company}</h2>
                <p className="text-xs text-muted-foreground">{r.report_title ?? r.filename}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="tag">Scope 2: {r.scope2_method}</span>
                <button className="btn-link" onClick={() => setReports((rs) => rs.filter((x) => x.id !== r.id))}>Remove</button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="ledger">
                <thead>
                  <tr>
                    <th>Year</th><th>Scope 1</th><th>Scope 2 location</th><th>Scope 2 market</th><th>Scope 2 (unstated)</th><th>Scope 3</th><th>Unit</th>
                  </tr>
                </thead>
                <tbody>
                  {r.years.length === 0 && (
                    <tr><td colSpan={7} className="missing">No emissions figures found in this document</td></tr>
                  )}
                  {r.years.map((y) => (
                    <tr key={y.year}>
                      <td>{y.year}</td><td>{fmt(y.scope1)}</td><td>{fmt(y.scope2_location)}</td><td>{fmt(y.scope2_market)}</td>
                      <td>{fmt(y.scope2_unspecified)}</td><td>{fmt(y.scope3)}</td><td>{y.unit ?? <span className="missing">missing</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid gap-6 px-5 py-5 md:grid-cols-3">
              <div>
                <h3 className="eyebrow">Scope 2 method</h3>
                <p className="text-sm">{r.scope2_method_evidence ?? "No explanation given in the report."}</p>
              </div>
              <div>
                <h3 className="eyebrow">Definition changes</h3>
                {r.definition_changes.length ? (
                  <ul className="space-y-2 text-sm">
                    {r.definition_changes.map((c, i) => (
                      <li key={i}><strong>{c.year ?? "—"} · {c.scope}</strong> — {c.description}</li>
                    ))}
                  </ul>
                ) : <p className="text-sm text-muted-foreground">None reported.</p>}
              </div>
              <div>
                <h3 className="eyebrow">Missing data</h3>
                {r.missing_data.length ? (
                  <ul className="space-y-1 text-sm">
                    {r.missing_data.map((m, i) => (
                      <li key={i}><span className="missing">{m.year ?? "All years"} · {m.field}</span> {m.note}</li>
                    ))}
                  </ul>
                ) : <p className="text-sm text-muted-foreground">Nothing missing.</p>}
              </div>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
