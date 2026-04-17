import {
  OCR_CUSTOM_MODULE_SCOPE_PREFIX,
  type BuiltinOcrRuleScreenScope,
  type CustomRecognitionModule,
  type OcrRuleScreenScope
} from "../domain/types";
import { normalizeOcrRuleScreenScope } from "../storage/ocrCustomRulesStore";
import { OCR_RULE_SCOPE_LABEL } from "./homeUiConstants";

export function formatOcrRuleScopeLabel(
  scope: OcrRuleScreenScope | undefined,
  customModules: CustomRecognitionModule[]
): string {
  const s: OcrRuleScreenScope = normalizeOcrRuleScreenScope(scope) ?? (scope ?? "any");
  if (typeof s === "string" && s.startsWith(OCR_CUSTOM_MODULE_SCOPE_PREFIX)) {
    const id = s.slice(OCR_CUSTOM_MODULE_SCOPE_PREFIX.length);
    const m = customModules.find((x) => x.id === id);
    return m ? `仅「${m.displayName}」` : "自定义模块（已删除）";
  }
  return OCR_RULE_SCOPE_LABEL[s as BuiltinOcrRuleScreenScope];
}
