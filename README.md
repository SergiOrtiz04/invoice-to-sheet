# invoice-to-sheet

> Drop a folder of PDF invoices in, get a clean spreadsheet out. Powered by Claude, validated by code.

[Español](./README.es.md) · [Demo script](./docs/loom-script.md) · MIT License

Every small business has the same Monday-morning chore: a pile of supplier invoices that someone has to open one by one and retype into a spreadsheet or accounting tool. Fifty invoices a week at three to four minutes each is roughly **three working hours of pure data entry**, and the typos only surface when the numbers do not reconcile. `invoice-to-sheet` turns that chore into a single command: it reads each PDF, asks Claude to extract the fields as JSON, checks that the arithmetic actually adds up, and writes a CSV that opens directly in Google Sheets or Excel. Anything that looks off is flagged for a human instead of silently landing in your books.

```
$ npm run demo

+--------------------+---------------------------+----------------+------------+-----+-----------+-------+------+--------+
| File               | Vendor                    | Invoice #      | Date       | Cur | Total     | Items | Conf | Review |
+--------------------+---------------------------+----------------+------------+-----+-----------+-------+------+--------+
| acme-cloud-usd.pdf | ACME Cloud Services, Inc. | INV-2025-00417 | 2025-09-03 | USD | 394.44    | 4     | 0.90 | no     |
| nordlicht-eur.pdf  | Nordlicht Design GmbH     | NL-2025-0932   | 2025-09-21 | EUR | 4,752.86  | 3     | 0.90 | no     |
| tecnosol-gtq.pdf   | TecnoSol Guatemala, S.A.  | 2025-1188      | 2025-09-15 | GTQ | 11,975.00 | 3     | 0.90 | no     |
+--------------------+---------------------------+----------------+------------+-----+-----------+-------+------+--------+

3 invoice(s) processed, 0 flagged for review, 0 failed.
Totals by currency: USD 394.44, EUR 4,752.86, GTQ 11,975.00
```

<!-- TODO: replace with a real recording -->
![Demo GIF placeholder: running `npm run demo` and opening output/invoices.csv in Google Sheets](docs/demo.gif)

## 60-second quickstart

Requirements: Node.js 20 or newer.

```bash
git clone <this-repo> invoice-to-sheet && cd invoice-to-sheet
npm install
npm run demo          # runs on samples/ in offline mock mode, no API key needed
```

Open `output/invoices.csv` in Google Sheets (File → Import) or Excel. Line items are in `output/line_items.csv`, and the full structured record in `output/invoices.json`.

To use Claude on your own invoices:

```bash
cp .env.example .env            # paste your ANTHROPIC_API_KEY
npm run build
node dist/cli.js ./my-invoices --out ./output
```

```
Usage: invoice-to-sheet [options] <input-dir>

Options:
  -o, --out <dir>        output folder (default: "output")
  -m, --mock             use the offline rule-based extractor (no API calls)
  --model <name>         Claude model id (default: $CLAUDE_MODEL or claude-sonnet-4-5)
  -c, --concurrency <n>  PDFs processed in parallel (default: 3)
  -q, --quiet            only print the final summary
```

The CLI always prints which mode it is in. If `ANTHROPIC_API_KEY` is missing it falls back to mock mode automatically and tells you why.

## What you get

| File | Contents |
|---|---|
| `output/invoices.csv` | One row per invoice: vendor, number, dates, currency, subtotal, tax, total, confidence, `needs_review`, reasons. Stable column order. |
| `output/line_items.csv` | One row per line item, denormalized with vendor and invoice number so it pivots nicely. |
| `output/invoices.json` | The same data as typed JSON, for feeding an API or a database. |

## Architecture

```
  samples/*.pdf
       │
       ▼
┌──────────────┐    text     ┌─────────────────────────┐   JSON    ┌───────────────┐
│  pdf-parse   │ ──────────▶ │  Extractor (interface)  │ ────────▶ │  zod schema   │
│  text layer  │             │  ├─ ClaudeExtractor      │           │  RawInvoice   │
└──────────────┘             │  │   Messages API,       │           └───────┬───────┘
                             │  │   JSON-only prompt,   │                   │
                             │  │   1 retry on bad JSON │                   ▼
                             │  └─ MockExtractor        │           ┌───────────────┐
                             │      rule-based, offline │           │  reconcile()  │
                             └─────────────────────────┘           │  arithmetic + │
                                                                   │  completeness │
                                                                   │  checks       │
                                                                   └───────┬───────┘
                                                                           ▼
                                                         output/invoices.csv  line_items.csv  invoices.json
```

