import * as SQLite from "expo-sqlite";
import type { AssetClass, ParsedAsset } from "../domain/types";

export type TrendFilter = "all" | AssetClass;

export type TrendPoint = {
  date: string;
  total: number;
};

type SaveResult = {
  saved: boolean;
  date: string;
};

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

function getTodayDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync("netwise.db");
  }
  return dbPromise;
}

export async function initAssetHistoryDb(): Promise<void> {
  const db = await getDb();
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS imports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      image_hash TEXT NOT NULL,
      import_date TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(image_hash, import_date)
    );

    CREATE TABLE IF NOT EXISTS asset_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      import_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      asset_class TEXT NOT NULL,
      amount REAL NOT NULL,
      FOREIGN KEY(import_id) REFERENCES imports(id)
    );
  `);
}

export async function saveImportSnapshot(imageHash: string, assets: ParsedAsset[]): Promise<SaveResult> {
  const date = getTodayDate();
  const db = await getDb();

  const insertResult = await db.runAsync(
    "INSERT OR IGNORE INTO imports (image_hash, import_date) VALUES (?, ?)",
    [imageHash, date]
  );
  if (!insertResult.changes) {
    return { saved: false, date };
  }

  const importId = insertResult.lastInsertRowId;
  await db.withTransactionAsync(async () => {
    for (const asset of assets) {
      await db.runAsync(
        "INSERT INTO asset_records (import_id, name, asset_class, amount) VALUES (?, ?, ?, ?)",
        [importId, asset.name, asset.assetClass, asset.amount]
      );
    }
  });

  return { saved: true, date };
}

export async function queryTrendSeries(filter: TrendFilter): Promise<TrendPoint[]> {
  const db = await getDb();
  if (filter === "all") {
    const rows = await db.getAllAsync<TrendPoint>(
      `SELECT i.import_date AS date, ROUND(SUM(a.amount), 2) AS total
       FROM imports i
       JOIN asset_records a ON a.import_id = i.id
       GROUP BY i.import_date
       ORDER BY i.import_date ASC`
    );
    return rows;
  }

  const rows = await db.getAllAsync<TrendPoint>(
    `SELECT i.import_date AS date, ROUND(SUM(a.amount), 2) AS total
     FROM imports i
     JOIN asset_records a ON a.import_id = i.id
     WHERE a.asset_class = ?
     GROUP BY i.import_date
     ORDER BY i.import_date ASC`,
    [filter]
  );
  return rows;
}
