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

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function pickClosestInlineAmount(line: string, label: string): number | null {
  const inlineMatch = line.match(new RegExp(`${escapeRegExp(label)}[^\\d-]{0,8}(-?\\d[\\d,]*(?:\\.\\d{1,2})?)`));
  if (!inlineMatch?.[1]) {
    return null;
  }
  return parseMoney(inlineMatch[1]);
}

function isMostlyAmountLine(line: string): boolean {
  const normalized = line.replace(/[¥$,\s]/g, "");
  return /^[-+]?\d+(?:\.\d{1,2})?(?:[%＋+]\d+(?:\.\d{1,2})?)?$/.test(normalized);
}

function pickAmountByLabel(
  lines: string[],
  label: string | string[],
  options?: {
    excludeKeywords?: string[];
    allowNegative?: boolean;
    sameLineOnly?: boolean;
    lookAheadLines?: number;
  }
): number | null {
  const excludeKeywords = options?.excludeKeywords ?? [];
  const labels = Array.isArray(label) ? label : [label];
  const lookAheadLines = options?.sameLineOnly ? 0 : Math.max(1, options?.lookAheadLines ?? 1);
  const candidates: number[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const matchedLabel = labels.find((item) => line.includes(item));
    if (!matchedLabel) {
      continue;
    }
    if (includesAny(line, excludeKeywords)) {
      continue;
    }

    const inlineAmount = pickClosestInlineAmount(line, matchedLabel);
    if (inlineAmount !== null) {
      candidates.push(inlineAmount);
      continue;
    }

    const sameLineNumbers = line.match(NUMBER_RE) ?? [];
    for (const rawNum of sameLineNumbers) {
      const value = parseMoney(rawNum);
      if (value !== null) {
        candidates.push(value);
      }
    }

    if (!sameLineNumbers.length && lookAheadLines > 0) {
      for (let step = 1; step <= lookAheadLines && i + step < lines.length; step += 1) {
        const nextLine = lines[i + step];
        if (includesAny(nextLine, excludeKeywords)) {
          continue;
        }
        if (!isMostlyAmountLine(nextLine)) {
          continue;
        }
        const nextLineNumbers = nextLine.match(NUMBER_RE) ?? [];
        const nextNumber = nextLineNumbers[0];
        if (nextNumber) {
          const value = parseMoney(nextNumber);
          if (value !== null) {
            candidates.push(value);
            break;
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
    label: string | string[];
    assetClass: ParsedAsset["assetClass"];
    excludeKeywords?: string[];
    allowNegative?: boolean;
    sameLineOnly?: boolean;
    lookAheadLines?: number;
  }>
): ParsedAsset[] {
  const lines = toLines(raw);
  return rules
    .map((rule) => {
      const amount = pickAmountByLabel(lines, rule.label, {
        excludeKeywords: rule.excludeKeywords,
        allowNegative: rule.allowNegative,
        sameLineOnly: rule.sameLineOnly ?? true,
        lookAheadLines: rule.lookAheadLines
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
        { name: "招行个人养老金", label: ["专项", "专項"], assetClass: "insurance", excludeKeywords: ["收益"] },
        { name: "招行理财持仓", label: "理财", assetClass: "wealth_management", excludeKeywords: ["收益", "昨日"] },
        { name: "招行基金持仓", label: "基金", assetClass: "fund", excludeKeywords: ["收益", "累计"] },
        {
          name: "招行黄金持仓",
          label: ["黄金", "黃金", "黃全", "贵金属"],
          assetClass: "stock",
          excludeKeywords: ["收益"],
          sameLineOnly: false,
          lookAheadLines: 2
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
    keywords: ["支付宝", "余额宝", "余颧宝", "借呗", "花呗", "储蓄1养老", "家庭保障"],
    parse: (raw) =>
      parseByLineRules(raw, "alipay_wealth", [
        { name: "支付宝余额宝", label: ["余额宝", "余颧宝", "余額宝"], assetClass: "cash", excludeKeywords: ["收益"] },
        { name: "支付宝基金持仓", label: "基金", assetClass: "fund", excludeKeywords: ["收益", "自选"] },
        {
          name: "支付宝养老储蓄",
          label: ["储蓄|养老", "储蓄1养老", "储蓄I养老", "储蓄养老", "养老"],
          assetClass: "insurance",
          excludeKeywords: ["收益"]
        },
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
  if (includesAny(text, ["余额宝", "余颧宝", "借呗", "花呗", "储蓄1养老", "家庭保障", "余利宝"])) {
    return "alipay_wealth";
  }
  if (includesAny(text, ["活钱", "朝朝宝", "朝朝盈", "专项", "招商银行"])) {
    return "cmb_property";
  }
  if (includesAny(text, ["零钱通", "微信零钱", "微信钱包", "服务"])) {
    return "wechat_wallet";
  }
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
