import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { extractPdfText } from "../pdf.js";
import { reconcile } from "../reconcile.js";
import { detectNumberStyle, MockExtractor, parseAmount, parseDate, parseLineItems } from "./mock.js";

const samplesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../samples");
const extractor = new MockExtractor();

async function run(file: string) {
  const text = await extractPdfText(path.join(samplesDir, file));
  const raw = await extractor.extract(text, file);
  return reconcile(raw, file, "mock");
}

describe("MockExtractor on the sample PDFs", () => {
  it("extracts the US SaaS invoice (USD)", async () => {
    const inv = await run("acme-cloud-usd.pdf");
    expect(inv).toMatchObject({
      vendor: "ACME Cloud Services, Inc.",
      invoice_number: "INV-2025-00417",
      invoice_date: "2025-09-03",
      due_date: "2025-10-03",
      currency: "USD",
      subtotal: 362.7,
      tax: 31.74,
      total: 394.44,
      needs_review: false,
    });
    expect(inv.line_items).toHaveLength(4);
    expect(inv.line_items[0]).toEqual({
      description: "Compute instances (m5.large) - 720 h",
      quantity: 3,
      unit_price: 58.4,
      amount: 175.2,
    });
  });

  it("extracts the Guatemalan invoice (GTQ, Spanish labels, tax-inclusive prices)", async () => {
    const inv = await run("tecnosol-gtq.pdf");
    expect(inv).toMatchObject({
      vendor: "TecnoSol Guatemala, S.A.",
      invoice_number: "2025-1188",
      invoice_date: "2025-09-15",
      due_date: "2025-09-30",
      currency: "GTQ",
      subtotal: 10691.96,
      tax: 1283.04,
      total: 11975,
      needs_review: false,
    });
    expect(inv.line_items.map((li) => li.quantity)).toEqual([1, 2, 1]);
    expect(inv.line_items[1]?.description).toBe('Monitor 27" IPS 1440p');
  });

  it("extracts the German invoice (EUR, 1.234,56 number format)", async () => {
    const inv = await run("nordlicht-eur.pdf");
    expect(inv).toMatchObject({
      vendor: "Nordlicht Design GmbH",
      invoice_number: "NL-2025-0932",
      invoice_date: "2025-09-21",
      due_date: "2025-10-05",
      currency: "EUR",
      subtotal: 3994,
      tax: 758.86,
      total: 4752.86,
      needs_review: false,
    });
    expect(inv.line_items[2]).toEqual({
      description: "Icon set (24 custom icons)",
      quantity: 24,
      unit_price: 18.5,
      amount: 444,
    });
  });

  it("is deterministic", async () => {
    const a = await run("acme-cloud-usd.pdf");
    const b = await run("acme-cloud-usd.pdf");
    expect(a).toEqual(b);
  });
});

describe("mock helpers", () => {
  it("detects number style", () => {
    expect(detectNumberStyle("Total 1,234.56 Tax 12.00")).toBe("us");
    expect(detectNumberStyle("Summe 1.234,56 MwSt 12,00")).toBe("eu");
  });

  it("parses amounts in both styles", () => {
    expect(parseAmount("$ 1,234.56", "us")).toBe(1234.56);
    expect(parseAmount("1.234,56 EUR", "eu")).toBe(1234.56);
    expect(parseAmount("abc", "us")).toBeNull();
  });

  it("normalizes dates and guesses day/month order when unambiguous", () => {
    expect(parseDate("2025-09-03")).toBe("2025-09-03");
    expect(parseDate("15/09/2025")).toBe("2025-09-15");
    expect(parseDate("21.09.2025")).toBe("2025-09-21");
    expect(parseDate("09/15/2025")).toBe("2025-09-15"); // month-first, detectable
    expect(parseDate("not a date")).toBeNull();
    expect(parseDate(null)).toBeNull();
  });

  it("returns no line items when there is no table header", () => {
    expect(parseLineItems(["Invoice 1", "Total: 10.00"], "us")).toEqual([]);
  });
});
