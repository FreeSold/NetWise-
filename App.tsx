import { StatusBar as ExpoStatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Crypto from "expo-crypto";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { Picker } from "@react-native-picker/picker";
import { Alert, Image, Modal, Platform, Pressable, SafeAreaView, ScrollView, StatusBar as NativeStatusBar, Text, TextInput, View } from "react-native";
import { AppLockGate } from "./src/app/components/AppLockGate";
import { styles } from "./src/app/AppStyles";
import { formatOcrRuleScopeLabel } from "./src/app/formatOcrRuleScopeLabel";
import {
  ASSET_CLASS_LABEL,
  ASSET_CLASS_ORDER,
  EMPTY_PARSE_RESULT,
  OCR_RULE_SCOPE_LABEL,
  OCR_RULE_SCOPE_ORDER,
  PLATFORM_MODULE_LABEL,
  PLATFORM_TREND_LABEL,
  PLATFORM_TREND_ORDER,
  SCREEN_TYPE_LABEL,
  TREND_FILTER_LABEL,
  TREND_FILTER_ORDER
} from "./src/app/homeUiConstants";
import { MODULE_HINT_TEXT, alerts, common, errors, fmt, labels, notices, placeholders } from "./src/copy";
import {
  buildImportSnapshotPayload,
  inferMimeFromUri,
  validateEditableImportAmount,
  validateEditableImportName,
  type EditableAssetItem,
  type ImportedImageMeta
} from "./src/app/importSnapshot";
import {
  OCR_CUSTOM_MODULE_SCOPE_PREFIX,
  type AssetClass,
  type CustomRecognitionModule,
  type OcrCustomRule,
  type OcrRuleScreenScope,
  type ParsedAsset,
  type ParseResult
} from "./src/domain/types";
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
  clearAllImportHistory,
  clearCurrentDateData,
  clearSeedTestData,
  type DailySummary,
  ensureDevClientSeedTestDataOnce,
  initAssetHistoryDb,
  queryCombinedLatestSummary,
  queryTrendDashboardBundle,
  type PlatformTrendFilter,
  exportPersistedSnapshotsJsonForDebug,
  resolveSnapshotBucketIdFromParseResult,
  saveImportSnapshot,
  type SnapshotAssetBucket,
  seedDefaultModuleTestData,
  type TrendFilter,
  type TrendPoint,
  type TrendSeriesBreakdown
} from "./src/storage/assetHistoryDb";
import { loadCustomRecognitionModules, saveCustomRecognitionModules } from "./src/storage/customRecognitionModulesStore";
import { loadOcrCustomRules, normalizeOcrRuleScreenScope, saveOcrCustomRules } from "./src/storage/ocrCustomRulesStore";
import { splitRecognitionKeywords } from "./src/utils/splitRecognitionKeywords";

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
  const [seedTestBusy, setSeedTestBusy] = useState(false);
  /** 由设置「测试数据」开关：控制首页折线 JSON、导入预览、已存快照等调试块 */
  const [debugJsonDumpsVisible, setDebugJsonDumpsVisible] = useState(false);
  const [moduleHintPopover, setModuleHintPopover] = useState<{ title: string; body: string } | null>(null);
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
  /** 各折线卡片独立的展示类型，key：trend-main / platform-alipay / platform-cmb / platform-wechat / cm-模块id */
  const [trendFiltersByModule, setTrendFiltersByModule] = useState<Record<string, TrendFilter>>({});
  /** 当前展开「折线类型」下拉的卡片 key，null 表示全关 */
  const [trendMenuFor, setTrendMenuFor] = useState<string | null>(null);
  const [trendPoints, setTrendPoints] = useState<TrendPoint[]>([]);
  const [mainTrendBreakdown, setMainTrendBreakdown] = useState<TrendSeriesBreakdown[] | undefined>(undefined);
  const [platformTrendPoints, setPlatformTrendPoints] = useState<Record<PlatformTrendFilter, TrendPoint[]>>({
    alipay: [],
    cmb: [],
    wechat: []
  });
  const [platformTrendBreakdown, setPlatformTrendBreakdown] = useState<
    Record<PlatformTrendFilter, TrendSeriesBreakdown[] | undefined>
  >({
    alipay: undefined,
    cmb: undefined,
    wechat: undefined
  });
  const [visiblePlatformModules, setVisiblePlatformModules] = useState<PlatformTrendFilter[]>(PLATFORM_TREND_ORDER);
  const [cardOpacityPercent, setCardOpacityPercent] = useState(86);
  const opacityBarWidthRef = useRef(0);
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
  const [customRecognitionModules, setCustomRecognitionModules] = useState<CustomRecognitionModule[]>([]);
  const [hiddenCustomModuleIds, setHiddenCustomModuleIds] = useState<string[]>([]);
  const [customModuleTrendPoints, setCustomModuleTrendPoints] = useState<Record<string, TrendPoint[]>>({});
  const [customModuleTrendBreakdown, setCustomModuleTrendBreakdown] = useState<
    Record<string, TrendSeriesBreakdown[] | undefined>
  >({});
  const [customModuleWizardVisible, setCustomModuleWizardVisible] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [wizardUri, setWizardUri] = useState<string | null>(null);
  const [wizardOcrText, setWizardOcrText] = useState("");
  const [wizardKeywordsText, setWizardKeywordsText] = useState("");
  const [wizardModuleName, setWizardModuleName] = useState("");
  const [wizardOcrExpanded, setWizardOcrExpanded] = useState(false);
  const [wizardOcrLoading, setWizardOcrLoading] = useState(false);
  const [wizardError, setWizardError] = useState<string | null>(null);
  const [customModuleNotice, setCustomModuleNotice] = useState<string | null>(null);
  const [customModuleConfigVisible, setCustomModuleConfigVisible] = useState(false);
  const [customModuleConfigEditingId, setCustomModuleConfigEditingId] = useState<string | null>(null);
  const [editCmDisplayName, setEditCmDisplayName] = useState("");
  const [editCmKeywordsText, setEditCmKeywordsText] = useState("");
  const [editCmError, setEditCmError] = useState<string | null>(null);
  const [editCmSaving, setEditCmSaving] = useState(false);
  const [persistedSnapshotsDebugText, setPersistedSnapshotsDebugText] = useState("");
  const [persistedSnapshotsDebugBusy, setPersistedSnapshotsDebugBusy] = useState(false);

  const cashAmount = dailySummary.byClass.cash;
  const fundAmount = dailySummary.byClass.fund;
  const insuranceAmount = dailySummary.byClass.insurance;
  const stockAmount = dailySummary.byClass.stock;
  const wealthManagementAmount = dailySummary.byClass.wealth_management;
  const cardAlpha = Math.max(0.3, Math.min(1, cardOpacityPercent / 100));
  const cardBackgroundColor = `rgba(255,255,255,${cardAlpha})`;
  /** 与卡片同步：槽用同一白底 alpha；填充条蓝色 alpha 随卡片透明度变化 */
  const opacityTrackFillColor = `rgba(59,130,246,${Math.min(1, 0.38 + cardAlpha * 0.62)})`;
  /** 卡片 30%～100% 映射到控件 50%～100%，与卡片透明度联动且不单独展示 */
  const moduleControlOpacity = 0.5 + ((cardOpacityPercent - 30) / 70) * 0.5;
  const modulePressOpacityStyle = (factor = 1) => ({ opacity: moduleControlOpacity * factor });
  const hiddenPlatformModules = PLATFORM_TREND_ORDER.filter((platform) => !visiblePlatformModules.includes(platform));

  function renderModuleInfoIcon(title: string, body: string, useModuleOpacity = false) {
    return (
      <Pressable
        style={[styles.moduleInfoIconHit, useModuleOpacity ? modulePressOpacityStyle() : null]}
        onPress={() => setModuleHintPopover({ title, body })}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={fmt.moduleInfoAccessibilityLabel(title)}
      >
        <Text style={styles.moduleInfoIconChar}>i</Text>
      </Pressable>
    );
  }

  /** 打开折线类型菜单时抬高整张卡片，避免被下方卡片的下拉控件盖住 */
  function trendCardMenuLiftStyle(menuKey: string) {
    return trendMenuFor === menuKey ? styles.trendCardMenuLift : null;
  }

  function trendFilterForMenuKey(menuKey: string): TrendFilter {
    return trendFiltersByModule[menuKey] ?? "all";
  }

  function renderTrendTypePicker(menuKey: string) {
    const menuOpen = trendMenuFor === menuKey;
    const selected = trendFilterForMenuKey(menuKey);
    return (
      <View style={styles.trendPickerArea}>
        <Pressable
          style={[styles.trendPickerWrap, modulePressOpacityStyle()]}
          onPress={() => setTrendMenuFor((prev) => (prev === menuKey ? null : menuKey))}
        >
          <Text style={styles.trendPickerLabel}>{TREND_FILTER_LABEL[selected]}</Text>
          <Text style={styles.trendPickerArrow}>▼</Text>
        </Pressable>
        {menuOpen ? (
          <View style={[styles.trendDropdownMenu, modulePressOpacityStyle()]}>
            {TREND_FILTER_ORDER.map((f) => (
              <Pressable
                key={f}
                style={[styles.trendDropdownItem, f === selected ? styles.trendDropdownItemActive : null]}
                onPress={() => {
                  setTrendFiltersByModule((prev) => {
                    const cur = prev[menuKey] ?? "all";
                    if (cur === f) {
                      return prev;
                    }
                    return { ...prev, [menuKey]: f };
                  });
                  setTrendMenuFor(null);
                }}
              >
                <Text
                  style={[
                    styles.trendDropdownItemText,
                    f === selected ? styles.trendDropdownItemTextActive : null
                  ]}
                >
                  {TREND_FILTER_LABEL[f]}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
    );
  }

  /** 固定高度 + 内层 ScrollView，避免嵌在外层 ScrollView 里时只读 TextInput 无法纵向滚动 */
  function renderDebugJsonScroll(text: string, variant: "default" | "tall" = "default") {
    return (
      <ScrollView
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
        style={variant === "tall" ? [styles.debugDumpScrollBox, styles.debugDumpScrollBoxTall] : styles.debugDumpScrollBox}
        contentContainerStyle={styles.debugDumpScrollContent}
      >
        <Text style={styles.debugDumpMonoText} selectable>
          {text}
        </Text>
      </ScrollView>
    );
  }

  const visibleCustomRecognitionModules = customRecognitionModules.filter((m) => !hiddenCustomModuleIds.includes(m.id));
  const hiddenCustomRecognitionModules = customRecognitionModules.filter((m) => hiddenCustomModuleIds.includes(m.id));
  const currentImageHashes = importedImageMetas.map((item) => item.hash);

  const compileImportSnapshotPayload = useCallback(
    () => buildImportSnapshotPayload(editableAssets, importedImageMetas, currentImageHashes),
    [editableAssets, importedImageMetas, currentImageHashes]
  );

  const pendingSaveDebugText = useMemo(() => {
    if (!editableAssets.length) {
      return fmt.debugPendingSaveEmpty;
    }
    try {
      const { validationErrors, assetBuckets, ocrTextsForSave } = compileImportSnapshotPayload();
      const bucketTotals: Record<string, number> = {};
      for (const b of assetBuckets) {
        const sum = b.assets.reduce((s, a) => s + (Number.isFinite(a.amount) ? a.amount : 0), 0);
        bucketTotals[b.bucketId] = Math.round(sum * 100) / 100;
      }
      const grandTotalAllBuckets = Math.round(Object.values(bucketTotals).reduce((s, v) => s + v, 0) * 100) / 100;
      return JSON.stringify(
        {
          validationErrors,
          imageHashes: currentImageHashes,
          assetBuckets,
          bucketTotals,
          grandTotalAllBuckets,
          ocrTextLengths: ocrTextsForSave.map((t) => t.length),
          ocrTextPreview: ocrTextsForSave.map((t) => fmt.ocrTextPreviewInJson(t))
        },
        null,
        2
      );
    } catch (e) {
      return fmt.debugPreviewFailed(e instanceof Error ? e.message : String(e));
    }
  }, [compileImportSnapshotPayload]);

  const trendChartsStructureDebugText = useMemo(() => {
    try {
      return {
        trendMain: JSON.stringify(
          {
            filter: trendFiltersByModule["trend-main"] ?? "all",
            points: trendPoints,
            breakdownByClass: mainTrendBreakdown ?? null
          },
          null,
          2
        ),
        platformAlipay: JSON.stringify(
          {
            filter: trendFiltersByModule["platform-alipay"] ?? "all",
            points: platformTrendPoints.alipay,
            breakdownByClass: platformTrendBreakdown.alipay ?? null
          },
          null,
          2
        ),
        platformCmb: JSON.stringify(
          {
            filter: trendFiltersByModule["platform-cmb"] ?? "all",
            points: platformTrendPoints.cmb,
            breakdownByClass: platformTrendBreakdown.cmb ?? null
          },
          null,
          2
        ),
        platformWechat: JSON.stringify(
          {
            filter: trendFiltersByModule["platform-wechat"] ?? "all",
            points: platformTrendPoints.wechat,
            breakdownByClass: platformTrendBreakdown.wechat ?? null
          },
          null,
          2
        ),
        customModules: Object.fromEntries(
          customRecognitionModules.map((m) => [
            m.id,
            JSON.stringify(
              {
                displayName: m.displayName,
                filter: trendFiltersByModule[`cm-${m.id}`] ?? "all",
                points: customModuleTrendPoints[m.id] ?? [],
                breakdownByClass: customModuleTrendBreakdown[m.id] ?? null
              },
              null,
              2
            )
          ])
        ) as Record<string, string>
      };
    } catch (e) {
      const msg = fmt.debugSerializeFailed(e instanceof Error ? e.message : String(e));
      return {
        trendMain: msg,
        platformAlipay: msg,
        platformCmb: msg,
        platformWechat: msg,
        customModules: {}
      };
    }
  }, [
    trendFiltersByModule,
    trendPoints,
    mainTrendBreakdown,
    platformTrendPoints,
    platformTrendBreakdown,
    customModuleTrendPoints,
    customModuleTrendBreakdown,
    customRecognitionModules
  ]);

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
        const summary = await queryCombinedLatestSummary([]);
        setDailySummary(summary);
        setDbReady(true);
        setDbInitError(null);
      } catch (error) {
        const message = error instanceof Error ? error.message : errors.unknownDb;
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
        await refreshTrendData();
      } catch (error) {
        console.error("TREND_LOAD_FAILED", error);
      }
    }
    void loadTrend();
  }, [dbReady, trendFiltersByModule, customRecognitionModules]);

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
        const message = error instanceof Error ? error.message : errors.rulesLoadFailed;
        setCustomRuleNotice(message);
      }
    })();
  }, [appUnlocked]);

  useEffect(() => {
    if (!appUnlocked) {
      return;
    }
    void (async () => {
      try {
        const { modules, hiddenIds } = await loadCustomRecognitionModules();
        setCustomRecognitionModules(modules);
        setHiddenCustomModuleIds(hiddenIds);
        setCustomModuleNotice(null);
      } catch (error) {
        const message = error instanceof Error ? error.message : errors.customModulesLoadFailed;
        setCustomModuleNotice(message);
      }
    })();
  }, [appUnlocked]);

  useEffect(() => {
    if (!dbReady || !appUnlocked) {
      return;
    }
    void refreshTrendData();
  }, [dbReady, appUnlocked, trendFiltersByModule, customRecognitionModules]);

  useEffect(() => {
    if (!dbReady || !appUnlocked) {
      return;
    }
    void (async () => {
      try {
        const seeded = await ensureDevClientSeedTestDataOnce();
        if (seeded) {
          await refreshTrendData();
        }
      } catch (error) {
        console.warn("DEV_CLIENT_SEED_TEST_DATA_FAILED", error);
      }
    })();
  }, [dbReady, appUnlocked, trendFiltersByModule, customRecognitionModules]);

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

  async function refreshTrendData() {
    const tf = trendFiltersByModule;
    const mainF = tf["trend-main"] ?? "all";
    const bundle = await queryTrendDashboardBundle(customRecognitionModules, {
      mainTrendFilter: mainF,
      platform: {
        alipay: tf["platform-alipay"] ?? "all",
        cmb: tf["platform-cmb"] ?? "all",
        wechat: tf["platform-wechat"] ?? "all"
      },
      customModuleFilterById: Object.fromEntries(
        customRecognitionModules.map((m) => [m.id, tf[`cm-${m.id}`] ?? "all"])
      )
    });
    setTrendPoints(bundle.mainTrend);
    setMainTrendBreakdown(bundle.mainBreakdown?.length ? bundle.mainBreakdown : undefined);
    setDailySummary(bundle.heroSummary);
    setPlatformTrendPoints({
      alipay: bundle.platform.alipay.primary,
      cmb: bundle.platform.cmb.primary,
      wechat: bundle.platform.wechat.primary
    });
    setPlatformTrendBreakdown({
      alipay: bundle.platform.alipay.breakdown,
      cmb: bundle.platform.cmb.breakdown,
      wechat: bundle.platform.wechat.breakdown
    });
    const pts: Record<string, TrendPoint[]> = {};
    const br: Record<string, TrendSeriesBreakdown[] | undefined> = {};
    for (const m of customRecognitionModules) {
      const row = bundle.customByModuleId[m.id];
      pts[m.id] = row?.primary ?? [];
      br[m.id] = row?.breakdown?.length ? row.breakdown : undefined;
    }
    setCustomModuleTrendPoints(pts);
    setCustomModuleTrendBreakdown(br);
  }

  async function refreshPersistedSnapshotsDebug() {
    if (!dbReady) {
      setPersistedSnapshotsDebugText(notices.debugDbNotReady);
      return;
    }
    setPersistedSnapshotsDebugBusy(true);
    try {
      const json = await exportPersistedSnapshotsJsonForDebug(500);
      setPersistedSnapshotsDebugText(json);
    } catch (e) {
      setPersistedSnapshotsDebugText(e instanceof Error ? e.message : String(e));
    } finally {
      setPersistedSnapshotsDebugBusy(false);
    }
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
    return validateEditableImportName(name);
  }

  function getAmountValidationMessage(amountInput: string): string | null {
    return validateEditableImportAmount(amountInput);
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
    Alert.alert(alerts.deleteRow.title, alerts.deleteRow.message, [
      { text: common.cancel, style: "cancel" },
      { text: common.delete, style: "destructive", onPress: () => removeEditableAsset(localId) }
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
      setCustomRuleNotice(notices.customRuleFillSourceAndContent);
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
      setCustomRuleNotice(notices.customRuleSaved);
      setTimeout(() => setCustomRuleNotice(null), 2000);
      closeOcrRuleModal();
    } catch (error) {
      const message = error instanceof Error ? error.message : errors.saveFailed;
      setCustomRuleNotice(message);
    }
  }

  async function handleRemoveOcrCustomRule(id: string) {
    const next = ocrCustomRules.filter((r) => r.id !== id);
    setOcrCustomRules(next);
    try {
      await saveOcrCustomRules(next);
    } catch (error) {
      const message = error instanceof Error ? error.message : errors.saveAfterDeleteFailed;
      setCustomRuleNotice(message);
    }
  }

  function confirmDeleteOcrRuleInModal() {
    const id = ocrRuleEditingId;
    if (!id) {
      return;
    }
    Alert.alert(alerts.deleteRule.title, alerts.deleteRule.message, [
      { text: common.cancel, style: "cancel" },
      {
        text: common.delete,
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

  async function moveCustomModuleToHidden(moduleId: string) {
    const loaded = await loadCustomRecognitionModules();
    const nextHidden = loaded.hiddenIds.includes(moduleId) ? loaded.hiddenIds : [...loaded.hiddenIds, moduleId];
    setHiddenCustomModuleIds(nextHidden);
    await saveCustomRecognitionModules({ modules: loaded.modules, hiddenIds: nextHidden });
  }

  async function moveCustomModuleToVisible(moduleId: string) {
    const loaded = await loadCustomRecognitionModules();
    const nextHidden = loaded.hiddenIds.filter((id) => id !== moduleId);
    setHiddenCustomModuleIds(nextHidden);
    await saveCustomRecognitionModules({ modules: loaded.modules, hiddenIds: nextHidden });
  }

  function openCustomModuleConfig(m: CustomRecognitionModule) {
    setEditCmError(null);
    setCustomModuleConfigEditingId(m.id);
    setEditCmDisplayName(m.displayName);
    setEditCmKeywordsText(m.keywords.join(" "));
    setCustomModuleConfigVisible(true);
  }

  function closeCustomModuleConfig() {
    setCustomModuleConfigVisible(false);
    setCustomModuleConfigEditingId(null);
    setEditCmDisplayName("");
    setEditCmKeywordsText("");
    setEditCmError(null);
  }

  async function saveCustomModuleConfig() {
    const id = customModuleConfigEditingId;
    if (!id) {
      return;
    }
    const name = editCmDisplayName.trim();
    const keywords = splitRecognitionKeywords(editCmKeywordsText);
    if (!name) {
      setEditCmError(notices.customModuleDisplayNameRequired);
      return;
    }
    if (!keywords.length) {
      setEditCmError(notices.customModuleKeywordsRequired);
      return;
    }
    setEditCmSaving(true);
    setEditCmError(null);
    try {
      const loaded = await loadCustomRecognitionModules();
      const idx = loaded.modules.findIndex((x) => x.id === id);
      if (idx < 0) {
        setEditCmError(notices.customModuleMissing);
        return;
      }
      const nextModules = [...loaded.modules];
      nextModules[idx] = { id, displayName: name, keywords };
      await saveCustomRecognitionModules({ modules: nextModules, hiddenIds: loaded.hiddenIds });
      setCustomRecognitionModules(nextModules);
      setHiddenCustomModuleIds(loaded.hiddenIds);
      await refreshTrendData();
      setCustomModuleNotice(notices.customModuleSaved);
      setTimeout(() => setCustomModuleNotice(null), 2000);
      closeCustomModuleConfig();
    } catch (error) {
      setEditCmError(error instanceof Error ? error.message : errors.saveFailed);
    } finally {
      setEditCmSaving(false);
    }
  }

  function confirmDeleteCustomModule() {
    const id = customModuleConfigEditingId;
    if (!id) {
      return;
    }
    const name = editCmDisplayName.trim() || notices.defaultModuleName;
    Alert.alert(alerts.deleteCustomModule.title, fmt.deleteCustomModuleBody(name), [
      { text: common.cancel, style: "cancel" },
      { text: common.delete, style: "destructive", onPress: () => void executeDeleteCustomModule(id) }
    ]);
  }

  async function executeDeleteCustomModule(id: string) {
    setEditCmSaving(true);
    setEditCmError(null);
    try {
      const loaded = await loadCustomRecognitionModules();
      const nextModules = loaded.modules.filter((x) => x.id !== id);
      const nextHidden = loaded.hiddenIds.filter((hid) => hid !== id);
      await saveCustomRecognitionModules({ modules: nextModules, hiddenIds: nextHidden });
      setCustomRecognitionModules(nextModules);
      setHiddenCustomModuleIds(nextHidden);
      await refreshTrendData();
      setCustomModuleNotice(notices.customModuleDeleted);
      setTimeout(() => setCustomModuleNotice(null), 2000);
      closeCustomModuleConfig();
    } catch (error) {
      setEditCmError(error instanceof Error ? error.message : errors.deleteFailed);
    } finally {
      setEditCmSaving(false);
    }
  }

  function resetCustomModuleWizard() {
    setWizardStep(1);
    setWizardUri(null);
    setWizardOcrText("");
    setWizardKeywordsText("");
    setWizardModuleName("");
    setWizardOcrExpanded(false);
    setWizardOcrLoading(false);
    setWizardError(null);
  }

  function openCustomModuleWizard() {
    resetCustomModuleWizard();
    setCustomModuleWizardVisible(true);
  }

  function closeCustomModuleWizard() {
    setCustomModuleWizardVisible(false);
    resetCustomModuleWizard();
  }

  async function wizardPickSingleFromGallery() {
    setWizardError(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setWizardError(notices.wizardNoAlbumPermission);
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: false,
      allowsEditing: false,
      quality: 1
    });
    if (picked.canceled || !picked.assets[0]) {
      return;
    }
    const localUri = await ensureLocalImportUri(picked.assets[0].uri, picked.assets[0].fileName ?? null);
    setWizardUri(localUri);
  }

  async function wizardPickSingleFromFiles() {
    setWizardError(null);
    const picked = await DocumentPicker.getDocumentAsync({
      type: ["image/*"],
      copyToCacheDirectory: true
    });
    if (picked.canceled || !picked.assets?.[0]) {
      return;
    }
    const asset = picked.assets[0];
    const localUri = await ensureLocalImportUri(asset.uri, asset.name ?? null);
    setWizardUri(localUri);
  }

  async function wizardEnterStep2RunOcr() {
    if (!wizardUri) {
      setWizardError(notices.wizardPickImageFirst);
      return;
    }
    setWizardStep(2);
    setWizardOcrLoading(true);
    setWizardError(null);
    setWizardOcrExpanded(false);
    try {
      const text = await recognizeTextFromImage(wizardUri);
      setWizardOcrText(text);
      setWizardKeywordsText(text);
    } catch (error) {
      setWizardError(formatOcrError(error));
    } finally {
      setWizardOcrLoading(false);
    }
  }

  function wizardGoNext() {
    if (wizardStep === 1) {
      void wizardEnterStep2RunOcr();
      return;
    }
    if (wizardStep === 2) {
      if (wizardOcrLoading) {
        return;
      }
      if (!wizardOcrText.trim()) {
        setWizardError(notices.wizardOcrFirst);
        return;
      }
      setWizardError(null);
      setWizardStep(3);
      return;
    }
    if (wizardStep === 3) {
      const k = splitRecognitionKeywords(wizardKeywordsText);
      if (!k.length) {
        setWizardError(notices.wizardKeywordsRequired);
        return;
      }
      setWizardError(null);
      setWizardStep(4);
      return;
    }
    if (wizardStep === 4) {
      if (!wizardModuleName.trim()) {
        setWizardError(notices.wizardModuleNameRequired);
        return;
      }
      setWizardError(null);
      setWizardStep(5);
    }
  }

  function wizardGoPrev() {
    setWizardError(null);
    if (wizardStep <= 1) {
      return;
    }
    if (wizardStep === 2) {
      setWizardStep(1);
      return;
    }
    setWizardStep((s) => Math.max(1, s - 1));
  }

  async function submitCustomRecognitionModule() {
    const keywords = splitRecognitionKeywords(wizardKeywordsText);
    if (!keywords.length || !wizardModuleName.trim()) {
      setWizardError(notices.wizardIncomplete);
      return;
    }
    const id = `cm-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const loaded = await loadCustomRecognitionModules();
    const nextModules = [...loaded.modules, { id, displayName: wizardModuleName.trim(), keywords }];
    try {
      await saveCustomRecognitionModules({ modules: nextModules, hiddenIds: loaded.hiddenIds });
      setCustomRecognitionModules(nextModules);
      setHiddenCustomModuleIds(loaded.hiddenIds);
      await refreshTrendData();
      closeCustomModuleWizard();
      setCustomModuleNotice(notices.customModuleAdded);
      setTimeout(() => setCustomModuleNotice(null), 2000);
    } catch (error) {
      setWizardError(error instanceof Error ? error.message : errors.saveFailed);
    }
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
    const rawMessage = error instanceof Error ? error.message : errors.ocrGeneric;
    if (rawMessage.includes("doesn't seem to be linked")) {
      return errors.ocrNotInBuild;
    }
    if (rawMessage.includes("Network request failed")) {
      return errors.ocrNetwork;
    }
    if (rawMessage.includes("OCR request failed")) {
      return fmt.ocrRequestFailed(rawMessage);
    }
    if (rawMessage.includes("empty text")) {
      return errors.ocrEmptyText;
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
      if (typeof __DEV__ !== "undefined" && __DEV__) {
        console.log("[OCR_FULL_TEXT_BEGIN]\n" + text + "\n[OCR_FULL_TEXT_END]");
      }
      const parsedResult = parseOcrText(text, ocrCustomRules, customRecognitionModules);
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
      setOcrError(notices.ocrMaxImages);
      return;
    }
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setOcrError(notices.ocrNoAlbumPermission);
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
      setOcrError(notices.ocrMaxImages);
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
      setSaveNotice(dbInitError ? fmt.dbInitFailed(dbInitError) : notices.saveDbInitWait);
      return;
    }
    if (!currentImageHashes.length) {
      setSaveNotice(notices.saveImportFirst);
      return;
    }
    if (!editableAssets.length) {
      setSaveNotice(notices.saveNoAssets);
      return;
    }
    setSaveLoading(true);
    setSaveNotice(notices.saveInProgress);
    try {
      const { validationErrors, assetBuckets, ocrTextsForSave } = compileImportSnapshotPayload();
      setEditableAssets((prev) =>
        prev.map((asset) => ({
          ...asset,
          amountError: getAmountValidationMessage(asset.amountInput)
        }))
      );
      if (validationErrors.length) {
        setSaveNotice(fmt.saveFailedLine(validationErrors[0]));
        setSaveLoading(false);
        return;
      }
      const result = await saveImportSnapshot(currentImageHashes, assetBuckets, ocrTextsForSave);
      setSaveNotice(result.saved ? fmt.savedSnapshot(result.date) : notices.saveDuplicateToday);
      await refreshTrendData();
      resetWorkingImport();
      setManageVisible(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : errors.unknownSave;
      console.error("SAVE_IMPORT_FAILED", error);
      setSaveNotice(fmt.saveFailedLine(message));
    } finally {
      setSaveLoading(false);
    }
  }

  async function handleClearData() {
    if (clearMode === "today") {
      await clearCurrentDateData();
      setSaveNotice(notices.saveClearedToday);
    } else if (clearMode === "all") {
      if (!clearAllStep2) {
        setClearAllStep2(true);
        return;
      }
      await clearAllImportHistory();
      setSaveNotice(notices.saveClearedAll);
    }
    await refreshTrendData();
    resetWorkingImport();
    setClearMode(null);
    setClearAllStep2(false);
  }

  function promptWriteSeedTestData() {
    if (!dbReady || seedTestBusy) {
      return;
    }
    Alert.alert(alerts.seedWrite.title, alerts.seedWrite.message, [
      { text: common.cancel, style: "cancel" },
      { text: alerts.seedWrite.confirm, style: "destructive", onPress: () => void executeWriteSeedTestData() }
    ]);
  }

  async function executeWriteSeedTestData() {
    if (!dbReady || seedTestBusy) {
      return;
    }
    setSeedTestBusy(true);
    try {
      await seedDefaultModuleTestData();
      await refreshTrendData();
      Alert.alert(alerts.seedWritten.title, alerts.seedWritten.message);
    } catch (error) {
      const message = error instanceof Error ? error.message : errors.unknown;
      Alert.alert(alerts.seedWriteFailedTitle, message);
    } finally {
      setSeedTestBusy(false);
    }
  }

  function promptClearSeedTestData() {
    if (!dbReady || seedTestBusy) {
      return;
    }
    Alert.alert(alerts.seedClear.title, alerts.seedClear.message, [
      { text: common.cancel, style: "cancel" },
      { text: alerts.seedClear.confirm, onPress: () => void executeClearSeedTestData() }
    ]);
  }

  async function executeClearSeedTestData() {
    if (!dbReady || seedTestBusy) {
      return;
    }
    setSeedTestBusy(true);
    try {
      const removed = await clearSeedTestData();
      await refreshTrendData();
      Alert.alert(alerts.seedClearDoneTitle, fmt.seedCleared(removed));
    } catch (error) {
      const message = error instanceof Error ? error.message : errors.unknown;
      Alert.alert(alerts.seedClearFailedTitle, message);
    } finally {
      setSeedTestBusy(false);
    }
  }

  function updateCardOpacity(next: number) {
    setCardOpacityPercent(Math.max(30, Math.min(100, next)));
  }

  function applyOpacityFromBarX(x: number, width: number) {
    if (width <= 0) {
      return;
    }
    const clamped = Math.max(0, Math.min(width, x));
    const ratio = clamped / width;
    const value = Math.round(30 + ratio * 70);
    updateCardOpacity(value);
  }

  async function handlePasscodeSubmit() {
    if (securityBusy) {
      return;
    }

    setUnlockError(null);
    const trimmedPasscode = passcodeInput.trim();
    if (!/^\d{6}$/.test(trimmedPasscode)) {
      setUnlockError(notices.unlockPasscodeLength);
      return;
    }

    setSecurityBusy(true);
    try {
      if (!hasPasscodeConfigured) {
        if (trimmedPasscode !== passcodeConfirmInput.trim()) {
          setUnlockError(notices.unlockPasscodeMismatch);
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
        setUnlockError(notices.unlockWrongPasscode);
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

  if (!securityReady || !appUnlocked) {
    return (
      <AppLockGate
        androidTopInset={androidTopInset}
        securityReady={securityReady}
        appUnlocked={appUnlocked}
        hasPasscodeConfigured={hasPasscodeConfigured}
        biometricAvailable={biometricAvailable}
        biometricEnabled={biometricEnabled}
        securityBusy={securityBusy}
        passcodeInput={passcodeInput}
        passcodeConfirmInput={passcodeConfirmInput}
        unlockError={unlockError}
        onChangePasscode={setPasscodeInput}
        onChangePasscodeConfirm={setPasscodeConfirmInput}
        onPasscodeSubmit={handlePasscodeSubmit}
        onBiometricUnlock={handleBiometricUnlock}
      />
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ExpoStatusBar style="auto" />
      <Modal
        visible={moduleHintPopover !== null}
        animationType="fade"
        transparent
        onRequestClose={() => setModuleHintPopover(null)}
      >
        <View style={styles.overlayMask}>
          <Pressable style={styles.overlayMaskTouch} onPress={() => setModuleHintPopover(null)} />
          <View style={styles.moduleHintPopoverCard}>
            <Text style={styles.moduleHintPopoverTitle}>{moduleHintPopover?.title}</Text>
            <ScrollView
              style={styles.moduleHintPopoverScroll}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.moduleHintPopoverBody}>{moduleHintPopover?.body}</Text>
            </ScrollView>
            <Pressable style={styles.moduleHintPopoverOk} onPress={() => setModuleHintPopover(null)}>
              <Text style={styles.moduleHintPopoverOkText}>{common.ok}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        visible={sourceModalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setSourceModalVisible(false)}
      >
        <View style={styles.overlayMask}>
          <Pressable style={styles.overlayMaskTouch} onPress={() => setSourceModalVisible(false)} />
          <View style={styles.sourceSheet}>
            <Text style={styles.sourceTitle}>{labels.sourceSheetTitle}</Text>
            <Pressable style={styles.sheetButton} onPress={handlePickAndRecognize}>
              <Text style={styles.sheetButtonText}>{labels.pickFromAlbum}</Text>
            </Pressable>
            <Pressable style={styles.sheetButton} onPress={handlePickFromFiles}>
              <Text style={styles.sheetButtonText}>{labels.pickFromFiles}</Text>
            </Pressable>
            <Pressable style={styles.sheetCancelButton} onPress={() => setSourceModalVisible(false)}>
              <Text style={styles.sheetCancelButtonText}>{common.cancel}</Text>
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
            <Text style={styles.previewReselectButtonText}>{labels.previewReselect}</Text>
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
            <View style={styles.sourceTitleHintRow}>
              <Text style={[styles.sourceTitle, styles.sourceTitleFlex]}>
                {clearMode === "all" && clearAllStep2 ? labels.clearDataTitleStep2 : labels.clearDataTitleStep1}
              </Text>
              {renderModuleInfoIcon(
                labels.clearDataHintTitle,
                clearMode === "today" ? MODULE_HINT_TEXT.clearToday : MODULE_HINT_TEXT.clearAll
              )}
            </View>
            <Pressable style={styles.sheetButton} onPress={handleClearData}>
              <Text style={styles.sheetButtonText}>{clearMode === "all" && !clearAllStep2 ? labels.clearDataNext : labels.clearDataConfirm}</Text>
            </Pressable>
            <Pressable
              style={styles.sheetCancelButton}
              onPress={() => {
                setClearMode(null);
                setClearAllStep2(false);
              }}
            >
              <Text style={styles.sheetCancelButtonText}>{common.cancel}</Text>
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
              <Text style={styles.ocrRuleModalTitle}>{ocrRuleEditingId ? labels.ocrRuleModalEdit : labels.ocrRuleModalAdd}</Text>
              <View style={styles.settingsSubLabelHintRow}>
                <Text style={styles.settingsSubLabel}>{labels.ocrRuleSourceCaption}</Text>
                {renderModuleInfoIcon(labels.ocrRuleSourceCaption, MODULE_HINT_TEXT.ocrRuleSource)}
              </View>
              <TextInput
                value={ruleDraftSource}
                onChangeText={setRuleDraftSource}
                placeholder={placeholders.ocrRuleSourceExample}
                placeholderTextColor="#94a3b8"
                style={styles.settingsFieldInput}
                autoCorrect={false}
                autoCapitalize="none"
                multiline
              />
              <Text style={styles.settingsSubLabel}>{labels.ocrRuleRecognizedCaption}</Text>
              <TextInput
                value={ruleDraftContent}
                onChangeText={setRuleDraftContent}
                placeholder={placeholders.ocrRuleContentExample}
                placeholderTextColor="#94a3b8"
                style={styles.settingsFieldInput}
                autoCorrect={false}
              />
              <Text style={styles.settingsSubLabel}>{labels.ocrRuleAssetClassCaption}</Text>
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
              <View style={styles.settingsSubLabelHintRow}>
                <Text style={styles.settingsSubLabel}>{labels.ocrRuleScopeCaption}</Text>
                {renderModuleInfoIcon(labels.ruleColScope, MODULE_HINT_TEXT.ocrRuleScope)}
              </View>
              <View style={[styles.settingsOcrPickerWrap, styles.settingsOcrScopePickerWrap]}>
                <View style={styles.settingsScopeDisplayRow}>
                  <Text style={[styles.classLabelText, styles.settingsScopePickerLabel]} numberOfLines={2}>
                    {formatOcrRuleScopeLabel(ruleDraftScope, customRecognitionModules)}
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
                  {customRecognitionModules.map((m) => (
                    <Picker.Item
                      key={`ocr-scope-cm-${m.id}`}
                      label={fmt.scopePickerOnlyModule(m.displayName)}
                      value={`${OCR_CUSTOM_MODULE_SCOPE_PREFIX}${m.id}`}
                    />
                  ))}
                  {typeof ruleDraftScope === "string" &&
                  ruleDraftScope.startsWith(OCR_CUSTOM_MODULE_SCOPE_PREFIX) &&
                  !customRecognitionModules.some(
                    (m) => `${OCR_CUSTOM_MODULE_SCOPE_PREFIX}${m.id}` === ruleDraftScope
                  ) ? (
                    <Picker.Item
                      key="ocr-scope-orphan"
                      label={formatOcrRuleScopeLabel(ruleDraftScope, customRecognitionModules)}
                      value={ruleDraftScope}
                    />
                  ) : null}
                </Picker>
              </View>
              <View style={styles.ocrRuleModalActions}>
                {ocrRuleEditingId ? (
                  <Pressable style={styles.ocrRuleModalDeleteButton} onPress={confirmDeleteOcrRuleInModal}>
                    <Text style={styles.ocrRuleModalDeleteText}>{labels.ocrRuleDelete}</Text>
                  </Pressable>
                ) : (
                  <View style={styles.ocrRuleModalActionsSpacer} />
                )}
                <View style={styles.ocrRuleModalActionsRight}>
                  <Pressable style={styles.ocrRuleModalSecondaryButton} onPress={closeOcrRuleModal}>
                    <Text style={styles.ocrRuleModalSecondaryText}>{common.cancel}</Text>
                  </Pressable>
                  <Pressable style={styles.ocrRuleModalPrimaryButton} onPress={() => void handleSaveOcrCustomRuleFromModal()}>
                    <Text style={styles.ocrRuleModalPrimaryText}>{common.save}</Text>
                  </Pressable>
                </View>
              </View>
              </ScrollView>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={customModuleWizardVisible} animationType="slide" onRequestClose={closeCustomModuleWizard}>
        <SafeAreaView style={styles.customModuleWizardSafe}>
          <View style={styles.customModuleWizardHeader}>
            <View style={styles.customModuleWizardTitleRow}>
              <Text style={styles.customModuleWizardTitle}>{labels.wizardTitleNew}</Text>
              {renderModuleInfoIcon(labels.wizardTitleNew, MODULE_HINT_TEXT.wizardOverview)}
            </View>
            <Pressable style={styles.customModuleWizardHeaderCloseHit} onPress={closeCustomModuleWizard} hitSlop={12}>
              <Text style={styles.customModuleWizardCloseText}>{common.close}</Text>
            </Pressable>
          </View>
          <Text style={styles.customModuleWizardStep}>{labels.wizardStep(wizardStep)}</Text>
          {wizardError ? <Text style={[styles.warn, styles.customModuleWizardErr]}>{wizardError}</Text> : null}
          <ScrollView
            style={styles.customModuleWizardScrollFlex}
            contentContainerStyle={styles.customModuleWizardScroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {wizardStep === 1 ? (
              <View style={styles.customModuleWizardStepBody}>
                {wizardUri ? (
                  <Image source={{ uri: wizardUri }} style={styles.customModuleWizardPreview} resizeMode="contain" />
                ) : null}
                <Pressable style={styles.sheetButton} onPress={() => void wizardPickSingleFromGallery()}>
                  <Text style={styles.sheetButtonText}>{labels.pickFromAlbum}</Text>
                </Pressable>
                <Pressable style={styles.sheetButton} onPress={() => void wizardPickSingleFromFiles()}>
                  <Text style={styles.sheetButtonText}>{labels.pickFromFiles}</Text>
                </Pressable>
              </View>
            ) : null}
            {wizardStep === 2 ? (
              <View style={styles.customModuleWizardStepBody}>
                {wizardOcrLoading ? <Text style={styles.muted}>{labels.wizardOcrLoading}</Text> : null}
                <Pressable style={styles.addRowButton} onPress={() => setWizardOcrExpanded((v) => !v)}>
                  <Text style={styles.addRowButtonText}>
                    {wizardOcrExpanded ? labels.wizardOcrToggleExpand : labels.wizardOcrToggleCollapse}
                  </Text>
                </Pressable>
                {wizardOcrExpanded ? (
                  <ScrollView nestedScrollEnabled style={styles.ocrSelectableScroll} keyboardShouldPersistTaps="handled">
                    <Text selectable style={styles.ocrSelectableText}>
                      {wizardOcrText}
                    </Text>
                  </ScrollView>
                ) : null}
              </View>
            ) : null}
            {wizardStep === 3 ? (
              <View style={styles.customModuleWizardStepBody}>
                <TextInput
                  value={wizardKeywordsText}
                  onChangeText={setWizardKeywordsText}
                  multiline
                  style={[styles.settingsFieldInput, styles.customModuleWizardKeywordInput]}
                  placeholder={placeholders.keywordsMulti}
                  placeholderTextColor="#94a3b8"
                  autoCorrect={false}
                />
                <Text style={styles.muted}>
                  {labels.keywordSplitPrefix}
                  {splitRecognitionKeywords(wizardKeywordsText).join(" · ") || labels.keywordSplitNone}
                </Text>
              </View>
            ) : null}
            {wizardStep === 4 ? (
              <View style={styles.customModuleWizardStepBody}>
                <View style={styles.settingsSubLabelHintRow}>
                  <Text style={styles.settingsSubLabel}>{labels.wizardModuleNameCaption}</Text>
                  {renderModuleInfoIcon(labels.wizardModuleNameHintPopoverTitle, labels.wizardModuleNameHintPopoverBody)}
                </View>
                <TextInput
                  value={wizardModuleName}
                  onChangeText={setWizardModuleName}
                  style={styles.settingsFieldInput}
                  placeholder={placeholders.moduleDisplayExample}
                  placeholderTextColor="#94a3b8"
                />
              </View>
            ) : null}
            {wizardStep === 5 ? (
              <View style={styles.customModuleWizardStepBody}>
                <Text style={styles.line}>{fmt.wizardModuleSummary(wizardModuleName.trim())}</Text>
                <Text style={styles.line}>{labels.moduleWizardSummaryKeywords}</Text>
                <Text style={styles.muted}>{splitRecognitionKeywords(wizardKeywordsText).join(" · ") || common.dash}</Text>
                <View style={styles.settingsSubLabelHintRow}>
                  <Text style={styles.settingsSubLabel}>{labels.wizardSubmitHintTitle}</Text>
                  {renderModuleInfoIcon(labels.wizardSubmitHintTitle, labels.wizardSubmitHintBody)}
                </View>
              </View>
            ) : null}
          </ScrollView>
          <View style={styles.customModuleWizardFooter}>
            <Pressable style={styles.customModuleWizardExitButton} onPress={closeCustomModuleWizard}>
              <Text style={styles.customModuleWizardExitText}>{labels.wizardExit}</Text>
            </Pressable>
            <View style={styles.customModuleWizardFooterRight}>
              {wizardStep > 1 ? (
                <Pressable style={styles.ocrRuleModalSecondaryButton} onPress={wizardGoPrev}>
                  <Text style={styles.ocrRuleModalSecondaryText}>{common.prev}</Text>
                </Pressable>
              ) : null}
              {wizardStep < 5 ? (
                <Pressable style={styles.ocrRuleModalPrimaryButton} onPress={wizardGoNext}>
                  <Text style={styles.ocrRuleModalPrimaryText}>{wizardStep === 1 ? labels.wizardNextWithOcr : common.next}</Text>
                </Pressable>
              ) : (
                <Pressable style={styles.ocrRuleModalPrimaryButton} onPress={() => void submitCustomRecognitionModule()}>
                  <Text style={styles.ocrRuleModalPrimaryText}>{common.submit}</Text>
                </Pressable>
              )}
            </View>
          </View>
        </SafeAreaView>
      </Modal>

      <Modal visible={customModuleConfigVisible} animationType="slide" onRequestClose={closeCustomModuleConfig}>
        <SafeAreaView style={styles.customModuleWizardSafe}>
          <View style={styles.customModuleWizardHeader}>
            <View style={styles.customModuleWizardTitleRow}>
              <Text style={styles.customModuleWizardTitle}>{labels.wizardTitleEdit}</Text>
              {renderModuleInfoIcon(labels.wizardTitleEdit, MODULE_HINT_TEXT.configModule)}
            </View>
            <Pressable style={styles.customModuleWizardHeaderCloseHit} onPress={closeCustomModuleConfig} hitSlop={12}>
              <Text style={styles.customModuleWizardCloseText}>{common.close}</Text>
            </Pressable>
          </View>
          <ScrollView
            style={styles.customModuleWizardScrollFlex}
            contentContainerStyle={styles.customModuleWizardScroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {editCmError ? <Text style={[styles.warn, styles.customModuleWizardErr]}>{editCmError}</Text> : null}
            <Text style={styles.settingsSubLabel}>{labels.wizardModuleNameCaption}</Text>
            <TextInput
              value={editCmDisplayName}
              onChangeText={setEditCmDisplayName}
              style={styles.settingsFieldInput}
              placeholder={placeholders.moduleDisplayExample}
              placeholderTextColor="#94a3b8"
              editable={!editCmSaving}
            />
            <View style={styles.settingsSubLabelHintRow}>
              <Text style={styles.settingsSubLabel}>{labels.configKeywordsCaption}</Text>
              {renderModuleInfoIcon(labels.configKeywordsCaption, MODULE_HINT_TEXT.configKeywords)}
            </View>
            <TextInput
              value={editCmKeywordsText}
              onChangeText={setEditCmKeywordsText}
              multiline
              style={[styles.settingsFieldInput, styles.customModuleWizardKeywordInput]}
              placeholder={placeholders.keywordsMulti}
              placeholderTextColor="#94a3b8"
              autoCorrect={false}
              editable={!editCmSaving}
            />
            <Text style={styles.muted}>
              {labels.keywordSplitPrefix}
              {splitRecognitionKeywords(editCmKeywordsText).join(" · ") || labels.keywordSplitNone}
            </Text>
          </ScrollView>
          <View style={styles.customModuleConfigFooter}>
            <Pressable
              style={styles.ocrRuleModalDeleteButton}
              onPress={confirmDeleteCustomModule}
              disabled={editCmSaving}
            >
              <Text style={styles.ocrRuleModalDeleteText}>{labels.configDeleteModule}</Text>
            </Pressable>
            <Pressable
              style={[styles.ocrRuleModalPrimaryButton, editCmSaving ? styles.customModuleConfigSaveDisabled : null]}
              onPress={() => void saveCustomModuleConfig()}
              disabled={editCmSaving}
            >
              <Text style={styles.ocrRuleModalPrimaryText}>{editCmSaving ? common.saving : labels.customModuleConfigSave}</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </Modal>

      <ScrollView nestedScrollEnabled contentContainerStyle={[styles.content, { paddingTop: 16 + androidTopInset }]}>
        <View style={styles.heroCard}>
          <View style={styles.heroTopRow}>
            <Text style={styles.heroHint}>{labels.heroTotalHint}</Text>
            <View style={styles.heroActions}>
              <Pressable style={[styles.manageButton, modulePressOpacityStyle()]} onPress={() => setManageVisible(true)}>
                <Text style={styles.manageButtonText}>{labels.importButton}</Text>
              </Pressable>
              <Pressable style={[styles.settingsGearButton, modulePressOpacityStyle()]} onPress={() => setSettingsVisible(true)}>
                <Text style={styles.settingsGearText}>⚙</Text>
              </Pressable>
            </View>
          </View>
          <Text style={styles.heroTotal}>{formatDisplayAmount(dailySummary.total)}</Text>
          {dbInitError ? <Text style={styles.heroError}>{fmt.heroDbErrorLine(dbInitError)}</Text> : null}
          <View style={styles.quickStatsColumn}>
            <View style={styles.quickStatRow}>
              <View style={styles.quickStatItem}>
                <Text style={styles.quickStatLabel}>{labels.quickStatCash}</Text>
                <Text style={styles.quickStatValue}>{cashAmount.toFixed(2)}</Text>
              </View>
              <View style={styles.quickStatItem}>
                <Text style={styles.quickStatLabel}>{labels.quickStatFund}</Text>
                <Text style={styles.quickStatValue}>{fundAmount.toFixed(2)}</Text>
              </View>
              <View style={styles.quickStatItem}>
                <Text style={styles.quickStatLabel}>{labels.quickStatInsurance}</Text>
                <Text style={styles.quickStatValue}>{insuranceAmount.toFixed(2)}</Text>
              </View>
            </View>
            <View style={styles.quickStatRow}>
              <View style={styles.quickStatItem}>
                <Text style={styles.quickStatLabel}>{labels.quickStatStock}</Text>
                <Text style={styles.quickStatValue}>{stockAmount.toFixed(2)}</Text>
              </View>
              <View style={styles.quickStatItem}>
                <Text style={styles.quickStatLabel}>{labels.quickStatWealth}</Text>
                <Text style={styles.quickStatValue}>{wealthManagementAmount.toFixed(2)}</Text>
              </View>
            </View>
          </View>
        </View>

        <View
          collapsable={false}
          style={[
            styles.card,
            { backgroundColor: cardBackgroundColor },
            trendCardMenuLiftStyle("trend-main")
          ]}
        >
          <View style={styles.trendHeaderRow}>
            <View style={styles.trendHeaderTitleCluster}>
              <View style={styles.cardTitleHintRow}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {labels.trendMainChartTitle}
                </Text>
                {renderModuleInfoIcon(labels.trendMainChartTitle, MODULE_HINT_TEXT.trendChart, true)}
              </View>
            </View>
            {renderTrendTypePicker("trend-main")}
          </View>
          <TrendLineChart
            points={trendPoints}
            breakdownByClass={mainTrendBreakdown}
            primarySeriesLabel={labels.chartPrimaryAll}
            chartTooltipOpacity={moduleControlOpacity}
          />
          {debugJsonDumpsVisible ? (
            <>
              <Text style={styles.debugDumpLabel}>{labels.debugTrendDumpTitle}</Text>
              {renderDebugJsonScroll(trendChartsStructureDebugText.trendMain)}
            </>
          ) : null}
        </View>

        {visiblePlatformModules.map((platform) => (
          <View
            key={platform}
            collapsable={false}
            style={[
              styles.card,
              { backgroundColor: cardBackgroundColor },
              trendCardMenuLiftStyle(`platform-${platform}`)
            ]}
          >
            <View style={styles.trendHeaderRow}>
              <View style={styles.trendHeaderTitleCluster}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {PLATFORM_TREND_LABEL[platform]}
                </Text>
              </View>
              {renderTrendTypePicker(`platform-${platform}`)}
            </View>
            <TrendLineChart
              points={platformTrendPoints[platform]}
              breakdownByClass={platformTrendBreakdown[platform]}
              primarySeriesLabel={labels.chartPrimaryAll}
              chartTooltipOpacity={moduleControlOpacity}
            />
            {debugJsonDumpsVisible ? (
              <>
                <Text style={styles.debugDumpLabel}>{labels.debugTrendDumpTitle}</Text>
                {renderDebugJsonScroll(
                  platform === "alipay"
                    ? trendChartsStructureDebugText.platformAlipay
                    : platform === "cmb"
                      ? trendChartsStructureDebugText.platformCmb
                      : trendChartsStructureDebugText.platformWechat
                )}
              </>
            ) : null}
          </View>
        ))}
        {visibleCustomRecognitionModules.map((m) => (
          <View
            key={m.id}
            collapsable={false}
            style={[
              styles.card,
              { backgroundColor: cardBackgroundColor },
              trendCardMenuLiftStyle(`cm-${m.id}`)
            ]}
          >
            <View style={styles.trendHeaderRow}>
              <View style={styles.trendHeaderTitleCluster}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {fmt.customModuleTrendTitle(m.displayName)}
                </Text>
              </View>
              {renderTrendTypePicker(`cm-${m.id}`)}
            </View>
            <TrendLineChart
              points={customModuleTrendPoints[m.id] ?? []}
              breakdownByClass={customModuleTrendBreakdown[m.id]}
              primarySeriesLabel={labels.chartPrimaryAll}
              chartTooltipOpacity={moduleControlOpacity}
            />
            {debugJsonDumpsVisible ? (
              <>
                <Text style={styles.debugDumpLabel}>{labels.debugTrendDumpTitle}</Text>
                {renderDebugJsonScroll(trendChartsStructureDebugText.customModules[m.id] ?? "{}")}
              </>
            ) : null}
          </View>
        ))}
      </ScrollView>

      {settingsVisible ? (
        <SafeAreaView style={[styles.pageOverlay, { paddingTop: 16 + androidTopInset }]}>
          <View style={styles.settingsHeader}>
            <Text style={styles.settingsTitle}>{labels.settingsTitle}</Text>
            <Pressable onPress={() => setSettingsVisible(false)}>
              <Text style={styles.settingsClose}>{common.done}</Text>
            </Pressable>
          </View>
          <ScrollView
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.settingsScrollContent}
            showsVerticalScrollIndicator={false}
          >
          <View style={styles.settingsOpacityBarRow}>
            <Text style={styles.settingsOpacityInlineLabel}>{labels.opacityLabel}</Text>
            <View
              style={styles.opacityTrackTouch}
              onLayout={(e) => {
                opacityBarWidthRef.current = e.nativeEvent.layout.width;
              }}
              onStartShouldSetResponder={() => true}
              onMoveShouldSetResponder={() => true}
              onResponderGrant={(e) =>
                applyOpacityFromBarX(e.nativeEvent.locationX, opacityBarWidthRef.current)
              }
              onResponderMove={(e) =>
                applyOpacityFromBarX(e.nativeEvent.locationX, opacityBarWidthRef.current)
              }
            >
              <View style={styles.opacityTrackClip}>
                <View style={[styles.opacityTrackBg, { backgroundColor: cardBackgroundColor }]}>
                  <View
                    style={[
                      styles.opacityTrackFill,
                      {
                        width: `${((cardOpacityPercent - 30) / 70) * 100}%`,
                        backgroundColor: opacityTrackFillColor
                      }
                    ]}
                  />
                </View>
                <View style={styles.opacityPercentCenter} pointerEvents="none">
                  <Text style={styles.opacityTrackPercentText}>{cardOpacityPercent}%</Text>
                </View>
              </View>
            </View>
          </View>
          <View style={[styles.settingsCard, { backgroundColor: cardBackgroundColor }]}>
            <View style={styles.settingsLabelHintRow}>
              <Text style={styles.settingsLabel}>{labels.privacyTitle}</Text>
              {renderModuleInfoIcon(labels.privacyTitle, MODULE_HINT_TEXT.privacy, true)}
            </View>
            {biometricAvailable ? (
              <Pressable style={[styles.securityActionButton, modulePressOpacityStyle()]} onPress={handleToggleBiometric}>
                <Text style={styles.securityActionButtonText}>{biometricEnabled ? labels.biometricToggleOff : labels.biometricToggleOn}</Text>
              </Pressable>
            ) : (
              <Text style={styles.muted}>{labels.biometricUnavailable}</Text>
            )}
          </View>
          <View style={[styles.settingsCard, { backgroundColor: cardBackgroundColor }]}>
            <View style={styles.settingsLabelHintRow}>
              <Text style={styles.settingsLabel}>{labels.moduleDisplayTitle}</Text>
              {renderModuleInfoIcon(labels.moduleDisplayTitle, MODULE_HINT_TEXT.moduleDisplay, true)}
            </View>
            <View style={styles.tagArea}>
              {visiblePlatformModules.map((platform) => (
                <Pressable
                  key={`visible-${platform}`}
                  style={[styles.visibleTag, modulePressOpacityStyle()]}
                  onPress={() => movePlatformModuleToHidden(platform)}
                >
                  <Text style={styles.visibleTagText}>{PLATFORM_MODULE_LABEL[platform]}</Text>
                  <Text style={styles.visibleTagAction}>×</Text>
                </Pressable>
              ))}
              {visibleCustomRecognitionModules.map((m) => (
                <View key={`vis-cm-${m.id}`} style={styles.customModuleVisiblePill}>
                  <Pressable
                    style={[styles.customModuleVisiblePillBody, modulePressOpacityStyle()]}
                    onPress={() => openCustomModuleConfig(m)}
                  >
                    <Text style={[styles.visibleTagText, styles.customModulePillLabel]} numberOfLines={1}>
                      {m.displayName}
                    </Text>
                  </Pressable>
                  <View style={styles.customModulePillDivider} />
                  <Pressable
                    style={[styles.customModuleVisiblePillAction, modulePressOpacityStyle()]}
                    onPress={() => void moveCustomModuleToHidden(m.id)}
                    hitSlop={8}
                  >
                    <Text style={styles.visibleTagAction}>×</Text>
                  </Pressable>
                </View>
              ))}
              {hiddenPlatformModules.map((platform) => (
                <Pressable
                  key={`hidden-${platform}`}
                  style={[styles.platformHiddenGreenCapsule, modulePressOpacityStyle()]}
                  onPress={() => movePlatformModuleToVisible(platform)}
                >
                  <Text style={styles.platformHiddenGreenCapsuleAction}>+</Text>
                  <Text style={styles.platformHiddenGreenCapsuleText}>{PLATFORM_MODULE_LABEL[platform]}</Text>
                </Pressable>
              ))}
              {hiddenCustomRecognitionModules.map((m) => (
                <View key={`hid-cm-${m.id}`} style={styles.customModuleHiddenPill}>
                  <Pressable
                    style={[styles.customModuleHiddenPillAction, modulePressOpacityStyle()]}
                    onPress={() => void moveCustomModuleToVisible(m.id)}
                    hitSlop={8}
                  >
                    <Text style={styles.hiddenTagAction}>+</Text>
                  </Pressable>
                  <View style={styles.customModulePillDividerLight} />
                  <Pressable
                    style={[styles.customModuleHiddenPillBody, modulePressOpacityStyle()]}
                    onPress={() => openCustomModuleConfig(m)}
                  >
                    <Text style={[styles.hiddenTagText, styles.customModulePillLabel]} numberOfLines={1}>
                      {m.displayName}
                    </Text>
                  </Pressable>
                </View>
              ))}
            </View>
          </View>

          <View style={[styles.settingsCard, { backgroundColor: cardBackgroundColor }]}>
            <View style={styles.settingsLabelHintRow}>
              <Text style={styles.settingsLabel}>{labels.newModuleTitle}</Text>
              {renderModuleInfoIcon(labels.newModuleTitle, MODULE_HINT_TEXT.newCustomModule, true)}
            </View>
            {customModuleNotice ? <Text style={styles.muted}>{customModuleNotice}</Text> : null}
            <Pressable style={[styles.securityActionButton, modulePressOpacityStyle()]} onPress={openCustomModuleWizard}>
              <Text style={styles.securityActionButtonText}>{labels.openModuleWizard}</Text>
            </Pressable>
          </View>

          <View style={[styles.settingsCard, { backgroundColor: cardBackgroundColor }]}>
            <View style={styles.settingsLabelHintRow}>
              <Text style={styles.settingsLabel}>{labels.ocrRulesTitle}</Text>
              {renderModuleInfoIcon(labels.ocrRulesTitle, MODULE_HINT_TEXT.ocrRules, true)}
            </View>
            {customRuleNotice ? (
              <Text style={customRuleNotice.includes(notices.customRuleSavedToken) ? styles.muted : styles.warn}>{customRuleNotice}</Text>
            ) : null}
            {ocrCustomRules.length ? (
              <View style={styles.settingsRuleListSection}>
                <View style={styles.settingsSubLabelHintRow}>
                  <Text style={styles.settingsSubLabel}>{labels.ocrRulesAddedCaption}</Text>
                  {renderModuleInfoIcon(labels.ocrRulesAddedCaption, MODULE_HINT_TEXT.ocrRulesList, true)}
                </View>
                <View style={[styles.assetTableHeaderRow, styles.ruleListColumnsGap]}>
                  <View style={styles.ruleColSource}>
                    <Text style={styles.fieldCaption}>{labels.ruleColSource}</Text>
                  </View>
                  <View style={styles.ruleColContent}>
                    <Text style={styles.fieldCaption}>{labels.ruleColContent}</Text>
                  </View>
                  <View style={styles.ruleColClass}>
                    <Text style={styles.fieldCaption}>{labels.ruleColClass}</Text>
                  </View>
                  <View style={styles.ruleColScope}>
                    <Text style={styles.fieldCaption}>{labels.ruleColScope}</Text>
                  </View>
                </View>
                {ocrCustomRules.map((rule) => (
                  <Pressable
                    key={rule.id}
                    style={({ pressed }) => [
                      styles.ruleListRowPress,
                      pressed && styles.ruleListRowPressPressed,
                      modulePressOpacityStyle()
                    ]}
                    onPress={() => openOcrRuleModalForEdit(rule)}
                  >
                    <View style={[styles.assetRow, styles.ruleListColumnsGap]}>
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
                            {formatOcrRuleScopeLabel(rule.screenScope, customRecognitionModules)}
                          </Text>
                        </View>
                      </View>
                    </View>
                  </Pressable>
                ))}
              </View>
            ) : (
              <Text style={styles.muted}>{labels.noCustomRules}</Text>
            )}
            <Pressable style={[styles.securityActionButton, modulePressOpacityStyle()]} onPress={openOcrRuleModalForCreate}>
              <Text style={styles.securityActionButtonText}>{labels.addRule}</Text>
            </Pressable>
          </View>
          {debugJsonDumpsVisible ? (
            <View style={[styles.settingsCard, { backgroundColor: cardBackgroundColor }]}>
              <View style={styles.settingsLabelHintRow}>
                <Text style={styles.settingsLabel}>{labels.snapshotsDebugTitle}</Text>
              </View>
              <Text style={styles.muted}>{labels.snapshotsDebugHint}</Text>
              <View style={styles.debugDumpToolbar}>
                <Pressable
                  style={[styles.securityActionButton, modulePressOpacityStyle(), persistedSnapshotsDebugBusy && { opacity: 0.6 }]}
                  onPress={() => void refreshPersistedSnapshotsDebug()}
                  disabled={persistedSnapshotsDebugBusy}
                >
                  <Text style={styles.securityActionButtonText}>
                    {persistedSnapshotsDebugBusy ? common.loading : labels.refreshSnapshots}
                  </Text>
                </Pressable>
              </View>
              {renderDebugJsonScroll(persistedSnapshotsDebugText || labels.snapshotsDebugPlaceholder, "tall")}
            </View>
          ) : null}
          <View style={[styles.settingsCard, { backgroundColor: cardBackgroundColor }]}>
            <View style={styles.settingsDataCleanupRow}>
              <View style={styles.settingsDataCleanupTitleCluster}>
                <Text style={styles.settingsLabel} numberOfLines={1} ellipsizeMode="tail">
                  {labels.dataCleanupTitle}
                </Text>
                {renderModuleInfoIcon(labels.dataCleanupTitle, MODULE_HINT_TEXT.dataCleanup, true)}
              </View>
              <View style={styles.clearActionRowModal}>
                <Pressable
                  style={[styles.clearActionButtonBlue, modulePressOpacityStyle()]}
                  onPress={() => {
                    setClearMode("today");
                    setClearAllStep2(false);
                  }}
                >
                  <Text style={styles.clearActionText}>{labels.clearToday}</Text>
                </Pressable>
                <Pressable
                  style={[styles.clearActionButtonDanger, modulePressOpacityStyle()]}
                  onPress={() => {
                    setClearMode("all");
                    setClearAllStep2(false);
                  }}
                >
                  <Text style={styles.clearActionText}>{labels.clearAllImports}</Text>
                </Pressable>
              </View>
            </View>
          </View>
          <View style={[styles.settingsCard, { backgroundColor: cardBackgroundColor }]}>
            <View style={styles.settingsDataCleanupRow}>
              <View style={styles.settingsDataCleanupTitleCluster}>
                <Text style={styles.settingsLabel} numberOfLines={1} ellipsizeMode="tail">
                  {labels.seedTestDataTitle}
                </Text>
                {renderModuleInfoIcon(labels.seedTestDataTitle, MODULE_HINT_TEXT.seedTestData, true)}
              </View>
              <View style={styles.clearActionRowModal}>
                <Pressable
                  style={[
                    styles.clearActionButtonBlue,
                    modulePressOpacityStyle(!dbReady || seedTestBusy ? 0.45 : 1)
                  ]}
                  disabled={!dbReady || seedTestBusy}
                  onPress={promptWriteSeedTestData}
                >
                  <Text style={styles.clearActionText}>
                    {seedTestBusy ? common.processing : labels.seedWriteTestData}
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.clearActionButtonDanger,
                    modulePressOpacityStyle(!dbReady || seedTestBusy ? 0.45 : 1)
                  ]}
                  disabled={!dbReady || seedTestBusy}
                  onPress={promptClearSeedTestData}
                >
                  <Text style={styles.clearActionText}>{labels.clearSeedData}</Text>
                </Pressable>
              </View>
            </View>
            <Text style={styles.seedTestDebugToggleHint}>{labels.debugJsonToggleHint}</Text>
            <Pressable
              style={[styles.securityActionButton, modulePressOpacityStyle(), styles.seedTestDebugToggleButton]}
              onPress={() => setDebugJsonDumpsVisible((v) => !v)}
            >
              <Text style={styles.securityActionButtonText}>
                {debugJsonDumpsVisible ? labels.toggleDebugHide : labels.toggleDebugShow}
              </Text>
            </Pressable>
          </View>
          </ScrollView>
        </SafeAreaView>
      ) : null}

      {manageVisible ? (
        <SafeAreaView style={[styles.pageOverlay, { paddingTop: 16 + androidTopInset }]}>
          <View style={styles.settingsHeader}>
            <Text style={styles.settingsTitle}>{labels.settingsDataTitle}</Text>
            <Pressable onPress={() => setManageVisible(false)}>
              <Text style={styles.settingsClose}>{common.done}</Text>
            </Pressable>
          </View>
          <ScrollView nestedScrollEnabled contentContainerStyle={styles.manageContent}>
            <View style={[styles.card, { backgroundColor: cardBackgroundColor }]}>
              <View style={styles.sectionHeaderRow}>
                <View style={[styles.cardTitleHintRow, styles.cardTitleHintRowGrow]}>
                  <Text style={styles.cardTitle}>{labels.cardScreenshotImport}</Text>
                  {renderModuleInfoIcon(labels.cardScreenshotImport, MODULE_HINT_TEXT.screenshotImport, true)}
                </View>
                <View style={styles.sectionHeaderActions}>
                  {selectedImageUris.length ? (
                    <Pressable style={[styles.retryButton, modulePressOpacityStyle()]} onPress={handleRetryRecognition}>
                      <Text style={styles.retryButtonText}>{ocrLoading ? labels.recognizing : labels.retryRecognize}</Text>
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
                      style={[styles.previewTileDelete, modulePressOpacityStyle()]}
                      hitSlop={8}
                      onPress={() => handleDeleteImportedImage(uri)}
                    >
                      <Text style={styles.previewTileDeleteText}>×</Text>
                    </Pressable>
                  </Pressable>
                ))}
                {selectedImageUris.length < 6 ? (
                  <Pressable style={[styles.previewTileAdd, modulePressOpacityStyle()]} onPress={() => setSourceModalVisible(true)}>
                    <Text style={styles.previewTileHint}>{labels.importTileAdd}</Text>
                  </Pressable>
                ) : null}
              </View>
              {selectedImageUris.length ? <Text style={styles.muted}>{labels.importCountHint(selectedImageUris.length)}</Text> : null}
              {ocrError ? (
                <View style={styles.errorBanner}>
                  <Text style={styles.errorBannerTitle}>{labels.importFailedTitle}</Text>
                  <Text style={styles.errorBannerText}>{ocrError}</Text>
                </View>
              ) : null}
              {dbInitError ? <Text style={styles.error}>{fmt.dbInitFailed(dbInitError)}</Text> : null}
            </View>

            <View style={[styles.card, { backgroundColor: cardBackgroundColor }]}>
              <View style={[styles.cardTitleHintRow, styles.cardTitleHintRowGrow]}>
                <Text style={styles.cardTitle}>{labels.cardParseResult}</Text>
                {renderModuleInfoIcon(labels.cardParseResult, MODULE_HINT_TEXT.parseResult, true)}
              </View>
              {groupedEditableAssets.map((group) => (
                <View style={styles.parseGroup} key={group.uri}>
                  <View style={styles.parseGroupHeader}>
                    <Text style={styles.parseGroupTitle}>{fmt.parseGroupTitle(group.index)}</Text>
                    <Text style={styles.parseGroupTotal}>
                      {labels.parsePageTotal}
                      {group.total.toFixed(2)}
                    </Text>
                  </View>
                  <Text style={styles.line}>
                    {labels.parseScreenTypeCaption}
                    {group.meta?.parseResult.screenDisplayLabel ??
                      SCREEN_TYPE_LABEL[group.meta?.parseResult.screenType ?? "unknown"]}
                  </Text>
                  <Pressable style={[styles.addRowButton, modulePressOpacityStyle()]} onPress={() => addManualAssetRow(group.uri)}>
                    <Text style={styles.addRowButtonText}>{labels.addRowManual}</Text>
                  </Pressable>
                  {group.assets.length ? (
                    <View style={styles.assetTableHeaderRow}>
                      <View style={styles.assetNameColumn}>
                        <Text style={styles.fieldCaption}>{labels.fieldAmountName}</Text>
                      </View>
                      <View style={styles.assetAmountWrap}>
                        <Text style={styles.fieldCaption}>{labels.fieldAmount}</Text>
                      </View>
                      <View style={styles.classPickerColumn}>
                        <Text style={styles.fieldCaption}>{labels.fieldClass}</Text>
                      </View>
                    </View>
                  ) : null}
                  {group.assets.map((asset) => (
                    <View style={styles.assetBlock} key={asset.localId}>
                      <View style={styles.assetRow}>
                        <View style={styles.assetNameColumn}>
                          <View style={styles.assetNameFieldWrap}>
                            <Pressable
                              style={[styles.assetNameClearPress, modulePressOpacityStyle()]}
                              hitSlop={6}
                              onPress={() => confirmRemoveAssetRow(asset.localId)}
                            >
                              <Text style={styles.assetNameClearText}>×</Text>
                            </Pressable>
                            <TextInput
                              value={asset.name}
                              onChangeText={(value) => updateAssetName(asset.localId, value)}
                              style={styles.assetNameInput}
                              placeholder={placeholders.amountName}
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
                            placeholder={placeholders.amount}
                            placeholderTextColor="#94a3b8"
                          />
                          {asset.amountError ? <Text style={styles.assetAmountErrorText}>{asset.amountError}</Text> : null}
                        </View>
                        <View style={styles.classPickerColumn}>
                          <View style={[styles.classPickerWrap, modulePressOpacityStyle()]}>
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
                      <Pressable style={[styles.addRowButton, modulePressOpacityStyle()]} onPress={() => toggleOcrText(group.uri)}>
                        <Text style={styles.addRowButtonText}>
                          {expandedOcrUris.includes(group.uri) ? labels.wizardOcrToggleExpand : labels.wizardOcrToggleCollapse}
                        </Text>
                      </Pressable>
                      {expandedOcrUris.includes(group.uri) ? (
                        <>
                          <Text style={styles.ocrSourceHint}>{labels.ocrSourceHint}</Text>
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
              <Pressable style={[styles.confirmButton, modulePressOpacityStyle()]} onPress={handleConfirmSnapshot}>
                <Text style={styles.confirmButtonText}>{saveLoading ? labels.savingRecord : labels.confirmSave}</Text>
              </Pressable>
              {debugJsonDumpsVisible ? (
                <>
                  <Text style={styles.debugDumpLabel}>{labels.debugPendingSaveTitle}</Text>
                  {renderDebugJsonScroll(pendingSaveDebugText)}
                </>
              ) : null}
              {saveNotice ? <Text style={styles.muted}>{saveNotice}</Text> : null}
            </View>
          </ScrollView>
        </SafeAreaView>
      ) : null}
    </SafeAreaView>
  );
}

