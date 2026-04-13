import * as FileSystem from "expo-file-system";
import { OCR_CUSTOM_MODULE_SCOPE_PREFIX, type OcrCustomRule, type OcrRuleScreenScope } from "../domain/types";

const RULES_FILE = "netwise-ocr-custom-rules.json";

/** 旧版按理财/基金、财产/理财拆分的 scope，读入后合并为 alipay / cmb */
const LEGACY_ALIPAY_SCOPES = new Set(["alipay_wealth", "alipay_fund"]);
const LEGACY_CMB_SCOPES = new Set(["cmb_property", "cmb_wealth"]);

const VALID_BUILTIN_SCOPES = new Set<string>([
  "any",
  "unknown",
  "alipay",
  "cmb",
  "wechat_wallet",
  ...LEGACY_ALIPAY_SCOPES,
  ...LEGACY_CMB_SCOPES
]);

export function normalizeOcrRuleScreenScope(scope: string | undefined): OcrRuleScreenScope | undefined {
  if (scope === undefined) {
    return undefined;
  }
  if (LEGACY_ALIPAY_SCOPES.has(scope)) {
    return "alipay";
  }
  if (LEGACY_CMB_SCOPES.has(scope)) {
    return "cmb";
  }
  return scope as OcrRuleScreenScope;
}

function isValidScreenScope(s: string): s is OcrRuleScreenScope {
  if (VALID_BUILTIN_SCOPES.has(s)) {
    return true;
  }
  return s.startsWith(OCR_CUSTOM_MODULE_SCOPE_PREFIX) && s.length > OCR_CUSTOM_MODULE_SCOPE_PREFIX.length;
}

function getRulesUri(): string {
  if (!FileSystem.documentDirectory) {
    throw new Error("文件存储目录不可用");
  }
  return `${FileSystem.documentDirectory}${RULES_FILE}`;
}

export async function loadOcrCustomRules(): Promise<OcrCustomRule[]> {
  const uri = getRulesUri();
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) {
    return [];
  }
  try {
    const raw = await FileSystem.readAsStringAsync(uri);
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(isValidRule).map((r) => {
      const rule = r as OcrCustomRule;
      const nextScope = normalizeOcrRuleScreenScope(rule.screenScope);
      if (nextScope === rule.screenScope) {
        return rule;
      }
      return { ...rule, screenScope: nextScope };
    });
  } catch {
    return [];
  }
}

function isValidRule(item: unknown): item is OcrCustomRule {
  if (!item || typeof item !== "object") {
    return false;
  }
  const r = item as Record<string, unknown>;
  if (
    typeof r.id !== "string" ||
    typeof r.sourceSnippet !== "string" ||
    typeof r.recognizedContent !== "string" ||
    typeof r.assetClass !== "string"
  ) {
    return false;
  }
  if (r.amountText !== undefined && typeof r.amountText !== "string") {
    return false;
  }
  if (r.screenScope !== undefined) {
    if (typeof r.screenScope !== "string" || !isValidScreenScope(r.screenScope)) {
      return false;
    }
  }
  return true;
}

export async function saveOcrCustomRules(rules: OcrCustomRule[]): Promise<void> {
  const uri = getRulesUri();
  await FileSystem.writeAsStringAsync(uri, JSON.stringify(rules, null, 0), {
    encoding: FileSystem.EncodingType.UTF8
  });
}
