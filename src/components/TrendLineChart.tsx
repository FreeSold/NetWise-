import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line, Path, Rect } from "react-native-svg";
import {
  BREAKDOWN_CLASS_LABEL,
  BREAKDOWN_LINE_COLORS,
  DISPLAY_POINT_CAP,
  PAN_LINE_BUFFER,
  TOOLTIP_WIDTH_FALLBACK,
  X_LABEL_SLOT_W,
  X_LABEL_STRIP_GUTTER
} from "./trendLineChart/constants";
import { chartStyles as styles } from "./trendLineChart/chartStyles";
import { computeTrendLineChartLayout } from "./trendLineChart/computeLayout";
import { createTrendLineChartPanResponder } from "./trendLineChart/createPanResponder";
import type { TrendLineChartProps } from "./trendLineChart/types";

export type { TrendLineChartProps };

export function TrendLineChart({
  points,
  chartTooltipOpacity = 1,
  breakdownByClass,
  primarySeriesLabel = "全部"
}: TrendLineChartProps) {
  const [width, setWidth] = useState(320);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [tooltipClusterW, setTooltipClusterW] = useState<number | null>(null);
  const visibleDotsSelectionKeyRef = useRef<string | null>(null);
  const height = 180;
  const paddingY = 28;
  const rightPad = 24;

  const [windowStart, setWindowStart] = useState(0);
  const [axisFreezeStart, setAxisFreezeStart] = useState<number | null>(null);
  const userPannedRef = useRef(false);
  const pointsLenRef = useRef(0);
  const pointsRef = useRef(points);
  pointsRef.current = points;
  const windowStartRef = useRef(windowStart);
  windowStartRef.current = windowStart;
  const dragOriginWindowRef = useRef(0);
  const dragX = useRef(new Animated.Value(0)).current;
  const latestComputedRef = useRef({
    plotW: 1,
    axisFreezeStart: null as number | null,
    panJ0: 0,
    panJFirstMax: 0
  });

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
    const start = Math.min(axisFreezeStart !== null ? axisFreezeStart : windowStart, maxS);
    return points.slice(start, start + DISPLAY_POINT_CAP);
  }, [points, windowStart, axisFreezeStart]);

  const panResponder = useMemo(
    () =>
      createTrendLineChartPanResponder({
        dragX,
        windowStartRef,
        pointsRef,
        latestComputedRef,
        dragOriginWindowRef,
        userPannedRef,
        setSelectedDate,
        setAxisFreezeStart,
        setWindowStart
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

  const computed = useMemo(
    () =>
      computeTrendLineChartLayout({
        points,
        breakdownByClass,
        axisFreezeStart,
        windowStart,
        width,
        height,
        paddingY,
        rightPad
      }),
    [points, breakdownByClass, axisFreezeStart, windowStart, height, paddingY, rightPad, width]
  );

  useLayoutEffect(() => {
    if (!computed.dots.length) {
      setSelectedDate(null);
      visibleDotsSelectionKeyRef.current = null;
      return;
    }
    const key = computed.visibleDotsInteractionKey;
    if (visibleDotsSelectionKeyRef.current === key) {
      return;
    }
    visibleDotsSelectionKeyRef.current = key;
    setSelectedDate((prev) => {
      if (prev !== null && computed.dots.some((d) => d.date === prev)) {
        return prev;
      }
      return computed.dots[computed.dots.length - 1].date;
    });
  }, [computed.visibleDotsInteractionKey]);

  useLayoutEffect(() => {
    setTooltipClusterW(null);
  }, [selectedDate]);

  const frozenPanScrollInitedRef = useRef(false);
  useLayoutEffect(() => {
    if (axisFreezeStart !== null && computed.frozenScrollInitT !== null && !frozenPanScrollInitedRef.current) {
      dragX.setValue(computed.frozenScrollInitT);
      frozenPanScrollInitedRef.current = true;
    }
    if (axisFreezeStart === null) {
      frozenPanScrollInitedRef.current = false;
    }
  }, [axisFreezeStart, computed.frozenScrollInitT, dragX]);

  {
    const freezeW = axisFreezeStart;
    if (freezeW !== null && points.length > 0) {
      const len = points.length;
      const maxS = Math.max(0, len - DISPLAY_POINT_CAP);
      const bufStart = Math.max(0, freezeW - PAN_LINE_BUFFER);
      const bufEnd = Math.min(len, freezeW + DISPLAY_POINT_CAP + PAN_LINE_BUFFER);
      latestComputedRef.current = {
        plotW: computed.plotW,
        axisFreezeStart: freezeW,
        panJ0: freezeW - bufStart,
        panJFirstMax: Math.min(maxS, bufEnd - DISPLAY_POINT_CAP) - bufStart
      };
    } else {
      latestComputedRef.current = {
        plotW: computed.plotW,
        axisFreezeStart: null,
        panJ0: 0,
        panJFirstMax: 0
      };
    }
  }

  const dotHitRadius = useMemo(() => {
    const dots = computed.dots;
    if (dots.length <= 1) {
      return 26;
    }
    let minSeg = Infinity;
    for (let i = 1; i < dots.length; i++) {
      const dx = dots[i].x - dots[i - 1].x;
      const dy = dots[i].y - dots[i - 1].y;
      const d = Math.hypot(dx, dy);
      if (d < minSeg) {
        minSeg = d;
      }
    }
    if (!Number.isFinite(minSeg) || minSeg <= 4) {
      return 26;
    }
    const raw = Math.floor((minSeg - 2) / 2);
    return Math.min(26, Math.max(4, raw));
  }, [computed.dots]);

  if (!points.length) {
    return (
      <View style={styles.emptyWrap}>
        <Text style={styles.emptyText}>暂无趋势数据，先确认一次导入记录。</Text>
      </View>
    );
  }

  const selectedIdx = selectedDate === null ? -1 : computed.dots.findIndex((d) => d.date === selectedDate);
  const safeActiveIndex = selectedIdx >= 0 ? selectedIdx : null;
  const activeDot = safeActiveIndex === null ? null : computed.dots[safeActiveIndex];

  const rangeLabel =
    points.length <= DISPLAY_POINT_CAP
      ? `共 ${points.length} 天有记录`
      : `共 ${points.length} 天 · 当前 ${displayPoints[0]?.date ?? ""}～${displayPoints[displayPoints.length - 1]?.date ?? ""} · 左右拖动看历史`;

  return (
    <View style={styles.container} onLayout={(e) => setWidth(Math.max(280, e.nativeEvent.layout.width))}>
      <View style={[styles.chartSurface, { width, height }]}>
        <View
          style={[
            styles.chartPlotClip,
            {
              top: paddingY,
              left: computed.chartLeft,
              width: computed.plotW,
              height: computed.plotInnerH
            }
          ]}
        >
          <View style={styles.chartPlotBandLayer} pointerEvents="none">
            <Svg width={computed.plotW} height={computed.plotInnerH}>
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
                const y = ((computed.domainMax - tick) * computed.plotInnerH) / spread;
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
            </Svg>
          </View>
          <Animated.View
            style={[
              styles.chartPlotScroll,
              {
                width: computed.bufferScrollW,
                height: computed.plotInnerH,
                transform: [{ translateX: dragX }],
                zIndex: 2
              }
            ]}
          >
            <Svg width={computed.bufferScrollW} height={computed.plotInnerH} pointerEvents="none">
              {computed.breakdownPaths.map((layer) => (
                <Path
                  key={layer.key}
                  d={layer.d}
                  stroke={layer.color}
                  strokeWidth={1.5}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={0.92}
                />
              ))}
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
            </Svg>
            <View style={styles.panLayer} {...panResponder.panHandlers} accessibilityLabel="横向拖动查看历史数据">
              <Pressable style={StyleSheet.absoluteFill} onPress={() => setSelectedDate(null)} accessibilityRole="button" />
            </View>
            {computed.dots.map((dot, index) => (
              <Pressable
                key={`dot-hit-${index}`}
                style={[
                  styles.dotHit,
                  {
                    left: dot.x - dotHitRadius,
                    top: dot.y - dotHitRadius,
                    width: dotHitRadius * 2,
                    height: dotHitRadius * 2
                  }
                ]}
                accessibilityHint="点击查看该日金额"
                hitSlop={dotHitRadius >= 18 ? 4 : 0}
                onPress={() => setSelectedDate(computed.dots[index].date)}
              />
            ))}
          </Animated.View>
        </View>

        {!computed.hideXLabels ? (
          <View
            style={[
              styles.xLabelStripClip,
              {
                left: computed.chartLeft - X_LABEL_STRIP_GUTTER,
                top: height - paddingY + 2,
                width: computed.plotW + X_LABEL_STRIP_GUTTER * 2,
                height: Math.max(14, paddingY - 4)
              }
            ]}
          >
            <Animated.View
              style={[
                styles.xLabelStripScroll,
                {
                  width: computed.bufferScrollW,
                  height: Math.max(14, paddingY - 4),
                  transform: [{ translateX: dragX }]
                }
              ]}
            >
              {xLabelIndices.map((index) => {
                const dot = computed.dots[index];
                if (!dot) {
                  return null;
                }
                const scrollW = computed.bufferScrollW;
                const rawLeft = dot.x - X_LABEL_SLOT_W / 2;
                const left = Math.max(0, Math.min(rawLeft, Math.max(0, scrollW - X_LABEL_SLOT_W)));
                return (
                  <Text
                    key={`xlabel-txt-${dot.date}-${index}`}
                    style={[styles.xLabelText, { left, top: 0, width: X_LABEL_SLOT_W, textAlign: "center" }]}
                    numberOfLines={1}
                  >
                    {dot.date.slice(5)}
                  </Text>
                );
              })}
            </Animated.View>
          </View>
        ) : null}

        <View style={[styles.chartAxisFrameLayer, { width, height }]} pointerEvents="none">
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
          </Svg>
        </View>

        <View style={[styles.chartYTickLabelsLayer, { width, height }]} pointerEvents="none">
          {computed.yTickLayouts.map((row) => (
            <Text
              key={row.key}
              style={[
                styles.yTickLabelText,
                {
                  top: row.top,
                  width: Math.max(24, computed.chartLeft - 6)
                }
              ]}
            >
              {row.label}
            </Text>
          ))}
        </View>

        <View
          style={[
            styles.tooltipPlotOverlay,
            {
              top: paddingY,
              left: computed.chartLeft,
              width: computed.plotW,
              height: computed.plotInnerH
            }
          ]}
          pointerEvents="none"
        >
          <Animated.View
            style={[
              styles.tooltipScrollSync,
              {
                width: computed.bufferScrollW,
                height: computed.plotInnerH,
                transform: [{ translateX: dragX }]
              }
            ]}
            pointerEvents="none"
          >
            {activeDot ? (
              <View
                style={[
                  styles.tooltipCluster,
                  {
                    left:
                      activeDot.x - (tooltipClusterW !== null ? tooltipClusterW : TOOLTIP_WIDTH_FALLBACK) / 2,
                    bottom: computed.plotInnerH - activeDot.y,
                    opacity: chartTooltipOpacity
                  }
                ]}
                pointerEvents="none"
                onLayout={(e) => {
                  const w = Math.round(e.nativeEvent.layout.width);
                  if (w <= 0) {
                    return;
                  }
                  setTooltipClusterW((prev) => (prev === w ? prev : w));
                }}
              >
                <View style={styles.tooltipBubble}>
                  <Text style={styles.tooltipDate}>{activeDot.date}</Text>
                  {breakdownByClass?.length ? (
                    <>
                      <Text style={styles.tooltipAmountPrimary}>
                        {primarySeriesLabel} {activeDot.total.toFixed(2)} 元
                      </Text>
                      {(breakdownByClass ?? [])
                        .map((ser) => {
                          const pt = ser.points.find((p) => p.date === activeDot.date);
                          const v = pt?.total ?? 0;
                          return { ser, v };
                        })
                        .filter(({ v }) => v > 0)
                        .map(({ ser, v }) => (
                          <Text
                            key={ser.assetClass}
                            style={[styles.tooltipBreakdownLine, { color: BREAKDOWN_LINE_COLORS[ser.assetClass] }]}
                          >
                            {BREAKDOWN_CLASS_LABEL[ser.assetClass]} {v.toFixed(2)} 元
                          </Text>
                        ))}
                    </>
                  ) : (
                    <Text style={styles.tooltipAmount}>{activeDot.total.toFixed(2)} 元</Text>
                  )}
                </View>
                <View style={styles.tooltipCaret} />
              </View>
            ) : null}
          </Animated.View>
        </View>
      </View>
      <Text style={styles.rangeHint}>{rangeLabel}</Text>
    </View>
  );
}