```
src/
├── cli.ts                 commander entry point, mode banner, summary table
├── config.ts              model name, tolerances, mode resolution (the only place that reads env)
├── schema.ts              zod schemas + the JSON shape sent to Claude (kept side by side)
├── reconcile.ts           needs_review logic
├── pdf.ts                 PDF → normalized text
├── pipeline.ts            folder walk with bounded concurrency, per-file error isolation
├── output.ts              CSV / JSON writers
├── report.ts              terminal table
└── extractors/
    ├── types.ts           Extractor interface
    ├── claude.ts          Anthropic Messages API implementation
    ├── mock.ts            deterministic rule-based implementation
    └── json.ts            fence-stripping JSON parser
```

The pipeline only knows about the `Extractor` interface, so swapping the model provider, adding an OCR step before extraction, or replacing the mock with recorded fixtures are all one-file changes.

## How accuracy is handled

LLM extraction is good but not infallible, so the design assumes every output needs to earn trust:

1. **Schema validation (zod).** The model's JSON is parsed against a strict schema: ISO dates, 3-letter currency codes, non-negative money, positive quantities. If the first reply fails, the validation error is sent back to Claude once with a "fix this" instruction; a second failure marks the file as failed rather than guessing.
2. **Confidence field.** The extractor reports its own 0–1 confidence. Claude is told to be honest about it (high only when every field was printed verbatim). Anything under `0.7` is flagged.
3. **Arithmetic reconciliation.** Independently of the model, `reconcile()` checks that `subtotal + tax = total` and that line items sum to the subtotal (or to the total, for tax-inclusive invoices common in Latin America), with cent-level rounding tolerance. It also checks each `quantity × unit_price = amount`, that invoice number and date exist, and that the due date is not before the invoice date.
4. **`needs_review` flag + reasons.** Any failed check sets `needs_review = TRUE` and lists the reasons in the CSV, so an accountant can filter one column and check only the suspicious rows. The default is to over-flag: a false alarm costs ten seconds, a wrong total costs a lot more.
5. **Per-file isolation.** One corrupt or image-only PDF does not abort the batch; it appears in a "Failed" section of the summary and the exit code is non-zero.

Scanned (image-only) PDFs are out of scope for this demo. The natural extension is an OCR step, or sending the page image to Claude directly since the Messages API accepts PDFs and images.

## Cost estimate

A typical one-page invoice is roughly 500–900 input tokens of text plus about 600 tokens of system prompt, and the JSON reply is 200–400 output tokens. With Claude Sonnet 4.5 that works out to **well under one US dollar per 100 invoices** (about $0.30–0.60 at the time of writing). Prices change, so treat this as an order of magnitude and check [current API pricing](https://www.anthropic.com/pricing). For comparison, 100 invoices is roughly five to six hours of manual entry.

## Extension ideas

- **Push to Google Sheets** via the Sheets API instead of writing a CSV, so the finance team sees new rows appear in real time.
- **Email ingestion**: poll a mailbox (Gmail API / IMAP), grab PDF attachments, run the pipeline, reply with the summary.
- **n8n / Zapier / Make node**: expose `processPdf()` behind a tiny HTTP endpoint and let no-code tools trigger it from Drive or Dropbox uploads.
- **Structured outputs**: the Anthropic API can enforce a JSON schema server-side (`output_config.format`), which would remove the retry path entirely.
- **OCR / vision** for scanned invoices, using the Messages API's native PDF and image inputs.
- **Vendor memory**: cache vendor → tax ID / default currency to catch inconsistencies across months.
- **Accounting sync**: map the JSON to QuickBooks, Xero, or a local ERP import format.

## Development

```bash
npm test          # vitest: schema, reconciliation, CSV writer, mock extractor on real PDFs, Claude retry logic (mocked client)
npm run typecheck
npm run build
python3 scripts/generate-samples.py   # regenerate the sample PDFs (needs reportlab)
```

Developed on Node 22; requires Node 20+. No ESLint on purpose; `strict` + `noUncheckedIndexedAccess` in `tsconfig.json` do most of the work for a project this size.

## Hire me

I build small, reliable automations like this one for teams that are drowning in repetitive document work: invoices, purchase orders, bank statements, contracts. Node.js/TypeScript or Python, Claude or OpenAI, wired into the tools you already use (Google Workspace, n8n, Zapier, your ERP). Based in Guatemala City, fluent in English and Spanish, comfortable with US and European time zones.

Let's talk: **[your-link-here](https://example.com)** <!-- TODO: LinkedIn / Upwork / Calendly -->

---

MIT © Sergio Ortiz
