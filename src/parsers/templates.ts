import {
  OCR_CUSTOM_MODULE_SCOPE_PREFIX,
  type CustomRecognitionModule,
  type OcrCustomRule,
  type OcrRuleScreenScope,
  type ParseResult,
  type ParsedAsset,
  type ScreenType
} from "../domain/types";
import { normalizeOcrRuleScreenScope } from "../storage/ocrRuleScopeNormalize";
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
    // 已识别为内置 App 页面时，资产只归该平台；不再用「仅某自定义模块」规则重复抽金额
    if (detectedScreen !== "unknown") {
      return false;
    }
    const moduleId = scope.slice(OCR_CUSTOM_MODULE_SCOPE_PREFIX.length);
    const mod = customModuleById.get(moduleId);
    if (!mod?.keywords.length) {
      return false;
    }
    const compactKws = mod.keywords.map((k) => compactForMatch(k.trim())).filter(Boolean);
    return compactKws.length > 0 && compactKws.some((k) => compactOcr.includes(k));
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

/** 原「快捷分支」里出现过、且有助于招行页识别的补充词（已去重合并进各内置类型的计分词表） */
const BUILTIN_SCORING_EXTRA_KEYWORDS: Partial<Record<Template["type"], string[]>> = {
  alipay_wealth: ["余利宝"],
  cmb_property: ["活钱", "朝朝宝", "朝朝盈", "专项"],
  wechat_wallet: ["微信零钱", "微信钱包"]
};

/** 各内置页用于与自定义模块竞标的词表（与 templates 中 keywords 合并去重） */
const BUILTIN_SCORING_SPECS: Array<{ type: Template["type"]; keywords: string[] }> = templates.map((tpl) => {
  const extra = BUILTIN_SCORING_EXTRA_KEYWORDS[tpl.type] ?? [];
  const merged = [...tpl.keywords, ...extra];
  return { type: tpl.type, keywords: [...new Set(merged)] };
});

function countBuiltinKeywordHits(compactText: string, keywords: string[]): number {
  return keywords.filter((k) => k.length > 0 && compactText.includes(k)).length;
}

/** 自定义模块得分 = 该模块配置的关键词在 OCR 中命中条数（多词同时命中则更强） */
function countCustomModuleKeywordHits(compactOcr: string, mod: CustomRecognitionModule): number {
  const kws = mod.keywords.map((k) => compactForMatch(k.trim())).filter(Boolean);
  if (!kws.length) {
    return 0;
  }
  return kws.filter((k) => compactOcr.includes(k)).length;
}

/**
 * 页面类型：内置模板与自定义识别模块按「关键词命中条数」同台竞争，分高者胜。
 * 平局时优先内置模板：否则 `screenType` 会落在 `unknown` 且不会跑财产页/理财页等模板，活钱、黄金等仅模板能抽的行会丢失，且数据会进 `cm-*` 分桶导致招行内置折线读不到。
 */
function resolveScreenByKeywordCompetition(
  compactText: string,
  customRecognitionModules: CustomRecognitionModule[]
): {
  screenType: ScreenType | "unknown";
  customModuleDisplayLabels: string[];
  customModuleIds: string[];
} {
  let bestBuiltin: { type: Template["type"]; score: number } | null = null;
  for (const spec of BUILTIN_SCORING_SPECS) {
    const s = countBuiltinKeywordHits(compactText, spec.keywords);
    if (s === 0) {
      continue;
    }
    if (!bestBuiltin || s > bestBuiltin.score) {
      bestBuiltin = { type: spec.type, score: s };
    }
  }

  let bestCustom: { score: number; labels: string[]; ids: string[] } | null = null;
  for (const mod of customRecognitionModules) {
    const s = countCustomModuleKeywordHits(compactText, mod);
    if (s === 0) {
      continue;
    }
    if (!bestCustom || s > bestCustom.score) {
      bestCustom = { score: s, labels: [mod.displayName], ids: [mod.id] };
    } else if (bestCustom && s === bestCustom.score) {
      if (!bestCustom.ids.includes(mod.id)) {
        bestCustom.labels.push(mod.displayName);
        bestCustom.ids.push(mod.id);
      }
    }
  }

  const bScore = bestBuiltin?.score ?? 0;
  const cScore = bestCustom?.score ?? 0;

  if (bScore === 0 && cScore === 0) {
    return { screenType: "unknown", customModuleDisplayLabels: [], customModuleIds: [] };
  }
  if (cScore === 0 && bestBuiltin) {
    return { screenType: bestBuiltin.type, customModuleDisplayLabels: [], customModuleIds: [] };
  }
  if (bScore === 0 && bestCustom) {
    return {
      screenType: "unknown",
      customModuleDisplayLabels: [...bestCustom.labels],
      customModuleIds: [...bestCustom.ids]
    };
  }
  if (cScore > bScore) {
    return {
      screenType: "unknown",
      customModuleDisplayLabels: [...bestCustom!.labels],
      customModuleIds: [...bestCustom!.ids]
    };
  }
  if (bScore > cScore && bestBuiltin) {
    return { screenType: bestBuiltin.type, customModuleDisplayLabels: [], customModuleIds: [] };
  }
  /** 同分且两边都有命中：用内置页跑模板，避免财产页活钱/黄金等仅模板规则的行丢失 */
  if (bScore === cScore && bestBuiltin && bestCustom && bScore > 0) {
    return { screenType: bestBuiltin.type, customModuleDisplayLabels: [], customModuleIds: [] };
  }
  return {
    screenType: "unknown",
    customModuleDisplayLabels: [...bestCustom!.labels],
    customModuleIds: [...bestCustom!.ids]
  };
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
  const { screenType, customModuleDisplayLabels, customModuleIds } = resolveScreenByKeywordCompetition(
    compactText,
    customRecognitionModules
  );
  const customAssets = parseCustomRules(raw, customRules, screenType, customRecognitionModules);
  const screenDisplayLabelFromModules =
    customModuleDisplayLabels.length > 0 ? customModuleDisplayLabels.join("、") : undefined;

  if (screenType === "unknown") {
    const warnings: string[] = [];
    if (!customAssets.length) {
      warnings.push("暂未识别到支持的页面，请检查截图是否包含页面标题与金额。");
    }
    return {
      screenType,
      ...(screenDisplayLabelFromModules ? { screenDisplayLabel: screenDisplayLabelFromModules } : {}),
      ...(customModuleIds.length ? { customModuleIds } : {}),
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
    ...(customModuleIds.length ? { customModuleIds } : {}),
    reportedTotal: parseReportedTotal(lines),
    assets,
    warnings
  };
}
