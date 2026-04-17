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
    zIndex: 2
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
    fontSize: 10,
    color: "#4f76b3"
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
    fontSize: 10,
    color: "#4f76b3",
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
  /** 与 plot 对齐的框仅用于定位，不裁剪子元素 */
  tooltipPlotOverlay: {
    position: "absolute",
    overflow: "visible",
    zIndex: 15,
    elevation: 15
  },
  /** 与 chartPlotScroll 同宽、同 translateX，保证浮窗与折线点对齐 */
  tooltipScrollSync: {
    position: "absolute",
    left: 0,
    top: 0
  },
  tooltipCluster: {
    position: "absolute",
    zIndex: 20,
    alignItems: "center"
  },
  /** 相对原尺寸约 70% */
  tooltipBubble: {
    borderRadius: 7,
    backgroundColor: "rgba(255,255,255,0.94)",
    borderWidth: 1,
    borderColor: "rgba(37,99,235,0.22)",
    paddingHorizontal: 7,
    paddingVertical: 4,
    minWidth: 96,
    alignItems: "center",
    shadowColor: "#1e3a5f",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.16,
    shadowRadius: 4,
    elevation: 3
  },
  /** 指向下侧数据点的三角 */
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
    borderTopColor: "rgba(255,255,255,0.94)"
  },
  tooltipDate: {
    color: "#64748b",
    fontSize: 8,
    lineHeight: 11,
    marginBottom: 1
  },
  tooltipAmount: {
    color: "#163d7a",
    fontWeight: "700",
    fontSize: 11,
    lineHeight: 14
  },
  tooltipAmountPrimary: {
    color: "#1d4ed8",
    fontWeight: "700",
    fontSize: 11,
    lineHeight: 14
  },
  tooltipBreakdownLine: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: "600",
    marginTop: 1
  },
  emptyWrap: {
    borderWidth: 1,
    borderColor: "#b7d4fb",
    borderRadius: 10,
    paddingVertical: 20,
    alignItems: "center",
    backgroundColor: "#f4f8ff"
  },
  emptyText: {
    color: "#4f76b3"
  },
  rangeHint: {
    alignSelf: "center",
    maxWidth: "96%",
    textAlign: "center",
    color: "#64748b",
    fontSize: 11,
    marginTop: 2,
    lineHeight: 16,
    zIndex: 0
  }
});
