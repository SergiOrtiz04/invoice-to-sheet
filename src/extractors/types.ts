import type { RawInvoice } from "../schema.js";

/**
 * Anything that can turn invoice text into a structured record.
 * Both the Claude-backed extractor and the offline mock implement this,
 * which is what lets the pipeline and the tests stay agnostic.
 */
export interface Extractor {
  readonly name: string;
  extract(text: string, sourceFile: string): Promise<RawInvoice>;
}

/** Thrown when an extractor cannot produce a schema-valid result. */
export class ExtractionError extends Error {
  constructor(
    message: string,
    public readonly sourceFile: string,
    cause?: unknown,
  ) {
    super(message, { cause });
    this.name = "ExtractionError";
  }
}
