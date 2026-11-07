import { z } from "zod";

/** ISO-8601 calendar date, e.g. 2025-09-03. */
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "expected an ISO date (YYYY-MM-DD)")
  .refine((s) => !Number.isNaN(Date.parse(s)), "not a real calendar date");

const money = z.number().finite().nonnegative();

export const LineItemSchema = z.object({
  description: z.string().trim().min(1),
  quantity: z.number().finite().positive(),
  unit_price: money,
  amount: money,
});

/**
 * What an extractor (Claude or the mock) must return. This is deliberately
 * the *raw* shape: no review flags yet, those are computed by `reconcile()`.
 */
export const RawInvoiceSchema = z.object({
  vendor: z.string().trim().min(1),
  invoice_number: z.string().trim().min(1).nullable(),
  invoice_date: isoDate.nullable(),
  due_date: isoDate.nullable(),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, "expected a 3-letter ISO 4217 code"),
  subtotal: money.nullable(),
  tax: money.nullable(),
  total: money,
  line_items: z.array(LineItemSchema).default([]),
  /** Extractor's own confidence, 0..1. */
  confidence: z.number().min(0).max(1),
});

/** Final record written to CSV/JSON. */
export const InvoiceSchema = RawInvoiceSchema.extend({
  /** Source file name (basename). */
  source_file: z.string().min(1),
  extraction_mode: z.enum(["claude", "mock"]),
  /** True when any consistency check failed; see `review_reasons`. */
  needs_review: z.boolean(),
  review_reasons: z.array(z.string()),
});

export type LineItem = z.infer<typeof LineItemSchema>;
export type RawInvoice = z.infer<typeof RawInvoiceSchema>;
export type Invoice = z.infer<typeof InvoiceSchema>;

/**
 * JSON-schema-ish description we send to Claude in the system prompt. Kept
 * next to the zod schema so the two cannot drift apart silently.
 */
export const RAW_INVOICE_JSON_SHAPE = `{
  "vendor": string,                     // legal/trade name of the issuer
  "invoice_number": string | null,
  "invoice_date": "YYYY-MM-DD" | null,
  "due_date": "YYYY-MM-DD" | null,
  "currency": string,                   // ISO 4217 code, e.g. "USD", "GTQ", "EUR"
  "subtotal": number | null,            // before tax
  "tax": number | null,                 // total tax/VAT/IVA amount
  "total": number,                      // amount payable
  "line_items": [
    { "description": string, "quantity": number, "unit_price": number, "amount": number }
  ],
  "confidence": number                  // 0..1, your own confidence in this extraction
}`;
