import type { ParsedAsset } from "../domain/types";

export function normalizeText(input: string): string {
  return input
    .replace(/[,\s]/g, "")
    .replace(/人民币/g, "CNY")
    .replace(/元/g, "")
    .trim();
}

export function parseMoney(raw: string): number | null {
  const text = raw.replace(/[, ]/g, "");
  const match = text.match(/-?\d+(?:\.\d+)?/);
  if (!match) {
    return null;
  }
  const value = Number(match[0]);
  return Number.isFinite(value) ? value : null;
}

export function safeAsset(asset: Omit<ParsedAsset, "currency">): ParsedAsset | null {
  if (!asset.name.trim()) {
    return null;
  }
  if (!Number.isFinite(asset.amount) || asset.amount < 0) {
    return null;
  }
  return {
    ...asset,
    currency: "CNY"
  };
}
