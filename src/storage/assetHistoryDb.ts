import * as FileSystem from "expo-file-system";
import type { AssetClass, ParsedAsset, ScreenType } from "../domain/types";
import { decryptJson, encryptJson, getEncryptionKey } from "../security/appSecurity";

export type TrendFilter = "all" | AssetClass;

export type TrendPoint = {
  date: string;
  total: number;
};

/** 折线「全部」模式下按资产类的分项序列 */
export type TrendSeriesBreakdown = {
  assetClass: AssetClass;
  points: TrendPoint[];
};

const ASSET_CLASSES_FOR_BREAKDOWN: AssetClass[] = [
  "cash",
  "fund",
  "insurance",
  "stock",
  "wealth_management"
];

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
  /** 测试数据折线快照，可通过 clearSeedTestData / clearAllImportHistory 清除 */
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

/** 合并 OCR 去空白后，任一关键词以子串形式出现即视为命中该模块 */
function keywordsAnyMatchInCompactOcr(compactOcr: string, compactKeywords: string[]): boolean {
  if (!compactOcr || !compactKeywords.length) {
    return false;
  }
  return compactKeywords.some((k) => k.length > 0 && compactOcr.includes(k));
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

function buildMainTrendSeriesFromSnapshots(
  snapshots: SnapshotRecord[],
  filter: TrendFilter,
  customModules: { id: string; keywords: string[] }[]
): TrendPoint[] {
  const withAssets = snapshots.filter((s) => s.assets.length);
  const uniqueDates = [...new Set(withAssets.map((s) => s.importDate))].sort((a, b) => a.localeCompare(b));

  return uniqueDates.map((date) => {
    const pool = snapshots.filter((s) => s.importDate <= date && s.assets.length);
    const { total } = combinedSummaryFromSnapshotList(pool, customModules, filter);
    return { date, total };
  });
}

/** 主趋势「全部」时：与各时点日期对齐的各资产类分项（用于多折线） */
function buildMainTrendBreakdownSeries(
  snapshots: SnapshotRecord[],
  customModules: { id: string; keywords: string[] }[]
): TrendSeriesBreakdown[] {
  const withAssets = snapshots.filter((s) => s.assets.length);
  const uniqueDates = [...new Set(withAssets.map((s) => s.importDate))].sort((a, b) => a.localeCompare(b));
  const series: TrendSeriesBreakdown[] = [];
  for (const c of ASSET_CLASSES_FOR_BREAKDOWN) {
    const points = uniqueDates.map((date) => {
      const pool = snapshots.filter((s) => s.importDate <= date && s.assets.length);
      const { total } = combinedSummaryFromSnapshotList(pool, customModules, c);
      return { date, total };
    });
    if (points.some((p) => p.total > 0)) {
      series.push({ assetClass: c, points });
    }
  }
  return series;
}

/**
 * 主资金趋势：每个日期点为「截至该日（含）」按首页同款规则合并后的总资产（或指定资产类别合计）。
 * 数据与顶部「目前为止总资产」同源（持久化快照列表），由存储计算，并非先画线再反推合计。
 */
export async function queryTrendSeries(
  filter: TrendFilter,
  customModules: { id: string; keywords: string[] }[] = []
): Promise<TrendPoint[]> {
  const store = await readStore();
  return buildMainTrendSeriesFromSnapshots(store.snapshots, filter, customModules);
}

/**
 * 单次读盘同时得到主折线序列与首页「目前为止总资产」。
 * 二者均由同一快照列表按规则独立算出，并列展示；折线末点与 hero 合计在「全部」筛选下口径一致。
 */
export async function queryStoredMainTrendAndHeroSummary(
  mainTrendFilter: TrendFilter,
  customModules: { id: string; keywords: string[] }[]
): Promise<{
  mainTrend: TrendPoint[];
  heroSummary: DailySummary;
  mainBreakdown?: TrendSeriesBreakdown[];
}> {
  const store = await readStore();
  const mainTrend = buildMainTrendSeriesFromSnapshots(store.snapshots, mainTrendFilter, customModules);
  const { total, byClass } = combinedSummaryFromSnapshotList(store.snapshots, customModules, "all");
  const mainBreakdown =
    mainTrendFilter === "all" && mainTrend.length
      ? buildMainTrendBreakdownSeries(store.snapshots, customModules)
      : undefined;
  return {
    mainTrend,
    heroSummary: { date: "combined-latest", total, byClass },
    ...(mainBreakdown?.length ? { mainBreakdown } : {})
  };
}

/** 平台趋势 + 选「全部」时按资产类的分项（与主图多线口径一致：同日多快照按类相加） */
export async function queryPlatformTrendSeriesFull(
  platform: PlatformTrendFilter,
  filter: TrendFilter = "all"
): Promise<{ primary: TrendPoint[]; breakdown?: TrendSeriesBreakdown[] }> {
  const snapshots = await readAllSnapshots();
  if (filter !== "all") {
    const totalsByDate = new Map<string, number>();
    for (const snapshot of snapshots) {
      const platformAssets = snapshot.assets.filter((asset) => {
        if (!belongsToPlatform(asset.source, platform)) {
          return false;
        }
        if (asset.assetClass !== filter) {
          return false;
        }
        return true;
      });
      if (!platformAssets.length) {
        continue;
      }
      const snapshotTotal = platformAssets.reduce(
        (sum, asset) => sum + (Number.isFinite(asset.amount) ? asset.amount : 0),
        0
      );
      totalsByDate.set(snapshot.date, roundMoney((totalsByDate.get(snapshot.date) ?? 0) + snapshotTotal));
    }
    const primary = [...totalsByDate.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, total]) => ({ date, total: roundMoney(total) }));
    return { primary };
  }

  const byDateClass = new Map<string, Record<AssetClass, number>>();
  for (const snapshot of snapshots) {
    const platformAssets = snapshot.assets.filter((asset) => belongsToPlatform(asset.source, platform));
    if (!platformAssets.length) {
      continue;
    }
    const date = snapshot.date;
    let row = byDateClass.get(date);
    if (!row) {
      row = emptyByClassTotals();
      byDateClass.set(date, row);
    }
    for (const asset of platformAssets) {
      const add = Number.isFinite(asset.amount) ? asset.amount : 0;
      row[asset.assetClass] = roundMoney(row[asset.assetClass] + add);
    }
  }
  const sortedDates = [...byDateClass.keys()].sort((a, b) => a.localeCompare(b));
  const primary = sortedDates.map((date) => {
    const row = byDateClass.get(date)!;
    const total = roundMoney(ASSET_CLASSES_FOR_BREAKDOWN.reduce((s, c) => s + row[c], 0));
    return { date, total };
  });
  const breakdown: TrendSeriesBreakdown[] = [];
  for (const c of ASSET_CLASSES_FOR_BREAKDOWN) {
    const points = sortedDates.map((date) => ({
      date,
      total: roundMoney(byDateClass.get(date)![c])
    }));
    if (points.some((p) => p.total > 0)) {
      breakdown.push({ assetClass: c, points });
    }
  }
  return { primary, breakdown: breakdown.length ? breakdown : undefined };
}

