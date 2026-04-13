import {
  OCR_CUSTOM_MODULE_SCOPE_PREFIX,
  type CustomRecognitionModule,
  type OcrCustomRule,
  type OcrRuleScreenScope,
  type ParseResult,
  type ParsedAsset,
  type ScreenType
} from "../domain/types";
import { normalizeOcrRuleScreenScope } from "../storage/ocrCustomRulesStore";
import { buildRuleSummary, parseMoney, safeAsset } from "./shared";

type Template = {
  type: Exclude<ScreenType, "custom">;
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

type PickMeta = { amount: number; matchedLabel: string };

function pickAmountByLabelWithMeta(
  lines: string[],
  label: string | string[],
  options?: {
    excludeKeywords?: string[];
    allowNegative?: boolean;
    sameLineOnly?: boolean;
    lookAheadLines?: number;
  }
): PickMeta | null {
  const excludeKeywords = options?.excludeKeywords ?? [];
  const labels = Array.isArray(label) ? label : [label];
  const lookAheadLines = options?.sameLineOnly ? 0 : Math.max(1, options?.lookAheadLines ?? 1);
  const candidates: PickMeta[] = [];

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
      candidates.push({ amount: inlineAmount, matchedLabel });
      continue;
    }

    const sameLineNumbers = line.match(NUMBER_RE) ?? [];
    for (const rawNum of sameLineNumbers) {
      const value = parseMoney(rawNum);
      if (value !== null) {
        candidates.push({ amount: value, matchedLabel });
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
            candidates.push({ amount: value, matchedLabel });
            break;
          }
        }
      }
    }
  }

  const filtered = options?.allowNegative ? candidates : candidates.filter((c) => c.amount >= 0);
  if (!filtered.length) {
    return null;
  }
  return filtered.sort((a, b) => b.amount - a.amount)[0];
}

function parseByLineRules(
  raw: string,
  source: Exclude<ScreenType, "custom">,
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
      const picked = pickAmountByLabelWithMeta(lines, rule.label, {
        excludeKeywords: rule.excludeKeywords,
        allowNegative: rule.allowNegative,
        sameLineOnly: rule.sameLineOnly ?? true,
        lookAheadLines: rule.lookAheadLines
      });
      if (!picked) {
        return null;
      }
      const { amount, matchedLabel } = picked;
      const displayLabel = matchedLabel.trim() || rule.name;
      return safeAsset({
        name: displayLabel,
        amount,
        assetClass: rule.assetClass,
        source,
        confidence: 0.9,
        recognizedLabel: displayLabel,
        ruleSummary: buildRuleSummary(displayLabel, amount, rule.assetClass)
      });
    })
    .filter((item): item is ParsedAsset => item !== null);
}

function compactForMatch(text: string): string {
  return text.replace(/\s+/g, "");
}

/** 在已去空白的字符串中，取 anchor 之后出现的第一个金额数字（可与关键词紧挨或间隔若干非数字字符） */
function firstNumberAfterAnchorInCompact(compactLine: string, anchorCompact: string): number | null {
  const idx = compactLine.indexOf(anchorCompact);
  if (idx < 0) {
    return null;
  }
  const tail = compactLine.slice(idx + anchorCompact.length);
  const m = tail.match(/-?\d[\d,]*(?:\.\d{1,2})?/);
  if (!m) {
    return null;
  }
  return parseMoney(m[0]);
}

function ruleScreenScopeAllows(
  rule: OcrCustomRule,
  detectedScreen: ParseResult["screenType"],
  compactOcr: string,
  customModuleById: Map<string, CustomRecognitionModule>
): boolean {
  const scope: OcrRuleScreenScope =
    normalizeOcrRuleScreenScope(rule.screenScope) ?? (rule.screenScope ?? "any");
  if (scope === "any") {
    return true;
  }
  if (typeof scope === "string" && scope.startsWith(OCR_CUSTOM_MODULE_SCOPE_PREFIX)) {
    const moduleId = scope.slice(OCR_CUSTOM_MODULE_SCOPE_PREFIX.length);
    const mod = customModuleById.get(moduleId);
    if (!mod?.keywords.length) {
      return false;
    }
    const compactKws = mod.keywords.map((k) => compactForMatch(k.trim())).filter(Boolean);
    return compactKws.length > 0 && compactKws.every((k) => compactOcr.includes(k));
  }
  if (scope === "alipay") {
    return detectedScreen === "alipay_wealth" || detectedScreen === "alipay_fund";
  }
  if (scope === "cmb") {
    return detectedScreen === "cmb_property" || detectedScreen === "cmb_wealth";
  }
  return scope === detectedScreen;
}

