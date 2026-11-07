#!/usr/bin/env node
import { stat } from "node:fs/promises";
import path from "node:path";
import { Command } from "commander";
import { config as loadDotenv } from "dotenv";
import { DEFAULT_MODEL, resolveConfig } from "./config.js";
import { writeOutputs } from "./output.js";
import { processFolder } from "./pipeline.js";
import { renderSummary } from "./report.js";

loadDotenv({ quiet: true });

const program = new Command()
  .name("invoice-to-sheet")
  .description("Extract structured data from a folder of PDF invoices into CSV/JSON using Claude.")
  .version("1.0.0")
  .argument("<input-dir>", "folder containing .pdf invoices")
  .option("-o, --out <dir>", "output folder", "output")
  .option("-m, --mock", "use the offline rule-based extractor (no API calls)", false)
  .option("--model <name>", `Claude model id (default: $CLAUDE_MODEL or ${DEFAULT_MODEL})`)
  .option("-c, --concurrency <n>", "PDFs processed in parallel", (v) => Number.parseInt(v, 10), 3)
  .option("-q, --quiet", "only print the final summary", false)
  .showHelpAfterError();

program.action(async (inputDir: string, opts: { out: string; mock: boolean; model?: string; concurrency: number; quiet: boolean }) => {
  const log = (msg: string) => {
    if (!opts.quiet) console.error(msg);
  };

  const inputPath = path.resolve(inputDir);
  const info = await stat(inputPath).catch(() => null);
  if (!info?.isDirectory()) {
    console.error(`error: "${inputDir}" is not a directory`);
    process.exit(2);
  }

  const config = resolveConfig({ forceMock: opts.mock, model: opts.model });
  const banner = config.mode === "mock" ? "MOCK (offline, rule-based)" : `CLAUDE (${config.model})`;
  log(`invoice-to-sheet`);
  log(`  mode:   ${banner}`);
  log(`  why:    ${config.modeReason}`);
  log(`  input:  ${inputPath}`);
  log(`  output: ${path.resolve(opts.out)}`);
  log("");

  const started = Date.now();
  const result = await processFolder(inputPath, config, {
    concurrency: opts.concurrency,
    onProgress: (e) => {
      if (e.status === "start") log(`  → ${e.file}`);
      if (e.status === "failed") log(`  ✖ ${e.file}: ${e.message}`);
    },
  });

  if (result.invoices.length === 0 && result.failures.length === 0) {
    console.error(`No .pdf files found in ${inputPath}`);
    process.exit(1);
  }

  const files = await writeOutputs(result.invoices, opts.out);
  log("");
  console.log(renderSummary(result));
  console.log("");
  console.log(`Wrote ${path.relative(process.cwd(), files.invoicesCsv)}, ${path.relative(process.cwd(), files.lineItemsCsv)}, ${path.relative(process.cwd(), files.invoicesJson)} in ${((Date.now() - started) / 1000).toFixed(1)}s`);

  process.exitCode = result.failures.length > 0 ? 1 : 0;
});

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
