# Loom script: invoice-to-sheet (90 seconds)

Target length: 85–95 seconds. Record at 1080p with the terminal on the left and a browser (Google Sheets) on the right. Font size 16+ in the terminal. Read naturally; the timings are a guide, not a metronome.

Before recording:

- `npm install` done, `rm -rf output` so the folder is created on camera.
- Terminal cleared, cwd = project root, `samples/` visible in a file explorer or `ls` output.
- A blank Google Sheet already open in the browser tab.
- Optional: have `samples/tecnosol-gtq.pdf` open in a PDF viewer to show the source.

---

**[0:00–0:12] Hook**

> Hi, I'm Sergio. If your team still retypes supplier invoices into a spreadsheet, this is a tool I built that does it for you in one command, and tells you when a number doesn't add up. Let me show you.

**[0:12–0:25] Show the input**

*(Show the samples folder, open one PDF briefly.)*

> Here are three invoices from three different vendors: a US SaaS company in dollars, a Guatemalan supplier in quetzales with tax-inclusive prices, and a German studio in euros with the European number format. Different layouts, different languages.

**[0:25–0:45] Run it**

*(Type `npm run demo` and let it run.)*

> One command. It reads the text layer of each PDF, sends it to Claude with a strict "JSON only" prompt, and validates the answer against a schema. Notice it prints which mode it's running in — right now this is the offline mode so I'm not spending API credits on a demo, but with an API key it's the exact same pipeline with Claude doing the extraction.

*(Point at the summary table.)*

> Vendor, invoice number, date, currency, total, number of line items, a confidence score, and a review flag. All three reconcile: subtotal plus tax equals total, and the line items add up.

**[0:45–1:05] Open the output in Sheets**

*(Drag `output/invoices.csv` into the Google Sheet or use File → Import.)*

> The output is a plain CSV, so it drops straight into Google Sheets or Excel. One row per invoice. There's a second file with one row per line item if you want to pivot by product or vendor.

*(Scroll to the `needs_review` column.)*

> This column is the important one. If subtotal plus tax doesn't match the total, if the dates look wrong, or if the model wasn't confident, the row says TRUE and the next column tells you why. Your accountant filters on one column instead of re-checking everything.

**[1:05–1:20] Why this matters**

> For a business doing fifty invoices a week this is about three hours of data entry gone, and the errors get caught by code instead of by the bank. Per hundred invoices the API cost is cents, not dollars.

**[1:20–1:30] Call to action**

> The code is open source, link below. If you have a document workflow like this — invoices, purchase orders, bank statements — send me a sample and I'll show you what it looks like automated. Thanks for watching.

---

## Fallbacks

- If `npm run demo` is slow to start on camera, run it once before recording so the TypeScript cache is warm.
- If you want to show a flagged row, edit `samples/` generation in `scripts/generate-samples.py` to print a wrong total on one invoice, regenerate, and the table will show `YES` with the reason.
- If asked about scanned PDFs: "This demo reads the text layer; for scans you'd add an OCR step or send the page image to Claude directly. Same pipeline."
