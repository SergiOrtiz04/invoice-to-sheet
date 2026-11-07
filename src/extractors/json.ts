/**
 * Parse JSON from an LLM reply defensively.
 *
 * Even with a "JSON only" instruction, models occasionally wrap the payload in
 * a ```json fence or add a short preamble. We strip fences, then fall back to
 * the outermost {...} block before giving up.
 */
export function parseJsonLoose(text: string): unknown {
  const trimmed = text.trim();

  const candidates: string[] = [trimmed];

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) candidates.unshift(fenced[1].trim());

  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first !== -1 && last > first) candidates.push(trimmed.slice(first, last + 1));

  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch (err) {
      lastError = err;
    }
  }
  throw new SyntaxError(
    `Could not find valid JSON in model output: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}
