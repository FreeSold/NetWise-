import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Animated, PanResponder, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from "react-native-svg";
import type { TrendPoint } from "../storage/assetHistoryDb";

type Props = {
  points: TrendPoint[];
};

const DISPLAY_POINT_CAP = 10;
/** 横向拖动约多少像素视为平移 1 个时点 */
const PAN_PX_PER_STEP = 38;

function buildPath(points: Array<{ x: number; y: number }>): string {
  if (!points.length) {
    return "";
  }
  return points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
}

/** 将步长规整为 1/2/5 × 10^n，便于出现 1000、5000、10000、200000 等刻度 */
function niceStep(roughStep: number): number {
  if (!Number.isFinite(roughStep) || roughStep <= 0) {
    return 1;
  }
  const exp = Math.floor(Math.log10(roughStep));
  const pow = Math.pow(10, exp);
  const n = roughStep / pow;
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return nice * pow;
}

function buildNiceYTicks(
  dataMin: number,
  dataMax: number,
  targetTickCount = 5
): { ticks: number[]; domainMin: number; domainMax: number } {
  if (!Number.isFinite(dataMin) || !Number.isFinite(dataMax)) {
    return { ticks: [0, 1], domainMin: 0, domainMax: 1 };
  }
  if (dataMax < dataMin) {
    return buildNiceYTicks(dataMax, dataMin, targetTickCount);
  }
  if (dataMin === dataMax) {
    const c = Math.max(dataMin, 1);
    return buildNiceYTicks(c * 0.92, c * 1.08, targetTickCount);
  }

  const spanRaw = dataMax - dataMin;
  const pad = Math.max(spanRaw * 0.06, spanRaw * 0.02);
  let lo = Math.max(0, dataMin - pad);
  let hi = dataMax + pad;
  const span = hi - lo;
  const rough = span / Math.max(targetTickCount - 1, 1);
  let step = niceStep(rough);

  let domainMin = Math.floor(lo / step) * step;
  let domainMax = Math.ceil(hi / step) * step;
  let ticks: number[] = [];
  for (let t = domainMin; t <= domainMax + step * 1e-9; t += step) {
    ticks.push(Math.round(t * 100) / 100);
  }

  while (ticks.length > targetTickCount + 2) {
    step *= 2;
    domainMin = Math.floor(lo / step) * step;
    domainMax = Math.ceil(hi / step) * step;
    ticks = [];
    for (let t = domainMin; t <= domainMax + step * 1e-9; t += step) {
      ticks.push(Math.round(t * 100) / 100);
    }
  }

  if (ticks.length < 2) {
    ticks = [domainMin, domainMax];
  }

  return { ticks, domainMin, domainMax };
}

/** 与 Y 轴刻度对齐的条带：自下而上浅绿 / 浅蓝交替（最低档为浅绿） */
const Y_BAND_FILL_A = "#CEFFE9";
const Y_BAND_FILL_B = "#CEF3FF";

function ySvgForValue(
  value: number,
  domainMin: number,
  domainMax: number,
  spread: number,
  innerPlotHeight: number,
  paddingY: number
): number {
  return paddingY + ((domainMax - value) * innerPlotHeight) / spread;
}

function buildYBandRects(
  ticks: number[],
  domainMin: number,
  domainMax: number,
  chartLeft: number,
  chartW: number,
  paddingY: number,
  plotHeight: number
): Array<{ key: string; x: number; y: number; width: number; height: number; fill: string }> {
  const spread = Math.max(domainMax - domainMin, 1e-9);
  const innerH = plotHeight - paddingY * 2;
  const plotTop = paddingY;
  const plotBottom = plotHeight - paddingY;
  if (ticks.length < 2) {
    return [];
  }
  const bands: Array<{ key: string; x: number; y: number; width: number; height: number; fill: string }> = [];
  for (let i = 0; i < ticks.length - 1; i += 1) {
    const vLow = ticks[i];
    const vHigh = ticks[i + 1];
    if (!(vHigh > vLow)) {
      continue;
    }
    let top = ySvgForValue(vHigh, domainMin, domainMax, spread, innerH, paddingY);
    let bot = ySvgForValue(vLow, domainMin, domainMax, spread, innerH, paddingY);
    top = Math.max(plotTop, Math.min(plotBottom, top));
    bot = Math.max(plotTop, Math.min(plotBottom, bot));
    if (bot - top < 0.5) {
      continue;
    }
    const fill = i % 2 === 0 ? Y_BAND_FILL_A : Y_BAND_FILL_B;
    bands.push({
      key: `yband-${vLow}-${vHigh}`,
      x: chartLeft,
      y: top,
      width: chartW,
      height: bot - top,
      fill
    });
  }
  return bands;
}

