import * as FileSystem from "expo-file-system";
import { decryptJson, encryptJson, getEncryptionKey } from "../security/appSecurity";

export type BillPlatform = "alipay" | "wechat" | "cmb" | "meituan" | "other";

export const BILL_PLATFORM_LABEL: Record<BillPlatform, string> = {
  alipay: "支付宝",
  wechat: "微信",
  cmb: "招商银行",
  meituan: "美团",
  other: "其他"
};

export type BillTradeType =
  | "catering"       // 餐饮
  | "shopping"        // 购物
  | "transfer"        // 红包/转账
  | "service"         // 服务
  | "other"           // 其他
  | "utility"         // 生活缴费
  | "refund"          // 退款
  | "salary";         // 工资

export const BILL_TRADE_TYPE_LABEL: Record<BillTradeType, string> = {
  catering: "餐饮",
  shopping: "购物",
  transfer: "红包/转账",
  service: "服务",
  other: "其他",
  utility: "生活缴费",
  refund: "退款",
  salary: "工资"
};

export type BillType = "income" | "expense";

export type BillEntry = {
  id: string;
  date: string;
  type: BillType;
  amount: number;
  platform: BillPlatform;
  tradeType: BillTradeType;
  description: string;
  transactionId?: string;
  imageUri?: string;
};

export type BillSummary = {
  totalIncome: number;
  totalExpense: number;
  balance: number;
};

const BILL_STORE_FILE = `${FileSystem.documentDirectory}bill_store.enc.json`;

function generateTransactionId(): string {
  const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let result = "";
  for (let i = 0; i < 16; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function getMockBillEntries(): BillEntry[] {
  const today = new Date();
  const entries: BillEntry[] = [];
  const platforms: BillPlatform[] = ["alipay", "wechat", "cmb", "meituan", "other"];

  for (let i = 0; i < 30; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split("T")[0];

    const incomeCount = Math.floor(Math.random() * 3);
    for (let j = 0; j < incomeCount; j++) {
      const tradeTypes: BillTradeType[] = ["salary", "refund", "transfer"];
      entries.push({
        id: `income-${dateStr}-${j}`,
        date: dateStr,
        type: "income",
        amount: Math.round(Math.random() * 5000 + 100) / 100,
        platform: platforms[Math.floor(Math.random() * platforms.length)],
        tradeType: tradeTypes[Math.floor(Math.random() * tradeTypes.length)],
        description: BILL_TRADE_TYPE_LABEL[tradeTypes[Math.floor(Math.random() * tradeTypes.length)] as BillTradeType],
        transactionId: generateTransactionId()
      });
    }

    const expenseCount = Math.floor(Math.random() * 5);
    for (let j = 0; j < expenseCount; j++) {
      const tradeTypes: BillTradeType[] = ["catering", "shopping", "transfer", "service", "other", "utility"];
      const tradeType = tradeTypes[Math.floor(Math.random() * tradeTypes.length)];
      entries.push({
        id: `expense-${dateStr}-${j}`,
        date: dateStr,
        type: "expense",
        amount: Math.round(Math.random() * 500 + 10) / 100,
        platform: platforms[Math.floor(Math.random() * platforms.length)],
        tradeType,
        description: BILL_TRADE_TYPE_LABEL[tradeType],
        transactionId: generateTransactionId()
      });
    }
  }

  return entries.sort((a, b) => b.date.localeCompare(a.date));
}

async function readStore(): Promise<BillEntry[]> {
  try {
    const content = await FileSystem.readAsStringAsync(BILL_STORE_FILE);
    const key = await getEncryptionKey();
    return decryptJson<BillEntry[]>(content, key) ?? getMockBillEntries();
  } catch {
    return getMockBillEntries();
  }
}

async function writeStore(entries: BillEntry[]): Promise<void> {
  const key = await getEncryptionKey();
  const content = encryptJson(entries, key);
  await FileSystem.writeAsStringAsync(BILL_STORE_FILE, content);
}

export async function queryBillEntries(): Promise<BillEntry[]> {
  return readStore();
}

export async function queryBillSummary(): Promise<BillSummary> {
  const entries = await readStore();
  
  let totalIncome = 0;
  let totalExpense = 0;
  
  for (const entry of entries) {
    if (entry.type === "income") {
      totalIncome += entry.amount;
    } else {
      totalExpense += entry.amount;
    }
  }
  
  return {
    totalIncome: Math.round(totalIncome * 100) / 100,
    totalExpense: Math.round(totalExpense * 100) / 100,
    balance: Math.round((totalIncome - totalExpense) * 100) / 100
  };
}

export async function addBillEntry(entry: Omit<BillEntry, "id">): Promise<void> {
  const entries = await readStore();
  const newEntry: BillEntry = {
    ...entry,
    id: `bill-${Date.now()}`
  };
  entries.unshift(newEntry);
  await writeStore(entries);
}
