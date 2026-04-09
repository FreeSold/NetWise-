import type { AssetClass, ParsedAsset } from "../domain/types";

export const ASSET_CLASS_CN: Record<AssetClass, string> = {
  cash: "现金",
  fund: "基金",
  insurance: "保险",
  stock: "股票",
  wealth_management: "理财"
};

export function formatDisplayAmount(amount: number): string {
  if (!Number.isFinite(amount)) {
    return "0.00";
  }
  try {
    return amount.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  } catch {
    return amount.toFixed(2);
  }
}

export function buildRuleSummary(label: string, amount: number, assetClass: AssetClass): string {
  const trimmed = label.trim();
  return `${trimmed}   ${formatDisplayAmount(amount)}   ${ASSET_CLASS_CN[assetClass]}`;
}

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
