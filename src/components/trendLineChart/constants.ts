import type { AssetClass } from "../../domain/types";

/** 分项折线：赤、橙、黄、绿、青（与资产类固定对应）；紫色未使用 */
export const BREAKDOWN_LINE_COLORS: Record<AssetClass, string> = {
  cash: "#dc2626",
  fund: "#ea580c",
  insurance: "#ca8a04",
  stock: "#16a34a",
  wealth_management: "#06b6d4"
};

export const BREAKDOWN_CLASS_LABEL: Record<AssetClass, string> = {
  cash: "现金",
  fund: "基金",
  insurance: "保险",
  stock: "股票",
  wealth_management: "理财"
};

export const DISPLAY_POINT_CAP = 10;
/** 拖动时折线路径向两侧多取的点数，减轻贴边时的截断感 */
export const PAN_LINE_BUFFER = 10;
/** 横向拖动约多少像素视为平移 1 个时点 */
export const PAN_PX_PER_STEP = 38;
/** 底部日期刻度占位宽度（居中），避免贴左右边界被裁切 */
export const X_LABEL_SLOT_W = 44;
/** 日期条相对绘图区左右多露出的安全边距 */
export const X_LABEL_STRIP_GUTTER = 14;
/** 折线/圆点距绘图区左右边的内缩，避免端点圆与描边被裁切 */
export const LINE_X_INSET = 8;

/** 与 Y 轴刻度对齐的条带：自下而上浅绿 / 浅蓝交替（最低档为浅绿） */
export const Y_BAND_FILL_A = "#CEFFE9";
export const Y_BAND_FILL_B = "#CEF3FF";

/** 首帧估算宽度（量到真实宽度前用于水平居中） */
export const TOOLTIP_WIDTH_FALLBACK = 84;
