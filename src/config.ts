/**
 * Central configuration. Everything that could change between environments
 * lives here so the rest of the code never reads `process.env` directly.
 */

/** Default Claude model. Override with the CLAUDE_MODEL environment variable. */
export const DEFAULT_MODEL = "claude-sonnet-4-5";

/** Upper bound on tokens Claude may return for a single invoice. */
export const MAX_OUTPUT_TOKENS = 2048;

/**
 * Rounding tolerance for arithmetic checks (subtotal + tax = total, etc.).
 * Absolute floor of 0.02 handles cent rounding; the relative part handles
 * large invoices where vendors round line items independently.
 */
export const AMOUNT_TOLERANCE_ABS = 0.02;
export const AMOUNT_TOLERANCE_REL = 0.001;

/** Extractions below this confidence are flagged for human review. */
export const MIN_CONFIDENCE = 0.7;

export type ExtractionMode = "claude" | "mock";

export interface RuntimeConfig {
  mode: ExtractionMode;
  /** Human-readable explanation of why this mode was chosen (shown in logs). */
  modeReason: string;
  model: string;
  apiKey?: string;
}

export interface ResolveConfigOptions {
  /** `--mock` CLI flag. */
  forceMock?: boolean;
  /** `--model` CLI flag. */
  model?: string;
  env?: NodeJS.ProcessEnv;
}

/**
 * Decide which extractor to run. Mock mode is used when explicitly requested
 * or when no API key is available, so the demo always works end-to-end.
 */
export function resolveConfig(opts: ResolveConfigOptions = {}): RuntimeConfig {
  const env = opts.env ?? process.env;
  const apiKey = env.ANTHROPIC_API_KEY?.trim() || undefined;
  const model = opts.model?.trim() || env.CLAUDE_MODEL?.trim() || DEFAULT_MODEL;

  if (opts.forceMock) {
    return { mode: "mock", modeReason: "--mock flag passed", model, apiKey };
  }
  if (!apiKey) {
    return {
      mode: "mock",
      modeReason: "ANTHROPIC_API_KEY is not set (add it to .env to use Claude)",
      model,
      apiKey,
    };
  }
  return { mode: "claude", modeReason: `ANTHROPIC_API_KEY found, model ${model}`, model, apiKey };
}