export async function queryPlatformTrendSeries(
  platform: PlatformTrendFilter,
  filter: TrendFilter = "all"
): Promise<TrendPoint[]> {
  return (await queryPlatformTrendSeriesFull(platform, filter)).primary;
}

/** 自定义识别模块趋势：OCR 命中模块关键词时计入；若同图还被内置模板解析出资产，只累加自定义规则产出的 `source===custom` 部分，避免误判内置页时模块整条为空。 */
export async function queryCustomRecognitionTrendSeriesFull(
  keywords: string[],
  filter: TrendFilter = "all"
): Promise<{ primary: TrendPoint[]; breakdown?: TrendSeriesBreakdown[] }> {
  const compactKws = keywords.map((k) => compactOcrSnippet(k.trim())).filter(Boolean);
  if (!compactKws.length) {
    return { primary: [] };
  }

  const store = await readStore();

  if (filter !== "all") {
    const totalsByDate = new Map<string, number>();
    for (const snapshot of store.snapshots) {
      if (!snapshot.assets.length) {
        continue;
      }
      if (!snapshotOcrMatchesCustomModuleKeywords(snapshot, compactKws)) {
        continue;
      }
      if (snapshotHasBuiltInTemplateAssets(snapshot) && !snapshot.assets.some((a) => a.source === "custom")) {
        continue;
      }
      const byPart = sumAssetsForCustomModuleContribution(snapshot);
      const snapshotTotal = roundMoney(byPart[filter]);
      if (snapshotTotal > 0) {
        totalsByDate.set(
          snapshot.importDate,
          roundMoney((totalsByDate.get(snapshot.importDate) ?? 0) + snapshotTotal)
        );
      }
    }
    const primary = [...totalsByDate.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, total]) => ({ date, total: roundMoney(total) }));
    return { primary };
  }

  const byDateClass = new Map<string, Record<AssetClass, number>>();
  for (const snapshot of store.snapshots) {
    if (!snapshot.assets.length) {
      continue;
    }
    if (!snapshotOcrMatchesCustomModuleKeywords(snapshot, compactKws)) {
      continue;
    }
    if (snapshotHasBuiltInTemplateAssets(snapshot) && !snapshot.assets.some((a) => a.source === "custom")) {
      continue;
    }
    const byPart = sumAssetsForCustomModuleContribution(snapshot);
    const date = snapshot.importDate;
    let row = byDateClass.get(date);
    if (!row) {
      row = emptyByClassTotals();
      byDateClass.set(date, row);
    }
    for (const c of ASSET_CLASSES_FOR_BREAKDOWN) {
      row[c] = roundMoney(row[c] + byPart[c]);
    }
  }
  const sortedDates = [...byDateClass.keys()].sort((a, b) => a.localeCompare(b));
  const primary = sortedDates.map((date) => {
    const row = byDateClass.get(date)!;
    const total = roundMoney(ASSET_CLASSES_FOR_BREAKDOWN.reduce((s, c) => s + row[c], 0));
    return { date, total };
  });
  const breakdown: TrendSeriesBreakdown[] = [];
  for (const c of ASSET_CLASSES_FOR_BREAKDOWN) {
    const points = sortedDates.map((date) => ({
      date,
      total: roundMoney(byDateClass.get(date)![c])
    }));
    if (points.some((p) => p.total > 0)) {
      breakdown.push({ assetClass: c, points });
    }
  }
  return { primary, breakdown: breakdown.length ? breakdown : undefined };
}

