import { describe, expect, it } from "vitest";
import { DEFAULT_MODEL, resolveConfig } from "./config.js";

describe("resolveConfig", () => {
  it("falls back to mock mode when no API key is present", () => {
    const cfg = resolveConfig({ env: {} });
    expect(cfg.mode).toBe("mock");
    expect(cfg.modeReason).toMatch(/ANTHROPIC_API_KEY/);
    expect(cfg.model).toBe(DEFAULT_MODEL);
  });

  it("uses Claude when a key is present", () => {
    const cfg = resolveConfig({ env: { ANTHROPIC_API_KEY: "sk-test" } });
    expect(cfg.mode).toBe("claude");
  });

  it("honours --mock even with a key", () => {
    const cfg = resolveConfig({ forceMock: true, env: { ANTHROPIC_API_KEY: "sk-test" } });
    expect(cfg.mode).toBe("mock");
    expect(cfg.modeReason).toMatch(/--mock/);
  });

  it("resolves the model from flag, then env, then default", () => {
    expect(resolveConfig({ env: { CLAUDE_MODEL: "env-model" } }).model).toBe("env-model");
    expect(resolveConfig({ model: "flag-model", env: { CLAUDE_MODEL: "env-model" } }).model).toBe("flag-model");
  });
});
