import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Animated, PanResponder, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line, Path, Rect } from "react-native-svg";
import type { AssetClass } from "../domain/types";
import type { TrendPoint, TrendSeriesBreakdown } from "../storage/assetHistoryDb";

/** 分项折线：赤、橙、黄、绿、青（与资产类固定对应）；紫色未使用 */
const BREAKDOWN_LINE_COLORS: Record<AssetClass, string> = {
  cash: "#dc2626",
  fund: "#ea580c",
  insurance: "#ca8a04",
  stock: "#16a34a",
  wealth_management: "#06b6d4"
};

const BREAKDOWN_CLASS_LABEL: Record<AssetClass, string> = {
  cash: "现金",
  fund: "基金",
  insurance: "保险",
  stock: "股票",
  wealth_management: "理财"
};

type Props = {
  points: TrendPoint[];
  /** 选「全部」时叠加的各资产类折线 */
  breakdownByClass?: TrendSeriesBreakdown[];
  /** 主折线在浮层中的名称，默认「全部」 */
  primarySeriesLabel?: string;
  /** 与设置页卡片透明度联动，浮窗不透明度（建议传 moduleControlOpacity，约 0.5～1） */
  chartTooltipOpacity?: number;
};

type BreakdownPathLayer = { key: string; d: string; color: string; assetClass: AssetClass };

const DISPLAY_POINT_CAP = 10;
/** 拖动时折线路径向两侧多取的点数，减轻贴边时的截断感 */
const PAN_LINE_BUFFER = 10;
/** 横向拖动约多少像素视为平移 1 个时点 */
const PAN_PX_PER_STEP = 38;
/** 底部日期刻度占位宽度（居中），避免贴左右边界被裁切 */
const X_LABEL_SLOT_W = 44;
/** 日期条相对绘图区左右多露出的安全边距 */
const X_LABEL_STRIP_GUTTER = 14;
/** 折线/圆点距绘图区左右边的内缩，避免端点圆与描边被裁切 */
const LINE_X_INSET = 8;

