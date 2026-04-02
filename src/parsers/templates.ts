import type { ParseResult, ParsedAsset, ScreenType } from "../domain/types";
import { parseMoney, safeAsset } from "./shared";

type Template = {
  type: ScreenType;
  keywords: string[];
  parse: (raw: string) => ParsedAsset[];
};

const NUMBER_RE = /-?\d[\d,]*(?:\.\d{1,2})?/g;

function toLines(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function includesAny(text: string, words: string[]): boolean {
  return words.some((word) => text.includes(word));
}

function pickAmountByLabel(
  lines: string[],
  label: string,
  options?: {
    excludeKeywords?: string[];
    allowNegative?: boolean;
    sameLineOnly?: boolean;
  }
): number | null {
  const excludeKeywords = options?.excludeKeywords ?? [];
  const candidates: number[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.includes(label)) {
      continue;
    }
    if (includesAny(line, excludeKeywords)) {
      continue;
    }

    const sameLineNumbers = line.match(NUMBER_RE) ?? [];
    for (const rawNum of sameLineNumbers) {
      const value = parseMoney(rawNum);
      if (value !== null) {
        candidates.push(value);
      }
    }

    if (!sameLineNumbers.length && !options?.sameLineOnly && i + 1 < lines.length) {
      const nextLine = lines[i + 1];
      if (!includesAny(nextLine, excludeKeywords)) {
        const nextLineNumbers = nextLine.match(NUMBER_RE) ?? [];
        for (const rawNum of nextLineNumbers) {
          const value = parseMoney(rawNum);
          if (value !== null) {
            candidates.push(value);
          }
        }
      }
    }
  }

  const normalized = options?.allowNegative ? candidates : candidates.filter((v) => v >= 0);
  if (!normalized.length) {
    return null;
  }
  return normalized.sort((a, b) => b - a)[0];
}

function parseByLineRules(
  raw: string,
  source: ScreenType,
  rules: Array<{
    name: string;
    label: string;
    assetClass: ParsedAsset["assetClass"];
    excludeKeywords?: string[];
    allowNegative?: boolean;
  }>
): ParsedAsset[] {
  const lines = toLines(raw);
  return rules
    .map((rule) => {
      const amount = pickAmountByLabel(lines, rule.label, {
        excludeKeywords: rule.excludeKeywords,
        allowNegative: rule.allowNegative,
        sameLineOnly: true
      });
      if (amount === null) {
        return null;
      }
      return safeAsset({
        name: rule.name,
        amount,
        assetClass: rule.assetClass,
        source,
        confidence: 0.9
      });
    })
    .filter((item): item is ParsedAsset => item !== null);
}

const templates: Template[] = [
  {
    type: "cmb_property",
    keywords: ["招商银行", "总资产", "活期", "理财"],
    parse: (raw) =>
      parseByLineRules(raw, "cmb_property", [
        { name: "招行活钱", label: "活钱", assetClass: "cash", excludeKeywords: ["收益"] },
        { name: "招行活期余额", label: "活期", assetClass: "cash", excludeKeywords: ["收益"] },
        { name: "招行存款", label: "存款", assetClass: "cash", excludeKeywords: ["收益"] },
        { name: "招行理财持仓", label: "理财", assetClass: "wealth_management", excludeKeywords: ["收益", "昨日"] },
        { name: "招行基金持仓", label: "基金", assetClass: "fund", excludeKeywords: ["收益", "累计"] },
        { name: "招行黄金持仓", label: "黄金", assetClass: "stock", excludeKeywords: ["收益"] },
        {
          name: "招行保险持仓",
          label: "保险",
          assetClass: "insurance",
          excludeKeywords: ["收益", "配齐", "特药保", "保障", "广告", "万"]
        }
      ])
  },
  {
    type: "cmb_wealth",
    keywords: ["招商银行", "理财", "持有金额"],
    parse: (raw) =>
      parseByLineRules(raw, "cmb_wealth", [
        { name: "招行理财持仓", label: "持有金额", assetClass: "wealth_management", excludeKeywords: ["收益"] }
      ])
  },
  {
    type: "alipay_wealth",
    keywords: ["总资产", "余额宝", "理财"],
    parse: (raw) =>
      parseByLineRules(raw, "alipay_wealth", [
        { name: "支付宝余额宝", label: "余额宝", assetClass: "cash", excludeKeywords: ["收益"] },
        { name: "支付宝基金持仓", label: "基金", assetClass: "fund", excludeKeywords: ["收益", "自选"] },
        { name: "支付宝养老储蓄", label: "储蓄", assetClass: "insurance", excludeKeywords: ["收益"] },
        { name: "支付宝理财持仓", label: "理财", assetClass: "wealth_management", excludeKeywords: ["收益", "好礼"] }
      ])
  },
  {
    type: "alipay_fund",
    keywords: ["支付宝", "基金", "持有"],
    parse: (raw) =>
      parseByLineRules(raw, "alipay_fund", [
        { name: "支付宝基金持仓", label: "持有", assetClass: "fund", excludeKeywords: ["收益"] }
      ])
  },
  {
    type: "wechat_wallet",
    keywords: ["微信", "钱包", "零钱", "零钱通"],
    parse: (raw) =>
      parseByLineRules(raw, "wechat_wallet", [
        { name: "微信零钱", label: "零钱", assetClass: "cash", excludeKeywords: ["收益"] },
        { name: "微信零钱通", label: "零钱通", assetClass: "wealth_management", excludeKeywords: ["收益"] }
      ])
  }
];

function detectScreenType(text: string): ScreenType | "unknown" {
  const scored = templates
    .map((tpl) => ({
      type: tpl.type,
      score: tpl.keywords.filter((k) => text.includes(k)).length
    }))
    .sort((a, b) => b.score - a.score);
  if (!scored.length || scored[0].score < 2) {
    return "unknown";
  }
  return scored[0].type;
}

function parseReportedTotal(lines: string[]): number | undefined {
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.includes("总资产")) {
      continue;
    }

    const sameLineNumbers = line.match(NUMBER_RE) ?? [];
    for (const rawNum of sameLineNumbers) {
      const value = parseMoney(rawNum);
      if (value !== null && value > 0) {
        return value;
      }
    }

    if (i > 0) {
      const prevLineNumbers = lines[i - 1].match(NUMBER_RE) ?? [];
      for (const rawNum of prevLineNumbers) {
        const value = parseMoney(rawNum);
        if (value !== null && value > 0) {
          return value;
        }
      }
    }

    if (i + 1 < lines.length) {
      const nextLineNumbers = lines[i + 1].match(NUMBER_RE) ?? [];
      for (const rawNum of nextLineNumbers) {
        const value = parseMoney(rawNum);
        if (value !== null && value > 0) {
          return value;
        }
      }
    }
  }
  return undefined;
}

export function parseOcrText(raw: string): ParseResult {
  const compactText = raw.replace(/\s+/g, "");
  const lines = toLines(raw);
  const screenType = detectScreenType(compactText);
  if (screenType === "unknown") {
    return {
      screenType,
      assets: [],
      reportedTotal: parseReportedTotal(lines),
      warnings: ["暂未识别到支持的页面，请检查截图是否包含页面标题与金额。"]
    };
  }

  const template = templates.find((item) => item.type === screenType);
  const assets = template ? template.parse(raw) : [];

  return {
    screenType,
    assets,
    reportedTotal: parseReportedTotal(lines),
    warnings: assets.length ? [] : ["识别到了页面类型，但未提取到金额。建议调整截图范围。"]
  };
}
