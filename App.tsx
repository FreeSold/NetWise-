import { StatusBar as ExpoStatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import * as Crypto from "expo-crypto";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { Picker } from "@react-native-picker/picker";
import Slider from "@react-native-community/slider";
import { Alert, Image, Modal, Platform, Pressable, SafeAreaView, ScrollView, StatusBar as NativeStatusBar, StyleSheet, Text, TextInput, View } from "react-native";
import type { AssetClass, OcrCustomRule, OcrRuleScreenScope, ParsedAsset, ParseResult } from "./src/domain/types";
import { TrendLineChart } from "./src/components/TrendLineChart";
import { recognizeTextFromImage } from "./src/ocr/ocrSpace";
import { buildRuleSummary, formatDisplayAmount } from "./src/parsers/shared";
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
import { loadOcrCustomRules, saveOcrCustomRules } from "./src/storage/ocrCustomRulesStore";

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
  custom: "自定义规则",
  unknown: "未识别页面"
};

const OCR_RULE_SCOPE_ORDER: OcrRuleScreenScope[] = [
  "any",
  "unknown",
  "cmb_property",
  "cmb_wealth",
  "alipay_wealth",
  "alipay_fund",
  "wechat_wallet"
];

const OCR_RULE_SCOPE_LABEL: Record<OcrRuleScreenScope, string> = {
  any: "不限页面（每张图都尝试）",
  unknown: "仅「未识别页面」时",
  cmb_property: "仅招商银行财产页",
  cmb_wealth: "仅招商银行理财页",
  alipay_wealth: "仅支付宝理财页",
  alipay_fund: "仅支付宝基金页",
  wechat_wallet: "仅微信钱包页"
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
  const [ocrCustomRules, setOcrCustomRules] = useState<OcrCustomRule[]>([]);
  const [expandedOcrUris, setExpandedOcrUris] = useState<string[]>([]);
  const [customRuleNotice, setCustomRuleNotice] = useState<string | null>(null);
  const [ruleDraftSource, setRuleDraftSource] = useState("");
  const [ruleDraftContent, setRuleDraftContent] = useState("");
  const [ruleDraftClass, setRuleDraftClass] = useState<AssetClass>("cash");
  const [ruleDraftScope, setRuleDraftScope] = useState<OcrRuleScreenScope>("any");
  const [ocrRuleModalVisible, setOcrRuleModalVisible] = useState(false);
  const [ocrRuleEditingId, setOcrRuleEditingId] = useState<string | null>(null);

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
      try {
        await refreshTrendData(trendFilter);
      } catch (error) {
        console.error("TREND_LOAD_FAILED", error);
      }
    }
    void loadTrend();
  }, [dbReady, trendFilter]);

  useEffect(() => {
    if (!appUnlocked) {
      return;
    }
    void (async () => {
      try {
        const rules = await loadOcrCustomRules();
        setOcrCustomRules(rules);
        setCustomRuleNotice(null);
      } catch (error) {
        const message = error instanceof Error ? error.message : "规则加载失败";
        setCustomRuleNotice(message);
      }
    })();
  }, [appUnlocked]);

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

  function toggleOcrText(uri: string) {
    setExpandedOcrUris((prev) => (prev.includes(uri) ? prev.filter((item) => item !== uri) : [...prev, uri]));
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
    setEditableAssets((prev) =>
      prev.map((a) => {
        if (a.localId !== localId) {
          return a;
        }
        const label = name.trim() || a.recognizedLabel || "—";
        return {
          ...a,
          name,
          ruleSummary: buildRuleSummary(label, a.amount, a.assetClass)
        };
      })
    );
  }

  function getNameValidationMessage(name: string): string | null {
    if (!name.trim()) {
      return "请填写金额名称";
    }
    return null;
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
        const nextAmount = normalized && Number.isFinite(amount) ? amount : a.amount;
        const label = a.name.trim() || a.recognizedLabel || "—";
        return {
          ...a,
          amountInput: amountRaw,
          amount: nextAmount,
          amountError: null,
          ruleSummary: buildRuleSummary(label, nextAmount, a.assetClass)
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
          const num = Number(normalized);
          const label = a.name.trim() || a.recognizedLabel || "—";
          return {
            ...a,
            amount: num,
            amountError: null,
            ruleSummary: buildRuleSummary(label, num, a.assetClass)
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
    setEditableAssets((prev) =>
      prev.map((a) => {
        if (a.localId !== localId) {
          return a;
        }
        const label = a.name.trim() || a.recognizedLabel || "—";
        return {
          ...a,
          assetClass,
          ruleSummary: buildRuleSummary(label, a.amount, assetClass)
        };
      })
    );
  }

  function addManualAssetRow(imageUri: string) {
    const localId = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    setEditableAssets((prev) => [
      ...prev,
      {
        name: "",
        amount: 0,
        currency: "CNY",
        assetClass: "cash",
        source: "custom",
        confidence: 1,
        imageUri,
        localId,
        amountInput: "",
        amountError: null
      }
    ]);
  }

  function removeEditableAsset(localId: string) {
    setEditableAssets((prev) => prev.filter((a) => a.localId !== localId));
  }

  function confirmRemoveAssetRow(localId: string) {
    Alert.alert("删除该行？", "将从当前解析列表移除，不影响已保存的历史。", [
      { text: "取消", style: "cancel" },
      { text: "删除", style: "destructive", onPress: () => removeEditableAsset(localId) }
    ]);
  }

  function resetOcrRuleDraft() {
    setRuleDraftSource("");
    setRuleDraftContent("");
    setRuleDraftClass("cash");
    setRuleDraftScope("any");
  }

  function openOcrRuleModalForCreate() {
    setOcrRuleEditingId(null);
    resetOcrRuleDraft();
    setOcrRuleModalVisible(true);
  }

  function openOcrRuleModalForEdit(rule: OcrCustomRule) {
    setOcrRuleEditingId(rule.id);
    setRuleDraftSource(rule.sourceSnippet);
    setRuleDraftContent(rule.recognizedContent);
    setRuleDraftClass(rule.assetClass);
    setRuleDraftScope(rule.screenScope ?? "any");
    setOcrRuleModalVisible(true);
  }

  function closeOcrRuleModal() {
    setOcrRuleModalVisible(false);
    setOcrRuleEditingId(null);
    resetOcrRuleDraft();
  }

  async function handleSaveOcrCustomRuleFromModal() {
    const sourceSnippet = ruleDraftSource.trim();
    const recognizedContent = ruleDraftContent.trim();
    if (!sourceSnippet || !recognizedContent) {
      setCustomRuleNotice("请填写原文与识别内容（金额名称）。");
      setTimeout(() => setCustomRuleNotice(null), 2500);
      return;
    }
    const buildRule = (id: string): OcrCustomRule => {
      const row: OcrCustomRule = {
        id,
        sourceSnippet,
        recognizedContent,
        assetClass: ruleDraftClass
      };
      if (ruleDraftScope !== "any") {
        row.screenScope = ruleDraftScope;
      }
      return row;
    };
    let next: OcrCustomRule[];
    if (ocrRuleEditingId) {
      next = ocrCustomRules.map((r) => (r.id === ocrRuleEditingId ? buildRule(r.id) : r));
    } else {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      next = [...ocrCustomRules, buildRule(id)];
    }
    setOcrCustomRules(next);
    try {
      await saveOcrCustomRules(next);
      setCustomRuleNotice("已保存规则。");
      setTimeout(() => setCustomRuleNotice(null), 2000);
      closeOcrRuleModal();
    } catch (error) {
      const message = error instanceof Error ? error.message : "保存失败";
      setCustomRuleNotice(message);
    }
  }

  async function handleRemoveOcrCustomRule(id: string) {
    const next = ocrCustomRules.filter((r) => r.id !== id);
    setOcrCustomRules(next);
    try {
      await saveOcrCustomRules(next);
    } catch (error) {
      const message = error instanceof Error ? error.message : "删除后保存失败";
      setCustomRuleNotice(message);
    }
  }

  function confirmDeleteOcrRuleInModal() {
    const id = ocrRuleEditingId;
    if (!id) {
      return;
    }
    Alert.alert("删除此规则？", "将从本机规则列表移除。", [
      { text: "取消", style: "cancel" },
      {
        text: "删除",
        style: "destructive",
        onPress: () =>
          void (async () => {
            await handleRemoveOcrCustomRule(id);
            closeOcrRuleModal();
          })()
      }
    ]);
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

  async function runOcrForAsset(imageUri: string) {
    setSelectedImageUris((prev) => (prev.includes(imageUri) ? prev : [...prev, imageUri].slice(0, 6)));
    setOcrLoading(true);
    setOcrError(null);
    setSaveNotice(null);
    try {
      const imageHash = await computeImageHash(imageUri);
      const text = await recognizeTextFromImage(imageUri);
      console.log("[OCR_FULL_TEXT_BEGIN]\n" + text + "\n[OCR_FULL_TEXT_END]");
      const parsedResult = parseOcrText(text, ocrCustomRules);
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
      for (const asset of editableAssets) {
        const amountError = getAmountValidationMessage(asset.amountInput);
        const nameError = getNameValidationMessage(asset.name);
        if (amountError) {
          validationErrors.push(`${asset.name.trim() || "未命名"}：${amountError}`);
        } else if (nameError) {
          validationErrors.push(`${asset.ruleSummary ?? "某一行"}：${nameError}`);
        }
      }
      setEditableAssets((prev) =>
        prev.map((asset) => ({
          ...asset,
          amountError: getAmountValidationMessage(asset.amountInput)
        }))
      );
      if (validationErrors.length) {
        setSaveNotice(`记录失败：${validationErrors[0]}`);
        setSaveLoading(false);
        return;
      }
      const toSave: ParsedAsset[] = editableAssets.map((row) => {
        const amount = Number(row.amountInput.replace(/,/g, "").trim());
        const label = row.name.trim() || row.recognizedLabel || "—";
        const summary = buildRuleSummary(label, amount, row.assetClass);
        const item: ParsedAsset = {
          name: row.name.trim(),
          amount,
          currency: "CNY",
          assetClass: row.assetClass,
          source: row.source,
          confidence: row.confidence,
          ruleSummary: summary
        };
        if (row.recognizedLabel) {
          item.recognizedLabel = row.recognizedLabel;
        }
        return item;
      });
      const result = await saveImportSnapshot(currentImageHashes, toSave);
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

      <Modal
        visible={ocrRuleModalVisible}
        animationType="fade"
        transparent
        onRequestClose={closeOcrRuleModal}
      >
        <View style={styles.overlayMask}>
          <Pressable style={styles.overlayMaskTouch} onPress={closeOcrRuleModal} />
          <View style={styles.ocrRuleModalKeyboard}>
            <View style={styles.ocrRuleModalSheet}>
              <ScrollView
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.ocrRuleModalScroll}
              >
              <Text style={styles.ocrRuleModalTitle}>{ocrRuleEditingId ? "编辑规则" : "添加规则"}</Text>
              <Text style={styles.settingsSubLabel}>原文（锚点关键词）</Text>
              <Text style={styles.muted}>
                OCR 去掉空白后须包含这一段；金额自动取关键词之后出现的第一个数字（可与关键词紧挨或隔几个符号）。
              </Text>
              <TextInput
                value={ruleDraftSource}
                onChangeText={setRuleDraftSource}
                placeholder="如 创业板指、存款"
                placeholderTextColor="#94a3b8"
                style={styles.settingsFieldInput}
                autoCorrect={false}
                autoCapitalize="none"
                multiline
              />
              <Text style={styles.settingsSubLabel}>识别内容（金额名称默认值）</Text>
              <TextInput
                value={ruleDraftContent}
                onChangeText={setRuleDraftContent}
                placeholder="如 存款"
                placeholderTextColor="#94a3b8"
                style={styles.settingsFieldInput}
                autoCorrect={false}
              />
              <Text style={styles.settingsSubLabel}>资产分类</Text>
              <View style={styles.settingsOcrPickerWrap}>
                <View style={styles.classDisplayRow}>
                  <Text style={styles.classLabelText} numberOfLines={1}>
                    {ASSET_CLASS_LABEL[ruleDraftClass]}
                  </Text>
                  <Text style={styles.classArrowText}>▼</Text>
                </View>
                <Picker
                  mode="dialog"
                  selectedValue={ruleDraftClass}
                  onValueChange={(v) => setRuleDraftClass(v as AssetClass)}
                  style={styles.classPickerOverlay}
                >
                  {ASSET_CLASS_ORDER.map((c) => (
                    <Picker.Item key={c} label={ASSET_CLASS_LABEL[c]} value={c} />
                  ))}
                </Picker>
              </View>
              <Text style={styles.settingsSubLabel}>限定页面（防跨 App 误匹配）</Text>
              <View style={[styles.settingsOcrPickerWrap, styles.settingsOcrScopePickerWrap]}>
                <View style={styles.settingsScopeDisplayRow}>
                  <Text style={[styles.classLabelText, styles.settingsScopePickerLabel]} numberOfLines={2}>
                    {OCR_RULE_SCOPE_LABEL[ruleDraftScope]}
                  </Text>
                  <Text style={styles.classArrowText}>▼</Text>
                </View>
                <Picker
                  mode="dialog"
                  selectedValue={ruleDraftScope}
                  onValueChange={(v) => setRuleDraftScope(v as OcrRuleScreenScope)}
                  style={styles.classPickerOverlay}
                >
                  {OCR_RULE_SCOPE_ORDER.map((scope) => (
                    <Picker.Item key={scope} label={OCR_RULE_SCOPE_LABEL[scope]} value={scope} />
                  ))}
                </Picker>
              </View>
              <View style={styles.ocrRuleModalActions}>
                {ocrRuleEditingId ? (
                  <Pressable style={styles.ocrRuleModalDeleteButton} onPress={confirmDeleteOcrRuleInModal}>
                    <Text style={styles.ocrRuleModalDeleteText}>删除规则</Text>
                  </Pressable>
                ) : (
                  <View style={styles.ocrRuleModalActionsSpacer} />
                )}
                <View style={styles.ocrRuleModalActionsRight}>
                  <Pressable style={styles.ocrRuleModalSecondaryButton} onPress={closeOcrRuleModal}>
                    <Text style={styles.ocrRuleModalSecondaryText}>取消</Text>
                  </Pressable>
                  <Pressable style={styles.ocrRuleModalPrimaryButton} onPress={() => void handleSaveOcrCustomRuleFromModal()}>
                    <Text style={styles.ocrRuleModalPrimaryText}>保存</Text>
                  </Pressable>
                </View>
              </View>
              </ScrollView>
            </View>
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
          <Text style={styles.heroTotal}>{formatDisplayAmount(dailySummary.total)}</Text>
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
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.settingsScrollContent}
            showsVerticalScrollIndicator={false}
          >
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

          <View style={[styles.settingsCard, { backgroundColor: cardBackgroundColor }]}>
            <Text style={styles.settingsLabel}>自定义 OCR 识别规则</Text>
            <Text style={styles.muted}>
              规则保存在本机（netwise-ocr-custom-rules.json）。「原文」为锚点关键词（去空白后 OCR 须包含）；金额自动取该关键词之后出现的数字，无需与某笔固定金额一致。可选「限定页面」防跨 App 误匹配。
            </Text>
            {customRuleNotice ? (
              <Text style={customRuleNotice.includes("已保存") ? styles.muted : styles.warn}>{customRuleNotice}</Text>
            ) : null}
            {ocrCustomRules.length ? (
              <View style={styles.settingsRuleListSection}>
                <Text style={styles.settingsSubLabel}>已添加的规则</Text>
                <Text style={styles.muted}>点击一行可查看全文并编辑；下方按钮添加新规则。</Text>
                <View style={styles.assetTableHeaderRow}>
                  <View style={styles.ruleColSource}>
                    <Text style={styles.fieldCaption}>原文</Text>
                  </View>
                  <View style={styles.ruleColContent}>
                    <Text style={styles.fieldCaption}>识别内容</Text>
                  </View>
                  <View style={styles.ruleColClass}>
                    <Text style={styles.fieldCaption}>分类</Text>
                  </View>
                  <View style={styles.ruleColScope}>
                    <Text style={styles.fieldCaption}>限定页面</Text>
                  </View>
                </View>
                {ocrCustomRules.map((rule) => (
                  <Pressable
                    key={rule.id}
                    style={({ pressed }) => [styles.ruleListRowPress, pressed && styles.ruleListRowPressPressed]}
                    onPress={() => openOcrRuleModalForEdit(rule)}
                  >
                    <View style={styles.assetRow}>
                      <View style={styles.ruleColSource}>
                        <View style={styles.ruleListCellBox}>
                          <Text style={styles.ruleListCellText} numberOfLines={1} ellipsizeMode="tail">
                            {rule.sourceSnippet}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.ruleColContent}>
                        <View style={styles.ruleListCellBox}>
                          <Text style={styles.ruleListCellText} numberOfLines={1} ellipsizeMode="tail">
                            {rule.recognizedContent}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.ruleColClass}>
                        <View style={styles.ruleListCellBox}>
                          <Text style={styles.ruleListCellText} numberOfLines={1} ellipsizeMode="tail">
                            {ASSET_CLASS_LABEL[rule.assetClass]}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.ruleColScope}>
                        <View style={styles.ruleListCellBox}>
                          <Text style={styles.ruleListCellText} numberOfLines={1} ellipsizeMode="tail">
                            {OCR_RULE_SCOPE_LABEL[(rule.screenScope ?? "any") as OcrRuleScreenScope]}
                          </Text>
                        </View>
                      </View>
                    </View>
                  </Pressable>
                ))}
              </View>
            ) : (
              <Text style={styles.muted}>暂无自定义规则。点击下方按钮添加。</Text>
            )}
            <Pressable style={styles.securityActionButton} onPress={openOcrRuleModalForCreate}>
              <Text style={styles.securityActionButtonText}>添加规则</Text>
            </Pressable>
          </View>
          </ScrollView>
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
                  <Pressable style={styles.addRowButton} onPress={() => addManualAssetRow(group.uri)}>
                    <Text style={styles.addRowButtonText}>+ 手动添加一行</Text>
                  </Pressable>
                  {group.assets.length ? (
                    <View style={styles.assetTableHeaderRow}>
                      <View style={styles.assetNameColumn}>
                        <Text style={styles.fieldCaption}>金额名称</Text>
                      </View>
                      <View style={styles.assetAmountWrap}>
                        <Text style={styles.fieldCaption}>金额</Text>
                      </View>
                      <View style={styles.classPickerColumn}>
                        <Text style={styles.fieldCaption}>分类</Text>
                      </View>
                    </View>
                  ) : null}
                  {group.assets.map((asset) => (
                    <View style={styles.assetBlock} key={asset.localId}>
                      <View style={styles.assetRow}>
                        <View style={styles.assetNameColumn}>
                          <View style={styles.assetNameFieldWrap}>
                            <Pressable
                              style={styles.assetNameClearPress}
                              hitSlop={6}
                              onPress={() => confirmRemoveAssetRow(asset.localId)}
                            >
                              <Text style={styles.assetNameClearText}>×</Text>
                            </Pressable>
                            <TextInput
                              value={asset.name}
                              onChangeText={(value) => updateAssetName(asset.localId, value)}
                              style={styles.assetNameInput}
                              placeholder="金额名称"
                              placeholderTextColor="#94a3b8"
                            />
                          </View>
                        </View>
                        <View style={styles.assetAmountWrap}>
                          <TextInput
                            value={asset.amountInput}
                            onChangeText={(value) => updateAssetAmount(asset.localId, value)}
                            onBlur={() => validateAssetAmount(asset.localId)}
                            style={styles.assetAmountInput}
                            autoCorrect={false}
                            autoCapitalize="none"
                            placeholder="金额"
                            placeholderTextColor="#94a3b8"
                          />
                          {asset.amountError ? <Text style={styles.assetAmountErrorText}>{asset.amountError}</Text> : null}
                        </View>
                        <View style={styles.classPickerColumn}>
                          <View style={styles.classPickerWrap}>
                            <View style={styles.classDisplayRow}>
                              <Text
                                style={[styles.classLabelText, styles.parseClassPickerLabel]}
                                numberOfLines={1}
                                ellipsizeMode="tail"
                              >
                                {ASSET_CLASS_LABEL[asset.assetClass]}
                              </Text>
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
                      <Pressable style={styles.addRowButton} onPress={() => toggleOcrText(group.uri)}>
                        <Text style={styles.addRowButtonText}>
                          {expandedOcrUris.includes(group.uri) ? "收起 OCR 原文" : "查看 OCR 原文"}
                        </Text>
                      </Pressable>
                      {expandedOcrUris.includes(group.uri) ? (
                        <>
                          <Text style={styles.ocrSourceHint}>OCR 原文（长按可选中部分文字后复制）</Text>
                          <ScrollView
                            nestedScrollEnabled
                            style={styles.ocrSelectableScroll}
                            keyboardShouldPersistTaps="handled"
                          >
                            <Text selectable style={styles.ocrSelectableText}>
                              {group.meta.rawOcrText}
                            </Text>
                          </ScrollView>
                        </>
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
  assetTableHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    flexWrap: "nowrap",
    width: "100%",
    gap: 0,
    marginBottom: 4,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(29,78,216,0.12)"
  },
  assetRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "nowrap",
    width: "100%",
    gap: 0
  },
  assetBlock: {
    width: "100%",
    marginBottom: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(29,78,216,0.08)"
  },
  fieldCaption: {
    fontSize: 11,
    color: "#4f76b3",
    marginBottom: 4
  },
  assetNameColumn: {
    width: "33.33%",
    minWidth: 0,
    paddingRight: 4
  },
  classPickerColumn: {
    width: "33.34%",
    minWidth: 0,
    paddingLeft: 2
  },
  assetNameFieldWrap: {
    flex: 1,
    alignSelf: "stretch",
    position: "relative",
    minWidth: 0
  },
  assetNameClearPress: {
    position: "absolute",
    top: 3,
    left: 3,
    zIndex: 2,
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6
  },
  assetNameClearText: {
    color: "#94a3b8",
    fontSize: 20,
    fontWeight: "500",
    lineHeight: 22
  },
  addRowButton: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#e0edff",
    marginBottom: 8
  },
  addRowButtonText: {
    color: "#1d4ed8",
    fontSize: 12,
    fontWeight: "600"
  },
  assetNameInput: {
    alignSelf: "stretch",
    borderColor: "#b7d4fb",
    borderWidth: 1,
    borderRadius: 8,
    paddingLeft: 34,
    paddingRight: 8,
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
    width: "33.33%",
    minWidth: 0,
    paddingHorizontal: 2,
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
    width: "100%",
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
    gap: 6
  },
  ocrSourceHint: {
    fontSize: 12,
    color: "#64748b"
  },
  ocrSelectableScroll: {
    maxHeight: 220,
    minHeight: 120,
    borderColor: "#b7d4fb",
    borderWidth: 1,
    borderRadius: 10,
    backgroundColor: "#f8fbff",
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  ocrSelectableText: {
    color: "#163d7a",
    fontSize: 14,
    lineHeight: 22
  },
  classPickerWrap: {
    alignSelf: "stretch",
    width: "100%",
    minWidth: 0,
    height: 36,
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
    paddingHorizontal: 6
  },
  parseClassPickerLabel: {
    flex: 1,
    minWidth: 0,
    marginRight: 4
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
  settingsScrollContent: {
    gap: 12,
    paddingBottom: 32
  },
  settingsFieldInput: {
    borderWidth: 1,
    borderColor: "#b7d4fb",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "#f4f8ff",
    color: "#163d7a"
  },
  settingsOcrPickerWrap: {
    width: "100%",
    alignSelf: "stretch",
    minHeight: 36,
    borderRadius: 999,
    borderColor: "#bfdbfe",
    borderWidth: 1,
    overflow: "hidden",
    backgroundColor: "#dbeafe",
    justifyContent: "center"
  },
  settingsOcrScopePickerWrap: {
    minHeight: 44,
    paddingVertical: 4
  },
  settingsScopeDisplayRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    gap: 8
  },
  settingsScopePickerLabel: {
    flex: 1
  },
  settingsRuleListSection: {
    marginTop: 14,
    gap: 0
  },
  ruleColSource: {
    flex: 1.35,
    minWidth: 56
  },
  ruleColContent: {
    flex: 1,
    minWidth: 48
  },
  ruleColClass: {
    width: 40
  },
  ruleColScope: {
    flex: 1,
    minWidth: 56
  },
  ruleListRowPress: {
    marginBottom: 6,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(29,78,216,0.08)"
  },
  ruleListRowPressPressed: {
    opacity: 0.88
  },
  ruleListCellBox: {
    height: 44,
    borderColor: "#b7d4fb",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 6,
    backgroundColor: "#f4f8ff",
    justifyContent: "center",
    overflow: "hidden"
  },
  ruleListCellText: {
    color: "#163d7a",
    fontSize: 12,
    lineHeight: 16
  },
  ocrRuleModalKeyboard: {
    width: "100%",
    maxWidth: 420,
    alignSelf: "center",
    zIndex: 2,
    maxHeight: "88%"
  },
  ocrRuleModalSheet: {
    backgroundColor: "white",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 10,
    maxHeight: "100%"
  },
  ocrRuleModalScroll: {
    gap: 8,
    paddingBottom: 12
  },
  ocrRuleModalTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#163d7a",
    marginBottom: 4
  },
  ocrRuleModalActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
    gap: 10,
    flexWrap: "wrap"
  },
  ocrRuleModalActionsSpacer: {
    flex: 1,
    minWidth: 8
  },
  ocrRuleModalActionsRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  ocrRuleModalDeleteButton: {
    paddingVertical: 8,
    paddingHorizontal: 4
  },
  ocrRuleModalDeleteText: {
    color: "#dc2626",
    fontWeight: "600",
    fontSize: 14
  },
  ocrRuleModalSecondaryButton: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#bfdbfe",
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: "#f8fbff"
  },
  ocrRuleModalSecondaryText: {
    color: "#1d4ed8",
    fontWeight: "600",
    fontSize: 14
  },
  ocrRuleModalPrimaryButton: {
    borderRadius: 8,
    backgroundColor: "#2563eb",
    paddingVertical: 10,
    paddingHorizontal: 18
  },
  ocrRuleModalPrimaryText: {
    color: "white",
    fontWeight: "700",
    fontSize: 14
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
