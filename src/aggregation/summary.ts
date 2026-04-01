import type { ParsedAsset, ParseResult } from "../domain/types";

export function toSummaryFromAssets(assets: ParsedAsset[]): string[] {
  const total = assets.reduce((sum, asset) => sum + asset.amount, 0);
  const byClass = assets.reduce<Record<string, number>>((acc, asset) => {
    acc[asset.assetClass] = (acc[asset.assetClass] || 0) + asset.amount;
    return acc;
  }, {});

  const lines = [`总计: ${total.toFixed(2)} CNY`];
  for (const [k, v] of Object.entries(byClass)) {
    lines.push(`${k}: ${v.toFixed(2)} CNY`);
  }
  return lines;
}

export function toSummary(result: ParseResult): string[] {
  return toSummaryFromAssets(result.assets);
}
