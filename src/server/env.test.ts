import { describe, expect, it } from "vitest";
import { rankingModel } from "./env";
import { supportsEffort } from "./rank";

describe("rankingModel", () => {
  it("defaults to the smallest model", () => {
    expect(rankingModel(undefined)).toBe("claude-haiku-5-5");
    expect(rankingModel("")).toBe("claude-haiku-5-5");
  });

  it("takes a short name or a full model ID", () => {
    expect(rankingModel("Sonnet")).toBe("claude-sonnet-5-5");
    expect(rankingModel(" opus ")).toBe("claude-opus-5-5");
    expect(rankingModel("claude-sonnet-5")).toBe("claude-sonnet-5");
  });

  it("turns AI ranking off for free rule-based picks", () => {
    for (const v of ["off", "OFF", "none", "rules", "false", "0"]) expect(rankingModel(v)).toBeNull();
  });
});

describe("supportsEffort", () => {
  it("leaves effort off only for models that reject it", () => {
    expect(supportsEffort("claude-haiku-5-5")).toBe(true);
    expect(supportsEffort("claude-opus-5-5")).toBe(true);
    expect(supportsEffort("claude-haiku-4-5")).toBe(false);
  });
});
