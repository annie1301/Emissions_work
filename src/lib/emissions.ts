// Browser-safe types and helpers shared by the extractor and the spreadsheet export.

export type Scope2Method = "location-based" | "market-based" | "both" | "not stated";

export interface YearRow {
  year: string;
  scope1: number | null;
  scope2_location: number | null;
  scope2_market: number | null;
  scope2_unspecified: number | null;
  scope3: number | null;
  unit: string | null;
  page_reference: string | null;
}

export interface DefinitionChange {
  year: string | null;
  scope: string;
  description: string;
}

export interface MissingItem {
  year: string | null;
  field: string;
  note: string;
}

export interface Extraction {
  company: string;
  report_title: string | null;
  years: YearRow[];
  scope2_method: Scope2Method;
  scope2_method_evidence: string | null;
  definition_changes: DefinitionChange[];
  missing_data: MissingItem[];
}

export interface ReportResult extends Extraction {
  id: string;
  filename: string;
}

const FIELD_LABELS: Record<string, string> = {
  scope1: "Scope 1",
  scope3: "Scope 3",
  unit: "Unit",
};

/**
 * Lists every empty value in the year table so missing data is never
 * silently treated as zero. Scope 2 counts as missing only when no Scope 2
 * figure of any kind was reported for that year.
 */
export function findMissing(rows: YearRow[]): MissingItem[] {
  const out: MissingItem[] = [];
  for (const r of rows) {
    for (const key of ["scope1", "scope3", "unit"] as const) {
      if (r[key] === null || r[key] === undefined) {
        out.push({ year: r.year, field: FIELD_LABELS[key]!, note: "Not reported in this document" });
      }
    }
    if (r.scope2_location === null && r.scope2_market === null && r.scope2_unspecified === null) {
      out.push({ year: r.year, field: "Scope 2", note: "Not reported in this document" });
    }
  }
  return out;
}

/** Combines the AI's notes with the computed gaps, dropping duplicates. */
export function mergeMissing(ai: MissingItem[], computed: MissingItem[]): MissingItem[] {
  const seen = new Set<string>();
  const out: MissingItem[] = [];
  const pretty: Record<string, string> = {
    scope1: "Scope 1", scope3: "Scope 3", unit: "Unit",
    scope2_location: "Scope 2 (location-based)", scope2_market: "Scope 2 (market-based)", scope2_unspecified: "Scope 2",
  };
  for (const raw of [...computed, ...ai]) {
    const m = { ...raw, field: pretty[raw.field] ?? raw.field };
    const k = `${m.year ?? ""}|${m.field.toLowerCase()}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(m);
  }
  return out;
}

/** Empty cells stay empty text, never 0. */
export function cell(v: number | null | undefined): number | string {
  return v === null || v === undefined ? "MISSING" : v;
}
