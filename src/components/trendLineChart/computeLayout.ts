import type { AssetClass } from "../../domain/types";
import type { TrendPoint, TrendSeriesBreakdown } from "../../storage/assetHistoryDb";
import { BREAKDOWN_LINE_COLORS, DISPLAY_POINT_CAP, LINE_X_INSET, PAN_LINE_BUFFER } from "./constants";
import { buildNiceYTicks, buildPathExtended, buildYBandRects, formatYTickLabel } from "./geometry";

export type BreakdownPathLayer = { key: string; d: string; color: string; assetClass: AssetClass };

export type TrendLineChartComputed = {
  path: string;
  dots: Array<{ x: number; y: number; total: number; date: string }>;
  dotsSignature: string;
  visibleDotsInteractionKey: string;
  ticks: number[];
  domainMin: number;
  domainMax: number;
  leftPad: number;
  chartLeft: number;
  chartRight: number;
  plotW: number;
  plotInnerH: number;
  bufferScrollW: number;
  frozenScrollInitT: number | null;
  hideXLabels: boolean;
  yTickLayouts: Array<{ key: string; top: number; label: string }>;
  yBandRects: Array<{ key: string; x: number; y: number; width: number; height: number; fill: string }>;
  breakdownPaths: BreakdownPathLayer[];
};

const emptyComputed = (plotInnerHFallback: number): TrendLineChartComputed => ({
  path: "",
  dots: [],
  dotsSignature: "",
  visibleDotsInteractionKey: "",
  ticks: [],
  domainMin: 0,
  domainMax: 1,
  leftPad: 40,
  chartLeft: 40,
  chartRight: 0,
  plotW: 1,
  plotInnerH: plotInnerHFallback,
  bufferScrollW: 1,
  frozenScrollInitT: null,
  hideXLabels: false,
  yTickLayouts: [],
  yBandRects: [],
  breakdownPaths: []
});

export function computeTrendLineChartLayout(input: {
  points: TrendPoint[];
  breakdownByClass?: TrendSeriesBreakdown[];
  axisFreezeStart: number | null;
  windowStart: number;
  width: number;
  height: number;
  paddingY: number;
  rightPad: number;
}): TrendLineChartComputed {
  const { points, breakdownByClass, axisFreezeStart, windowStart, width, height, paddingY, rightPad } = input;
  const plotInnerHFallback = Math.max(1, height - paddingY * 2);
  if (!points.length) {
    return emptyComputed(plotInnerHFallback);
  }

  const maxS = Math.max(0, points.length - DISPLAY_POINT_CAP);
  const frozen = axisFreezeStart !== null;
  const axisStartClamped = Math.min(Math.max(0, frozen ? axisFreezeStart! : windowStart), maxS);
  const lineStartClamped = Math.min(Math.max(0, windowStart), maxS);

  const axisPoints = points.slice(axisStartClamped, axisStartClamped + DISPLAY_POINT_CAP);
  if (!axisPoints.length) {
    return emptyComputed(plotInnerHFallback);
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
    bufferScrollW = M <= 1 ? plotW : Math.max(plotW, (M - 1) * plotStep + 2 * LINE_X_INSET);
    const bufPathDots = bufPts.map((item, j) => {
      const x = M <= 1 ? plotW / 2 : LINE_X_INSET + j * plotStep;
      const y = ((domainMax - item.total) * plotInnerH) / spread;
      return { x, y, total: item.total, date: item.date };
    });
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
      const x = linePoints.length === 1 ? plotW / 2 : LINE_X_INSET + (index * lineUsableW) / denom;
      const y = ((domainMax - item.total) * plotInnerH) / spread;
      return { x, y, total: item.total, date: item.date };
    });
    path = buildPathExtended(dots, 0, plotW);
    breakdownPaths = (breakdownByClass ?? []).map((ser, si) => {
      const pts = linePoints.map((item, index) => {
        const total = ser.points.find((p) => p.date === item.date)?.total ?? 0;
        const x = linePoints.length === 1 ? plotW / 2 : LINE_X_INSET + (index * lineUsableW) / denom;
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
  const visibleDotsInteractionKey = dots.map((d) => `${d.date}:${d.total}`).join("|");
  const dotsSignature = `${visibleDotsInteractionKey}#${breakdownSig}`;

  return {
    path,
    dots,
    dotsSignature,
    visibleDotsInteractionKey,
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
}
