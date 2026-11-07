import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { MAX_OUTPUT_TOKENS } from "../config.js";
import { RAW_INVOICE_JSON_SHAPE, RawInvoiceSchema, type RawInvoice } from "../schema.js";
import { parseJsonLoose } from "./json.js";
import { ExtractionError, type Extractor } from "./types.js";

const SYSTEM_PROMPT = `You are an accounts-payable data entry specialist. You receive the raw text of ONE invoice and return its fields as JSON.

Rules:
- Respond with a single JSON object and nothing else: no prose, no markdown, no code fences.
- Use exactly this shape:
${RAW_INVOICE_JSON_SHAPE}
- Dates must be ISO 8601 (YYYY-MM-DD). Interpret DD/MM/YYYY and DD.MM.YYYY as day-first unless the invoice is clearly US-formatted.
- Numbers must be plain JSON numbers: no currency symbols, no thousands separators. "1.234,56" means 1234.56 in European formats.
- If a field is genuinely absent, use null (or [] for line_items). Never invent values.
- "currency" is the ISO 4217 code. Infer it from symbols or wording if no code is printed ("Q" or "Quetzales" = GTQ, "€" = EUR, "$" with a US address = USD).
- "total" is the final amount payable. Line item amounts should be what is printed, even if they are tax-inclusive.
- Set "confidence" honestly: 0.95+ only when every field was clearly printed, lower when you had to infer.`;

export interface ClaudeExtractorOptions {
  apiKey: string;
  model: string;
  /** Injected in tests; defaults to a real Anthropic client. */
  client?: Pick<Anthropic, "messages">;
}

/**
 * Extractor backed by the Anthropic Messages API.
 * One invoice = one request; invalid output triggers exactly one retry that
 * feeds the validation error back to the model.
 */
export class ClaudeExtractor implements Extractor {
  readonly name: string;
  private readonly client: Pick<Anthropic, "messages">;
  private readonly model: string;

  constructor(opts: ClaudeExtractorOptions) {
    this.model = opts.model;
    this.name = `claude (${opts.model})`;
    this.client = opts.client ?? new Anthropic({ apiKey: opts.apiKey });
  }

  async extract(text: string, sourceFile: string): Promise<RawInvoice> {
    const messages: Anthropic.MessageParam[] = [
      { role: "user", content: `Invoice text:\n\n"""\n${text}\n"""` },
    ];

    let lastProblem: string | undefined;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const reply = await this.ask(messages);
      try {
        return RawInvoiceSchema.parse(parseJsonLoose(reply));
      } catch (err) {
        lastProblem = err instanceof z.ZodError ? z.prettifyError(err) : String(err);
        // Give the model its own answer plus the validation error, once.
        messages.push(
          { role: "assistant", content: reply },
          {
            role: "user",
            content: `That response was rejected by the validator:\n${lastProblem}\n\nReturn the corrected JSON object only.`,
          },
        );
      }
    }
    throw new ExtractionError(`Claude returned invalid JSON twice: ${lastProblem}`, sourceFile);
  }

  private async ask(messages: Anthropic.MessageParam[]): Promise<string> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: SYSTEM_PROMPT,
      messages,
    });
    return response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n");
  }
}
