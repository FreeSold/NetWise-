import * as FileSystem from "expo-file-system";
import type { CustomRecognitionModule } from "../domain/types";

const FILE_NAME = "netwise-custom-recognition-modules.json";

type FilePayload = {
  modules: CustomRecognitionModule[];
  hiddenIds: string[];
};

function getUri(): string {
  if (!FileSystem.documentDirectory) {
    throw new Error("文件存储目录不可用");
  }
  return `${FileSystem.documentDirectory}${FILE_NAME}`;
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
    return { modules: [], hiddenIds: [] };
  }
  try {
    const raw = await FileSystem.readAsStringAsync(uri);
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return { modules: [], hiddenIds: [] };
    }
    const p = parsed as Record<string, unknown>;
    const modules = Array.isArray(p.modules) ? p.modules.filter(isValidModule) : [];
    const hiddenIds = Array.isArray(p.hiddenIds) ? p.hiddenIds.filter((id): id is string => typeof id === "string") : [];
    return { modules, hiddenIds };
  } catch {
    return { modules: [], hiddenIds: [] };
  }
}

export async function saveCustomRecognitionModules(payload: FilePayload): Promise<void> {
  const uri = getUri();
  const body: FilePayload = {
    modules: payload.modules.filter(isValidModule),
    hiddenIds: [...new Set(payload.hiddenIds.filter((id) => typeof id === "string"))]
  };
  await FileSystem.writeAsStringAsync(uri, JSON.stringify(body, null, 0), {
    encoding: FileSystem.EncodingType.UTF8
  });
}
