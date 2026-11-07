import { readFile } from "node:fs/promises";
import { PDFParse } from "pdf-parse";

/**
 * Extract the text layer of a PDF. Returns an empty string for scanned
 * (image-only) PDFs; the caller decides what to do with that.
 */
export async function extractPdfText(filePath: string): Promise<string> {
  const bytes = await readFile(filePath);
  const parser = new PDFParse({ data: new Uint8Array(bytes) });
  try {
    const result = await parser.getText();
    return normalizeText(result.text);
  } finally {
    await parser.destroy();
  }
}

/** Collapse whitespace noise and drop pdf-parse's page separators. */
export function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter((line) => line.length > 0 && !/^-- \d+ of \d+ --$/.test(line))
    .join("\n");
}
