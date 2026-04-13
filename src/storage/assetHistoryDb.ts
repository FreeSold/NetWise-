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
  /** 与 imageHashes 同序的 OCR 全文，用于自定义识别模块匹配；旧数据无此字段 */
  ocrTexts?: string[];
  /** 内置模块测试折线数据，可通过 clearSeedTestData / clearAllData 清除 */
  seedTest?: boolean;
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

function compactOcrSnippet(text: string): string {
  return text.replace(/\s+/g, "");
}

function buildSnapshotOcrCompact(ocrTexts: string[] | undefined): string {
  if (!ocrTexts?.length) {
    return "";
  }
  return ocrTexts.map((t) => compactOcrSnippet(t)).join("");
}

function keywordsAllMatchInCompactOcr(compactOcr: string, compactKeywords: string[]): boolean {
  if (!compactOcr || !compactKeywords.length) {
    return false;
  }
  return compactKeywords.every((k) => k.length > 0 && compactOcr.includes(k));
}

export async function saveImportSnapshot(
  imageHashes: string[],
  assets: ParsedAsset[],
  ocrTexts?: string[]
): Promise<SaveResult> {
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

  let ocrForNew: string[] | undefined;
  if (ocrTexts && ocrTexts.length && newHashes.length) {
    const ocrByHash = new Map(uniqueHashes.map((h, i) => [h, ocrTexts[i] ?? ""]));
    ocrForNew = newHashes.map((h) => ocrByHash.get(h) ?? "");
  }

  const nextId = store.snapshots.length ? Math.max(...store.snapshots.map((item) => item.id)) + 1 : 1;
  store.snapshots.push({
    id: nextId,
    importDate: date,
    imageHashes: newHashes,
    assets,
    ...(ocrForNew ? { ocrTexts: ocrForNew } : {})
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
      return sum + (Number.isFinite(asset.amount) ? asset.amount : 0);
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
    const platformAssets = snapshot.assets.filter((asset) => belongsToPlatform(asset.source, platform));
    if (!platformAssets.length) {
      continue;
    }
    const snapshotTotal = platformAssets.reduce(
      (sum, asset) => sum + (Number.isFinite(asset.amount) ? asset.amount : 0),
      0
    );
    totalsByDate.set(snapshot.date, roundMoney((totalsByDate.get(snapshot.date) ?? 0) + snapshotTotal));
  }

  return [...totalsByDate.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, total]) => ({ date, total: roundMoney(total) }));
}

/** 自定义识别模块：当日快照合并 OCR 同时包含全部关键词时，将该快照资产总额计入趋势 */
export async function queryCustomRecognitionTrendSeries(keywords: string[]): Promise<TrendPoint[]> {
  const compactKws = keywords.map((k) => compactOcrSnippet(k.trim())).filter(Boolean);
  if (!compactKws.length) {
    return [];
  }

  const store = await readStore();
  const totalsByDate = new Map<string, number>();

  for (const snapshot of store.snapshots) {
    if (!snapshot.assets.length) {
      continue;
    }
    const compact = buildSnapshotOcrCompact(snapshot.ocrTexts);
    if (!keywordsAllMatchInCompactOcr(compact, compactKws)) {
      continue;
    }
    const snapshotTotal = snapshot.assets.reduce(
      (sum, asset) => sum + (Number.isFinite(asset.amount) ? asset.amount : 0),
      0
    );
    if (snapshotTotal > 0) {
      totalsByDate.set(
        snapshot.importDate,
        roundMoney((totalsByDate.get(snapshot.importDate) ?? 0) + snapshotTotal)
      );
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
      const add = Number.isFinite(asset.amount) ? asset.amount : 0;
      byClass[asset.assetClass] = roundMoney(byClass[asset.assetClass] + add);
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

function formatLocalYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function buildSeedTestAsset(name: string, source: ParsedAsset["source"], amount: number): ParsedAsset {
  return {
    name,
    amount,
    currency: "CNY",
    assetClass: "cash",
    source,
    confidence: 1,
    recognizedLabel: name,
    ruleSummary: `${name}  ${amount.toFixed(2)}  测试`
  };
}

const SEED_TEST_DAYS = 20;
const SEED_TEST_STEP = 10000;

/** 为支付宝 / 招行 / 微信三个内置趋势各写入 20 个时点：金额从 0 元起每档 +10000。会先移除已存在的测试快照再写入。 */
export async function seedDefaultModuleTestData(): Promise<{ snapshotsWritten: number }> {
  const store = await readStore();
  store.snapshots = store.snapshots.filter((s) => !s.seedTest);
  let nextId = store.snapshots.length ? Math.max(...store.snapshots.map((item) => item.id)) + 1 : 1;

  const start = new Date();
  start.setHours(12, 0, 0, 0);
  start.setDate(start.getDate() - (SEED_TEST_DAYS - 1));

  for (let j = 0; j < SEED_TEST_DAYS; j += 1) {
    const d = new Date(start);
    d.setDate(d.getDate() + j);
    const importDate = formatLocalYmd(d);
    const amount = j * SEED_TEST_STEP;
    const id = nextId;
    nextId += 1;
    store.snapshots.push({
      id,
      importDate,
      imageHashes: [`seed-netwise-default-mod-${id}`],
      assets: [
        buildSeedTestAsset("测试·支付宝", "alipay_wealth", amount),
        buildSeedTestAsset("测试·招商银行", "cmb_property", amount),
        buildSeedTestAsset("测试·微信", "wechat_wallet", amount)
      ],
      seedTest: true
    });
  }

  await writeStore(store);
  return { snapshotsWritten: SEED_TEST_DAYS };
}

/** 仅删除带 seedTest 标记的快照，不影响真实导入记录。 */
export async function clearSeedTestData(): Promise<number> {
  const store = await readStore();
  const before = store.snapshots.length;
  store.snapshots = store.snapshots.filter((s) => !s.seedTest);
  await writeStore(store);
  return before - store.snapshots.length;
}

const DEV_CLIENT_SEED_MARKER = "netwise-dev-client-seed-once.flag";

function isReactNativeDevBundle(): boolean {
  return typeof __DEV__ !== "undefined" && __DEV__;
}

/**
 * 开发调试（Metro / dev client）时：若本机从未写过标记文件，则自动写入内置模块测试数据一次。
 * Release APK 中 __DEV__ 为 false，不会执行。
 * 与真机 APK 的数据互不共享（模拟器与手机、或不同包名实例各自一份存储）。
 */
export async function ensureDevClientSeedTestDataOnce(): Promise<boolean> {
  if (!isReactNativeDevBundle() || !FileSystem.documentDirectory) {
    return false;
  }
  const markerUri = `${FileSystem.documentDirectory}${DEV_CLIENT_SEED_MARKER}`;
  const info = await FileSystem.getInfoAsync(markerUri);
  if (info.exists) {
    return false;
  }
  await seedDefaultModuleTestData();
  await FileSystem.writeAsStringAsync(markerUri, new Date().toISOString(), {
    encoding: FileSystem.EncodingType.UTF8
  });
  return true;
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
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.round(value * 100) / 100;
}

function belongsToPlatform(source: ScreenType, platform: PlatformTrendFilter): boolean {
  if (source === "custom") {
    return false;
  }
  if (platform === "cmb") {
    return source === "cmb_property" || source === "cmb_wealth";
  }
  if (platform === "alipay") {
    return source === "alipay_wealth" || source === "alipay_fund";
  }
  return source === "wechat_wallet";
}
