import { Y_BAND_FILL_A, Y_BAND_FILL_B } from "./constants";

/** 折线经过各数据点，并在首尾沿相邻段斜率外推到 [xMin, xMax]，使两端贴齐绘图区边界 */
export function buildPathExtended(
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
export function niceStep(roughStep: number): number {
  if (!Number.isFinite(roughStep) || roughStep <= 0) {
    return 1;
  }
  const exp = Math.floor(Math.log10(roughStep));
  const pow = Math.pow(10, exp);
  const n = roughStep / pow;
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return nice * pow;
}

export function buildNiceYTicks(
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

export function ySvgForValue(
  value: number,
  domainMin: number,
  domainMax: number,
  spread: number,
  innerPlotHeight: number,
  paddingY: number
): number {
  return paddingY + ((domainMax - value) * innerPlotHeight) / spread;
}

export function buildYBandRects(
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

export function formatYTickLabel(n: number): string {
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
