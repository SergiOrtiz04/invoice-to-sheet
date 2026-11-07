import {
  AMOUNT_TOLERANCE_ABS,
  AMOUNT_TOLERANCE_REL,
  MIN_CONFIDENCE,
  type ExtractionMode,
} from "./config.js";
import { InvoiceSchema, type Invoice, type RawInvoice } from "./schema.js";

/** True when `a` and `b` are equal within the configured rounding tolerance. */
export function approxEqual(a: number, b: number): boolean {
  const tolerance = Math.max(AMOUNT_TOLERANCE_ABS, Math.abs(b) * AMOUNT_TOLERANCE_REL);
  return Math.abs(a - b) <= tolerance;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Run arithmetic and completeness checks on an extracted invoice and produce
 * the final record with `needs_review` / `review_reasons` filled in.
 *
 * The checks are intentionally conservative: a false "needs review" costs a
 * human ten seconds, a silently wrong total costs a lot more.
 */
export function reconcile(raw: RawInvoice, sourceFile: string, mode: ExtractionMode): Invoice {
  const reasons: string[] = [];

  if (!raw.invoice_number) reasons.push("missing invoice number");
  if (!raw.invoice_date) reasons.push("missing invoice date");

  if (raw.subtotal != null && raw.tax != null) {
    const expected = round2(raw.subtotal + raw.tax);
    if (!approxEqual(expected, raw.total)) {
      reasons.push(`subtotal + tax (${expected}) does not equal total (${raw.total})`);
    }
  } else if (raw.subtotal == null && raw.tax == null) {
    reasons.push("subtotal and tax not found; total could not be cross-checked");
  }

  if (raw.line_items.length > 0) {
    const sum = round2(raw.line_items.reduce((acc, li) => acc + li.amount, 0));
    const matchesSubtotal = raw.subtotal != null && approxEqual(sum, raw.subtotal);
    // Some countries (e.g. Guatemala) print tax-inclusive prices, so line
    // items legitimately add up to the total rather than the subtotal.
    const matchesTotal = approxEqual(sum, raw.total);
    if (!matchesSubtotal && !matchesTotal) {
      reasons.push(`line items sum to ${sum}, which matches neither subtotal nor total`);
    }
    for (const li of raw.line_items) {
      if (!approxEqual(round2(li.quantity * li.unit_price), li.amount)) {
        reasons.push(`line "${li.description}": ${li.quantity} x ${li.unit_price} != ${li.amount}`);
      }
    }
  } else {
    reasons.push("no line items extracted");
  }

  if (raw.invoice_date && raw.due_date && raw.due_date < raw.invoice_date) {
    reasons.push("due date is before invoice date");
  }

  if (raw.confidence < MIN_CONFIDENCE) {
    reasons.push(`extractor confidence ${raw.confidence.toFixed(2)} is below ${MIN_CONFIDENCE}`);
  }

  return InvoiceSchema.parse({
    ...raw,
    source_file: sourceFile,
    extraction_mode: mode,
    needs_review: reasons.length > 0,
    review_reasons: reasons,
  });
}
