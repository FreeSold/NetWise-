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

/** 内置页面类型 + 「不限」等；自定义识别模块页为 `custom_module:` + 模块 id */
export type BuiltinOcrRuleScreenScope =
  | "any"
  | "unknown"
  | "alipay"
  | "cmb"
  | "wechat_wallet";

export type OcrRuleScreenScope = BuiltinOcrRuleScreenScope | `custom_module:${string}`;

export const OCR_CUSTOM_MODULE_SCOPE_PREFIX = "custom_module:" as const;

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
  /** 解析结果页「页面类型」优先展示此文案（如未识别到内置页但命中自定义模块时的模块名） */
  screenDisplayLabel?: string;
  /** 关键词竞争中胜出的自定义识别模块 id（同分可能多个，保存时默认取第一个作为分桶主键） */
  customModuleIds?: string[];
  assets: ParsedAsset[];
  reportedTotal?: number;
  warnings: string[];
}

/** 用户自定义「识别模块」：按关键词在合并 OCR 中任一命中（去空白后子串匹配）时，将该次导入资产总额计入该模块趋势 */
export type CustomRecognitionModule = {
  id: string;
  displayName: string;
  /** 多个条件为「或」关系；保存为按空格/逗号/分号拆分后的词或词组 */
  keywords: string[];
};
