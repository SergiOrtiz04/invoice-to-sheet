import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { stringify } from "csv-stringify/sync";
import type { Invoice } from "./schema.js";

/** Column order for invoices.csv. Stable so downstream sheets never break. */
export const INVOICE_COLUMNS = [
  "source_file",
  "vendor",
  "invoice_number",
  "invoice_date",
  "due_date",
  "currency",
  "subtotal",
  "tax",
  "total",
  "line_item_count",
  "confidence",
  "needs_review",
  "review_reasons",
  "extraction_mode",
] as const;

export const LINE_ITEM_COLUMNS = [
  "source_file",
  "invoice_number",
  "vendor",
  "currency",
  "description",
  "quantity",
  "unit_price",
  "amount",
] as const;

/** One CSV row per invoice; line items are summarized by count (see line_items.csv). */
export function invoicesToCsv(invoices: Invoice[]): string {
  const rows = invoices.map((inv) => ({
    source_file: inv.source_file,
    vendor: inv.vendor,
    invoice_number: inv.invoice_number ?? "",
    invoice_date: inv.invoice_date ?? "",
    due_date: inv.due_date ?? "",
    currency: inv.currency,
    subtotal: inv.subtotal ?? "",
    tax: inv.tax ?? "",
    total: inv.total,
    line_item_count: inv.line_items.length,
    confidence: inv.confidence,
    needs_review: inv.needs_review ? "TRUE" : "FALSE",
    review_reasons: inv.review_reasons.join(" | "),
    extraction_mode: inv.extraction_mode,
  }));
  return stringify(rows, { header: true, columns: [...INVOICE_COLUMNS] });
}

/** One CSV row per line item, denormalized so it pivots nicely in a sheet. */
export function lineItemsToCsv(invoices: Invoice[]): string {
  const rows = invoices.flatMap((inv) =>
    inv.line_items.map((li) => ({
      source_file: inv.source_file,
      invoice_number: inv.invoice_number ?? "",
      vendor: inv.vendor,
      currency: inv.currency,
      description: li.description,
      quantity: li.quantity,
      unit_price: li.unit_price,
      amount: li.amount,
    })),
  );
  return stringify(rows, { header: true, columns: [...LINE_ITEM_COLUMNS] });
}

export interface WrittenFiles {
  invoicesCsv: string;
  lineItemsCsv: string;
  invoicesJson: string;
}

export async function writeOutputs(invoices: Invoice[], outDir: string): Promise<WrittenFiles> {
  await mkdir(outDir, { recursive: true });
  const files: WrittenFiles = {
    invoicesCsv: path.join(outDir, "invoices.csv"),
    lineItemsCsv: path.join(outDir, "line_items.csv"),
    invoicesJson: path.join(outDir, "invoices.json"),
  };
  await Promise.all([
    writeFile(files.invoicesCsv, invoicesToCsv(invoices), "utf8"),
    writeFile(files.lineItemsCsv, lineItemsToCsv(invoices), "utf8"),
    writeFile(files.invoicesJson, JSON.stringify(invoices, null, 2) + "\n", "utf8"),
  ]);
  return files;
}
