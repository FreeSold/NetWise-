import * as Crypto from "expo-crypto";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import * as CryptoJS from "crypto-js";

const PASSCODE_HASH_KEY = "netwise.passcode.hash";
const ENCRYPTION_KEY_KEY = "netwise.encryption.key";
const BIOMETRIC_ENABLED_KEY = "netwise.biometric.enabled";

export async function initializeAppSecurity(): Promise<void> {
  await getEncryptionKey();
}

export async function hasAppPasscode(): Promise<boolean> {
  return Boolean(await SecureStore.getItemAsync(PASSCODE_HASH_KEY));
}

export async function saveAppPasscode(passcode: string): Promise<void> {
  const hash = await hashValue(passcode);
  await SecureStore.setItemAsync(PASSCODE_HASH_KEY, hash);
  if (await isBiometricAvailable()) {
    await SecureStore.setItemAsync(BIOMETRIC_ENABLED_KEY, "true");
  }
}

export async function verifyAppPasscode(passcode: string): Promise<boolean> {
  const savedHash = await SecureStore.getItemAsync(PASSCODE_HASH_KEY);
  if (!savedHash) {
    return false;
  }
  return (await hashValue(passcode)) === savedHash;
}

export async function getEncryptionKey(): Promise<string> {
  const existing = await SecureStore.getItemAsync(ENCRYPTION_KEY_KEY);
  if (existing) {
    return existing;
  }

  const seed = `${Crypto.randomUUID()}-${Date.now()}`;
  const key = await hashValue(seed);
  await SecureStore.setItemAsync(ENCRYPTION_KEY_KEY, key);
  return key;
}

export function encryptJson(value: unknown, key: string): string {
  const { aesKey, iv } = deriveAesParams(key);
  const encrypted = CryptoJS.AES.encrypt(JSON.stringify(value), aesKey, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7
  });
  return encrypted.toString();
}

export function decryptJson<T>(cipherText: string, key: string): T {
  const { aesKey, iv } = deriveAesParams(key);
  const bytes = CryptoJS.AES.decrypt(cipherText, aesKey, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7
  });
  const plainText = bytes.toString(CryptoJS.enc.Utf8);
  if (!plainText) {
    throw new Error("解密失败");
  }
  return JSON.parse(plainText) as T;
}

export async function isBiometricAvailable(): Promise<boolean> {
  const compatible = await LocalAuthentication.hasHardwareAsync();
  if (!compatible) {
    return false;
  }
  return LocalAuthentication.isEnrolledAsync();
}

export async function isBiometricUnlockEnabled(): Promise<boolean> {
  return (await SecureStore.getItemAsync(BIOMETRIC_ENABLED_KEY)) === "true";
}

export async function setBiometricUnlockEnabled(enabled: boolean): Promise<void> {
  await SecureStore.setItemAsync(BIOMETRIC_ENABLED_KEY, enabled ? "true" : "false");
}

export async function authenticateWithBiometrics(): Promise<boolean> {
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: "使用生物识别解锁 NetWise",
    cancelLabel: "取消",
    disableDeviceFallback: true
  });
  return result.success;
}

async function hashValue(value: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value);
}

function deriveAesParams(key: string): { aesKey: CryptoJS.lib.WordArray; iv: CryptoJS.lib.WordArray } {
  const normalized = (key || "").padEnd(64, "0").slice(0, 64);
  const ivSeed = normalized.split("").reverse().join("").padEnd(32, "0").slice(0, 32);
  return {
    aesKey: CryptoJS.enc.Hex.parse(normalized),
    iv: CryptoJS.enc.Hex.parse(ivSeed)
  };
}