export async function queryCustomRecognitionTrendSeries(
  keywords: string[],
  filter: TrendFilter = "all"
): Promise<TrendPoint[]> {
  return (await queryCustomRecognitionTrendSeriesFull(keywords, filter)).primary;
}

/** 仅汇总「指定自然日」内确认保存的快照（历史行为，首页已不再使用）。 */
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

function isSnapshotNewerThan(a: SnapshotRecord, b: SnapshotRecord): boolean {
  const d = b.importDate.localeCompare(a.importDate);
  if (d !== 0) {
    return d > 0;
  }
  return b.id > a.id;
}

function pickLatestSnapshot(snapshots: SnapshotRecord[]): SnapshotRecord | null {
  if (!snapshots.length) {
    return null;
  }
  return snapshots.reduce((best, s) => (isSnapshotNewerThan(best, s) ? s : best));
}

function sumAssetsByClass(assets: ParsedAsset[], filter?: (asset: ParsedAsset) => boolean): Record<AssetClass, number> {
  const byClass = emptyByClassTotals();
  for (const asset of assets) {
    if (filter && !filter(asset)) {
      continue;
    }
    const add = Number.isFinite(asset.amount) ? asset.amount : 0;
    byClass[asset.assetClass] = roundMoney(byClass[asset.assetClass] + add);
  }
  return byClass;
}

function mergeByClassTotals(target: Record<AssetClass, number>, part: Record<AssetClass, number>): void {
  (Object.keys(part) as AssetClass[]).forEach((k) => {
    target[k] = roundMoney(target[k] + part[k]);
  });
}

function findLatestPlatformSnapshotInList(snapshots: SnapshotRecord[], platform: PlatformTrendFilter): SnapshotRecord | null {
  const candidates = snapshots.filter(
    (snap) => snap.assets.length && snap.assets.some((asset) => belongsToPlatform(asset.source, platform))
  );
  return pickLatestSnapshot(candidates);
}

