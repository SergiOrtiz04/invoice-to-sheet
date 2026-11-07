import { RawInvoiceSchema, type LineItem, type RawInvoice } from "../schema.js";
import type { Extractor } from "./types.js";

/**
 * Deterministic, rule-based extractor used when no API key is available
 * (or `--mock` is passed). It handles the common label/value layouts seen on
 * SaaS, Latin-American and European invoices well enough to demo the whole
 * pipeline offline. It is *not* meant to replace the model on messy real-world
 * PDFs; its confidence score reflects that.
 */
export class MockExtractor implements Extractor {
  readonly name = "mock (rule-based)";

  async extract(text: string): Promise<RawInvoice> {
    const lines = text.split("\n");
    const style = detectNumberStyle(text);
    const missing: string[] = [];

    const vendor = lines[0] ?? "Unknown vendor";

    const invoice_number = findLabelValue(lines, INVOICE_NUMBER_LABELS, /([A-Z]{0,4}[-/]?\d[\w\-/]*)/i);
    if (!invoice_number) missing.push("invoice_number");

    const invoice_date = parseDate(findLabelValue(lines, INVOICE_DATE_LABELS, DATE_RE));
    if (!invoice_date) missing.push("invoice_date");
    const due_date = parseDate(findLabelValue(lines, DUE_DATE_LABELS, DATE_RE));

    const currency = detectCurrency(text);
    if (!currency) missing.push("currency");

    const subtotal = findAmount(lines, SUBTOTAL_LABELS, style);
    const tax = findAmount(lines, TAX_LABELS, style);
    const total = findAmount(lines, TOTAL_LABELS, style);
    if (total == null) missing.push("total");

    const line_items = parseLineItems(lines, style);
    if (line_items.length === 0) missing.push("line_items");

    // Heuristic confidence: start high, pay for every field we could not find.
    const confidence = Math.max(0.1, Math.round((0.9 - 0.15 * missing.length) * 100) / 100);

    return RawInvoiceSchema.parse({
      vendor,
      invoice_number,
      invoice_date,
      due_date,
      currency: currency ?? "USD",
      subtotal,
      tax,
      total: total ?? 0,
      line_items,
      confidence,
    });
  }
}

/* ------------------------------------------------------------------------ */
/* Labels (English, Spanish, German-ish). Order matters: first match wins.   */
/* ------------------------------------------------------------------------ */

