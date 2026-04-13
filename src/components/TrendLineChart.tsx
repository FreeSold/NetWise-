import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line, Path, Text as SvgText } from "react-native-svg";
import type { TrendPoint } from "../storage/assetHistoryDb";

type Props = {
  points: TrendPoint[];
};

const DISPLAY_POINT_CAP = 10;

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

  const displayPoints = useMemo(
    () => (points.length <= DISPLAY_POINT_CAP ? points : points.slice(-DISPLAY_POINT_CAP)),
    [points]
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
        chartRight: 0
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
    const chartW = Math.max(chartRight - chartLeft, 1);

    const dots = displayPoints.map((item, index) => {
      const x =
        displayPoints.length === 1
          ? (chartLeft + chartRight) / 2
          : chartLeft + (index * chartW) / (displayPoints.length - 1);
      const y = paddingY + ((domainMax - item.total) * (height - paddingY * 2)) / spread;
      return { x, y, total: item.total, date: item.date };
    });

    return {
      path: buildPath(dots),
      dots,
      ticks,
      domainMin,
      domainMax,
      leftPad,
      chartLeft,
      chartRight
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

  return (
    <View
      style={styles.container}
      onLayout={(e) => setWidth(Math.max(280, e.nativeEvent.layout.width))}
    >
      <View style={[styles.chartSurface, { width, height }]}>
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
          return (
            <Line
              key={`grid-${idx}-${tick}`}
              x1={computed.chartLeft}
              y1={y}
              x2={computed.chartRight}
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
        {computed.ticks.map((tick, idx) => {
          const spread = Math.max(computed.domainMax - computed.domainMin, 1e-9);
          const y = paddingY + ((computed.domainMax - tick) * (height - paddingY * 2)) / spread;
          const label = formatYTickLabel(tick);
          return (
            <SvgText
              key={`ylabel-${idx}-${tick}`}
              x={Math.max(2, computed.chartLeft - 6 - label.length * 5.2)}
              y={y + 4}
              fontSize="10"
              fill="#4f76b3"
            >
              {label}
            </SvgText>
          );
        })}
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
        <Pressable
          style={StyleSheet.absoluteFillObject}
          accessibilityLabel="关闭数据点提示"
          onPress={() => setActiveIndex(null)}
        />
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
                left: Math.max(6, Math.min(activeDot.x - 84, width - 168)),
                top: Math.max(6, activeDot.y - 56)
              }
            ]}
            pointerEvents="none"
          >
            <Text style={styles.tooltipDate}>{activeDot.date}</Text>
            <Text style={styles.tooltipAmount}>{activeDot.total.toFixed(2)} 元</Text>
          </View>
        ) : null}
      </View>
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
    alignSelf: "center"
  },
  dotHit: {
    position: "absolute",
    borderRadius: 999,
    backgroundColor: "transparent"
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
  }
});
