import type { ParsedAsset, ParseResult } from "../domain/types";
import { buildRuleSummary } from "../parsers/shared";
import { resolveSnapshotBucketIdFromParseResult, type SnapshotAssetBucket } from "../storage/assetHistoryDb";

export type EditableAssetItem = ParsedAsset & {
  imageUri: string;
  localId: string;
  amountInput: string;
  amountError: string | null;
};

export type ImportedImageMeta = {
  uri: string;
  hash: string;
  parseResult: ParseResult;
  rawOcrText: string;
};

export function validateEditableImportName(name: string): string | null {
  if (!name.trim()) {
    return "请填写金额名称";
  }
  return null;
}

export function validateEditableImportAmount(amountInput: string): string | null {
  const normalized = amountInput.replace(/,/g, "").trim();
  if (!normalized) {
    return "请输入金额";
  }
  if (!/^-?\d*(\.\d*)?$/.test(normalized) || normalized === "." || normalized === "-" || normalized === "-.") {
    return "金额格式不正确";
  }
  const amount = Number(normalized);
  if (!Number.isFinite(amount)) {
    return "金额格式不正确";
  }
  return null;
}

export function buildImportSnapshotPayload(
  editableAssets: EditableAssetItem[],
  importedImageMetas: ImportedImageMeta[],
  currentImageHashes: string[]
): { validationErrors: string[]; assetBuckets: SnapshotAssetBucket[]; ocrTextsForSave: string[] } {
  const validationErrors: string[] = [];
  for (const asset of editableAssets) {
    const amountError = validateEditableImportAmount(asset.amountInput);
    const nameError = validateEditableImportName(asset.name);
    if (amountError) {
      validationErrors.push(`${asset.name.trim() || "未命名"}：${amountError}`);
    } else if (nameError) {
      validationErrors.push(`${asset.ruleSummary ?? "某一行"}：${nameError}`);
    }
  }
  const bucketMap = new Map<string, ParsedAsset[]>();
  for (const row of editableAssets) {
    const meta = importedImageMetas.find((item) => item.uri === row.imageUri);
    const bucketId = meta ? resolveSnapshotBucketIdFromParseResult(meta.parseResult) : "unknown";
    const amount = Number(row.amountInput.replace(/,/g, "").trim());
    const label = row.name.trim() || row.recognizedLabel || "—";
    const summary = buildRuleSummary(label, amount, row.assetClass);
    const item: ParsedAsset = {
      name: row.name.trim(),
      amount,
      currency: "CNY",
      assetClass: row.assetClass,
      source: row.source,
      confidence: row.confidence,
      ruleSummary: summary
    };
    if (row.recognizedLabel) {
      item.recognizedLabel = row.recognizedLabel;
    }
    const list = bucketMap.get(bucketId) ?? [];
    list.push(item);
    bucketMap.set(bucketId, list);
  }
  const assetBuckets: SnapshotAssetBucket[] = [...bucketMap.entries()].map(([bucketId, assets]) => ({
    bucketId,
    assets
  }));
  const hashToOcr = new Map(importedImageMetas.map((item) => [item.hash, item.rawOcrText]));
  const ocrTextsForSave = currentImageHashes.map((h) => hashToOcr.get(h) ?? "");
  return { validationErrors, assetBuckets, ocrTextsForSave };
}

export function inferMimeFromUri(uri: string): "image/png" | "image/jpeg" | "image/webp" {
  const lower = uri.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (lower.endsWith(".webp")) {
    return "image/webp";
  }
  return "image/png";
}
