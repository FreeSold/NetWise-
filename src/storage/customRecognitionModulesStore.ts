import * as FileSystem from "expo-file-system";
import type { CustomRecognitionModule } from "../domain/types";
import { backupCorruptDocumentFile, getDocumentFileUri, writeUtf8Atomically } from "./atomicDocumentFileWrite";

const FILE_NAME = "netwise-custom-recognition-modules.json";
const MODULES_CORRUPT_BACKUP_STEM = "netwise-custom-recognition-modules";

let corruptModulesFileBackupAttempted = false;

type FilePayload = {
  modules: CustomRecognitionModule[];
  hiddenIds: string[];
};

function getUri(): string {
  return getDocumentFileUri(FILE_NAME);
}

function isValidModule(x: unknown): x is CustomRecognitionModule {
  if (!x || typeof x !== "object") {
    return false;
  }
  const m = x as Record<string, unknown>;
  if (typeof m.id !== "string" || typeof m.displayName !== "string" || !Array.isArray(m.keywords)) {
    return false;
  }
  return m.keywords.every((k) => typeof k === "string");
}

export async function loadCustomRecognitionModules(): Promise<FilePayload> {
  const uri = getUri();
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) {
    corruptModulesFileBackupAttempted = false;
    return { modules: [], hiddenIds: [] };
  }
  let raw: string;
  try {
    raw = await FileSystem.readAsStringAsync(uri);
  } catch (error) {
    console.error("Failed to read custom recognition modules file", error);
    if (!corruptModulesFileBackupAttempted) {
      const bak = await backupCorruptDocumentFile(uri, MODULES_CORRUPT_BACKUP_STEM);
      corruptModulesFileBackupAttempted = true;
      if (bak) {
        console.warn("Backed up unreadable modules file to", bak);
      }
    }
    return { modules: [], hiddenIds: [] };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (error) {
    console.error("Failed to parse custom recognition modules JSON", error);
    if (!corruptModulesFileBackupAttempted) {
      const bak = await backupCorruptDocumentFile(uri, MODULES_CORRUPT_BACKUP_STEM);
      corruptModulesFileBackupAttempted = true;
      if (bak) {
        console.warn("Backed up corrupt modules file to", bak);
      }
    }
    return { modules: [], hiddenIds: [] };
  }
  if (!parsed || typeof parsed !== "object") {
    console.error("Custom recognition modules file root is not a JSON object");
    if (!corruptModulesFileBackupAttempted) {
      const bak = await backupCorruptDocumentFile(uri, MODULES_CORRUPT_BACKUP_STEM);
      corruptModulesFileBackupAttempted = true;
      if (bak) {
        console.warn("Backed up invalid modules file to", bak);
      }
    }
    return { modules: [], hiddenIds: [] };
  }
  corruptModulesFileBackupAttempted = false;
  const p = parsed as Record<string, unknown>;
  const modules = Array.isArray(p.modules) ? p.modules.filter(isValidModule) : [];
  const hiddenIds = Array.isArray(p.hiddenIds) ? p.hiddenIds.filter((id): id is string => typeof id === "string") : [];
  return { modules, hiddenIds };
}

export async function saveCustomRecognitionModules(payload: FilePayload): Promise<void> {
  const body: FilePayload = {
    modules: payload.modules.filter(isValidModule),
    hiddenIds: [...new Set(payload.hiddenIds.filter((id) => typeof id === "string"))]
  };
  await writeUtf8Atomically(FILE_NAME, JSON.stringify(body, null, 0));
}