function formatYTickLabel(n: number): string {
  const r = Math.round(n);
  if (r >= 10000 && r < 100000000) {
    const wan = r / 10000;
    return Number.isInteger(wan) ? `${wan}万` : `${wan.toFixed(1)}万`;
  }
  if (r >= 100000000) {
    const yi = r / 100000000;
    return Number.isInteger(yi) ? `${yi}亿` : `${yi.toFixed(1)}亿`;
  }
  return r.toLocaleString("zh-CN", { maximumFractionDigits: 0 });
}

export function TrendLineChart({ points }: Props) {
  const [width, setWidth] = useState(320);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const height = 180;
  const paddingY = 28;
  const rightPad = 24;

  const maxWindowStart = Math.max(0, points.length - DISPLAY_POINT_CAP);
  const [windowStart, setWindowStart] = useState(0);
  const userPannedRef = useRef(false);
  const pointsLenRef = useRef(0);
  const pointsRef = useRef(points);
  pointsRef.current = points;
  const windowStartRef = useRef(windowStart);
  windowStartRef.current = windowStart;
  /** 本次手势开始时的 windowStart，用于把累计位移映射为窗口索引 + 步内平移 */
  const dragOriginWindowRef = useRef(0);
  const dragX = useRef(new Animated.Value(0)).current;

  useLayoutEffect(() => {
    const len = points.length;
    const maxS = Math.max(0, len - DISPLAY_POINT_CAP);
    if (len === 0) {
      userPannedRef.current = false;
      setWindowStart(0);
      pointsLenRef.current = 0;
      return;
    }
    if (!userPannedRef.current || pointsLenRef.current === 0) {
      setWindowStart(maxS);
    } else {
      setWindowStart((w) => Math.min(w, maxS));
    }
    pointsLenRef.current = len;
  }, [points]);

  const displayPoints = useMemo(() => {
    if (!points.length) {
      return [];
    }
    const maxS = Math.max(0, points.length - DISPLAY_POINT_CAP);
    const start = Math.min(windowStart, maxS);
    return points.slice(start, start + DISPLAY_POINT_CAP);
  }, [points, windowStart]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onPanResponderGrant: () => {
          setActiveIndex(null);
          dragX.stopAnimation();
          dragOriginWindowRef.current = windowStartRef.current;
        },
        onMoveShouldSetPanResponder: (_, g) =>
          Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.05,
        onPanResponderMove: (_, g) => {
          const len = pointsRef.current.length;
          const maxS = Math.max(0, len - DISPLAY_POINT_CAP);
          if (maxS === 0) {
            return;
          }
          let dx = g.dx;
          const w = windowStartRef.current;
          if (w >= maxS && dx < 0) {
            dx *= 0.28;
          }
          if (w <= 0 && dx > 0) {
            dx *= 0.28;
          }
          const origin = dragOriginWindowRef.current;
          const raw = origin + Math.round(-dx / PAN_PX_PER_STEP);
          const next = Math.max(0, Math.min(maxS, raw));
          const visX = dx + (next - origin) * PAN_PX_PER_STEP;
          dragX.setValue(visX);
          if (next !== windowStartRef.current) {
            userPannedRef.current = true;
            windowStartRef.current = next;
            setWindowStart(next);
          }
        },
        onPanResponderRelease: () => {
          const len = pointsRef.current.length;
          const maxS = Math.max(0, len - DISPLAY_POINT_CAP);
          if (maxS === 0) {
            Animated.spring(dragX, {
              toValue: 0,
              useNativeDriver: true,
              friction: 8,
              tension: 160
            }).start();
            return;
          }
          Animated.spring(dragX, {
            toValue: 0,
            useNativeDriver: true,
            friction: 9,
            tension: 170
          }).start();
        },
        onPanResponderTerminate: () => {
          Animated.spring(dragX, {
            toValue: 0,
            useNativeDriver: true,
            friction: 9,
            tension: 170
          }).start();
        }
      }),
    [dragX]
  );

  const xLabelIndices = useMemo(() => {
    const n = displayPoints.length;
    if (n <= 0) {
      return [] as number[];
    }
    if (n === 1) {
      return [0];
    }
    const want = Math.min(4, n);
    const idx: number[] = [];
    for (let i = 0; i < want; i += 1) {
      idx.push(Math.round((i * (n - 1)) / (want - 1)));
    }
    return [...new Set(idx)].sort((a, b) => a - b);
  }, [displayPoints.length]);

  const computed = useMemo(() => {
    if (!displayPoints.length) {
      return {
        path: "",
        dots: [] as Array<{ x: number; y: number; total: number; date: string }>,
        ticks: [] as number[],
        domainMin: 0,
        domainMax: 1,
        leftPad: 40,
        chartLeft: 40,
        chartRight: 0,
        plotW: 1,
        yBandRects: [] as Array<{ key: string; x: number; y: number; width: number; height: number; fill: string }>
      };
    }
    const values = displayPoints.map((p) => p.total);
    const dataMin = Math.min(...values);
    const dataMax = Math.max(...values);
    const { ticks, domainMin, domainMax } = buildNiceYTicks(dataMin, dataMax, 5);
    const spread = Math.max(domainMax - domainMin, 1e-9);

    const maxLabel = ticks.reduce((a, t) => Math.max(a, formatYTickLabel(t).length), 8);
    const leftPad = Math.min(72, Math.max(36, 10 + maxLabel * 5.5));
    const chartLeft = leftPad;
    const chartRight = width - rightPad;
    const plotW = Math.max(chartRight - chartLeft, 1);

    const dots = displayPoints.map((item, index) => {
      const x =
        displayPoints.length === 1
          ? plotW / 2
          : (index * plotW) / (displayPoints.length - 1);
      const y = paddingY + ((domainMax - item.total) * (height - paddingY * 2)) / spread;
      return { x, y, total: item.total, date: item.date };
    });

    const yBandRects = buildYBandRects(ticks, domainMin, domainMax, 0, plotW, paddingY, height);

    return {
      path: buildPath(dots),
      dots,
      ticks,
      domainMin,
      domainMax,
      leftPad,
      chartLeft,
      chartRight,
      plotW,
      yBandRects
    };
  }, [displayPoints, height, paddingY, rightPad, width]);

  if (!points.length) {
    return (
      <View style={styles.emptyWrap}>
        <Text style={styles.emptyText}>暂无趋势数据，先确认一次导入记录。</Text>
      </View>
    );
  }

  const safeActiveIndex =
    activeIndex === null ? null : Math.max(0, Math.min(activeIndex, computed.dots.length - 1));
  const activeDot = safeActiveIndex === null ? null : computed.dots[safeActiveIndex];

  const hitR = 26;

  const rangeLabel =
    points.length <= DISPLAY_POINT_CAP
      ? `共 ${points.length} 天有记录`
      : `共 ${points.length} 天 · 当前 ${displayPoints[0]?.date ?? ""}～${displayPoints[displayPoints.length - 1]?.date ?? ""} · 左右拖动看历史`;

  return (
    <View
      style={styles.container}
      onLayout={(e) => setWidth(Math.max(280, e.nativeEvent.layout.width))}
    >
      <View style={[styles.chartSurface, { width, height }]}>
        <View
          style={[
            styles.chartPlotClip,
            {
              left: computed.chartLeft,
              width: computed.plotW,
              height
            }
          ]}
        >
        <Animated.View
          style={[
            styles.chartPlotScroll,
            {
              width: computed.plotW,
              height,
              transform: [{ translateX: dragX }]
            }
          ]}
        >
          <Svg width={computed.plotW} height={height}>
            {computed.yBandRects.map((band) => (
              <Rect
                key={band.key}
                x={band.x}
                y={band.y}
                width={band.width}
                height={band.height}
                fill={band.fill}
                opacity={0.5}
              />
            ))}
            {computed.ticks.map((tick, idx) => {
              const spread = Math.max(computed.domainMax - computed.domainMin, 1e-9);
              const y = paddingY + ((computed.domainMax - tick) * (height - paddingY * 2)) / spread;
              return (
                <Line
                  key={`grid-${idx}-${tick}`}
                  x1={0}
                  y1={y}
                  x2={computed.plotW}
                  y2={y}
                  stroke="#dbeafe"
                  strokeWidth={1}
                />
              );
            })}
            <Path d={computed.path} stroke="#2563eb" strokeWidth={2} fill="none" />
            {computed.dots.map((dot, index) => (
              <Circle
                key={`${dot.date}-${dot.total}-${index}`}
                cx={dot.x}
                cy={dot.y}
                r={index === safeActiveIndex ? 5 : 3}
                fill={index === safeActiveIndex ? "#1d4ed8" : "#2563eb"}
                pointerEvents="none"
              />
            ))}
            {xLabelIndices.map((index) => {
              const dot = computed.dots[index];
              if (!dot) {
                return null;
              }
              return (
                <SvgText
                  key={`xlabel-${dot.date}-${index}`}
                  x={dot.x - 18}
                  y={height - 8}
                  fontSize="10"
                  fill="#4f76b3"
                >
                  {dot.date.slice(5)}
                </SvgText>
              );
            })}
          </Svg>
          <View style={styles.panLayer} {...panResponder.panHandlers} accessibilityLabel="横向拖动查看历史数据">
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setActiveIndex(null)} accessibilityRole="button" />
          </View>
          {computed.dots.map((dot, index) => (
            <Pressable
              key={`dot-hit-${index}`}
              style={[
                styles.dotHit,
                {
                  left: dot.x - hitR,
                  top: dot.y - hitR,
                  width: hitR * 2,
                  height: hitR * 2
                }
              ]}
              accessibilityHint="长按查看该日金额"
              delayLongPress={380}
              onLongPress={() => setActiveIndex(index)}
            />
          ))}
          {activeDot ? (
            <View
              style={[
                styles.tooltip,
                {
                  left: Math.max(6, Math.min(activeDot.x - 84, computed.plotW - 168)),
                  top: Math.max(6, activeDot.y - 56)
                }
              ]}
              pointerEvents="none"
            >
              <Text style={styles.tooltipDate}>{activeDot.date}</Text>
              <Text style={styles.tooltipAmount}>{activeDot.total.toFixed(2)} 元</Text>
            </View>
          ) : null}
        </Animated.View>
        </View>

        <View style={[styles.chartAxisOverlay, { width, height }]} pointerEvents="none">
          <Svg width={width} height={height}>
            <Line
              x1={computed.chartLeft}
              y1={paddingY}
              x2={computed.chartLeft}
              y2={height - paddingY}
              stroke="#b7d4fb"
              strokeWidth={1}
            />
            <Line
              x1={computed.chartLeft}
              y1={height - paddingY}
              x2={computed.chartRight}
              y2={height - paddingY}
              stroke="#b7d4fb"
              strokeWidth={1}
            />
            {computed.ticks.map((tick, idx) => {
              const spread = Math.max(computed.domainMax - computed.domainMin, 1e-9);
              const y = paddingY + ((computed.domainMax - tick) * (height - paddingY * 2)) / spread;
              const label = formatYTickLabel(tick);
              return (
                <SvgText
                  key={`ylabel-fixed-${idx}-${tick}`}
                  x={Math.max(2, computed.chartLeft - 6 - label.length * 5.2)}
                  y={y + 4}
                  fontSize="10"
                  fill="#4f76b3"
                >
                  {label}
                </SvgText>
              );
            })}
          </Svg>
        </View>
      </View>
      <Text style={styles.rangeHint}>{rangeLabel}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    alignItems: "center",
    gap: 4,
    position: "relative"
  },
  chartSurface: {
    position: "relative",
    alignSelf: "center",
    overflow: "hidden"
  },
  /** 固定在 Y 轴右缘～右内边距之间，拖动时在此矩形内裁切折线/网格，避免画出坐标框 */
  chartPlotClip: {
    position: "absolute",
    top: 0,
    overflow: "hidden",
    zIndex: 1
  },
  chartPlotScroll: {
    position: "absolute",
    top: 0,
    left: 0,
    zIndex: 1
  },
  chartAxisOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    zIndex: 2,
    elevation: 2
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
  tooltip: {
    position: "absolute",
    zIndex: 20,
    borderRadius: 8,
    backgroundColor: "#eff6ff",
    borderWidth: 1,
    borderColor: "#bfdbfe",
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 120,
    shadowColor: "#1e3a5f",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 3
  },
  tooltipDate: {
    color: "#64748b",
    fontSize: 11,
    marginBottom: 2
  },
  tooltipAmount: {
    color: "#163d7a",
    fontWeight: "700",
    fontSize: 16
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
    lineHeight: 16
  }
});
