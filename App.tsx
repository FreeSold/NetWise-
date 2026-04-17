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
  MODULE_HINT_TEXT,
  OCR_RULE_SCOPE_LABEL,
  OCR_RULE_SCOPE_ORDER,
  PLATFORM_MODULE_LABEL,
  PLATFORM_TREND_LABEL,
  PLATFORM_TREND_ORDER,
  SCREEN_TYPE_LABEL,
  TREND_FILTER_LABEL,
  TREND_FILTER_ORDER
} from "./src/app/homeUiConstants";
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
        accessibilityLabel={`${title}说明`}
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
      return "（暂无解析行：导入并识别后，此处展示将写入库的 JSON 预览）";
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
          ocrTextPreview: ocrTextsForSave.map((t) =>
            t.length > 400 ? `${t.slice(0, 400)}…(全文${t.length}字)` : t
          )
        },
        null,
        2
      );
    } catch (e) {
      return `预览生成失败：${e instanceof Error ? e.message : String(e)}`;
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
      const msg = `序列化失败：${e instanceof Error ? e.message : String(e)}`;
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
        const message = error instanceof Error ? error.message : "规则加载失败";
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
        const message = error instanceof Error ? error.message : "自定义模块加载失败";
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
      setPersistedSnapshotsDebugText("数据库未就绪。");
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
      setEditCmError("请填写模块展示名称。");
      return;
    }
    if (!keywords.length) {
      setEditCmError("请至少填写一个匹配用词（可用空格、逗号、分号分隔）。");
      return;
    }
    setEditCmSaving(true);
    setEditCmError(null);
    try {
      const loaded = await loadCustomRecognitionModules();
      const idx = loaded.modules.findIndex((x) => x.id === id);
      if (idx < 0) {
        setEditCmError("模块已不存在，请关闭后重试。");
        return;
      }
      const nextModules = [...loaded.modules];
      nextModules[idx] = { id, displayName: name, keywords };
      await saveCustomRecognitionModules({ modules: nextModules, hiddenIds: loaded.hiddenIds });
      setCustomRecognitionModules(nextModules);
      setHiddenCustomModuleIds(loaded.hiddenIds);
      await refreshTrendData();
      setCustomModuleNotice("已保存模块修改。");
      setTimeout(() => setCustomModuleNotice(null), 2000);
      closeCustomModuleConfig();
    } catch (error) {
      setEditCmError(error instanceof Error ? error.message : "保存失败");
    } finally {
      setEditCmSaving(false);
    }
  }

  function confirmDeleteCustomModule() {
    const id = customModuleConfigEditingId;
    if (!id) {
      return;
    }
    const name = editCmDisplayName.trim() || "该模块";
    Alert.alert(
      "删除自定义模块",
      `确定删除「${name}」吗？绑定「仅该模块」的 OCR 规则将变成无效引用，请到规则列表中自行调整。`,
      [
        { text: "取消", style: "cancel" },
        { text: "删除", style: "destructive", onPress: () => void executeDeleteCustomModule(id) }
      ]
    );
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
      setCustomModuleNotice("已删除该模块。");
      setTimeout(() => setCustomModuleNotice(null), 2000);
      closeCustomModuleConfig();
    } catch (error) {
      setEditCmError(error instanceof Error ? error.message : "删除失败");
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
      setWizardError("没有相册权限，请在系统设置中允许访问相册。");
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
      setWizardError("请先选择一张图片。");
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
        setWizardError("请先完成 OCR 识别。");
        return;
      }
      setWizardError(null);
      setWizardStep(3);
      return;
    }
    if (wizardStep === 3) {
      const k = splitRecognitionKeywords(wizardKeywordsText);
      if (!k.length) {
        setWizardError("请填写关键词，可用空格、逗号、分号分隔多个词。");
        return;
      }
      setWizardError(null);
      setWizardStep(4);
      return;
    }
    if (wizardStep === 4) {
      if (!wizardModuleName.trim()) {
        setWizardError("请填写模块展示名称。");
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
      setWizardError("请完善模块名称与关键词。");
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
      setCustomModuleNotice("已添加识别模块。");
      setTimeout(() => setCustomModuleNotice(null), 2000);
    } catch (error) {
      setWizardError(error instanceof Error ? error.message : "保存失败");
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
      const { validationErrors, assetBuckets, ocrTextsForSave } = compileImportSnapshotPayload();
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
      const result = await saveImportSnapshot(currentImageHashes, assetBuckets, ocrTextsForSave);
      setSaveNotice(result.saved ? `已保存 ${result.date} 的快照记录。` : "同一图片今天已记录，已自动跳过重复保存。");
      await refreshTrendData();
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
      await clearAllImportHistory();
      setSaveNotice("已清空全部导入记录（自定义模块与 OCR 规则未改动）。");
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
    Alert.alert(
      "确认写入测试数据？",
      "将在你的导入记录中插入约 20 天的模拟快照，与真实导入混在一起，首页「目前为止总资产」和三平台折线图都会受影响，容易造成误判。仅建议在明确调试时使用。\n\n可通过本页「清除测试数据」移除测试快照，或使用「清空全部导入」清空全部记录。",
      [
        { text: "取消", style: "cancel" },
        { text: "仍要写入", style: "destructive", onPress: () => void executeWriteSeedTestData() }
      ]
    );
  }

  async function executeWriteSeedTestData() {
    if (!dbReady || seedTestBusy) {
      return;
    }
    setSeedTestBusy(true);
    try {
      await seedDefaultModuleTestData();
      await refreshTrendData();
      Alert.alert(
        "已写入",
        "已生成支付宝 / 招行 / 微信各约 20 个时点的测试曲线。若不再需要，请到本页清除测试数据。"
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";
      Alert.alert("写入失败", message);
    } finally {
      setSeedTestBusy(false);
    }
  }

  function promptClearSeedTestData() {
    if (!dbReady || seedTestBusy) {
      return;
    }
    Alert.alert("清除测试数据？", "将删除所有带测试标记的快照，不会影响其它真实导入记录。", [
      { text: "取消", style: "cancel" },
      { text: "清除", onPress: () => void executeClearSeedTestData() }
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
      Alert.alert("完成", removed > 0 ? `已清除 ${removed} 条测试快照。` : "当前没有测试快照。");
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";
      Alert.alert("清除失败", message);
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
              <Text style={styles.moduleHintPopoverOkText}>知道了</Text>
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
            <View style={styles.sourceTitleHintRow}>
              <Text style={[styles.sourceTitle, styles.sourceTitleFlex]}>
                {clearMode === "all" && clearAllStep2 ? "再次确认：清空全部导入记录？" : "确认清空数据？"}
              </Text>
              {renderModuleInfoIcon(
                "说明",
                clearMode === "today" ? MODULE_HINT_TEXT.clearToday : MODULE_HINT_TEXT.clearAll
              )}
            </View>
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
              <View style={styles.settingsSubLabelHintRow}>
                <Text style={styles.settingsSubLabel}>原文（锚点关键词）</Text>
                {renderModuleInfoIcon("原文（锚点关键词）", MODULE_HINT_TEXT.ocrRuleSource)}
              </View>
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
              <View style={styles.settingsSubLabelHintRow}>
                <Text style={styles.settingsSubLabel}>限定页面（防跨 App 误匹配）</Text>
                {renderModuleInfoIcon("限定页面", MODULE_HINT_TEXT.ocrRuleScope)}
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
                      label={`仅「${m.displayName}」`}
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

      <Modal visible={customModuleWizardVisible} animationType="slide" onRequestClose={closeCustomModuleWizard}>
        <SafeAreaView style={styles.customModuleWizardSafe}>
          <View style={styles.customModuleWizardHeader}>
            <View style={styles.customModuleWizardTitleRow}>
              <Text style={styles.customModuleWizardTitle}>新增识别模块</Text>
              {renderModuleInfoIcon("新增识别模块", MODULE_HINT_TEXT.wizardOverview)}
            </View>
            <Pressable style={styles.customModuleWizardHeaderCloseHit} onPress={closeCustomModuleWizard} hitSlop={12}>
              <Text style={styles.customModuleWizardCloseText}>关闭</Text>
            </Pressable>
          </View>
          <Text style={styles.customModuleWizardStep}>步骤 {wizardStep} / 5</Text>
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
                  <Text style={styles.sheetButtonText}>从相册选择</Text>
                </Pressable>
                <Pressable style={styles.sheetButton} onPress={() => void wizardPickSingleFromFiles()}>
                  <Text style={styles.sheetButtonText}>从文件选择</Text>
                </Pressable>
              </View>
            ) : null}
            {wizardStep === 2 ? (
              <View style={styles.customModuleWizardStepBody}>
                {wizardOcrLoading ? <Text style={styles.muted}>OCR 识别中…</Text> : null}
                <Pressable style={styles.addRowButton} onPress={() => setWizardOcrExpanded((v) => !v)}>
                  <Text style={styles.addRowButtonText}>
                    {wizardOcrExpanded ? "收起 OCR 原文" : "查看 OCR 原文"}
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
                  placeholder="多个词用空格、逗号或分号分隔"
                  placeholderTextColor="#94a3b8"
                  autoCorrect={false}
                />
                <Text style={styles.muted}>
                  当前拆分为：{splitRecognitionKeywords(wizardKeywordsText).join(" · ") || "（无）"}
                </Text>
              </View>
            ) : null}
            {wizardStep === 4 ? (
              <View style={styles.customModuleWizardStepBody}>
                <View style={styles.settingsSubLabelHintRow}>
                  <Text style={styles.settingsSubLabel}>模块展示名称</Text>
                  {renderModuleInfoIcon("模块展示名称", "将显示在首页对应折线图标题与设置中的模块列表中。")}
                </View>
                <TextInput
                  value={wizardModuleName}
                  onChangeText={setWizardModuleName}
                  style={styles.settingsFieldInput}
                  placeholder="例如：创业板指关注"
                  placeholderTextColor="#94a3b8"
                />
              </View>
            ) : null}
            {wizardStep === 5 ? (
              <View style={styles.customModuleWizardStepBody}>
                <Text style={styles.line}>模块名称：{wizardModuleName.trim() || "—"}</Text>
                <Text style={styles.line}>匹配用词（任一命中即可）：</Text>
                <Text style={styles.muted}>{splitRecognitionKeywords(wizardKeywordsText).join(" · ") || "—"}</Text>
                <View style={styles.settingsSubLabelHintRow}>
                  <Text style={styles.settingsSubLabel}>提交说明</Text>
                  {renderModuleInfoIcon(
                    "提交说明",
                    "提交后，新导入在「确认并记录」时会写入 OCR；当某日快照的合并 OCR 命中上述任一词时，该日该次导入解析出的资产总额会计入此模块折线图（与内置微信 / 支付宝 / 招行模块并列）。"
                  )}
                </View>
              </View>
            ) : null}
          </ScrollView>
          <View style={styles.customModuleWizardFooter}>
            <Pressable style={styles.customModuleWizardExitButton} onPress={closeCustomModuleWizard}>
              <Text style={styles.customModuleWizardExitText}>退出向导</Text>
            </Pressable>
            <View style={styles.customModuleWizardFooterRight}>
              {wizardStep > 1 ? (
                <Pressable style={styles.ocrRuleModalSecondaryButton} onPress={wizardGoPrev}>
                  <Text style={styles.ocrRuleModalSecondaryText}>上一步</Text>
                </Pressable>
              ) : null}
              {wizardStep < 5 ? (
                <Pressable style={styles.ocrRuleModalPrimaryButton} onPress={wizardGoNext}>
                  <Text style={styles.ocrRuleModalPrimaryText}>{wizardStep === 1 ? "下一步（开始 OCR）" : "下一步"}</Text>
                </Pressable>
              ) : (
                <Pressable style={styles.ocrRuleModalPrimaryButton} onPress={() => void submitCustomRecognitionModule()}>
                  <Text style={styles.ocrRuleModalPrimaryText}>提交</Text>
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
              <Text style={styles.customModuleWizardTitle}>配置识别模块</Text>
              {renderModuleInfoIcon("配置识别模块", MODULE_HINT_TEXT.configModule)}
            </View>
            <Pressable style={styles.customModuleWizardHeaderCloseHit} onPress={closeCustomModuleConfig} hitSlop={12}>
              <Text style={styles.customModuleWizardCloseText}>关闭</Text>
            </Pressable>
          </View>
          <ScrollView
            style={styles.customModuleWizardScrollFlex}
            contentContainerStyle={styles.customModuleWizardScroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {editCmError ? <Text style={[styles.warn, styles.customModuleWizardErr]}>{editCmError}</Text> : null}
            <Text style={styles.settingsSubLabel}>模块展示名称</Text>
            <TextInput
              value={editCmDisplayName}
              onChangeText={setEditCmDisplayName}
              style={styles.settingsFieldInput}
              placeholder="例如：创业板指关注"
              placeholderTextColor="#94a3b8"
              editable={!editCmSaving}
            />
            <View style={styles.settingsSubLabelHintRow}>
              <Text style={styles.settingsSubLabel}>匹配用词（任一命中即可）</Text>
              {renderModuleInfoIcon("匹配用词", MODULE_HINT_TEXT.configKeywords)}
            </View>
            <TextInput
              value={editCmKeywordsText}
              onChangeText={setEditCmKeywordsText}
              multiline
              style={[styles.settingsFieldInput, styles.customModuleWizardKeywordInput]}
              placeholder="多个词用空格、逗号或分号分隔"
              placeholderTextColor="#94a3b8"
              autoCorrect={false}
              editable={!editCmSaving}
            />
            <Text style={styles.muted}>
              当前拆分为：{splitRecognitionKeywords(editCmKeywordsText).join(" · ") || "（无）"}
            </Text>
          </ScrollView>
          <View style={styles.customModuleConfigFooter}>
            <Pressable
              style={styles.ocrRuleModalDeleteButton}
              onPress={confirmDeleteCustomModule}
              disabled={editCmSaving}
            >
              <Text style={styles.ocrRuleModalDeleteText}>删除此模块</Text>
            </Pressable>
            <Pressable
              style={[styles.ocrRuleModalPrimaryButton, editCmSaving ? styles.customModuleConfigSaveDisabled : null]}
              onPress={() => void saveCustomModuleConfig()}
              disabled={editCmSaving}
            >
              <Text style={styles.ocrRuleModalPrimaryText}>{editCmSaving ? "保存中…" : "保存修改"}</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </Modal>

      <ScrollView nestedScrollEnabled contentContainerStyle={[styles.content, { paddingTop: 16 + androidTopInset }]}>
        <View style={styles.heroCard}>
          <View style={styles.heroTopRow}>
            <Text style={styles.heroHint}>目前为止总资产(元)</Text>
            <View style={styles.heroActions}>
              <Pressable style={[styles.manageButton, modulePressOpacityStyle()]} onPress={() => setManageVisible(true)}>
                <Text style={styles.manageButtonText}>导入</Text>
              </Pressable>
              <Pressable style={[styles.settingsGearButton, modulePressOpacityStyle()]} onPress={() => setSettingsVisible(true)}>
                <Text style={styles.settingsGearText}>⚙</Text>
              </Pressable>
            </View>
          </View>
          <Text style={styles.heroTotal}>{formatDisplayAmount(dailySummary.total)}</Text>
          {dbInitError ? <Text style={styles.heroError}>数据库异常：{dbInitError}</Text> : null}
          <View style={styles.quickStatsColumn}>
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
            <View style={styles.quickStatRow}>
              <View style={styles.quickStatItem}>
                <Text style={styles.quickStatLabel}>股票</Text>
                <Text style={styles.quickStatValue}>{stockAmount.toFixed(2)}</Text>
              </View>
              <View style={styles.quickStatItem}>
                <Text style={styles.quickStatLabel}>理财</Text>
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
                  资金趋势折线图
                </Text>
                {renderModuleInfoIcon("资金趋势折线图", MODULE_HINT_TEXT.trendChart, true)}
              </View>
            </View>
            {renderTrendTypePicker("trend-main")}
          </View>
          <TrendLineChart
            points={trendPoints}
            breakdownByClass={mainTrendBreakdown}
            primarySeriesLabel="全部"
            chartTooltipOpacity={moduleControlOpacity}
          />
          {debugJsonDumpsVisible ? (
            <>
              <Text style={styles.debugDumpLabel}>本图折线数据结构（调试）</Text>
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
              primarySeriesLabel="全部"
              chartTooltipOpacity={moduleControlOpacity}
            />
            {debugJsonDumpsVisible ? (
              <>
                <Text style={styles.debugDumpLabel}>本图折线数据结构（调试）</Text>
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
                  {m.displayName}趋势
                </Text>
              </View>
              {renderTrendTypePicker(`cm-${m.id}`)}
            </View>
            <TrendLineChart
              points={customModuleTrendPoints[m.id] ?? []}
              breakdownByClass={customModuleTrendBreakdown[m.id]}
              primarySeriesLabel="全部"
              chartTooltipOpacity={moduleControlOpacity}
            />
            {debugJsonDumpsVisible ? (
              <>
                <Text style={styles.debugDumpLabel}>本图折线数据结构（调试）</Text>
                {renderDebugJsonScroll(trendChartsStructureDebugText.customModules[m.id] ?? "{}")}
              </>
            ) : null}
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
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.settingsScrollContent}
            showsVerticalScrollIndicator={false}
          >
          <View style={styles.settingsOpacityBarRow}>
            <Text style={styles.settingsOpacityInlineLabel}>透明度：</Text>
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
              <Text style={styles.settingsLabel}>隐私与安全</Text>
              {renderModuleInfoIcon("隐私与安全", MODULE_HINT_TEXT.privacy, true)}
            </View>
            {biometricAvailable ? (
              <Pressable style={[styles.securityActionButton, modulePressOpacityStyle()]} onPress={handleToggleBiometric}>
                <Text style={styles.securityActionButtonText}>{biometricEnabled ? "关闭生物识别解锁" : "开启生物识别解锁"}</Text>
              </Pressable>
            ) : (
              <Text style={styles.muted}>当前设备未检测到可用的生物识别能力。</Text>
            )}
          </View>
          <View style={[styles.settingsCard, { backgroundColor: cardBackgroundColor }]}>
            <View style={styles.settingsLabelHintRow}>
              <Text style={styles.settingsLabel}>模块展示</Text>
              {renderModuleInfoIcon("模块展示", MODULE_HINT_TEXT.moduleDisplay, true)}
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
              <Text style={styles.settingsLabel}>新增识别模块</Text>
              {renderModuleInfoIcon("新增识别模块", MODULE_HINT_TEXT.newCustomModule, true)}
            </View>
            {customModuleNotice ? <Text style={styles.muted}>{customModuleNotice}</Text> : null}
            <Pressable style={[styles.securityActionButton, modulePressOpacityStyle()]} onPress={openCustomModuleWizard}>
              <Text style={styles.securityActionButtonText}>打开配置向导</Text>
            </Pressable>
          </View>

          <View style={[styles.settingsCard, { backgroundColor: cardBackgroundColor }]}>
            <View style={styles.settingsLabelHintRow}>
              <Text style={styles.settingsLabel}>自定义 OCR 识别规则</Text>
              {renderModuleInfoIcon("自定义 OCR 识别规则", MODULE_HINT_TEXT.ocrRules, true)}
            </View>
            {customRuleNotice ? (
              <Text style={customRuleNotice.includes("已保存") ? styles.muted : styles.warn}>{customRuleNotice}</Text>
            ) : null}
            {ocrCustomRules.length ? (
              <View style={styles.settingsRuleListSection}>
                <View style={styles.settingsSubLabelHintRow}>
                  <Text style={styles.settingsSubLabel}>已添加的规则</Text>
                  {renderModuleInfoIcon("已添加的规则", MODULE_HINT_TEXT.ocrRulesList, true)}
                </View>
                <View style={[styles.assetTableHeaderRow, styles.ruleListColumnsGap]}>
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
              <Text style={styles.muted}>暂无自定义规则。点击下方按钮添加。</Text>
            )}
            <Pressable style={[styles.securityActionButton, modulePressOpacityStyle()]} onPress={openOcrRuleModalForCreate}>
              <Text style={styles.securityActionButtonText}>添加规则</Text>
            </Pressable>
          </View>
          {debugJsonDumpsVisible ? (
            <View style={[styles.settingsCard, { backgroundColor: cardBackgroundColor }]}>
              <View style={styles.settingsLabelHintRow}>
                <Text style={styles.settingsLabel}>已存快照（调试用）</Text>
              </View>
              <Text style={styles.muted}>从本地加密库读取当前所有快照 JSON，便于对照折线。OCR 正文过长会截断。</Text>
              <View style={styles.debugDumpToolbar}>
                <Pressable
                  style={[styles.securityActionButton, modulePressOpacityStyle(), persistedSnapshotsDebugBusy && { opacity: 0.6 }]}
                  onPress={() => void refreshPersistedSnapshotsDebug()}
                  disabled={persistedSnapshotsDebugBusy}
                >
                  <Text style={styles.securityActionButtonText}>
                    {persistedSnapshotsDebugBusy ? "加载中…" : "刷新已存数据"}
                  </Text>
                </Pressable>
              </View>
              {renderDebugJsonScroll(persistedSnapshotsDebugText || "（点击「刷新已存数据」）", "tall")}
            </View>
          ) : null}
          <View style={[styles.settingsCard, { backgroundColor: cardBackgroundColor }]}>
            <View style={styles.settingsDataCleanupRow}>
              <View style={styles.settingsDataCleanupTitleCluster}>
                <Text style={styles.settingsLabel} numberOfLines={1} ellipsizeMode="tail">
                  数据清理
                </Text>
                {renderModuleInfoIcon("数据清理", MODULE_HINT_TEXT.dataCleanup, true)}
              </View>
              <View style={styles.clearActionRowModal}>
                <Pressable
                  style={[styles.clearActionButtonBlue, modulePressOpacityStyle()]}
                  onPress={() => {
                    setClearMode("today");
                    setClearAllStep2(false);
                  }}
                >
                  <Text style={styles.clearActionText}>清空今日</Text>
                </Pressable>
                <Pressable
                  style={[styles.clearActionButtonDanger, modulePressOpacityStyle()]}
                  onPress={() => {
                    setClearMode("all");
                    setClearAllStep2(false);
                  }}
                >
                  <Text style={styles.clearActionText}>清空全部导入</Text>
                </Pressable>
              </View>
            </View>
          </View>
          <View style={[styles.settingsCard, { backgroundColor: cardBackgroundColor }]}>
            <View style={styles.settingsDataCleanupRow}>
              <View style={styles.settingsDataCleanupTitleCluster}>
                <Text style={styles.settingsLabel} numberOfLines={1} ellipsizeMode="tail">
                  测试数据
                </Text>
                {renderModuleInfoIcon("测试数据", MODULE_HINT_TEXT.seedTestData, true)}
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
                    {seedTestBusy ? "处理中…" : "写入测试数据"}
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
                  <Text style={styles.clearActionText}>清除测试数据</Text>
                </Pressable>
              </View>
            </View>
            <Text style={styles.seedTestDebugToggleHint}>
              开启后显示首页各折线图 JSON、导入页写入预览与本页已存快照；关闭后隐藏。
            </Text>
            <Pressable
              style={[styles.securityActionButton, modulePressOpacityStyle(), styles.seedTestDebugToggleButton]}
              onPress={() => setDebugJsonDumpsVisible((v) => !v)}
            >
              <Text style={styles.securityActionButtonText}>
                {debugJsonDumpsVisible ? "隐藏调试数据" : "显示调试数据"}
              </Text>
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
          <ScrollView nestedScrollEnabled contentContainerStyle={styles.manageContent}>
            <View style={[styles.card, { backgroundColor: cardBackgroundColor }]}>
              <View style={styles.sectionHeaderRow}>
                <View style={[styles.cardTitleHintRow, styles.cardTitleHintRowGrow]}>
                  <Text style={styles.cardTitle}>截图导入</Text>
                  {renderModuleInfoIcon("截图导入", MODULE_HINT_TEXT.screenshotImport, true)}
                </View>
                <View style={styles.sectionHeaderActions}>
                  {selectedImageUris.length ? (
                    <Pressable style={[styles.retryButton, modulePressOpacityStyle()]} onPress={handleRetryRecognition}>
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
            </View>

            <View style={[styles.card, { backgroundColor: cardBackgroundColor }]}>
              <View style={[styles.cardTitleHintRow, styles.cardTitleHintRowGrow]}>
                <Text style={styles.cardTitle}>解析结果（可修改）</Text>
                {renderModuleInfoIcon("解析结果（可修改）", MODULE_HINT_TEXT.parseResult, true)}
              </View>
              {groupedEditableAssets.map((group) => (
                <View style={styles.parseGroup} key={group.uri}>
                  <View style={styles.parseGroupHeader}>
                    <Text style={styles.parseGroupTitle}>页面 {group.index + 1}</Text>
                    <Text style={styles.parseGroupTotal}>当前页面总额：{group.total.toFixed(2)}</Text>
                  </View>
                  <Text style={styles.line}>
                    页面类型：
                    {group.meta?.parseResult.screenDisplayLabel ??
                      SCREEN_TYPE_LABEL[group.meta?.parseResult.screenType ?? "unknown"]}
                  </Text>
                  <Pressable style={[styles.addRowButton, modulePressOpacityStyle()]} onPress={() => addManualAssetRow(group.uri)}>
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
              <Pressable style={[styles.confirmButton, modulePressOpacityStyle()]} onPress={handleConfirmSnapshot}>
                <Text style={styles.confirmButtonText}>{saveLoading ? "记录中..." : "确认并记录"}</Text>
              </Pressable>
              {debugJsonDumpsVisible ? (
                <>
                  <Text style={styles.debugDumpLabel}>将写入库的预览（调试用）</Text>
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

