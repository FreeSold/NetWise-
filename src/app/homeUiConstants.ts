import type { AssetClass, BuiltinOcrRuleScreenScope, ParseResult } from "../domain/types";
import type { PlatformTrendFilter, TrendFilter } from "../storage/assetHistoryDb";

export const ASSET_CLASS_ORDER: AssetClass[] = ["cash", "fund", "insurance", "stock", "wealth_management"];

export const ASSET_CLASS_LABEL: Record<AssetClass, string> = {
  cash: "现金",
  fund: "基金",
  insurance: "保险",
  stock: "股票",
  wealth_management: "理财"
};

export const EMPTY_PARSE_RESULT: ParseResult = {
  screenType: "unknown",
  assets: [],
  warnings: [],
  reportedTotal: undefined
};

export const TREND_FILTER_ORDER: TrendFilter[] = ["all", ...ASSET_CLASS_ORDER];

export const TREND_FILTER_LABEL: Record<TrendFilter, string> = {
  all: "全部",
  cash: "现金",
  fund: "基金",
  insurance: "保险",
  stock: "股票",
  wealth_management: "理财"
};

export const PLATFORM_TREND_ORDER: PlatformTrendFilter[] = ["alipay", "cmb", "wechat"];

export const PLATFORM_MODULE_LABEL: Record<PlatformTrendFilter, string> = {
  alipay: "支付宝",
  cmb: "招商银行",
  wechat: "微信"
};

export const PLATFORM_TREND_LABEL: Record<PlatformTrendFilter, string> = {
  alipay: "支付宝趋势",
  cmb: "招商银行趋势",
  wechat: "微信趋势"
};

export const SCREEN_TYPE_LABEL: Record<ParseResult["screenType"], string> = {
  cmb_property: "招商银行财产页",
  cmb_wealth: "招商银行理财页",
  alipay_wealth: "支付宝理财页",
  alipay_fund: "支付宝基金页",
  wechat_wallet: "微信钱包页",
  custom: "自定义规则",
  unknown: "未识别页面"
};

export const OCR_RULE_SCOPE_ORDER: BuiltinOcrRuleScreenScope[] = [
  "any",
  "unknown",
  "cmb",
  "alipay",
  "wechat_wallet"
];

export const OCR_RULE_SCOPE_LABEL: Record<BuiltinOcrRuleScreenScope, string> = {
  any: "不限页面（每张图都尝试）",
  unknown: "仅「未识别页面」时",
  cmb: "仅招商银行",
  alipay: "仅支付宝",
  wechat_wallet: "仅微信钱包页"
};
