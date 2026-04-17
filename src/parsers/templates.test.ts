import { describe, expect, it } from "vitest";
import type { OcrCustomRule } from "../domain/types";
import { parseOcrText } from "./templates";

describe("parseOcrText", () => {
  it("detects CMB property page and extracts 活期 amount", () => {
    const raw = ["招商银行", "我的总资产", "1,000,000.00", "活期 5,432.10"].join("\n");
    const r = parseOcrText(raw, [], []);
    expect(r.screenType).toBe("cmb_property");
    const cash = r.assets.find((a) => a.amount === 5432.1 && a.assetClass === "cash");
    expect(cash).toBeDefined();
    expect(cash?.amount).toBe(5432.1);
  });

  it("detects Alipay wealth when keywords win over empty custom modules", () => {
    const raw = ["支付宝", "余额宝 3,210.50"].join("\n");
    const r = parseOcrText(raw, [], []);
    expect(r.screenType).toBe("alipay_wealth");
    const yeb = r.assets.find((a) => a.name.includes("余额宝") || a.recognizedLabel?.includes("余额宝"));
    expect(yeb?.amount).toBe(3210.5);
  });

  it("applies OCR custom rules when anchor matches", () => {
    const rules: OcrCustomRule[] = [
      {
        id: "r1",
        sourceSnippet: "自定义锚点",
        recognizedContent: "我的条目",
        assetClass: "fund"
      }
    ];
    const raw = "某页\n自定义锚点\n9,999.00";
    const r = parseOcrText(raw, rules, []);
    const custom = r.assets.find((a) => a.source === "custom");
    expect(custom?.name).toBe("我的条目");
    expect(custom?.amount).toBe(9999);
  });
});
