import { OCR_CUSTOM_MODULE_SCOPE_PREFIX, type OcrRuleScreenScope } from "../domain/types";

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

export function isValidRuleScreenScope(s: string): s is OcrRuleScreenScope {
  if (VALID_BUILTIN_SCOPES.has(s)) {
    return true;
  }
  return s.startsWith(OCR_CUSTOM_MODULE_SCOPE_PREFIX) && s.length > OCR_CUSTOM_MODULE_SCOPE_PREFIX.length;
}
