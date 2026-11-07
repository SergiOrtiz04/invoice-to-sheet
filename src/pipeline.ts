import { readdir } from "node:fs/promises";
import path from "node:path";
import type { RuntimeConfig } from "./config.js";
import { ClaudeExtractor } from "./extractors/claude.js";
import { MockExtractor } from "./extractors/mock.js";
import { ExtractionError, type Extractor } from "./extractors/types.js";
import { extractPdfText } from "./pdf.js";
import { reconcile } from "./reconcile.js";
import type { Invoice } from "./schema.js";

export interface PipelineFailure {
  source_file: string;
  error: string;
}

export interface PipelineResult {
  invoices: Invoice[];
  failures: PipelineFailure[];
}

export interface PipelineOptions {
  /** How many PDFs to process in parallel. Keep modest to respect API rate limits. */
  concurrency?: number;
  onProgress?: (event: { file: string; status: "start" | "done" | "failed"; message?: string }) => void;
}

export function createExtractor(config: RuntimeConfig): Extractor {
  if (config.mode === "mock") return new MockExtractor();
  if (!config.apiKey) throw new Error("Claude mode requires an API key");
  return new ClaudeExtractor({ apiKey: config.apiKey, model: config.model });
}

export async function listPdfFiles(inputDir: string): Promise<string[]> {
  const entries = await readdir(inputDir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".pdf"))
    .map((e) => path.join(inputDir, e.name))
    .sort();
}

/** Process one PDF end to end: text -> extractor -> schema -> reconciliation. */
export async function processPdf(filePath: string, extractor: Extractor, config: RuntimeConfig): Promise<Invoice> {
  const sourceFile = path.basename(filePath);
  const text = await extractPdfText(filePath);
  if (text.trim().length === 0) {
    throw new ExtractionError("PDF has no text layer (scanned image?). OCR is out of scope for this demo.", sourceFile);
  }
  const raw = await extractor.extract(text, sourceFile);
  return reconcile(raw, sourceFile, config.mode);
}

/** Process every PDF in a folder with bounded parallelism. Never throws for a single bad file. */
export async function processFolder(
  inputDir: string,
  config: RuntimeConfig,
  opts: PipelineOptions = {},
): Promise<PipelineResult> {
  const files = await listPdfFiles(inputDir);
  const extractor = createExtractor(config);
  const concurrency = Math.max(1, opts.concurrency ?? 3);

  const invoices: Invoice[] = [];
  const failures: PipelineFailure[] = [];

  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < files.length) {
      const file = files[next++]!;
      const name = path.basename(file);
      opts.onProgress?.({ file: name, status: "start" });
      try {
        const invoice = await processPdf(file, extractor, config);
        invoices.push(invoice);
        opts.onProgress?.({ file: name, status: "done" });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        failures.push({ source_file: name, error: message });
        opts.onProgress?.({ file: name, status: "failed", message });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, files.length) }, worker));

  // Workers finish out of order; keep output deterministic.
  invoices.sort((a, b) => a.source_file.localeCompare(b.source_file));
  failures.sort((a, b) => a.source_file.localeCompare(b.source_file));
  return { invoices, failures };
}