/** 折线经过各数据点，并在首尾沿相邻段斜率外推到 [xMin, xMax]，使两端贴齐绘图区边界 */
function buildPathExtended(
  points: Array<{ x: number; y: number }>,
  xMin: number,
  xMax: number
): string {
  if (!points.length) {
    return "";
  }
  if (points.length === 1) {
    const { y } = points[0];
    return `M ${xMin} ${y} L ${xMax} ${y}`;
  }
  const extrapolateY = (xa: number, ya: number, xb: number, yb: number, xTarget: number) => {
    const dx = xb - xa;
    if (Math.abs(dx) < 1e-6) {
      return ya;
    }
    return ya + ((yb - ya) / dx) * (xTarget - xa);
  };
  const p0 = points[0];
  const p1 = points[1];
  const pn1 = points[points.length - 1];
  const pn2 = points[points.length - 2];
  const yLeft = extrapolateY(p0.x, p0.y, p1.x, p1.y, xMin);
  const yRight = extrapolateY(pn2.x, pn2.y, pn1.x, pn1.y, xMax);
  const mid = points.map((p) => `L ${p.x} ${p.y}`).join(" ");
  return `M ${xMin} ${yLeft} ${mid} L ${xMax} ${yRight}`;
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

const TOOLTIP_LAYOUT_HALF_W = 42;
/** 气泡 + 三角总高度，使三角尖端落在数据点附近 */
const TOOLTIP_LAYOUT_ABOVE_DOT = 42;

export function TrendLineChart({
  points,
  chartTooltipOpacity = 1,
  breakdownByClass,
  primarySeriesLabel = "全部"
}: Props) {
  const [width, setWidth] = useState(320);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const height = 180;
  const paddingY = 28;
  const rightPad = 24;

  const maxWindowStart = Math.max(0, points.length - DISPLAY_POINT_CAP);
  const [windowStart, setWindowStart] = useState(0);
  /** 非 null：拖动中，Y 轴/横向网格/色带冻结为该窗起点；折线用预加载宽路径只平移，不重算 Path */
  const [axisFreezeStart, setAxisFreezeStart] = useState<number | null>(null);
  const userPannedRef = useRef(false);
  const pointsLenRef = useRef(0);
  const pointsRef = useRef(points);
  pointsRef.current = points;
  const windowStartRef = useRef(windowStart);
  windowStartRef.current = windowStart;
  /** 本次手势开始时的 windowStart，松手时与累计位移一起换算最终窗 */
  const dragOriginWindowRef = useRef(0);
  const dragX = useRef(new Animated.Value(0)).current;
  /** 供 PanResponder 读取当前布局（plotW、冻结窗等） */
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
      PanResponder.create({
        onPanResponderGrant: () => {
          setActiveIndex(null);
          dragX.stopAnimation();
          const w0 = windowStartRef.current;
          dragOriginWindowRef.current = w0;
          const len = pointsRef.current.length;
          const maxS = Math.max(0, len - DISPLAY_POINT_CAP);
          if (maxS > 0) {
            setAxisFreezeStart(w0);
          }
        },
        onMoveShouldSetPanResponder: (_, g) =>
          Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.05,
        onPanResponderMove: (_, g) => {
          const len = pointsRef.current.length;
          const maxS = Math.max(0, len - DISPLAY_POINT_CAP);
          if (maxS === 0) {
            return;
          }
          const freezeW = latestComputedRef.current.axisFreezeStart;
          if (freezeW === null) {
            return;
          }
          const { plotW, panJ0, panJFirstMax } = latestComputedRef.current;
          const denom = Math.max(1, DISPLAY_POINT_CAP - 1);
          const plotStep = Math.max(1, plotW - 2 * LINE_X_INSET) / denom;
          const T0 = -panJ0 * plotStep;
          const TMin = -panJFirstMax * plotStep;
          const TMax = 0;
          const dx = g.dx;
          let T = T0 + dx;
          if (T > TMax) {
            T = TMax + (T - TMax) * 0.28;
          }
          if (T < TMin) {
            T = TMin + (T - TMin) * 0.28;
          }
          dragX.setValue(T);
        },
        onPanResponderRelease: (_, g) => {
          const len = pointsRef.current.length;
          const maxS = Math.max(0, len - DISPLAY_POINT_CAP);
          if (maxS === 0) {
            Animated.spring(dragX, {
              toValue: 0,
              useNativeDriver: false,
              friction: 8,
              tension: 160
            }).start();
            return;
          }
          const w0 = dragOriginWindowRef.current;
          const delta = Math.round(-g.dx / PAN_PX_PER_STEP);
          if (delta !== 0) {
            userPannedRef.current = true;
          }
          const finalWin = Math.max(0, Math.min(maxS, w0 + delta));
          dragX.stopAnimation();
          dragX.setValue(0);
          setWindowStart(finalWin);
          setAxisFreezeStart(null);
        },
        onPanResponderTerminate: (_, g) => {
          const len = pointsRef.current.length;
          const maxS = Math.max(0, len - DISPLAY_POINT_CAP);
          dragX.stopAnimation();
          dragX.setValue(0);
          if (maxS > 0) {
            const w0 = dragOriginWindowRef.current;
            const delta = Math.round(-(g?.dx ?? 0) / PAN_PX_PER_STEP);
            if (delta !== 0) {
              userPannedRef.current = true;
            }
            const finalWin = Math.max(0, Math.min(maxS, w0 + delta));
            setWindowStart(finalWin);
            setAxisFreezeStart(null);
          }
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
    const plotInnerHFallback = Math.max(1, height - paddingY * 2);
    if (!points.length) {
      return {
        path: "",
        dots: [] as Array<{ x: number; y: number; total: number; date: string }>,
        dotsSignature: "",
        ticks: [] as number[],
        domainMin: 0,
        domainMax: 1,
        leftPad: 40,
        chartLeft: 40,
        chartRight: 0,
        plotW: 1,
        plotInnerH: plotInnerHFallback,
        bufferScrollW: 1,
        frozenScrollInitT: null as number | null,
        hideXLabels: false,
        yTickLayouts: [] as Array<{ key: string; top: number; label: string }>,
        yBandRects: [] as Array<{ key: string; x: number; y: number; width: number; height: number; fill: string }>,
        breakdownPaths: [] as BreakdownPathLayer[]
      };
    }

    const maxS = Math.max(0, points.length - DISPLAY_POINT_CAP);
    const frozen = axisFreezeStart !== null;
    const axisStartClamped = Math.min(Math.max(0, frozen ? axisFreezeStart! : windowStart), maxS);
    const lineStartClamped = Math.min(Math.max(0, windowStart), maxS);

    const axisPoints = points.slice(axisStartClamped, axisStartClamped + DISPLAY_POINT_CAP);
    if (!axisPoints.length) {
      return {
        path: "",
        dots: [] as Array<{ x: number; y: number; total: number; date: string }>,
        dotsSignature: "",
        ticks: [] as number[],
        domainMin: 0,
        domainMax: 1,
        leftPad: 40,
        chartLeft: 40,
        chartRight: 0,
        plotW: 1,
        plotInnerH: plotInnerHFallback,
        bufferScrollW: 1,
        frozenScrollInitT: null as number | null,
        hideXLabels: false,
        yTickLayouts: [] as Array<{ key: string; top: number; label: string }>,
        yBandRects: [] as Array<{ key: string; x: number; y: number; width: number; height: number; fill: string }>,
        breakdownPaths: [] as BreakdownPathLayer[]
      };
    }

    const axisDatesForScale = axisPoints.map((p) => p.date);
    const axisValuesForScale = [...axisPoints.map((p) => p.total)];
    if (breakdownByClass?.length) {
      for (const ser of breakdownByClass) {
        for (const d of axisDatesForScale) {
          axisValuesForScale.push(ser.points.find((p) => p.date === d)?.total ?? 0);
        }
      }
    }
    const dataMin = Math.min(...axisValuesForScale);
    const dataMax = Math.max(...axisValuesForScale);
    const { ticks, domainMin, domainMax } = buildNiceYTicks(dataMin, dataMax, 5);
    const spread = Math.max(domainMax - domainMin, 1e-9);

    const maxLabel = ticks.reduce((a, t) => Math.max(a, formatYTickLabel(t).length), 8);
    const leftPad = Math.min(72, Math.max(36, 10 + maxLabel * 5.5));
    const chartLeft = leftPad;
    const chartRight = width - rightPad;
    const plotW = Math.max(chartRight - chartLeft, 1);
    const plotInnerH = Math.max(1, height - paddingY * 2);
    const denom = Math.max(1, DISPLAY_POINT_CAP - 1);
    const lineUsableW = Math.max(1, plotW - 2 * LINE_X_INSET);
    const plotStep = lineUsableW / denom;

    let path: string;
    let dots: Array<{ x: number; y: number; total: number; date: string }>;
    let bufferScrollW = plotW;
    let frozenScrollInitT: number | null = null;
    let hideXLabels = false;
    let breakdownPaths: BreakdownPathLayer[] = [];

    if (frozen) {
      const freezeW = axisFreezeStart!;
      const bufStart = Math.max(0, freezeW - PAN_LINE_BUFFER);
      const bufEnd = Math.min(points.length, freezeW + DISPLAY_POINT_CAP + PAN_LINE_BUFFER);
      const bufPts = points.slice(bufStart, bufEnd);
      const M = bufPts.length;
      const j0 = freezeW - bufStart;
      bufferScrollW =
        M <= 1 ? plotW : Math.max(plotW, (M - 1) * plotStep + 2 * LINE_X_INSET);
      const bufPathDots = bufPts.map((item, j) => {
        const x = M <= 1 ? plotW / 2 : LINE_X_INSET + j * plotStep;
        const y = ((domainMax - item.total) * plotInnerH) / spread;
        return { x, y, total: item.total, date: item.date };
      });
      // 路径铺满 Svg 左右边，圆点仍用 LINE_X_INSET 避免贴边裁切；静态与拖动时视觉一致
      path = buildPathExtended(bufPathDots, 0, bufferScrollW);
      dots = bufPathDots.slice(j0, j0 + DISPLAY_POINT_CAP);
      frozenScrollInitT = -(M <= 1 ? 0 : j0 * plotStep);
      hideXLabels = true;
      breakdownPaths = (breakdownByClass ?? []).map((ser, si) => {
        const pts = bufPathDots.map((base) => {
          const total = ser.points.find((p) => p.date === base.date)?.total ?? 0;
          const y = ((domainMax - total) * plotInnerH) / spread;
          return { x: base.x, y };
        });
        return {
          key: `bd-${ser.assetClass}-fz-${si}`,
          d: buildPathExtended(pts, 0, bufferScrollW),
          color: BREAKDOWN_LINE_COLORS[ser.assetClass],
          assetClass: ser.assetClass
        };
      });
    } else {
      const linePoints = points.slice(lineStartClamped, lineStartClamped + DISPLAY_POINT_CAP);
      dots = linePoints.map((item, index) => {
        const x =
          linePoints.length === 1 ? plotW / 2 : LINE_X_INSET + (index * lineUsableW) / denom;
        const y = ((domainMax - item.total) * plotInnerH) / spread;
        return { x, y, total: item.total, date: item.date };
      });
      path = buildPathExtended(dots, 0, plotW);
      breakdownPaths = (breakdownByClass ?? []).map((ser, si) => {
        const pts = linePoints.map((item, index) => {
          const total = ser.points.find((p) => p.date === item.date)?.total ?? 0;
          const x =
            linePoints.length === 1 ? plotW / 2 : LINE_X_INSET + (index * lineUsableW) / denom;
          const y = ((domainMax - total) * plotInnerH) / spread;
          return { x, y };
        });
        return {
          key: `bd-${ser.assetClass}-st-${si}`,
          d: buildPathExtended(pts, 0, plotW),
          color: BREAKDOWN_LINE_COLORS[ser.assetClass],
          assetClass: ser.assetClass
        };
      });
    }

    const yBandRects = buildYBandRects(ticks, domainMin, domainMax, 0, plotW, 0, plotInnerH);

    const yTickLayouts = ticks.map((tick, idx) => {
      const yInner = ((domainMax - tick) * plotInnerH) / spread;
      return {
        key: `ytick-lbl-${idx}-${tick}`,
        top: paddingY + yInner - 5,
        label: formatYTickLabel(tick)
      };
    });

    const breakdownSig = (breakdownByClass ?? [])
      .map((s) => `${s.assetClass}:${s.points.map((p) => `${p.date}:${p.total}`).join(",")}`)
      .join("|");
    const dotsSignature = `${dots.map((d) => `${d.date}:${d.total}`).join("|")}#${breakdownSig}`;

    return {
      path,
      dots,
      dotsSignature,
      ticks,
      domainMin,
      domainMax,
      leftPad,
      chartLeft,
      chartRight,
      plotW,
      plotInnerH,
      bufferScrollW,
      frozenScrollInitT,
      hideXLabels,
      yTickLayouts,
      yBandRects,
      breakdownPaths
    };
  }, [points, breakdownByClass, axisFreezeStart, windowStart, height, paddingY, rightPad, width]);

  /** 可见折线点集变化时，默认高亮并展示最右侧点（当前窗内最近一次导入） */
  useLayoutEffect(() => {
    if (!computed.dots.length) {
      setActiveIndex(null);
      return;
    }
    setActiveIndex(computed.dots.length - 1);
  }, [computed.dotsSignature]);

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
                accessibilityHint="点击查看该日金额"
                hitSlop={4}
                onPress={() => setActiveIndex(index)}
              />
            ))}
            {activeDot ? (
              <View
                style={[
                  styles.tooltipCluster,
                  {
                    left: Math.max(
                      6,
                      Math.min(activeDot.x - TOOLTIP_LAYOUT_HALF_W, computed.plotW - TOOLTIP_LAYOUT_HALF_W * 2 - 6)
                    ),
                    top: Math.max(6, activeDot.y - TOOLTIP_LAYOUT_ABOVE_DOT),
                    opacity: chartTooltipOpacity
                  }
                ]}
                pointerEvents="none"
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
                            style={[
                              styles.tooltipBreakdownLine,
                              { color: BREAKDOWN_LINE_COLORS[ser.assetClass] }
                            ]}
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
                    style={[
                      styles.xLabelText,
                      { left, top: 0, width: X_LABEL_SLOT_W, textAlign: "center" }
                    ]}
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
    lineHeight: 16
  }
});
