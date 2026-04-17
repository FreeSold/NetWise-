/**
 * 与 `saveImportSnapshot` 中「同一天内已记录过的图片 hash 不再写入」规则一致，抽出便于单测。
 */
export function filterNewImageHashesForImportDate(
  importDate: string,
  uniqueHashes: string[],
  snapshots: { importDate: string; imageHashes: string[] }[]
): string[] {
  const existing = new Set(
    snapshots.filter((s) => s.importDate === importDate).flatMap((s) => s.imageHashes)
  );
  return uniqueHashes.filter((hash) => Boolean(hash) && !existing.has(hash));
}
