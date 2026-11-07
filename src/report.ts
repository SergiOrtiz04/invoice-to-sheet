import type { PipelineResult } from "./pipeline.js";

/** Fixed-width text table for the terminal; no dependency needed. */
export function renderTable(rows: string[][], headers: string[]): string {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)));
  const line = (cells: string[]) => "| " + cells.map((c, i) => c.padEnd(widths[i]!)).join(" | ") + " |";
  const rule = "+" + widths.map((w) => "-".repeat(w + 2)).join("+") + "+";
  return [rule, line(headers), rule, ...rows.map(line), rule].join("\n");
}

const fmtMoney = (n: number | null): string =>
  n == null ? "-" : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function renderSummary(result: PipelineResult): string {
  const headers = ["File", "Vendor", "Invoice #", "Date", "Cur", "Total", "Items", "Conf", "Review"];
  const rows = result.invoices.map((inv) => [
    inv.source_file,
    inv.vendor.length > 28 ? inv.vendor.slice(0, 27) + "…" : inv.vendor,
    inv.invoice_number ?? "-",
    inv.invoice_date ?? "-",
    inv.currency,
    fmtMoney(inv.total),
    String(inv.line_items.length),
    inv.confidence.toFixed(2),
    inv.needs_review ? "YES" : "no",
  ]);

  const parts = [renderTable(rows, headers)];

  const flagged = result.invoices.filter((i) => i.needs_review);
  if (flagged.length > 0) {
    parts.push("", "Needs review:");
    for (const inv of flagged) {
      for (const reason of inv.review_reasons) parts.push(`  - ${inv.source_file}: ${reason}`);
    }
  }
  if (result.failures.length > 0) {
    parts.push("", "Failed:");
    for (const f of result.failures) parts.push(`  - ${f.source_file}: ${f.error}`);
  }

  const totalsByCurrency = new Map<string, number>();
  for (const inv of result.invoices) {
    totalsByCurrency.set(inv.currency, (totalsByCurrency.get(inv.currency) ?? 0) + inv.total);
  }
  parts.push(
    "",
    `${result.invoices.length} invoice(s) processed, ${flagged.length} flagged for review, ${result.failures.length} failed.`,
    "Totals by currency: " +
      [...totalsByCurrency.entries()].map(([cur, sum]) => `${cur} ${fmtMoney(sum)}`).join(", "),
  );
  return parts.join("\n");
}
