import { StatusBar as ExpoStatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import * as Crypto from "expo-crypto";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { Picker } from "@react-native-picker/picker";
import Slider from "@react-native-community/slider";
import { Image, Modal, Platform, Pressable, SafeAreaView, ScrollView, StatusBar as NativeStatusBar, StyleSheet, Text, TextInput, View } from "react-native";
import type { AssetClass, ParsedAsset, ParseResult } from "./src/domain/types";
import { TrendLineChart } from "./src/components/TrendLineChart";
import { recognizeTextFromImage } from "./src/ocr/ocrSpace";
import { parseOcrText } from "./src/parsers/templates";
import {
  authenticateWithBiometrics,
  hasAppPasscode,
  initializeAppSecurity,
  isBiometricAvailable,
  isBiometricUnlockEnabled,
  saveAppPasscode,
  setBiometricUnlockEnabled,
  verifyAppPasscode
} from "./src/security/appSecurity";
import {
  clearAllData,
  clearCurrentDateData,
  type DailySummary,
  initAssetHistoryDb,
  queryPlatformTrendSeries,
  queryDailySummary,
  queryTrendSeries,
  type PlatformTrendFilter,
  saveImportSnapshot,
  type TrendFilter,
  type TrendPoint
} from "./src/storage/assetHistoryDb";

const ASSET_CLASS_ORDER: AssetClass[] = ["cash", "fund", "insurance", "stock", "wealth_management"];
const ASSET_CLASS_LABEL: Record<AssetClass, string> = {
  cash: "现金",
  fund: "基金",
  insurance: "保险",
  stock: "股票",
  wealth_management: "理财",
};
const EMPTY_PARSE_RESULT: ParseResult = { screenType: "unknown", assets: [], warnings: [], reportedTotal: undefined };
const TREND_FILTER_ORDER: TrendFilter[] = ["all", ...ASSET_CLASS_ORDER];
const TREND_FILTER_LABEL: Record<TrendFilter, string> = {
  all: "全部",
  cash: "现金",
  fund: "基金",
  insurance: "保险",
  stock: "股票",
  wealth_management: "理财"
};
const PLATFORM_TREND_ORDER: PlatformTrendFilter[] = ["alipay", "cmb", "wechat"];
const PLATFORM_MODULE_LABEL: Record<PlatformTrendFilter, string> = {
  alipay: "支付宝",
  cmb: "招商银行",
  wechat: "微信"
};
const PLATFORM_TREND_LABEL: Record<PlatformTrendFilter, string> = {
  alipay: "支付宝趋势",
  cmb: "招商银行趋势",
  wechat: "微信趋势"
};
const SCREEN_TYPE_LABEL: Record<ParseResult["screenType"], string> = {
  cmb_property: "招商银行财产页",
  cmb_wealth: "招商银行理财页",
  alipay_wealth: "支付宝理财页",
  alipay_fund: "支付宝基金页",
  wechat_wallet: "微信钱包页",
  unknown: "未识别页面"
};

type EditableAssetItem = ParsedAsset & {
  imageUri: string;
  localId: string;
  amountInput: string;
  amountError: string | null;
};

type ImportedImageMeta = {
  uri: string;
  hash: string;
  parseResult: ParseResult;
  rawOcrText: string;
};

function inferMimeFromUri(uri: string): "image/png" | "image/jpeg" | "image/webp" {
  const lower = uri.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (lower.endsWith(".webp")) {
    return "image/webp";
  }
  return "image/png";
}

export default function App() {
  const androidTopInset = Platform.OS === "android" ? (NativeStatusBar.currentHeight ?? 0) : 0;
  const [selectedImageUris, setSelectedImageUris] = useState<string[]>([]);
  const [importedImageMetas, setImportedImageMetas] = useState<ImportedImageMeta[]>([]);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [sourceModalVisible, setSourceModalVisible] = useState(false);
  const [previewModalVisible, setPreviewModalVisible] = useState(false);
  const [manageVisible, setManageVisible] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [clearMode, setClearMode] = useState<"today" | "all" | null>(null);
  const [clearAllStep2, setClearAllStep2] = useState(false);
  const [dbReady, setDbReady] = useState(false);
  const [dbInitError, setDbInitError] = useState<string | null>(null);
  const [securityReady, setSecurityReady] = useState(false);
  const [securityBusy, setSecurityBusy] = useState(false);
  const [appUnlocked, setAppUnlocked] = useState(false);
  const [hasPasscodeConfigured, setHasPasscodeConfigured] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [passcodeInput, setPasscodeInput] = useState("");
  const [passcodeConfirmInput, setPasscodeConfirmInput] = useState("");
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [dailySummary, setDailySummary] = useState<DailySummary>({
    date: "",
    total: 0,
    byClass: { cash: 0, fund: 0, insurance: 0, stock: 0, wealth_management: 0 }
  });
  const [trendFilter, setTrendFilter] = useState<TrendFilter>("all");
  const [trendMenuVisible, setTrendMenuVisible] = useState(false);
  const [trendPoints, setTrendPoints] = useState<TrendPoint[]>([]);
  const [platformTrendPoints, setPlatformTrendPoints] = useState<Record<PlatformTrendFilter, TrendPoint[]>>({
    alipay: [],
    cmb: [],
    wechat: []
  });
  const [visiblePlatformModules, setVisiblePlatformModules] = useState<PlatformTrendFilter[]>(PLATFORM_TREND_ORDER);
  const [cardOpacityPercent, setCardOpacityPercent] = useState(86);
  const [parsed, setParsed] = useState<ParseResult>(EMPTY_PARSE_RESULT);
  const [editableAssets, setEditableAssets] = useState<EditableAssetItem[]>([]);
  const [expandedOcrUris, setExpandedOcrUris] = useState<string[]>([]);

  const cashAmount = dailySummary.byClass.cash;
  const fundAmount = dailySummary.byClass.fund;
  const insuranceAmount = dailySummary.byClass.insurance;
  const cardBackgroundColor = `rgba(255,255,255,${Math.max(0.3, Math.min(1, cardOpacityPercent / 100))})`;
  const hiddenPlatformModules = PLATFORM_TREND_ORDER.filter((platform) => !visiblePlatformModules.includes(platform));
  const currentImageHashes = importedImageMetas.map((item) => item.hash);

  useEffect(() => {
    async function setupSecurity() {
      await initializeAppSecurity();
      const [passcodeExists, biometricReady, biometricTurnedOn] = await Promise.all([
        hasAppPasscode(),
        isBiometricAvailable(),
        isBiometricUnlockEnabled()
      ]);
      setHasPasscodeConfigured(passcodeExists);
      setBiometricAvailable(biometricReady);
      setBiometricEnabled(biometricReady && biometricTurnedOn);
      setSecurityReady(true);
    }
    void setupSecurity();
  }, []);

  useEffect(() => {
    async function setupDb() {
      try {
        await initAssetHistoryDb();
        const summary = await queryDailySummary();
        setDailySummary(summary);
        setDbReady(true);
        setDbInitError(null);
      } catch (error) {
        const message = error instanceof Error ? error.message : "未知数据库错误";
        console.error("DB_INIT_FAILED", error);
        setDbInitError(message);
      }
    }
    void setupDb();
  }, []);

  useEffect(() => {
    async function loadTrend() {
      if (!dbReady) {
        return;
      }
      await refreshTrendData(trendFilter);
    }
    void loadTrend();
  }, [dbReady, trendFilter]);

  async function computeImageHash(uri: string): Promise<string> {
    const base64Payload = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64
    });
    return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, base64Payload);
  }

  function inferFileExtension(uri: string, fallback = "jpg"): string {
    const cleanUri = uri.split("?")[0] ?? uri;
    const match = cleanUri.match(/\.([a-zA-Z0-9]+)$/);
    return match?.[1]?.toLowerCase() || fallback;
  }

  async function ensureLocalImportUri(sourceUri: string, preferredName?: string | null): Promise<string> {
    const ext = inferFileExtension(preferredName ?? sourceUri);
    const targetUri = `${FileSystem.cacheDirectory}netwise-import-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    if (sourceUri.startsWith("file://")) {
      await FileSystem.copyAsync({ from: sourceUri, to: targetUri });
      return targetUri;
    }
    const base64Payload = await FileSystem.readAsStringAsync(sourceUri, {
      encoding: FileSystem.EncodingType.Base64
    });
    await FileSystem.writeAsStringAsync(targetUri, base64Payload, {
      encoding: FileSystem.EncodingType.Base64
    });
    return targetUri;
  }

  function resetWorkingImport() {
    setSelectedImageUris([]);
    setImportedImageMetas([]);
    setEditableAssets([]);
    setParsed(EMPTY_PARSE_RESULT);
    setExpandedOcrUris([]);
    setPreviewIndex(0);
    setPreviewModalVisible(false);
  }

  async function refreshTrendData(filter: TrendFilter) {
    const [mainPoints, alipayPoints, cmbPoints, wechatPoints] = await Promise.all([
      queryTrendSeries(filter),
      queryPlatformTrendSeries("alipay"),
      queryPlatformTrendSeries("cmb"),
      queryPlatformTrendSeries("wechat")
    ]);
    setTrendPoints(mainPoints);
    setPlatformTrendPoints({
      alipay: alipayPoints,
      cmb: cmbPoints,
      wechat: wechatPoints
    });
  }

  function updateAssetName(localId: string, name: string) {
    setEditableAssets((prev) => prev.map((a) => (a.localId === localId ? { ...a, name } : a)));
  }

  function getAmountValidationMessage(amountInput: string): string | null {
    const normalized = amountInput.replace(/,/g, "").trim();
    if (!normalized) {
      return "请输入金额";
    }
    if (!/^-?\d*(\.\d*)?$/.test(normalized) || normalized === "." || normalized === "-" || normalized === "-.") {
      return "金额格式不正确";
    }
    const amount = Number(normalized);
    if (!Number.isFinite(amount)) {
      return "金额格式不正确";
    }
    return null;
  }

  function updateAssetAmount(localId: string, amountRaw: string) {
    setEditableAssets((prev) =>
      prev.map((a) => {
        if (a.localId !== localId) {
          return a;
        }
        const normalized = amountRaw.replace(/,/g, "").trim();
        const amount = Number(normalized);
        return {
          ...a,
          amountInput: amountRaw,
          amount: normalized && Number.isFinite(amount) ? amount : a.amount,
          amountError: null
        };
      })
    );
  }

  function validateAssetAmount(localId: string): boolean {
    let isValid = true;
    setEditableAssets((prev) =>
      prev.map((a) => {
        if (a.localId !== localId) {
          return a;
        }
        const amountError = getAmountValidationMessage(a.amountInput);
        if (!amountError) {
          const normalized = a.amountInput.replace(/,/g, "").trim();
          return {
            ...a,
            amount: Number(normalized),
            amountError: null
          };
        }
        isValid = false;
        return {
          ...a,
          amountError
        };
      })
    );
    return isValid;
  }

  function updateAssetClass(localId: string, assetClass: AssetClass) {
    setEditableAssets((prev) => prev.map((a) => (a.localId === localId ? { ...a, assetClass } : a)));
  }

  function movePlatformModuleToVisible(platform: PlatformTrendFilter) {
    setVisiblePlatformModules((prev) => (prev.includes(platform) ? prev : [...prev, platform]));
  }

  function movePlatformModuleToHidden(platform: PlatformTrendFilter) {
    setVisiblePlatformModules((prev) => prev.filter((item) => item !== platform));
  }

  function syncParsedFromMetas(nextMetas: ImportedImageMeta[]) {
    setParsed(nextMetas.length ? nextMetas[nextMetas.length - 1].parseResult : EMPTY_PARSE_RESULT);
  }

  const groupedEditableAssets = selectedImageUris.map((uri, index) => {
    const meta = importedImageMetas.find((item) => item.uri === uri);
    const assets = editableAssets.filter((asset) => asset.imageUri === uri);
    return {
      uri,
      index,
      meta,
      assets,
      total: assets.reduce((sum, asset) => sum + asset.amount, 0)
    };
  });

  function formatOcrError(error: unknown): string {
    const rawMessage = error instanceof Error ? error.message : "OCR 识别失败";
    if (rawMessage.includes("doesn't seem to be linked")) {
      return "本地 OCR 模块尚未编进当前 App，请重新安装调试包或重新打 APK。";
    }
    if (rawMessage.includes("Network request failed")) {
      return "OCR 服务连接失败，请检查当前网络，或稍后再试。";
    }
    if (rawMessage.includes("OCR request failed")) {
      return `OCR 服务请求失败：${rawMessage}`;
    }
    if (rawMessage.includes("empty text")) {
      return "OCR 没有识别出文字，请换一张更清晰的截图再试。";
    }
    return rawMessage;
  }

  function toggleOcrText(uri: string) {
    setExpandedOcrUris((prev) => (prev.includes(uri) ? prev.filter((item) => item !== uri) : [...prev, uri]));
  }

  async function runOcrForAsset(imageUri: string) {
    setSelectedImageUris((prev) => (prev.includes(imageUri) ? prev : [...prev, imageUri].slice(0, 6)));
    setOcrLoading(true);
    setOcrError(null);
    setSaveNotice(null);
    try {
      const imageHash = await computeImageHash(imageUri);
      const text = await recognizeTextFromImage(imageUri);
      console.log("[OCR_FULL_TEXT_BEGIN]\n" + text + "\n[OCR_FULL_TEXT_END]");
      const parsedResult = parseOcrText(text);
      const nextAssetItems = parsedResult.assets.map((asset, index) => ({
        ...asset,
        imageUri,
        localId: `${imageHash}-${index}-${Date.now()}`,
        amountInput: asset.amount.toFixed(2),
        amountError: null
      }));
      setImportedImageMetas((prev) => {
        const nextMetas = prev.some((item) => item.uri === imageUri)
          ? prev.map((item) => (item.uri === imageUri ? { uri: imageUri, hash: imageHash, parseResult: parsedResult, rawOcrText: text } : item))
          : [...prev, { uri: imageUri, hash: imageHash, parseResult: parsedResult, rawOcrText: text }];
        syncParsedFromMetas(nextMetas);
        return nextMetas;
      });
      setParsed(parsedResult);
      setEditableAssets((prev) => [...prev.filter((asset) => asset.imageUri !== imageUri), ...nextAssetItems]);
    } catch (error) {
      console.error("OCR_IMPORT_FAILED", error);
      setOcrError(formatOcrError(error));
    } finally {
      setOcrLoading(false);
    }
  }

  async function handlePickAndRecognize() {
    setSourceModalVisible(false);
    const remainSlots = 6 - selectedImageUris.length;
    if (remainSlots <= 0) {
      setOcrError("最多导入 6 张图片，请先清空后再导入。");
      return;
    }
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setOcrError("没有相册权限，请在系统设置中允许访问相册。");
      return;
    }

    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      selectionLimit: remainSlots,
      allowsEditing: false,
      quality: 1
    });
    if (picked.canceled || !picked.assets.length) {
      return;
    }

    for (const asset of picked.assets.slice(0, remainSlots)) {
      const localUri = await ensureLocalImportUri(asset.uri, asset.fileName ?? null);
      await runOcrForAsset(localUri);
    }
  }

  async function handlePickFromFiles() {
    setSourceModalVisible(false);
    const remainSlots = 6 - selectedImageUris.length;
    if (remainSlots <= 0) {
      setOcrError("最多导入 6 张图片，请先清空后再导入。");
      return;
    }
    const picked = await DocumentPicker.getDocumentAsync({
      type: ["image/*"],
      multiple: true,
      copyToCacheDirectory: true
    });
    if (picked.canceled || !picked.assets.length) {
      return;
    }
    for (const asset of picked.assets.slice(0, remainSlots)) {
      const localUri = await ensureLocalImportUri(asset.uri, asset.name ?? null);
      await runOcrForAsset(localUri);
    }
  }

  async function handleRetryRecognition() {
    if (!selectedImageUris.length || ocrLoading) {
      return;
    }

    setOcrError(null);
    setSaveNotice(null);
    setParsed(EMPTY_PARSE_RESULT);
    setEditableAssets([]);
    setImportedImageMetas([]);

    for (const uri of selectedImageUris) {
      await runOcrForAsset(uri);
    }
  }

  function handleDeleteImportedImage(imageUri: string) {
    setSelectedImageUris((prev) => prev.filter((uri) => uri !== imageUri));
    setEditableAssets((prev) => prev.filter((asset) => asset.imageUri !== imageUri));
    setImportedImageMetas((prev) => {
      const nextMetas = prev.filter((item) => item.uri !== imageUri);
      syncParsedFromMetas(nextMetas);
      return nextMetas;
    });
    setPreviewIndex(0);
    setPreviewModalVisible(false);
    setExpandedOcrUris((prev) => prev.filter((item) => item !== imageUri));
    setOcrError(null);
    setSaveNotice(null);
  }

  async function handleConfirmSnapshot() {
    if (saveLoading) {
      return;
    }
    if (!dbReady) {
      setSaveNotice(dbInitError ? `数据库初始化失败：${dbInitError}` : "数据库初始化中，请稍后重试。");
      return;
    }
    if (!currentImageHashes.length) {
      setSaveNotice("请先导入并识别图片。");
      return;
    }
    if (!editableAssets.length) {
      setSaveNotice("当前没有可保存的资产项。");
      return;
    }
    setSaveLoading(true);
    setSaveNotice("正在记录数据...");
    try {
      const validationErrors: string[] = [];
      setEditableAssets((prev) =>
        prev.map((asset) => {
          const amountError = getAmountValidationMessage(asset.amountInput);
          if (amountError) {
            validationErrors.push(`${asset.name}: ${amountError}`);
            return { ...asset, amountError };
          }
          return {
            ...asset,
            amount: Number(asset.amountInput.replace(/,/g, "").trim()),
            amountError: null
          };
        })
      );
      if (validationErrors.length) {
        setSaveNotice(`记录失败：${validationErrors[0]}`);
        setSaveLoading(false);
        return;
      }
      const normalizedAssets = editableAssets.map(({ amountInput, amountError, ...asset }) => ({
        ...asset,
        amount: Number(amountInput.replace(/,/g, "").trim())
      }));
      const result = await saveImportSnapshot(
        currentImageHashes,
        normalizedAssets.map(({ imageUri, localId, ...asset }) => asset)
      );
      setSaveNotice(result.saved ? `已保存 ${result.date} 的快照记录。` : "同一图片今天已记录，已自动跳过重复保存。");
      await refreshTrendData(trendFilter);
      const summary = await queryDailySummary();
      setDailySummary(summary);
      resetWorkingImport();
      setManageVisible(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知保存错误";
      console.error("SAVE_IMPORT_FAILED", error);
      setSaveNotice(`记录失败：${message}`);
    } finally {
      setSaveLoading(false);
    }
  }

  async function handleClearData() {
    if (clearMode === "today") {
      await clearCurrentDateData();
      setSaveNotice("已清空当前日期数据。");
    } else if (clearMode === "all") {
      if (!clearAllStep2) {
        setClearAllStep2(true);
        return;
      }
      await clearAllData();
      setSaveNotice("已清空全部数据。");
    }
    const summary = await queryDailySummary();
    setDailySummary(summary);
    await refreshTrendData(trendFilter);
    resetWorkingImport();
    setClearMode(null);
    setClearAllStep2(false);
  }

  function updateCardOpacity(next: number) {
    setCardOpacityPercent(Math.max(30, Math.min(100, next)));
  }

  async function handlePasscodeSubmit() {
    if (securityBusy) {
      return;
    }

    setUnlockError(null);
    const trimmedPasscode = passcodeInput.trim();
    if (!/^\d{6}$/.test(trimmedPasscode)) {
      setUnlockError("请输入 6 位数字口令。");
      return;
    }

    setSecurityBusy(true);
    try {
      if (!hasPasscodeConfigured) {
        if (trimmedPasscode !== passcodeConfirmInput.trim()) {
          setUnlockError("两次输入的口令不一致。");
          return;
        }
        await saveAppPasscode(trimmedPasscode);
        setHasPasscodeConfigured(true);
        if (biometricAvailable) {
          await setBiometricUnlockEnabled(true);
          setBiometricEnabled(true);
        }
        setPasscodeInput("");
        setPasscodeConfirmInput("");
        setAppUnlocked(true);
        return;
      }

      const verified = await verifyAppPasscode(trimmedPasscode);
      if (!verified) {
        setUnlockError("口令不正确，请重试。");
        return;
      }
      setPasscodeInput("");
      setAppUnlocked(true);
    } finally {
      setSecurityBusy(false);
    }
  }

  async function handleBiometricUnlock() {
    if (!biometricAvailable || !biometricEnabled || securityBusy) {
      return;
    }
    setSecurityBusy(true);
    setUnlockError(null);
    try {
      const success = await authenticateWithBiometrics();
      if (success) {
        setAppUnlocked(true);
      }
    } finally {
      setSecurityBusy(false);
    }
  }

  async function handleToggleBiometric() {
    const nextValue = !biometricEnabled;
    await setBiometricUnlockEnabled(nextValue);
    setBiometricEnabled(nextValue);
  }

  if (!securityReady) {
    return (
      <SafeAreaView style={[styles.lockContainer, { paddingTop: 20 + androidTopInset }]}>
        <ExpoStatusBar style="light" />
        <View style={styles.lockCard}>
          <Text style={styles.lockTitle}>NetWise 安全初始化中</Text>
          <Text style={styles.lockSubtitle}>正在准备本地加密密钥...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!appUnlocked) {
    return (
      <SafeAreaView style={[styles.lockContainer, { paddingTop: 20 + androidTopInset }]}>
        <ExpoStatusBar style="light" />
        <View style={styles.lockCard}>
          <Text style={styles.lockTitle}>{hasPasscodeConfigured ? "输入口令解锁" : "首次使用，先设置口令"}</Text>
          <Text style={styles.lockSubtitle}>
            {hasPasscodeConfigured ? "本地资产数据已加密，解锁后才会展示。" : "请设置 6 位数字口令，后续启动 App 时需要输入。"}
          </Text>
          <TextInput
            value={passcodeInput}
            onChangeText={setPasscodeInput}
            style={styles.lockInput}
            placeholder="输入 6 位数字口令"
            placeholderTextColor="#94a3b8"
            secureTextEntry
            keyboardType="number-pad"
            maxLength={6}
          />
          {!hasPasscodeConfigured ? (
            <TextInput
              value={passcodeConfirmInput}
              onChangeText={setPasscodeConfirmInput}
              style={styles.lockInput}
              placeholder="再次输入口令"
              placeholderTextColor="#94a3b8"
              secureTextEntry
              keyboardType="number-pad"
              maxLength={6}
            />
          ) : null}
          {unlockError ? <Text style={styles.error}>{unlockError}</Text> : null}
          <Pressable style={styles.lockPrimaryButton} onPress={handlePasscodeSubmit}>
            <Text style={styles.lockPrimaryButtonText}>{securityBusy ? "处理中..." : hasPasscodeConfigured ? "解锁" : "保存并进入"}</Text>
          </Pressable>
          {hasPasscodeConfigured && biometricAvailable && biometricEnabled ? (
            <Pressable style={styles.lockSecondaryButton} onPress={handleBiometricUnlock}>
              <Text style={styles.lockSecondaryButtonText}>使用生物识别解锁</Text>
            </Pressable>
          ) : null}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ExpoStatusBar style="auto" />
      <Modal
        visible={sourceModalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setSourceModalVisible(false)}
      >
        <View style={styles.overlayMask}>
          <Pressable style={styles.overlayMaskTouch} onPress={() => setSourceModalVisible(false)} />
          <View style={styles.sourceSheet}>
            <Text style={styles.sourceTitle}>选择图片来源</Text>
            <Pressable style={styles.sheetButton} onPress={handlePickAndRecognize}>
              <Text style={styles.sheetButtonText}>从相册选择</Text>
            </Pressable>
            <Pressable style={styles.sheetButton} onPress={handlePickFromFiles}>
              <Text style={styles.sheetButtonText}>从文件选择</Text>
            </Pressable>
            <Pressable style={styles.sheetCancelButton} onPress={() => setSourceModalVisible(false)}>
              <Text style={styles.sheetCancelButtonText}>取消</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        visible={previewModalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setPreviewModalVisible(false)}
      >
        <View style={styles.previewOverlay}>
          <Pressable style={styles.previewBackdrop} onPress={() => setPreviewModalVisible(false)} />
          {selectedImageUris[previewIndex] ? (
            <Image source={{ uri: selectedImageUris[previewIndex] }} style={styles.previewImage} />
          ) : null}
          <Pressable
            style={styles.previewReselectButton}
            onPress={() => {
              setPreviewModalVisible(false);
              setSourceModalVisible(true);
            }}
          >
            <Text style={styles.previewReselectButtonText}>重选图片</Text>
          </Pressable>
        </View>
      </Modal>

      <Modal
        visible={clearMode !== null}
        animationType="fade"
        transparent
        onRequestClose={() => {
          setClearMode(null);
          setClearAllStep2(false);
        }}
      >
        <View style={styles.overlayMask}>
          <Pressable
            style={styles.overlayMaskTouch}
            onPress={() => {
              setClearMode(null);
              setClearAllStep2(false);
            }}
          />
          <View style={styles.sourceSheet}>
            <Text style={styles.sourceTitle}>
              {clearMode === "all" && clearAllStep2 ? "再次确认：清空全部数据？" : "确认清空数据？"}
            </Text>
            <Text style={styles.muted}>
              {clearMode === "today"
                ? "将删除当前日期的所有已确认导入记录。"
                : "将删除全部历史记录。此操作不可恢复。"}
            </Text>
            <Pressable style={styles.sheetButton} onPress={handleClearData}>
              <Text style={styles.sheetButtonText}>{clearMode === "all" && !clearAllStep2 ? "下一步确认" : "确认清空"}</Text>
            </Pressable>
            <Pressable
              style={styles.sheetCancelButton}
              onPress={() => {
                setClearMode(null);
                setClearAllStep2(false);
              }}
            >
              <Text style={styles.sheetCancelButtonText}>取消</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <ScrollView contentContainerStyle={[styles.content, { paddingTop: 16 + androidTopInset }]}>
        <View style={styles.heroCard}>
          <View style={styles.heroTopRow}>
            <Text style={styles.heroHint}>今日已确认总资产(元)</Text>
            <View style={styles.heroActions}>
              <Pressable style={styles.manageButton} onPress={() => setManageVisible(true)}>
                <Text style={styles.manageButtonText}>导入</Text>
              </Pressable>
              <Pressable style={styles.settingsGearButton} onPress={() => setSettingsVisible(true)}>
                <Text style={styles.settingsGearText}>⚙</Text>
              </Pressable>
            </View>
          </View>
          <Text style={styles.heroTotal}>
            {dailySummary.total.toLocaleString("zh-CN", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2
            })}
          </Text>
          {dbInitError ? <Text style={styles.heroError}>数据库异常：{dbInitError}</Text> : null}
          <View style={styles.quickStatRow}>
            <View style={styles.quickStatItem}>
              <Text style={styles.quickStatLabel}>余额宝/现金</Text>
              <Text style={styles.quickStatValue}>{cashAmount.toFixed(2)}</Text>
            </View>
            <View style={styles.quickStatItem}>
              <Text style={styles.quickStatLabel}>基金</Text>
              <Text style={styles.quickStatValue}>{fundAmount.toFixed(2)}</Text>
            </View>
            <View style={styles.quickStatItem}>
              <Text style={styles.quickStatLabel}>保险</Text>
              <Text style={styles.quickStatValue}>{insuranceAmount.toFixed(2)}</Text>
            </View>
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: cardBackgroundColor }]}>
          <View style={styles.trendHeaderRow}>
            <Text style={styles.cardTitle}>资金趋势折线图</Text>
            <View style={styles.trendPickerArea}>
              <Pressable style={styles.trendPickerWrap} onPress={() => setTrendMenuVisible((prev) => !prev)}>
                <Text style={styles.trendPickerLabel}>{TREND_FILTER_LABEL[trendFilter]}</Text>
                <Text style={styles.trendPickerArrow}>▼</Text>
              </Pressable>
              {trendMenuVisible ? (
                <View style={styles.trendDropdownMenu}>
                  {TREND_FILTER_ORDER.map((filter) => (
                    <Pressable
                      key={filter}
                      style={[styles.trendDropdownItem, filter === trendFilter ? styles.trendDropdownItemActive : null]}
                      onPress={() => {
                        setTrendFilter(filter);
                        setTrendMenuVisible(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.trendDropdownItemText,
                          filter === trendFilter ? styles.trendDropdownItemTextActive : null
                        ]}
                      >
                        {TREND_FILTER_LABEL[filter]}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>
          </View>
          <TrendLineChart points={trendPoints} />
        </View>

        {visiblePlatformModules.map((platform) => (
          <View key={platform} style={[styles.card, { backgroundColor: cardBackgroundColor }]}>
            <Text style={styles.cardTitle}>{PLATFORM_TREND_LABEL[platform]}</Text>
            <TrendLineChart points={platformTrendPoints[platform]} />
          </View>
        ))}
      </ScrollView>

      {settingsVisible ? (
        <SafeAreaView style={[styles.pageOverlay, { paddingTop: 16 + androidTopInset }]}>
          <View style={styles.settingsHeader}>
            <Text style={styles.settingsTitle}>设置</Text>
            <Pressable onPress={() => setSettingsVisible(false)}>
              <Text style={styles.settingsClose}>完成</Text>
            </Pressable>
          </View>
          <View style={[styles.settingsCard, { backgroundColor: cardBackgroundColor }]}>
            <Text style={styles.settingsLabel}>卡片透明度: {cardOpacityPercent}%</Text>
            <View style={styles.opacityRow}>
              <Pressable style={styles.opacityButton} onPress={() => updateCardOpacity(cardOpacityPercent - 5)}>
                <Text style={styles.opacityButtonText}>-5%</Text>
              </Pressable>
              <View style={styles.opacitySliderWrap}>
                <Slider
                  minimumValue={30}
                  maximumValue={100}
                  step={5}
                  value={cardOpacityPercent}
                  onValueChange={(value) => updateCardOpacity(Number(value))}
                  minimumTrackTintColor="#2563eb"
                  maximumTrackTintColor="#bfdbfe"
                  thumbTintColor="#1d4ed8"
                />
              </View>
              <Pressable style={styles.opacityButton} onPress={() => updateCardOpacity(cardOpacityPercent + 5)}>
                <Text style={styles.opacityButtonText}>+5%</Text>
              </Pressable>
            </View>
            <View style={styles.opacityMarksRow}>
              <Text style={styles.opacityMarkText}>30%</Text>
              <Text style={styles.opacityMarkText}>65%</Text>
              <Text style={styles.opacityMarkText}>100%</Text>
            </View>
            <Text style={styles.muted}>透明度越低，蓝色背景透出越明显。</Text>
          </View>
          <View style={[styles.settingsCard, { backgroundColor: cardBackgroundColor }]}>
            <Text style={styles.settingsLabel}>隐私与安全</Text>
            <Text style={styles.muted}>已启用本地加密存储。数据库不会保存原始截图，只保留图片 hash 用于去重。</Text>
            <Text style={styles.muted}>点击确认保存后，会立即清掉当前导入图片的预览和内存引用。</Text>
            {biometricAvailable ? (
              <Pressable style={styles.securityActionButton} onPress={handleToggleBiometric}>
                <Text style={styles.securityActionButtonText}>{biometricEnabled ? "关闭生物识别解锁" : "开启生物识别解锁"}</Text>
              </Pressable>
            ) : (
              <Text style={styles.muted}>当前设备未检测到可用的生物识别能力。</Text>
            )}
          </View>
          <View style={[styles.settingsCard, { backgroundColor: cardBackgroundColor }]}>
            <Text style={styles.settingsLabel}>模块展示</Text>
            <Text style={styles.settingsSubLabel}>展示区域</Text>
            <View style={styles.tagArea}>
              {visiblePlatformModules.map((platform) => (
                <Pressable
                  key={`visible-${platform}`}
                  style={styles.visibleTag}
                  onPress={() => movePlatformModuleToHidden(platform)}
                >
                  <Text style={styles.visibleTagText}>{PLATFORM_MODULE_LABEL[platform]}</Text>
                  <Text style={styles.visibleTagAction}>×</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.settingsSubLabel}>隐藏区域</Text>
            <View style={styles.tagArea}>
              {hiddenPlatformModules.length ? (
                hiddenPlatformModules.map((platform) => (
                  <Pressable
                    key={`hidden-${platform}`}
                    style={styles.hiddenTag}
                    onPress={() => movePlatformModuleToVisible(platform)}
                  >
                    <Text style={styles.hiddenTagAction}>+</Text>
                    <Text style={styles.hiddenTagText}>{PLATFORM_MODULE_LABEL[platform]}</Text>
                  </Pressable>
                ))
              ) : (
                <Text style={styles.muted}>当前没有隐藏模块。</Text>
              )}
            </View>
          </View>
        </SafeAreaView>
      ) : null}

      {manageVisible ? (
        <SafeAreaView style={[styles.pageOverlay, { paddingTop: 16 + androidTopInset }]}>
          <View style={styles.settingsHeader}>
            <Text style={styles.settingsTitle}>数据管理</Text>
            <Pressable onPress={() => setManageVisible(false)}>
              <Text style={styles.settingsClose}>完成</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.manageContent}>
            <View style={[styles.card, { backgroundColor: cardBackgroundColor }]}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.cardTitle}>截图导入</Text>
                <View style={styles.sectionHeaderActions}>
                  {selectedImageUris.length ? (
                    <Pressable style={styles.retryButton} onPress={handleRetryRecognition}>
                      <Text style={styles.retryButtonText}>{ocrLoading ? "识别中..." : "重新识别"}</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
              <View style={styles.previewGrid}>
                {selectedImageUris.map((uri, idx) => (
                  <Pressable
                    key={`${uri}-${idx}`}
                    style={styles.previewTileSmall}
                    onPress={() => {
                      setPreviewIndex(idx);
                      setPreviewModalVisible(true);
                    }}
                  >
                    <Image source={{ uri }} style={styles.previewTileImage} />
                    <Pressable
                      style={styles.previewTileDelete}
                      hitSlop={8}
                      onPress={() => handleDeleteImportedImage(uri)}
                    >
                      <Text style={styles.previewTileDeleteText}>×</Text>
                    </Pressable>
                  </Pressable>
                ))}
                {selectedImageUris.length < 6 ? (
                  <Pressable style={styles.previewTileAdd} onPress={() => setSourceModalVisible(true)}>
                    <Text style={styles.previewTileHint}>+ 导入</Text>
                  </Pressable>
                ) : null}
              </View>
              {selectedImageUris.length ? <Text style={styles.muted}>已导入 {selectedImageUris.length}/6 张，点击可预览</Text> : null}
              {ocrError ? (
                <View style={styles.errorBanner}>
                  <Text style={styles.errorBannerTitle}>导入失败</Text>
                  <Text style={styles.errorBannerText}>{ocrError}</Text>
                </View>
              ) : null}
              {dbInitError ? <Text style={styles.error}>数据库初始化失败：{dbInitError}</Text> : null}
              <Text style={styles.muted}>识别后自动分类，可直接在下方修正。</Text>
            </View>

            <View style={[styles.card, { backgroundColor: cardBackgroundColor }]}>
              <Text style={styles.cardTitle}>解析结果（可修改）</Text>
              {groupedEditableAssets.map((group) => (
                <View style={styles.parseGroup} key={group.uri}>
                  <View style={styles.parseGroupHeader}>
                    <Text style={styles.parseGroupTitle}>页面 {group.index + 1}</Text>
                    <Text style={styles.parseGroupTotal}>当前页面总额：{group.total.toFixed(2)}</Text>
                  </View>
                  <Text style={styles.line}>页面类型：{SCREEN_TYPE_LABEL[group.meta?.parseResult.screenType ?? "unknown"]}</Text>
                  {group.assets.map((asset) => (
                    <View style={styles.assetRow} key={asset.localId}>
                      <TextInput
                        value={asset.name}
                        onChangeText={(value) => updateAssetName(asset.localId, value)}
                        style={styles.assetNameInput}
                        placeholder="资产名称"
                      />
                      <View style={styles.assetAmountWrap}>
                        <TextInput
                          value={asset.amountInput}
                          onChangeText={(value) => updateAssetAmount(asset.localId, value)}
                          onBlur={() => validateAssetAmount(asset.localId)}
                          style={styles.assetAmountInput}
                          autoCorrect={false}
                          autoCapitalize="none"
                          placeholder="金额"
                        />
                        {asset.amountError ? <Text style={styles.assetAmountErrorText}>{asset.amountError}</Text> : null}
                      </View>
                      <View style={styles.classPickerWrap}>
                        <View style={styles.classDisplayRow}>
                          <Text style={styles.classLabelText}>{ASSET_CLASS_LABEL[asset.assetClass]}</Text>
                          <Text style={styles.classArrowText}>▼</Text>
                        </View>
                        <Picker
                          mode="dialog"
                          selectedValue={asset.assetClass}
                          onValueChange={(value) => updateAssetClass(asset.localId, value as AssetClass)}
                          style={styles.classPickerOverlay}
                        >
                          {ASSET_CLASS_ORDER.map((assetClass) => (
                            <Picker.Item key={assetClass} label={ASSET_CLASS_LABEL[assetClass]} value={assetClass} />
                          ))}
                        </Picker>
                      </View>
                    </View>
                  ))}
                  {(group.meta?.parseResult.warnings ?? []).map((warn) => (
                    <Text style={styles.warn} key={`${group.uri}-${warn}`}>
                      {warn}
                    </Text>
                  ))}
                  {group.meta?.rawOcrText ? (
                    <View style={styles.ocrDebugWrap}>
                      <Pressable style={styles.ocrDebugToggle} onPress={() => toggleOcrText(group.uri)}>
                        <Text style={styles.ocrDebugToggleText}>
                          {expandedOcrUris.includes(group.uri) ? "收起 OCR 原文" : "查看 OCR 原文"}
                        </Text>
                      </Pressable>
                      {expandedOcrUris.includes(group.uri) ? (
                        <TextInput
                          value={group.meta.rawOcrText}
                          editable={false}
                          multiline
                          style={styles.ocrDebugText}
                        />
                      ) : null}
                    </View>
                  ) : null}
                </View>
              ))}
              <Pressable style={styles.confirmButton} onPress={handleConfirmSnapshot}>
                <Text style={styles.confirmButtonText}>{saveLoading ? "记录中..." : "确认并记录"}</Text>
              </Pressable>
              {saveNotice ? <Text style={styles.muted}>{saveNotice}</Text> : null}
            </View>

            <View style={[styles.card, { backgroundColor: cardBackgroundColor }]}>
              <Text style={styles.cardTitle}>数据清理</Text>
              <View style={styles.clearActionRowModal}>
                <Pressable
                  style={styles.clearActionButtonBlue}
                  onPress={() => {
                    setClearMode("today");
                    setClearAllStep2(false);
                  }}
                >
                  <Text style={styles.clearActionText}>清空今日</Text>
                </Pressable>
                <Pressable
                  style={styles.clearActionButtonDanger}
                  onPress={() => {
                    setClearMode("all");
                    setClearAllStep2(false);
                  }}
                >
                  <Text style={styles.clearActionText}>清空全部</Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </SafeAreaView>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0b63c8"
  },
  pageOverlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "#0b63c8",
    padding: 16,
    gap: 12,
    zIndex: 20
  },
  lockContainer: {
    flex: 1,
    backgroundColor: "#0b63c8",
    justifyContent: "center",
    padding: 20
  },
  lockCard: {
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.96)",
    padding: 18,
    gap: 12
  },
  lockTitle: {
    color: "#163d7a",
    fontSize: 24,
    fontWeight: "700"
  },
  lockSubtitle: {
    color: "#4f76b3",
    fontSize: 14,
    lineHeight: 20
  },
  lockInput: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#b7d4fb",
    backgroundColor: "#f4f8ff",
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#163d7a"
  },
  lockPrimaryButton: {
    borderRadius: 12,
    backgroundColor: "#2563eb",
    paddingVertical: 12,
    alignItems: "center"
  },
  lockPrimaryButtonText: {
    color: "white",
    fontWeight: "700"
  },
  lockSecondaryButton: {
    borderRadius: 12,
    backgroundColor: "#eef5ff",
    paddingVertical: 12,
    alignItems: "center"
  },
  lockSecondaryButtonText: {
    color: "#1d4ed8",
    fontWeight: "700"
  },
  content: {
    gap: 12,
    padding: 16
  },
  heroCard: {
    backgroundColor: "#0b63c8",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10
  },
  heroTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  heroActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  manageButton: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.16)"
  },
  manageButtonText: {
    color: "white",
    fontSize: 12,
    fontWeight: "700"
  },
  settingsGearButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.16)"
  },
  settingsGearText: {
    color: "white",
    fontSize: 16
  },
  heroHint: {
    color: "#bfdbfe",
    fontSize: 13
  },
  heroTotal: {
    color: "white",
    fontSize: 44,
    fontWeight: "700",
    lineHeight: 52
  },
  heroError: {
    color: "#fecaca",
    fontSize: 12
  },
  quickStatRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6
  },
  quickStatItem: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 8
  },
  quickStatLabel: {
    color: "#dbeafe",
    fontSize: 11
  },
  quickStatValue: {
    color: "white",
    fontSize: 16,
    fontWeight: "700"
  },
  clearActionRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8
  },
  clearActionRowModal: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8
  },
  clearActionButtonBlue: {
    borderRadius: 999,
    backgroundColor: "#2563eb",
    paddingHorizontal: 12,
    paddingVertical: 6
  },
  clearActionButton: {
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.22)",
    paddingHorizontal: 12,
    paddingVertical: 6
  },
  clearActionButtonDanger: {
    borderRadius: 999,
    backgroundColor: "rgba(239,68,68,0.32)",
    paddingHorizontal: 12,
    paddingVertical: 6
  },
  clearActionText: {
    color: "white",
    fontSize: 12,
    fontWeight: "700"
  },
  card: {
    borderRadius: 10,
    padding: 12,
    gap: 8
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#163d7a"
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8
  },
  sectionHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  retryButton: {
    borderRadius: 999,
    backgroundColor: "#eef5ff",
    borderWidth: 1,
    borderColor: "#bfdbfe",
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  retryButtonText: {
    color: "#1d4ed8",
    fontSize: 12,
    fontWeight: "700"
  },
  overlayMask: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.35)",
    justifyContent: "center",
    padding: 20
  },
  overlayMaskTouch: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0
  },
  sourceSheet: {
    backgroundColor: "white",
    borderRadius: 14,
    padding: 14,
    gap: 10
  },
  sourceTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#163d7a"
  },
  sheetButton: {
    borderRadius: 10,
    backgroundColor: "#2563eb",
    paddingVertical: 10,
    alignItems: "center"
  },
  sheetButtonText: {
    color: "white",
    fontWeight: "600"
  },
  sheetCancelButton: {
    borderRadius: 10,
    backgroundColor: "#eef5ff",
    paddingVertical: 10,
    alignItems: "center"
  },
  sheetCancelButtonText: {
    color: "#1d4ed8",
    fontWeight: "600"
  },
  previewOverlay: {
    flex: 1,
    backgroundColor: "rgba(2, 6, 23, 0.88)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20
  },
  previewBackdrop: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0
  },
  previewImage: {
    width: "100%",
    height: "76%",
    resizeMode: "contain"
  },
  previewReselectButton: {
    position: "absolute",
    right: 20,
    bottom: 24,
    borderRadius: 999,
    backgroundColor: "#2563eb",
    paddingVertical: 10,
    paddingHorizontal: 14
  },
  previewReselectButtonText: {
    color: "white",
    fontWeight: "700"
  },
  previewGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  previewTileSmall: {
    width: "31%",
    aspectRatio: 1,
    borderWidth: 1,
    borderColor: "#bfdbfe",
    borderStyle: "dashed",
    borderRadius: 10,
    backgroundColor: "#eff6ff",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden"
  },
  previewTileAdd: {
    width: "31%",
    aspectRatio: 1,
    borderWidth: 1,
    borderColor: "#bfdbfe",
    borderStyle: "dashed",
    borderRadius: 10,
    backgroundColor: "#eff6ff",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden"
  },
  previewTileImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover"
  },
  previewTileDelete: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "rgba(255,255,255,0.82)",
    alignItems: "center",
    justifyContent: "center"
  },
  previewTileDeleteText: {
    color: "rgba(100,116,139,0.9)",
    fontSize: 12,
    fontWeight: "500",
    lineHeight: 14
  },
  previewTileHint: {
    color: "#1d4ed8",
    fontSize: 14
  },
  assetRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 18
  },
  assetNameInput: {
    flex: 1,
    borderColor: "#b7d4fb",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: "#f4f8ff",
    color: "#163d7a"
  },
  assetAmountInput: {
    borderColor: "#b7d4fb",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: "#f4f8ff",
    color: "#163d7a"
  },
  assetAmountWrap: {
    width: 110,
    position: "relative"
  },
  assetAmountErrorText: {
    color: "#dc2626",
    fontSize: 11,
    position: "absolute",
    top: 38,
    left: 4
  },
  parseGroup: {
    gap: 8,
    marginBottom: 14,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(29,78,216,0.12)"
  },
  parseGroupHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  parseGroupTitle: {
    color: "#163d7a",
    fontWeight: "700"
  },
  parseGroupTotal: {
    color: "#2563eb",
    fontSize: 12,
    fontWeight: "600"
  },
  ocrDebugWrap: {
    marginTop: 2,
    gap: 8
  },
  ocrDebugToggle: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#e0edff"
  },
  ocrDebugToggleText: {
    color: "#1d4ed8",
    fontSize: 12,
    fontWeight: "600"
  },
  ocrDebugText: {
    minHeight: 120,
    borderColor: "#b7d4fb",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "#f8fbff",
    color: "#163d7a",
    textAlignVertical: "top"
  },
  classPickerWrap: {
    width: 76,
    height: 34,
    borderRadius: 999,
    borderColor: "#bfdbfe",
    borderWidth: 1,
    overflow: "hidden",
    backgroundColor: "#dbeafe",
    justifyContent: "center"
  },
  classDisplayRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10
  },
  classLabelText: {
    color: "#1d4ed8",
    fontWeight: "600",
    fontSize: 12
  },
  classArrowText: {
    color: "#1d4ed8",
    fontSize: 10
  },
  classPickerOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    opacity: 0.02
  },
  confirmButton: {
    backgroundColor: "#2563eb",
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center"
  },
  confirmButtonText: {
    color: "white",
    fontWeight: "700"
  },
  trendPickerWrap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#bfdbfe",
    borderRadius: 999,
    backgroundColor: "#eff6ff",
    width: 110,
    height: 34,
    paddingHorizontal: 12
  },
  trendPickerArea: {
    position: "relative",
    zIndex: 5
  },
  trendPickerLabel: {
    color: "#1d4ed8",
    fontSize: 12,
    fontWeight: "600"
  },
  trendPickerArrow: {
    color: "#1d4ed8",
    fontSize: 10
  },
  trendHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8
  },
  trendDropdownMenu: {
    position: "absolute",
    top: 38,
    right: 0,
    width: 110,
    borderWidth: 1,
    borderColor: "#bfdbfe",
    borderRadius: 14,
    backgroundColor: "#eff6ff",
    overflow: "hidden"
  },
  trendDropdownItem: {
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  trendDropdownItemActive: {
    backgroundColor: "#dbeafe"
  },
  trendDropdownItemText: {
    color: "#1d4ed8",
    fontSize: 13
  },
  trendDropdownItemTextActive: {
    fontWeight: "700"
  },
  line: {
    color: "#163d7a"
  },
  warn: {
    color: "#dc2626"
  },
  error: {
    color: "#dc2626"
  },
  errorBanner: {
    borderRadius: 10,
    backgroundColor: "rgba(239,68,68,0.10)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.35)",
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 4
  },
  errorBannerTitle: {
    color: "#dc2626",
    fontSize: 13,
    fontWeight: "700"
  },
  errorBannerText: {
    color: "#dc2626",
    fontSize: 12
  },
  muted: {
    color: "#4f76b3",
    fontSize: 12
  },
  settingsPage: {
    flex: 1,
    backgroundColor: "#0b63c8",
    padding: 16,
    gap: 12
  },
  settingsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  settingsTitle: {
    color: "white",
    fontSize: 24,
    fontWeight: "700"
  },
  settingsClose: {
    color: "white",
    fontSize: 16,
    fontWeight: "700"
  },
  settingsCard: {
    borderRadius: 12,
    padding: 12,
    gap: 10
  },
  manageContent: {
    gap: 12,
    paddingBottom: 24
  },
  settingsLabel: {
    color: "#163d7a",
    fontSize: 15,
    fontWeight: "700"
  },
  settingsSubLabel: {
    color: "#4f76b3",
    fontSize: 12,
    fontWeight: "700"
  },
  tagArea: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  visibleTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    backgroundColor: "#2563eb",
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  visibleTagText: {
    color: "white",
    fontSize: 13,
    fontWeight: "700"
  },
  visibleTagAction: {
    color: "white",
    fontSize: 14,
    fontWeight: "700"
  },
  hiddenTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    backgroundColor: "#eef5ff",
    borderWidth: 1,
    borderColor: "#bfdbfe",
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  hiddenTagText: {
    color: "#1d4ed8",
    fontSize: 13,
    fontWeight: "700"
  },
  hiddenTagAction: {
    color: "#1d4ed8",
    fontSize: 14,
    fontWeight: "700"
  },
  opacityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  opacityButton: {
    borderRadius: 8,
    backgroundColor: "#2563eb",
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  opacityButtonText: {
    color: "white",
    fontWeight: "700"
  },
  opacitySliderWrap: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 4
  },
  opacityMarksRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 72
  },
  opacityMarkText: {
    color: "#4f76b3",
    fontSize: 11
  },
  securityActionButton: {
    borderRadius: 8,
    backgroundColor: "#2563eb",
    paddingVertical: 10,
    alignItems: "center"
  },
  securityActionButtonText: {
    color: "white",
    fontWeight: "700"
  }
});
