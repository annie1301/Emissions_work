import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Extraction } from "./emissions";

const num = { type: ["number", "null"] };
const str = { type: ["string", "null"] };

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["company", "report_title", "years", "scope2_method", "scope2_method_evidence", "definition_changes", "missing_data"],
  properties: {
    company: { type: "string" },
    report_title: str,
    years: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["year", "scope1", "scope2_location", "scope2_market", "scope2_unspecified", "scope3", "unit", "page_reference"],
        properties: {
          year: { type: "string" },
          scope1: num,
          scope2_location: num,
          scope2_market: num,
          scope2_unspecified: num,
          scope3: num,
          unit: str,
          page_reference: str,
        },
      },
    },
    scope2_method: { type: "string", enum: ["location-based", "market-based", "both", "not stated"] },
    scope2_method_evidence: str,
    definition_changes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["year", "scope", "description"],
        properties: { year: str, scope: { type: "string" }, description: { type: "string" } },
      },
    },
    missing_data: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["year", "field", "note"],
        properties: { year: str, field: { type: "string" }, note: { type: "string" } },
      },
    },
  },
};

const PROMPT = `You are a GHG emissions analyst. Read this company report and return JSON.
Rules:
- Extract reported Scope 1, Scope 2 and Scope 3 totals for EVERY year shown in the report (including prior-year comparatives).
- Put Scope 2 location-based and market-based figures in their own fields. If the report gives a Scope 2 figure without saying which method, use scope2_unspecified.
- NEVER invent numbers and NEVER use 0 for a value that is not reported. Use null for anything not disclosed. Only use 0 if the report literally states zero.
- Convert numbers to plain numbers (no commas) in the unit the report uses, and record that unit (e.g. "tCO2e", "ktCO2e").
- scope2_method: which Scope 2 method(s) the company reports.
- definition_changes: any restatements, base-year recalculations, boundary/consolidation changes, changes in Scope 3 categories included, methodology or emission factor changes, or changes in GHG Protocol approach across years. Empty array if none.
- missing_data: list each figure or year that is not disclosed, or disclosures that are incomplete (e.g. only some Scope 3 categories), with a short note.
- page_reference: page number(s) where the figures appear, if visible.`;

const input = z.object({
  filename: z.string().min(1).max(300),
  base64: z.string().min(10).max(60_000_000),
});

export const extractEmissions = createServerFn({ method: "POST" })
  .inputValidator((d) => input.parse(d))
  .handler(async ({ data }): Promise<{ ok: true; result: Extraction } | { ok: false; error: string }> => {
    const { generateResponse, GatewayError } = await import("@lovable.dev/ai-gateway");
    try {
      const res = await generateResponse({
        model: "openai/gpt-6-astra",
        input: [
          {
            role: "user",
            content: [
              { type: "input_file", filename: data.filename, file_data: `data:application/pdf;base64,${data.base64}` },
              { type: "input_text", text: PROMPT },
            ],
          },
        ],
        text: { format: { type: "json_schema", name: "emissions", strict: true, schema } },
      });
      const r = res as unknown as { output?: { type: string; content?: { type: string; text?: string }[] }[] };
      const text = (r.output ?? [])
        .flatMap((o) => o.content ?? [])
        .filter((c) => c.type === "output_text")
        .map((c) => c.text ?? "")
        .join("");
      if (!text) return { ok: false, error: "The AI returned no data for this file." };
      return { ok: true, result: JSON.parse(text) as Extraction };
    } catch (e) {
      console.error("extractEmissions failed", e);
      if (e instanceof GatewayError) {
        if (e.code === "payment_required") return { ok: false, error: "AI credits are used up. Add credits and try again." };
        if (e.code === "rate_limited") return { ok: false, error: "Too many requests right now. Try again in a minute." };
        return { ok: false, error: `AI request failed (${e.code}).` };
      }
      return { ok: false, error: "Could not read this PDF." };
    }
  });
