import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line, Path, Text as SvgText } from "react-native-svg";
import type { TrendPoint } from "../storage/assetHistoryDb";

type Props = {
  points: TrendPoint[];
};

function buildPath(points: Array<{ x: number; y: number }>): string {
  if (!points.length) {
    return "";
  }
  return points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
}

export function TrendLineChart({ points }: Props) {
  const [width, setWidth] = useState(320);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const height = 180;
  const padding = 28;

  const computed = useMemo(() => {
    if (!points.length) {
      return { path: "", dots: [], min: 0, max: 0, yTicks: [] as number[] };
    }
    const values = points.map((p) => p.total);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const spread = Math.max(max - min, 1);
    const yTicks = Array.from({ length: 5 }, (_, i) => min + ((max - min) * i) / 4);

    const dots = points.map((item, index) => {
      const x =
        points.length === 1
          ? width / 2
          : padding + (index * (width - padding * 2)) / (points.length - 1);
      const y = padding + ((max - item.total) * (height - padding * 2)) / spread;
      return { x, y, total: item.total, date: item.date };
    });

    return {
      path: buildPath(dots),
      dots,
      min,
      max,
      yTicks
    };
  }, [height, padding, points, width]);

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

  return (
    <View
      style={styles.container}
      onLayout={(e) => setWidth(Math.max(280, e.nativeEvent.layout.width))}
    >
      {activeDot ? (
        <View
          style={[
            styles.tooltip,
            {
              left: Math.max(8, Math.min(activeDot.x - 90, width - 188)),
              top: Math.max(8, activeDot.y - 42)
            }
          ]}
        >
          <Text style={styles.tooltipText}>
            {activeDot.date} | {activeDot.total.toFixed(2)} CNY
          </Text>
        </View>
      ) : null}
      <Svg width={width} height={height}>
        <Line x1={24} y1={24} x2={24} y2={height - 24} stroke="#b7d4fb" strokeWidth={1} />
        <Line
          x1={24}
          y1={height - 24}
          x2={width - 24}
          y2={height - 24}
          stroke="#b7d4fb"
          strokeWidth={1}
        />
        {computed.yTicks.map((tick, idx) => {
          const spread = Math.max(computed.max - computed.min, 1);
          const y = padding + ((computed.max - tick) * (height - padding * 2)) / spread;
          return (
            <Line
              key={`grid-${idx}-${tick}`}
              x1={24}
              y1={y}
              x2={width - 24}
              y2={y}
              stroke="#dbeafe"
              strokeWidth={1}
            />
          );
        })}
        <Path d={computed.path} stroke="#2563eb" strokeWidth={2} fill="none" />
        {computed.dots.map((dot, index) => (
          <Circle
            key={`${dot.date}-${dot.total}`}
            cx={dot.x}
            cy={dot.y}
            r={index === safeActiveIndex ? 5 : 3}
            fill={index === safeActiveIndex ? "#1d4ed8" : "#2563eb"}
            onPress={() => setActiveIndex(index)}
          />
        ))}
        {computed.yTicks.map((tick, idx) => {
          const spread = Math.max(computed.max - computed.min, 1);
          const y = padding + ((computed.max - tick) * (height - padding * 2)) / spread;
          return (
            <SvgText key={`ylabel-${idx}-${tick}`} x={2} y={y + 4} fontSize="10" fill="#4f76b3">
              {tick.toFixed(0)}
            </SvgText>
          );
        })}
        {computed.dots.map((dot, index) => {
          if (!(index === 0 || index === computed.dots.length - 1 || index === Math.floor(computed.dots.length / 2))) {
            return null;
          }
          return (
            <SvgText key={`xlabel-${dot.date}-${index}`} x={dot.x - 22} y={height - 8} fontSize="10" fill="#4f76b3">
              {dot.date.slice(5)}
            </SvgText>
          );
        })}
      </Svg>
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
  axisText: {
    color: "#4f76b3",
    fontSize: 12
  },
  tooltip: {
    position: "absolute",
    zIndex: 10,
    borderRadius: 8,
    backgroundColor: "#eff6ff",
    borderWidth: 1,
    borderColor: "#bfdbfe",
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  tooltipText: {
    color: "#163d7a",
    fontWeight: "600",
    fontSize: 12
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
