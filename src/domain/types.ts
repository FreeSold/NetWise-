export type ScreenType =
  | "cmb_property"
  | "cmb_wealth"
  | "alipay_wealth"
  | "alipay_fund"
  | "wechat_wallet";

export type AssetClass =
  | "cash"
  | "wealth_management"
  | "fund"
  | "insurance"
  | "stock";

export interface ParsedAsset {
  name: string;
  amount: number;
  currency: "CNY";
  assetClass: AssetClass;
  source: ScreenType;
  confidence: number;
}

export interface ParseResult {
  screenType: ScreenType | "unknown";
  assets: ParsedAsset[];
  reportedTotal?: number;
  warnings: string[];
}
