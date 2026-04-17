import * as FileSystem from "expo-file-system";
import type { OcrCustomRule, OcrRuleScreenScope } from "../domain/types";
import { backupCorruptDocumentFile, getDocumentFileUri, writeUtf8Atomically } from "./atomicDocumentFileWrite";
import { isValidRuleScreenScope, normalizeOcrRuleScreenScope } from "./ocrRuleScopeNormalize";

export { normalizeOcrRuleScreenScope };

const RULES_FILE = "netwise-ocr-custom-rules.json";
const RULES_CORRUPT_BACKUP_STEM = "netwise-ocr-custom-rules";

/** 本会话内已对损坏规则文件尝试过备份，避免每次 load 都复制 */
let corruptRulesFileBackupAttempted = false;

function getRulesUri(): string {
  return getDocumentFileUri(RULES_FILE);
}

export async function loadOcrCustomRules(): Promise<OcrCustomRule[]> {
  const uri = getRulesUri();
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) {
    corruptRulesFileBackupAttempted = false;
    return [];
  }
  let raw: string;
  try {
    raw = await FileSystem.readAsStringAsync(uri);
  } catch (error) {
    console.error("Failed to read OCR custom rules file", error);
    if (!corruptRulesFileBackupAttempted) {
      const bak = await backupCorruptDocumentFile(uri, RULES_CORRUPT_BACKUP_STEM);
      corruptRulesFileBackupAttempted = true;
      if (bak) {
        console.warn("Backed up unreadable OCR rules file to", bak);
      }
    }
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (error) {
    console.error("Failed to parse OCR custom rules JSON", error);
    if (!corruptRulesFileBackupAttempted) {
      const bak = await backupCorruptDocumentFile(uri, RULES_CORRUPT_BACKUP_STEM);
      corruptRulesFileBackupAttempted = true;
      if (bak) {
        console.warn("Backed up corrupt OCR rules file to", bak);
      }
    }
    return [];
  }
  if (!Array.isArray(parsed)) {
    console.error("OCR custom rules file root is not a JSON array");
    if (!corruptRulesFileBackupAttempted) {
      const bak = await backupCorruptDocumentFile(uri, RULES_CORRUPT_BACKUP_STEM);
      corruptRulesFileBackupAttempted = true;
      if (bak) {
        console.warn("Backed up invalid OCR rules file to", bak);
      }
    }
    return [];
  }
  corruptRulesFileBackupAttempted = false;
  return parsed.filter(isValidRule).map((r) => {
    const rule = r as OcrCustomRule;
    const nextScope = normalizeOcrRuleScreenScope(rule.screenScope);
    if (nextScope === rule.screenScope) {
      return rule;
    }
    return { ...rule, screenScope: nextScope };
  });
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
    if (typeof r.screenScope !== "string" || !isValidRuleScreenScope(r.screenScope)) {
      return false;
    }
  }
  return true;
}

export async function saveOcrCustomRules(rules: OcrCustomRule[]): Promise<void> {
  await writeUtf8Atomically(RULES_FILE, JSON.stringify(rules, null, 0));
}
