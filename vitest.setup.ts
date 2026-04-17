import { vi } from "vitest";

process.env.EXPO_OS = "ios";

type GlobalExpo = { expo?: { NativeModule?: object } };
(globalThis as GlobalExpo).expo = {
  NativeModule: {}
};

vi.mock("expo-file-system", () => ({
  documentDirectory: "file:///tmp/netwise-vitest/",
  EncodingType: { UTF8: "utf8" },
  getInfoAsync: vi.fn().mockResolvedValue({ exists: false }),
  readAsStringAsync: vi.fn(),
  writeAsStringAsync: vi.fn(),
  moveAsync: vi.fn(),
  deleteAsync: vi.fn(),
  copyAsync: vi.fn()
}));

vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn().mockResolvedValue(null),
  setItemAsync: vi.fn(),
  deleteItemAsync: vi.fn()
}));

vi.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
  randomUUID: () => "00000000-0000-4000-8000-000000000001",
  digestStringAsync: vi.fn().mockResolvedValue("ab".repeat(32))
}));

vi.mock("expo-local-authentication", () => ({
  hasHardwareAsync: vi.fn().mockResolvedValue(false),
  isEnrolledAsync: vi.fn().mockResolvedValue(false),
  supportedAuthenticationTypesAsync: vi.fn().mockResolvedValue([]),
  authenticateAsync: vi.fn().mockResolvedValue({ success: false })
}));
