import * as FileSystem from "expo-file-system";
import type { OcrCustomRule, OcrRuleScreenScope } from "../domain/types";

const RULES_FILE = "netwise-ocr-custom-rules.json";

const VALID_SCOPES = new Set<OcrRuleScreenScope>([
  "any",
  "unknown",
  "cmb_property",
  "cmb_wealth",
  "alipay_wealth",
  "alipay_fund",
  "wechat_wallet"
]);

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
    return parsed.filter(isValidRule);
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
    if (typeof r.screenScope !== "string" || !VALID_SCOPES.has(r.screenScope as OcrRuleScreenScope)) {
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
