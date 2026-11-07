import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { INVOICE_COLUMNS, invoicesToCsv, lineItemsToCsv, writeOutputs } from "./output.js";
import type { Invoice } from "./schema.js";

const invoice: Invoice = {
  source_file: "acme.pdf",
  vendor: 'ACME "Cloud", Inc.',
  invoice_number: "INV-1",
  invoice_date: "2025-09-03",
  due_date: null,
  currency: "USD",
  subtotal: 100,
  tax: null,
  total: 100,
  line_items: [{ description: "Widgets, large", quantity: 2, unit_price: 50, amount: 100 }],
  confidence: 0.9,
  extraction_mode: "mock",
  needs_review: true,
  review_reasons: ["subtotal and tax not found", "no due date"],
};

describe("invoicesToCsv", () => {
  it("writes a header row in the documented column order", () => {
    const [header] = invoicesToCsv([invoice]).split("\n");
    expect(header).toBe(INVOICE_COLUMNS.join(","));
  });

  it("quotes commas and doubles embedded quotes (RFC 4180)", () => {
    const [, row] = invoicesToCsv([invoice]).trimEnd().split("\n");
    expect(row).toContain('"ACME ""Cloud"", Inc."');
  });

  it("renders nulls as empty cells and booleans as TRUE/FALSE for spreadsheets", () => {
    const [, row] = invoicesToCsv([invoice]).trimEnd().split("\n");
    const cells = row!.split(",");
    // due_date (index 4) and tax (index 7) are null
    expect(cells[cells.length - 3]).toBe("TRUE"); // needs_review
    expect(row).toContain(",2025-09-03,,USD,100,,100,");
    expect(row).toContain("subtotal and tax not found | no due date");
  });

  it("produces only a header for an empty list", () => {
    expect(invoicesToCsv([]).trimEnd()).toBe(INVOICE_COLUMNS.join(","));
  });
});

describe("lineItemsToCsv", () => {
  it("emits one row per line item with invoice context", () => {
    const lines = lineItemsToCsv([invoice]).trimEnd().split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe('acme.pdf,INV-1,"ACME ""Cloud"", Inc.",USD,"Widgets, large",2,50,100');
  });
});

describe("writeOutputs", () => {
  let dir: string;
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("creates the output folder and all three files", async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "invoice-to-sheet-"));
    const out = path.join(dir, "nested", "output");
    const files = await writeOutputs([invoice], out);

    const json = JSON.parse(await readFile(files.invoicesJson, "utf8")) as Invoice[];
    expect(json).toEqual([invoice]);

    const csv = await readFile(files.invoicesCsv, "utf8");
    expect(csv.split("\n")[0]).toBe(INVOICE_COLUMNS.join(","));
    expect((await readFile(files.lineItemsCsv, "utf8")).split("\n")).toHaveLength(3);
  });
});