function findLatestCustomModuleSnapshotInList(snapshots: SnapshotRecord[], keywords: string[]): SnapshotRecord | null {
  const compactKws = keywords.map((k) => compactOcrSnippet(k.trim())).filter(Boolean);
  if (!compactKws.length) {
    return null;
  }
  const candidates = snapshots.filter((snap) => {
    if (!snap.assets.length) {
      return false;
    }
    if (!snapshotOcrMatchesCustomModuleKeywords(snap, compactKws)) {
      return false;
    }
    if (snapshotHasBuiltInTemplateAssets(snap)) {
      return snap.assets.some((a) => a.source === "custom");
    }
    return true;
  });
  return pickLatestSnapshot(candidates);
}

/** 与 queryCombinedLatestSummary 相同合并规则，但仅从给定快照列表中选取「最新」 */
function combinedSummaryFromSnapshotList(
  snapshots: SnapshotRecord[],
  customModules: { id: string; keywords: string[] }[],
  filter: TrendFilter
): { total: number; byClass: Record<AssetClass, number> } {
  const byClass = emptyByClassTotals();
  const platforms: PlatformTrendFilter[] = ["alipay", "cmb", "wechat"];

  for (const platform of platforms) {
    const snap = findLatestPlatformSnapshotInList(snapshots, platform);
    if (!snap) {
      continue;
    }
    const part = sumAssetsByClass(snap.assets, (a) => belongsToPlatform(a.source, platform));
    mergeByClassTotals(byClass, part);
  }

  for (const mod of customModules) {
    const snap = findLatestCustomModuleSnapshotInList(snapshots, mod.keywords);
    if (!snap) {
      continue;
    }
    mergeByClassTotals(byClass, sumAssetsForCustomModuleContribution(snap));
  }

  const total =
    filter === "all"
      ? roundMoney(Object.values(byClass).reduce((sum, value) => sum + value, 0))
      : roundMoney(byClass[filter]);
  return { total, byClass };
}

/**
 * 首页「目前为止总资产」：从持久化快照列表按规则合并（与主资金折线图数据源相同，非由折线反算）。
 * 支付宝 / 招行 / 微信各自取「含有该平台资产的最近一次导入」中该平台资产之和；
 * 每个自定义识别模块取 OCR 命中关键词的最近一次导入：纯自定义来源快照计全额，与内置模板混排时仅计 `source===custom`（与模块折线图口径一致）；再按资产类别合并。
 */
export async function queryCombinedLatestSummary(
  customModules: { id: string; keywords: string[] }[]
): Promise<DailySummary> {
  const store = await readStore();
  const { total, byClass } = combinedSummaryFromSnapshotList(store.snapshots, customModules, "all");
  return { date: "combined-latest", total, byClass };
}

export async function clearCurrentDateData(date = getTodayDate()): Promise<void> {
  const store = await readStore();
  store.snapshots = store.snapshots.filter((snapshot) => snapshot.importDate !== date);
  await writeStore(store);
}

/** 仅清空已确认导入的资产快照（折线图与首页统计来源）。不删除自定义识别模块、自定义 OCR 规则等其它 JSON。 */
export async function clearAllImportHistory(): Promise<void> {
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
 * 开发调试（Metro / dev client）时：若本机从未写过标记文件，则自动写入测试数据一次。
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

/** 快照中是否存在内置模板解析出的资产（非自定义 OCR 规则） */
function snapshotHasBuiltInTemplateAssets(snapshot: SnapshotRecord): boolean {
  return snapshot.assets.some((a) => a.source !== "custom");
}

function snapshotOcrMatchesCustomModuleKeywords(snapshot: SnapshotRecord, compactKws: string[]): boolean {
  const compact = buildSnapshotOcrCompact(snapshot.ocrTexts);
  return keywordsAnyMatchInCompactOcr(compact, compactKws);
}

/**
 * 自定义识别模块在合并汇总 / 趋势中的金额：无内置资产时整张快照归属该次导入；有内置资产时只取自定义规则行，避免与平台拆解重复。
 */
function sumAssetsForCustomModuleContribution(snapshot: SnapshotRecord): Record<AssetClass, number> {
  if (snapshotHasBuiltInTemplateAssets(snapshot)) {
    return sumAssetsByClass(snapshot.assets, (a) => a.source === "custom");
  }
  return sumAssetsByClass(snapshot.assets);
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
