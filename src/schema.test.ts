import { describe, expect, it } from "vitest";
import { reconcile } from "./reconcile.js";
import { RawInvoiceSchema, type RawInvoice } from "./schema.js";

const valid: RawInvoice = {
  vendor: "ACME Cloud Services, Inc.",
  invoice_number: "INV-2025-00417",
  invoice_date: "2025-09-03",
  due_date: "2025-10-03",
  currency: "USD",
  subtotal: 362.7,
  tax: 31.74,
  total: 394.44,
  line_items: [
    { description: "Compute", quantity: 3, unit_price: 58.4, amount: 175.2 },
    { description: "Storage", quantity: 1, unit_price: 187.5, amount: 187.5 },
  ],
  confidence: 0.95,
};

describe("RawInvoiceSchema", () => {
  it("accepts a well-formed invoice", () => {
    expect(RawInvoiceSchema.parse(valid)).toEqual(valid);
  });

  it("normalizes currency to upper case and defaults line_items", () => {
    const parsed = RawInvoiceSchema.parse({ ...valid, currency: " gtq ", line_items: undefined });
    expect(parsed.currency).toBe("GTQ");
    expect(parsed.line_items).toEqual([]);
  });

  it.each([
    ["non-ISO date", { invoice_date: "03/09/2025" }],
    ["impossible date", { invoice_date: "2025-13-40" }],
    ["bad currency", { currency: "US$" }],
    ["negative total", { total: -1 }],
    ["confidence > 1", { confidence: 1.5 }],
    ["empty vendor", { vendor: "  " }],
    ["zero quantity", { line_items: [{ description: "x", quantity: 0, unit_price: 1, amount: 0 }] }],
  ])("rejects %s", (_label, patch) => {
    expect(RawInvoiceSchema.safeParse({ ...valid, ...patch }).success).toBe(false);
  });
});

describe("reconcile", () => {
  it("passes a consistent invoice without review flags", () => {
    const inv = reconcile(valid, "a.pdf", "mock");
    expect(inv.needs_review).toBe(false);
    expect(inv.review_reasons).toEqual([]);
    expect(inv.source_file).toBe("a.pdf");
    expect(inv.extraction_mode).toBe("mock");
  });

  it("flags when subtotal + tax does not equal total", () => {
    const inv = reconcile({ ...valid, total: 400 }, "a.pdf", "claude");
    expect(inv.needs_review).toBe(true);
    expect(inv.review_reasons.join()).toMatch(/subtotal \+ tax/);
  });

  it("accepts line items that add up to the tax-inclusive total", () => {
    const gtq: RawInvoice = {
      ...valid,
      currency: "GTQ",
      subtotal: 10691.96,
      tax: 1283.04,
      total: 11975,
      line_items: [
        { description: "Laptop", quantity: 1, unit_price: 7850, amount: 7850 },
        { description: "Monitor", quantity: 2, unit_price: 1890, amount: 3780 },
        { description: "Hub", quantity: 1, unit_price: 345, amount: 345 },
      ],
    };
    expect(reconcile(gtq, "g.pdf", "mock").needs_review).toBe(false);
  });

  it("flags line items that match neither subtotal nor total", () => {
    const inv = reconcile(
      { ...valid, line_items: [{ description: "x", quantity: 1, unit_price: 10, amount: 10 }] },
      "a.pdf",
      "mock",
    );
    expect(inv.review_reasons.join()).toMatch(/line items sum/);
  });

  it("flags low confidence, missing number and inverted dates", () => {
    const inv = reconcile(
      { ...valid, confidence: 0.4, invoice_number: null, due_date: "2025-01-01" },
      "a.pdf",
      "claude",
    );
    expect(inv.needs_review).toBe(true);
    expect(inv.review_reasons).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/missing invoice number/),
        expect.stringMatching(/due date is before/),
        expect.stringMatching(/confidence/),
      ]),
    );
  });

  it("tolerates cent-level rounding differences", () => {
    const inv = reconcile({ ...valid, total: 394.45 }, "a.pdf", "mock");
    expect(inv.needs_review).toBe(false);
  });
});
