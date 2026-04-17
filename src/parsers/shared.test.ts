import { describe, expect, it } from "vitest";
import { buildRuleSummary, normalizeText, parseMoney } from "./shared";

describe("parseMoney", () => {
  it("parses integers and decimals", () => {
    expect(parseMoney("1234.56")).toBe(1234.56);
    expect(parseMoney("0")).toBe(0);
  });

  it("strips thousands separators and spaces", () => {
    expect(parseMoney("1,234,567.8")).toBe(1234567.8);
    expect(parseMoney("12 345")).toBe(12345);
  });

  it("returns null when no number", () => {
    expect(parseMoney("abc")).toBeNull();
    expect(parseMoney("")).toBeNull();
  });
});

describe("normalizeText", () => {
  it("removes commas spaces and normalizes currency wording", () => {
    expect(normalizeText("1,234 元")).toBe("1234");
    expect(normalizeText("人民币100")).toBe("CNY100");
  });
});

describe("buildRuleSummary", () => {
  it("joins label amount and asset class in Chinese", () => {
    const line = buildRuleSummary("  活期  ", 1234.5, "cash");
    expect(line).toContain("活期");
    expect(line).toContain("1,234.50");
    expect(line).toContain("现金");
  });
});
