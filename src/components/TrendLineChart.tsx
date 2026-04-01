import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line, Path } from "react-native-svg";
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
  const height = 180;
  const padding = 24;

  const computed = useMemo(() => {
    if (!points.length) {
      return { path: "", dots: [], min: 0, max: 0 };
    }
    const values = points.map((p) => p.total);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const spread = Math.max(max - min, 1);

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
      max
    };
  }, [height, padding, points, width]);

  if (!points.length) {
    return (
      <View style={styles.emptyWrap}>
        <Text style={styles.emptyText}>暂无趋势数据，先确认一次导入记录。</Text>
      </View>
    );
  }

  return (
    <View
      style={styles.container}
      onLayout={(e) => setWidth(Math.max(280, e.nativeEvent.layout.width))}
    >
      <Svg width={width} height={height}>
        <Line x1={24} y1={24} x2={24} y2={height - 24} stroke="#cbd5e1" strokeWidth={1} />
        <Line
          x1={24}
          y1={height - 24}
          x2={width - 24}
          y2={height - 24}
          stroke="#cbd5e1"
          strokeWidth={1}
        />
        <Path d={computed.path} stroke="#2563eb" strokeWidth={2} fill="none" />
        {computed.dots.map((dot) => (
          <Circle key={`${dot.date}-${dot.total}`} cx={dot.x} cy={dot.y} r={3} fill="#2563eb" />
        ))}
      </Svg>
      <Text style={styles.axisText}>
        {points[0].date}
        {" -> "}
        {points[points.length - 1].date}
      </Text>
      <Text style={styles.axisText}>
        最小 {computed.min.toFixed(2)} / 最大 {computed.max.toFixed(2)} CNY
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    alignItems: "center",
    gap: 4
  },
  axisText: {
    color: "#475569",
    fontSize: 12
  },
  emptyWrap: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    paddingVertical: 20,
    alignItems: "center",
    backgroundColor: "#f8fafc"
  },
  emptyText: {
    color: "#64748b"
  }
});