const INVOICE_NUMBER_LABELS = [
  /invoice\s*(?:number|no\.?|#|num\.?)\s*:?/i,
  /(?:no\.?|n[úu]mero|num\.?)\s*(?:de\s*)?factura\s*:?/i,
  /factura\s*(?:no\.?|#|n[úu]mero)?\s*:?/i,
  /rechnungs?(?:nummer|-nr\.?)\s*:?/i,
];

const INVOICE_DATE_LABELS = [
  /invoice\s*date\s*:?/i,
  /fecha\s*(?:de\s*)?(?:emisi[óo]n|factura)\s*:?/i,
  /rechnungsdatum\s*:?/i,
  /^date\s*:?/i,
  /^fecha\s*:?/i,
];

const DUE_DATE_LABELS = [
  /due\s*date\s*:?/i,
  /payment\s*due\s*:?/i,
  /fecha\s*(?:de\s*)?vencimiento\s*:?/i,
  /vencimiento\s*:?/i,
  /f[äa]llig(?:keitsdatum|\s*am)\s*:?/i,
];

const SUBTOTAL_LABELS = [/^sub-?total\b/i, /^net\s*amount\b/i, /^nettobetrag\b/i, /^base\s*imponible\b/i];
const TAX_LABELS = [/^(?:sales\s*)?tax\b/i, /^vat\b/i, /^iva\b/i, /^mwst\.?\b/i, /^ust\.?\b/i, /^impuesto/i];
const TOTAL_LABELS = [
  /^total\s*due\b/i,
  /^total\s*a\s*pagar\b/i,
  /^gross\s*total\b/i,
  /^grand\s*total\b/i,
  /^amount\s*due\b/i,
  /^gesamtbetrag\b/i,
  /^total\b(?!\s*(?:tax|iva|vat))/i,
];

/** Column headers used to locate the line-item table. */
const HEADER_WORDS = {
  description: /\b(description|descripci[óo]n|service|concepto|item|artikel|bezeichnung)\b/i,
  quantity: /\b(qty|quantity|cant\.?|cantidad|menge)\b/i,
  price: /\b(unit\s*price|price|precio|rate|preis|unit)\b/i,
  amount: /\b(amount|total|net|importe|betrag)\b/i,
};

const DATE_RE = /(\d{4}-\d{2}-\d{2}|\d{1,2}[./]\d{1,2}[./]\d{4})/;

/* ------------------------------------------------------------------------ */
/* Helpers                                                                   */
/* ------------------------------------------------------------------------ */

type NumberStyle = "us" | "eu";

/** "1,234.56" (us) vs "1.234,56" (eu). Decided by which decimal mark is more common. */
export function detectNumberStyle(text: string): NumberStyle {
  const euDecimals = (text.match(/\d,\d{2}(?!\d)/g) ?? []).length;
  const usDecimals = (text.match(/\d\.\d{2}(?!\d)/g) ?? []).length;
  return euDecimals > usDecimals ? "eu" : "us";
}

export function parseAmount(raw: string, style: NumberStyle): number | null {
  const cleaned = raw.replace(/[^\d.,-]/g, "");
  if (!cleaned) return null;
  const normalized =
    style === "eu" ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned.replace(/,/g, "");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

const AMOUNT_TOKEN_RE = /-?\d[\d.,]*/g;

/**
 * Last numeric token on the line, e.g. "Total Due: $ 394.44" -> 394.44.
 * Totals are always printed with cents, so we require a decimal part; this
 * keeps "VAT ID: DE 812 345 678" from being mistaken for a tax amount.
 */
function lastAmountOnLine(line: string, style: NumberStyle): number | null {
  const tokens = line.match(AMOUNT_TOKEN_RE);
  if (!tokens) return null;
  const last = tokens[tokens.length - 1]!;
  if (!/\d[.,]\d{2}$/.test(last)) return null;
  return parseAmount(last, style);
}

function findAmount(lines: string[], labels: RegExp[], style: NumberStyle): number | null {
  for (const label of labels) {
    for (const line of lines) {
      if (!label.test(line)) continue;
      const value = lastAmountOnLine(line.replace(label, ""), style);
      if (value != null) return value;
    }
  }
  return null;
}

/**
 * Find "Label: value" on a line. Handles several labels on one line
 * ("Serie: A   No. Factura: 2025-1188") by searching *after* the label.
 */
function findLabelValue(lines: string[], labels: RegExp[], valueRe: RegExp): string | null {
  for (const label of labels) {
    for (const line of lines) {
      const m = label.exec(line);
      if (!m) continue;
      const rest = line.slice(m.index + m[0].length);
      const v = valueRe.exec(rest);
      if (v?.[1]) return v[1].trim();
    }
  }
  return null;
}

/** Normalize YYYY-MM-DD, DD/MM/YYYY and DD.MM.YYYY to ISO. Day-first for slashes/dots. */
export function parseDate(raw: string | null): string | null {
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const m = raw.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (!m) return null;
  let [, d, mo, y] = m;
  // If "day" cannot be a day but "month" can, the invoice was month-first (US).
  if (Number(d) > 12 && Number(mo) <= 12) {
    /* day-first already correct */
  } else if (Number(mo) > 12 && Number(d) <= 12) {
    [d, mo] = [mo, d];
  }
  const iso = `${y}-${mo!.padStart(2, "0")}-${d!.padStart(2, "0")}`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

export function detectCurrency(text: string): string | null {
  const code = text.match(/\b(USD|EUR|GTQ|MXN|GBP|CAD|CHF|COP|PEN|CLP|ARS|BRL|JPY)\b/);
  if (code) return code[1]!;
  if (/quetzal/i.test(text) || /\bQ\s?\d/.test(text)) return "GTQ";
  if (/€/.test(text) || /\beuro?s?\b/i.test(text)) return "EUR";
  if (/£/.test(text)) return "GBP";
  if (/\$/.test(text)) return "USD";
  return null;
}

type LeadingColumn = "position" | "quantity" | "none";

/**
 * Parse the line-item table. We locate a header row (needs at least two of the
 * known column words), note whether the first column is a position index or a
 * quantity, then read rows until the first totals line.
 */
export function parseLineItems(lines: string[], style: NumberStyle): LineItem[] {
  const headerIdx = lines.findIndex((l) => {
    const hits = Object.values(HEADER_WORDS).filter((re) => re.test(l)).length;
    return hits >= 2 && !/:\s*\S/.test(l); // "Label: value" lines are not headers
  });
  if (headerIdx === -1) return [];

  const header = lines[headerIdx]!;
  const leading: LeadingColumn = /^(pos\.?|#|no\.?|nr\.?)\b/i.test(header)
    ? "position"
    : HEADER_WORDS.quantity.test(header.split(/\s+/)[0] ?? "")
      ? "quantity"
      : "none";

  const items: LineItem[] = [];
  const stop = [...SUBTOTAL_LABELS, ...TAX_LABELS, ...TOTAL_LABELS];
  for (const line of lines.slice(headerIdx + 1)) {
    if (stop.some((re) => re.test(line))) break;
    const item = parseLineItem(line, style, leading);
    if (item) items.push(item);
  }
  return items;
}

function parseLineItem(line: string, style: NumberStyle, leading: LeadingColumn): LineItem | null {
  // Drop stand-alone currency symbols/codes ("Q 7,850.00", "$ 12.00", "12,00 EUR").
  const tokens = line.split(" ").filter((t) => !/^(?:[$€£Q]|USD|EUR|GTQ)$/i.test(t));
  if (tokens.length < 3) return null;

  const isNumeric = (t: string) => /^-?\d[\d.,]*$/.test(t);
  const amount = parseAmount(tokens[tokens.length - 1]!, style);
  const unit = parseAmount(tokens[tokens.length - 2]!, style);
  if (amount == null || unit == null || !isNumeric(tokens[tokens.length - 1]!) || !isNumeric(tokens[tokens.length - 2]!)) {
    return null;
  }

  let descTokens = tokens.slice(0, -2);
  let quantity: number | null = null;

  const leadingNumeric = descTokens[0] !== undefined && /^\d+$/.test(descTokens[0]);
  if (leading === "quantity" && leadingNumeric) {
    quantity = Number(descTokens[0]);
    descTokens = descTokens.slice(1);
  } else {
    if (leading === "position" && leadingNumeric) descTokens = descTokens.slice(1);
    const tail = descTokens[descTokens.length - 1];
    if (tail !== undefined && isNumeric(tail) && approx(Number(parseAmount(tail, style)) * unit, amount)) {
      quantity = parseAmount(tail, style);
      descTokens = descTokens.slice(0, -1);
    }
  }

  // Last resort: derive quantity from the printed numbers.
  if (quantity == null) quantity = unit > 0 && approx(Math.round(amount / unit) * unit, amount) ? Math.round(amount / unit) : 1;

  const description = descTokens.join(" ").trim();
  if (!description || quantity <= 0) return null;
  return { description, quantity, unit_price: unit, amount };
}

const approx = (a: number, b: number) => Math.abs(a - b) < 0.011;
