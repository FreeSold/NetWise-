import * as FileSystem from "expo-file-system";

function requireDocumentBase(): string {
  if (!FileSystem.documentDirectory) {
    throw new Error("文件存储目录不可用");
  }
  return FileSystem.documentDirectory;
}

/** 应用文档目录下主文件的绝对路径（`mainFileName` 含扩展名，如 `netwise-foo.json`） */
export function getDocumentFileUri(mainFileName: string): string {
  return `${requireDocumentBase()}${mainFileName}`;
}

/** 与主文件同目录的临时文件，写入完成后再 move，降低写入中断导致主文件半写入的风险 */
export function getDocumentTempUri(mainFileName: string): string {
  return `${requireDocumentBase()}${mainFileName}.tmp`;
}

/**
 * 将 UTF-8 文本原子写入文档目录下的 `mainFileName`（先写 `.tmp` 再 `moveAsync`）。
 * 与 `assetHistoryDb.writeStore` 策略一致。
 */
export async function writeUtf8Atomically(mainFileName: string, utf8: string): Promise<void> {
  const fileUri = getDocumentFileUri(mainFileName);
  const tmpUri = getDocumentTempUri(mainFileName);
  await FileSystem.writeAsStringAsync(tmpUri, utf8, {
    encoding: FileSystem.EncodingType.UTF8
  });
  try {
    await FileSystem.moveAsync({ from: tmpUri, to: fileUri });
  } catch (firstErr) {
    try {
      const destInfo = await FileSystem.getInfoAsync(fileUri);
      if (destInfo.exists) {
        await FileSystem.deleteAsync(fileUri, { idempotent: true });
      }
      await FileSystem.moveAsync({ from: tmpUri, to: fileUri });
    } catch (secondErr) {
      console.error(`writeUtf8Atomically(${mainFileName}): move temp to main failed`, secondErr);
      try {
        await FileSystem.deleteAsync(tmpUri, { idempotent: true });
      } catch {
        /* ignore */
      }
      throw firstErr instanceof Error ? firstErr : secondErr instanceof Error ? secondErr : new Error(String(secondErr));
    }
  }
}

/**
 * 将疑似损坏的主文件复制为 `stem.corrupt.<iso>.bak`（stem 不含 `.corrupt` 后缀，通常为主文件名去掉 `.json`）。
 */
export async function backupCorruptDocumentFile(sourceUri: string, stemForBackupName: string): Promise<string | null> {
  const base = FileSystem.documentDirectory;
  if (!base) {
    return null;
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const destUri = `${base}${stemForBackupName}.corrupt.${stamp}.bak`;
  try {
    await FileSystem.copyAsync({ from: sourceUri, to: destUri });
    return destUri;
  } catch (e) {
    console.warn("backupCorruptDocumentFile failed", e);
    return null;
  }
}