function parseCustomRules(
  raw: string,
  rules: OcrCustomRule[],
  detectedScreen: ParseResult["screenType"],
  customRecognitionModules: CustomRecognitionModule[]
): ParsedAsset[] {
  if (!rules.length) {
    return [];
  }
  const compactOcr = compactForMatch(raw);
  const customModuleById = new Map(customRecognitionModules.map((m) => [m.id, m]));
  const lines = toLines(raw);
  const linesToScan = lines.length > 0 ? lines : [raw];
  const assets: ParsedAsset[] = [];

  for (const rule of rules) {
    if (!ruleScreenScopeAllows(rule, detectedScreen, compactOcr, customModuleById)) {
      continue;
    }
    const anchor = compactForMatch(rule.sourceSnippet.trim());
    if (!anchor || !compactOcr.includes(anchor)) {
      continue;
    }

    const candidateAmounts: number[] = [];

    for (let i = 0; i < linesToScan.length; i += 1) {
      const line = linesToScan[i];
      const lc = compactForMatch(line);
      if (!lc.includes(anchor)) {
        continue;
      }

      const inline = firstNumberAfterAnchorInCompact(lc, anchor);
      if (inline !== null && Number.isFinite(inline) && inline >= 0) {
        candidateAmounts.push(inline);
        continue;
      }

      if (i + 1 < linesToScan.length) {
        const nextLine = linesToScan[i + 1];
        if (isMostlyAmountLine(nextLine)) {
          const nums = nextLine.match(NUMBER_RE) ?? [];
          const first = nums[0];
          if (first) {
            const v = parseMoney(first);
            if (v !== null && v >= 0) {
              candidateAmounts.push(v);
            }
          }
        }
      }
    }

    if (!candidateAmounts.length) {
      const fallback = firstNumberAfterAnchorInCompact(compactOcr, anchor);
      if (fallback !== null && Number.isFinite(fallback) && fallback >= 0) {
        candidateAmounts.push(fallback);
      }
    }

    if (!candidateAmounts.length) {
      continue;
    }

    const amount = Math.max(...candidateAmounts);
    const label = rule.recognizedContent.trim() || rule.sourceSnippet.trim();
    const built = safeAsset({
      name: label,
      amount,
      assetClass: rule.assetClass,
      source: "custom",
      confidence: 0.82,
      recognizedLabel: label,
      ruleSummary: buildRuleSummary(label, amount, rule.assetClass)
    });
    if (built) {
      assets.push(built);
    }
  }
  return assets;
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

export function parseOcrText(
  raw: string,
  customRules: OcrCustomRule[] = [],
  customRecognitionModules: CustomRecognitionModule[] = []
): ParseResult {
  const compactText = raw.replace(/\s+/g, "");
  const lines = toLines(raw);
  const screenType = detectScreenType(compactText);
  const customAssets = parseCustomRules(raw, customRules, screenType, customRecognitionModules);

  if (screenType === "unknown") {
    const warnings: string[] = [];
    if (!customAssets.length) {
      warnings.push("暂未识别到支持的页面，请检查截图是否包含页面标题与金额。");
    }
    return {
      screenType,
      assets: customAssets,
      reportedTotal: parseReportedTotal(lines),
      warnings
    };
  }

  const template = templates.find((item) => item.type === screenType);
  const templateAssets = template ? template.parse(raw) : [];
  const assets = [...templateAssets, ...customAssets];

  const warnings: string[] = [];
  if (!templateAssets.length && !customAssets.length) {
    warnings.push("识别到了页面类型，但未提取到金额。建议调整截图范围或在设置中添加自定义规则。");
  }

  return {
    screenType,
    assets,
    reportedTotal: parseReportedTotal(lines),
    warnings
  };
}
