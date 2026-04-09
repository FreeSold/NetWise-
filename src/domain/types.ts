export type ScreenType =
  | "cmb_property"
  | "cmb_wealth"
  | "alipay_wealth"
  | "alipay_fund"
  | "wechat_wallet"
  | "custom";

export type AssetClass =
  | "cash"
  | "wealth_management"
  | "fund"
  | "insurance"
  | "stock";

export interface ParsedAsset {
  /** 金额名称（可编辑，默认来自识别内容） */
  name: string;
  amount: number;
  currency: "CNY";
  assetClass: AssetClass;
  source: ScreenType;
  confidence: number;
  recognizedLabel?: string;
  /** 如「存款   17,866.94   现金」 */
  ruleSummary?: string;
}

export type OcrRuleScreenScope =
  | "any"
  | "unknown"
  | "cmb_property"
  | "cmb_wealth"
  | "alipay_wealth"
  | "alipay_fund"
  | "wechat_wallet";

export type OcrCustomRule = {
  id: string;
  /** 锚点关键词：OCR 去空白后须包含此片段；金额取该片段之后出现的第一个数字 */
  sourceSnippet: string;
  /** 解析后的金额名称（默认展示） */
  recognizedContent: string;
  /** @deprecated 旧版「固定金额」校验用，已不再参与匹配；可省略 */
  amountText?: string;
  assetClass: AssetClass;
  screenScope?: OcrRuleScreenScope;
};

export interface ParseResult {
  screenType: ScreenType | "unknown";
  assets: ParsedAsset[];
  reportedTotal?: number;
  warnings: string[];
}
