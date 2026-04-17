import type { TrendPoint, TrendSeriesBreakdown } from "../../storage/assetHistoryDb";

export type TrendLineChartProps = {
  points: TrendPoint[];
  /** 选「全部」时叠加的各资产类折线 */
  breakdownByClass?: TrendSeriesBreakdown[];
  /** 主折线在浮层中的名称，默认「全部」 */
  primarySeriesLabel?: string;
  /** 与设置页卡片透明度联动，浮窗不透明度（建议传 moduleControlOpacity，约 0.5～1） */
  chartTooltipOpacity?: number;
};
