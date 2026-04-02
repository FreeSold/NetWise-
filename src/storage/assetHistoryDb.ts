import * as FileSystem from "expo-file-system";
import type { AssetClass, ParsedAsset, ScreenType } from "../domain/types";
import { decryptJson, encryptJson, getEncryptionKey } from "../security/appSecurity";

export type TrendFilter = "all" | AssetClass;

export type TrendPoint = {
  date: string;
  total: number;
};

export type PlatformTrendFilter = "cmb" | "alipay" | "wechat";

type SaveResult = {
  saved: boolean;
  date: string;
};

export type DailySummary = {
  date: string;
  total: number;
  byClass: Record<AssetClass, number>;
};

type SnapshotRecord = {
  id: number;
  importDate: string;
  imageHashes: string[];
  assets: ParsedAsset[];
};

type StorePayload = {
  snapshots: SnapshotRecord[];
};

const STORE_FILE_NAME = "netwise-asset-history.json";

function getTodayDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getStoreFileUri(): string {
  if (!FileSystem.documentDirectory) {
    throw new Error("文件存储目录不可用");
  }
  return `${FileSystem.documentDirectory}${STORE_FILE_NAME}`;
}

export async function initAssetHistoryDb(): Promise<void> {
  const fileUri = getStoreFileUri();
  const fileInfo = await FileSystem.getInfoAsync(fileUri);
  if (fileInfo.exists) {
    return;
  }
  await writeStore({ snapshots: [] });
}

export async function saveImportSnapshot(imageHashes: string[], assets: ParsedAsset[]): Promise<SaveResult> {
  const date = getTodayDate();
  const uniqueHashes = [...new Set(imageHashes)].filter(Boolean);
  if (!uniqueHashes.length) {
    return { saved: false, date };
  }

  const store = await readStore();
  const existingSet = new Set(
    store.snapshots
      .filter((snapshot) => snapshot.importDate === date)
      .flatMap((snapshot) => snapshot.imageHashes)
  );
  const newHashes = uniqueHashes.filter((hash) => !existingSet.has(hash));
  if (!newHashes.length) {
    return { saved: false, date };
  }

  const nextId = store.snapshots.length ? Math.max(...store.snapshots.map((item) => item.id)) + 1 : 1;
  store.snapshots.push({
    id: nextId,
    importDate: date,
    imageHashes: newHashes,
    assets
  });
  await writeStore(store);

  return { saved: true, date };
}

export async function queryTrendSeries(filter: TrendFilter): Promise<TrendPoint[]> {
  const snapshots = await readAllSnapshots();
  const totalsByDate = new Map<string, number>();

  for (const snapshot of snapshots) {
    const snapshotTotal = snapshot.assets.reduce((sum, asset) => {
      if (filter !== "all" && asset.assetClass !== filter) {
        return sum;
      }
      return sum + asset.amount;
    }, 0);
    totalsByDate.set(snapshot.date, roundMoney((totalsByDate.get(snapshot.date) ?? 0) + snapshotTotal));
  }

  return [...totalsByDate.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, total]) => ({ date, total: roundMoney(total) }));
}

export async function queryPlatformTrendSeries(platform: PlatformTrendFilter): Promise<TrendPoint[]> {
  const snapshots = await readAllSnapshots();
  const totalsByDate = new Map<string, number>();

  for (const snapshot of snapshots) {
    const snapshotTotal = snapshot.assets.reduce((sum, asset) => {
      return belongsToPlatform(asset.source, platform) ? sum + asset.amount : sum;
    }, 0);

    if (snapshotTotal > 0) {
      totalsByDate.set(snapshot.date, roundMoney((totalsByDate.get(snapshot.date) ?? 0) + snapshotTotal));
    }
  }

  return [...totalsByDate.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, total]) => ({ date, total: roundMoney(total) }));
}

export async function queryDailySummary(date = getTodayDate()): Promise<DailySummary> {
  const store = await readStore();
  const byClass = emptyByClassTotals();

  for (const snapshot of store.snapshots) {
    if (snapshot.importDate !== date) {
      continue;
    }
    for (const asset of snapshot.assets) {
      byClass[asset.assetClass] = roundMoney(byClass[asset.assetClass] + asset.amount);
    }
  }
  const total = roundMoney(Object.values(byClass).reduce((sum, value) => sum + value, 0));
  return { date, total, byClass };
}

export async function clearCurrentDateData(date = getTodayDate()): Promise<void> {
  const store = await readStore();
  store.snapshots = store.snapshots.filter((snapshot) => snapshot.importDate !== date);
  await writeStore(store);
}

export async function clearAllData(): Promise<void> {
  await writeStore({ snapshots: [] });
}

async function readAllSnapshots(): Promise<Array<{ date: string; assets: ParsedAsset[] }>> {
  const store = await readStore();
  const snapshots: Array<{ date: string; assets: ParsedAsset[] }> = [];
  for (const snapshot of store.snapshots) {
    if (snapshot.assets.length) {
      snapshots.push({ date: snapshot.importDate, assets: snapshot.assets });
    }
  }
  return snapshots;
}

async function readStore(): Promise<StorePayload> {
  const fileUri = getStoreFileUri();
  const fileInfo = await FileSystem.getInfoAsync(fileUri);
  if (!fileInfo.exists) {
    return { snapshots: [] };
  }

  const raw = await FileSystem.readAsStringAsync(fileUri);
  const encryptionKey = await getEncryptionKey();
  try {
    const payload = decryptJson<StorePayload>(raw, encryptionKey);
    return {
      snapshots: Array.isArray(payload.snapshots) ? payload.snapshots : []
    };
  } catch (error) {
    console.warn("Failed to read encrypted asset store", error);
    return { snapshots: [] };
  }
}

async function writeStore(store: StorePayload): Promise<void> {
  const fileUri = getStoreFileUri();
  const encryptionKey = await getEncryptionKey();
  await FileSystem.writeAsStringAsync(fileUri, encryptJson(store, encryptionKey));
}

function emptyByClassTotals(): Record<AssetClass, number> {
  return {
    cash: 0,
    fund: 0,
    insurance: 0,
    stock: 0,
    wealth_management: 0
  };
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function belongsToPlatform(source: ScreenType, platform: PlatformTrendFilter): boolean {
  if (platform === "cmb") {
    return source === "cmb_property" || source === "cmb_wealth";
  }
  if (platform === "alipay") {
    return source === "alipay_wealth" || source === "alipay_fund";
  }
  return source === "wechat_wallet";
}
