import { describe, expect, it, vi } from "vitest";
import { ClaudeExtractor } from "./claude.js";
import { parseJsonLoose } from "./json.js";

const validJson = JSON.stringify({
  vendor: "ACME",
  invoice_number: "INV-1",
  invoice_date: "2025-09-03",
  due_date: null,
  currency: "USD",
  subtotal: 100,
  tax: 0,
  total: 100,
  line_items: [],
  confidence: 0.9,
});

/** Minimal stand-in for the Anthropic client; returns canned replies in order. */
function fakeClient(replies: string[]) {
  const create = vi.fn(async () => ({
    content: [{ type: "text", text: replies.shift() ?? "" }],
  }));
  return { client: { messages: { create } } as never, create };
}

describe("parseJsonLoose", () => {
  it("parses plain JSON", () => {
    expect(parseJsonLoose('{"a":1}')).toEqual({ a: 1 });
  });

  it("strips markdown code fences", () => {
    expect(parseJsonLoose('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseJsonLoose('```\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("recovers JSON surrounded by prose", () => {
    expect(parseJsonLoose('Here you go:\n{"a":1}\nLet me know!')).toEqual({ a: 1 });
  });

  it("throws on garbage", () => {
    expect(() => parseJsonLoose("no json here")).toThrow(SyntaxError);
  });
});

describe("ClaudeExtractor", () => {
  it("returns a validated invoice on the first try", async () => {
    const { client, create } = fakeClient([validJson]);
    const extractor = new ClaudeExtractor({ apiKey: "k", model: "test-model", client });
    const raw = await extractor.extract("Invoice text", "a.pdf");
    expect(raw.total).toBe(100);
    expect(create).toHaveBeenCalledTimes(1);
    const params = create.mock.calls[0]?.[0] as unknown as { model: string; system: string };
    expect(params.model).toBe("test-model");
    expect(params.system).toMatch(/JSON/);
  });

  it("retries once with the validation error when the reply is invalid", async () => {
    const { client, create } = fakeClient(['```json\n{"vendor": "ACME"}\n```', validJson]);
    const extractor = new ClaudeExtractor({ apiKey: "k", model: "test-model", client });
    const raw = await extractor.extract("Invoice text", "a.pdf");
    expect(raw.invoice_number).toBe("INV-1");
    expect(create).toHaveBeenCalledTimes(2);
    const retry = create.mock.calls[1]?.[0] as unknown as { messages: Array<{ role: string; content: string }> };
    expect(retry.messages).toHaveLength(3);
    expect(retry.messages[2]?.content).toMatch(/rejected by the validator/);
  });

  it("gives up after the second invalid reply", async () => {
    const { client, create } = fakeClient(["not json", "still not json"]);
    const extractor = new ClaudeExtractor({ apiKey: "k", model: "test-model", client });
    await expect(extractor.extract("Invoice text", "a.pdf")).rejects.toThrow(/invalid JSON twice/);
    expect(create).toHaveBeenCalledTimes(2);
  });
});
