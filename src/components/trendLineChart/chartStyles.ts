import { StyleSheet } from "react-native";

export const chartStyles = StyleSheet.create({
  container: {
    width: "100%",
    alignItems: "center",
    gap: 4,
    position: "relative"
  },
  chartSurface: {
    position: "relative",
    alignSelf: "center",
    overflow: "visible",
    zIndex: 0
  },
  /** 轴线围成的绘图区内：左=Y 轴内侧，右=右内边距，上/下=上下轴线 */
  chartPlotClip: {
    position: "absolute",
    overflow: "hidden",
    zIndex: 1
  },
  /** Y 轴色带 + 横向网格，不随 translateX 平移 */
  chartPlotBandLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0
  },
  chartPlotScroll: {
    position: "absolute",
    top: 0,
    left: 0,
    zIndex: 1
  },
  xLabelStripClip: {
    position: "absolute",
    overflow: "hidden",
    zIndex: 1
  },
  xLabelStripScroll: {
    position: "relative"
  },
  xLabelText: {
    position: "absolute",
    fontSize: 11,
    color: "#94A3B8"
  },
  /** 仅轴线（竖线+底边），与绘图区分层 */
  chartAxisFrameLayer: {
    position: "absolute",
    top: 0,
    left: 0,
    zIndex: 2,
    elevation: 2
  },
  /** Y 轴刻度数字，独立图层 */
  chartYTickLabelsLayer: {
    position: "absolute",
    top: 0,
    left: 0,
    zIndex: 3,
    elevation: 3
  },
  yTickLabelText: {
    position: "absolute",
    left: 0,
    fontSize: 14,
    color: "#CBD5E1",
    textAlign: "right"
  },
  panLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1
  },
  dotHit: {
    position: "absolute",
    borderRadius: 999,
    backgroundColor: "transparent",
    zIndex: 2
  },
  axisText: {
    color: "#4f76b3",
    fontSize: 12
  },
  /** 与 plot 对齐的框仅用于定位，不裁剪子元素；Android 上 elevation 须高于首页趋势卡「类型下拉」与 trendCardMenuLift(24)，否则浮窗被菜单盖住 */
  tooltipPlotOverlay: {
    position: "absolute",
    overflow: "visible",
    zIndex: 50,
    elevation: 50
  },
  /** 与 chartPlotScroll 同宽、同 translateX，保证浮窗与折线点对齐 */
  tooltipScrollSync: {
    position: "absolute",
    left: 0,
    top: 0
  },
  tooltipCluster: {
    position: "absolute",
    zIndex: 50,
    elevation: 50,
    alignItems: "center"
  },
  tooltipBubble: {
    borderRadius: 7,
    backgroundColor: "#1E293BCC",
    paddingHorizontal: 10,
    paddingVertical: 6,
    minWidth: 96,
    alignItems: "center"
  },
  tooltipCaret: {
    marginTop: -1,
    width: 0,
    height: 0,
    borderStyle: "solid",
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 6,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: "#1E293BCC"
  },
  tooltipDate: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
    marginBottom: 4
  },
  tooltipAmount: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 14,
    lineHeight: 20
  },
  tooltipAmountPrimary: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 14,
    lineHeight: 20
  },
  tooltipBreakdownLine: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "500",
    marginTop: 2
  },
  emptyWrap: {
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.3)",
    borderRadius: 10,
    paddingVertical: 20,
    alignItems: "center",
    backgroundColor: "rgba(148,163,184,0.1)"
  },
  emptyText: {
    color: "#94a3b8"
  },
  rangeHint: {
    alignSelf: "center",
    maxWidth: "96%",
    textAlign: "center",
    color: "#94A3B8",
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
    zIndex: 0
  }
});
