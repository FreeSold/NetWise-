import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useState } from "react";
import * as Crypto from "expo-crypto";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { Picker } from "@react-native-picker/picker";
import { Image, Modal, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { AssetClass, ParsedAsset, ParseResult } from "./src/domain/types";
import { toSummaryFromAssets } from "./src/aggregation/summary";
import { TrendLineChart } from "./src/components/TrendLineChart";
import { recognizeTextFromBase64, recognizeTextFromImage } from "./src/ocr/ocrSpace";
import { parseOcrText } from "./src/parsers/templates";
import {
  initAssetHistoryDb,
  queryTrendSeries,
  saveImportSnapshot,
  type TrendFilter,
  type TrendPoint
} from "./src/storage/assetHistoryDb";

const SAMPLE_TEXT = `招商银行
总资产 356,124.10
活期 10,220.80
理财 245,000.00
基金 100,903.30`;
const ASSET_CLASS_ORDER: AssetClass[] = ["cash", "fund", "insurance", "stock", "wealth_management"];
const ASSET_CLASS_LABEL: Record<AssetClass, string> = {
  cash: "现金",
  fund: "基金",
  insurance: "保险",
  stock: "股票",
  wealth_management: "理财",
};
const TREND_FILTER_ORDER: TrendFilter[] = ["all", ...ASSET_CLASS_ORDER];
const TREND_FILTER_LABEL: Record<TrendFilter, string> = {
  all: "全部",
  cash: "现金",
  fund: "基金",
  insurance: "保险",
  stock: "股票",
  wealth_management: "理财"
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
  const initialParsed = parseOcrText(SAMPLE_TEXT);
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);
  const [currentImageHash, setCurrentImageHash] = useState<string | null>(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [sourceModalVisible, setSourceModalVisible] = useState(false);
  const [previewModalVisible, setPreviewModalVisible] = useState(false);
  const [dbReady, setDbReady] = useState(false);
  const [trendFilter, setTrendFilter] = useState<TrendFilter>("all");
  const [trendPoints, setTrendPoints] = useState<TrendPoint[]>([]);
  const [parsed, setParsed] = useState<ParseResult>(initialParsed);
  const [editableAssets, setEditableAssets] = useState<ParsedAsset[]>(initialParsed.assets);

  const summary = useMemo(() => toSummaryFromAssets(editableAssets), [editableAssets]);

  useEffect(() => {
    async function setupDb() {
      await initAssetHistoryDb();
      setDbReady(true);
    }
    void setupDb();
  }, []);

  useEffect(() => {
    async function loadTrend() {
      if (!dbReady) {
        return;
      }
      const points = await queryTrendSeries(trendFilter);
      setTrendPoints(points);
    }
    void loadTrend();
  }, [dbReady, trendFilter]);

  async function computeImageHash(uri: string, base64?: string | null): Promise<string> {
    const base64Payload =
      base64 ??
      (await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64
      }));
    return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, base64Payload);
  }

  function applyParsing(text: string) {
    const parsedResult = parseOcrText(text);
    setParsed(parsedResult);
    setEditableAssets(parsedResult.assets);
  }

  function updateAssetName(index: number, name: string) {
    setEditableAssets((prev) => prev.map((a, i) => (i === index ? { ...a, name } : a)));
  }

  function updateAssetAmount(index: number, amountRaw: string) {
    const amount = Number(amountRaw.replace(/,/g, ""));
    if (!Number.isFinite(amount)) {
      return;
    }
    setEditableAssets((prev) => prev.map((a, i) => (i === index ? { ...a, amount } : a)));
  }

  function updateAssetClass(index: number, assetClass: AssetClass) {
    setEditableAssets((prev) => prev.map((a, i) => (i === index ? { ...a, assetClass } : a)));
  }

  async function runOcrForAsset(imageUri: string, base64?: string | null) {
    setSelectedImageUri(imageUri);
    setOcrLoading(true);
    setOcrError(null);
    setSaveNotice(null);
    try {
      const imageHash = await computeImageHash(imageUri, base64);
      setCurrentImageHash(imageHash);
      const text = base64
        ? await recognizeTextFromBase64(base64, inferMimeFromUri(imageUri))
        : await recognizeTextFromImage(imageUri);
      console.log("[OCR_FULL_TEXT_BEGIN]\n" + text + "\n[OCR_FULL_TEXT_END]");
      applyParsing(text);
    } catch (error) {
      setOcrError(error instanceof Error ? error.message : "OCR 识别失败");
    } finally {
      setOcrLoading(false);
    }
  }

  async function handlePickAndRecognize() {
    setSourceModalVisible(false);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setOcrError("没有相册权限，请在系统设置中允许访问相册。");
      return;
    }

    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      base64: true,
      quality: 1
    });
    if (picked.canceled || !picked.assets.length) {
      return;
    }

    const asset = picked.assets[0];
    await runOcrForAsset(asset.uri, asset.base64);
  }

  async function handlePickFromFiles() {
    setSourceModalVisible(false);
    const picked = await DocumentPicker.getDocumentAsync({
      type: ["image/*"],
      multiple: false,
      copyToCacheDirectory: true
    });
    if (picked.canceled || !picked.assets.length) {
      return;
    }
    const asset = picked.assets[0];
    await runOcrForAsset(asset.uri);
  }

  async function handleConfirmSnapshot() {
    if (!dbReady) {
      setSaveNotice("数据库初始化中，请稍后重试。");
      return;
    }
    if (!currentImageHash) {
      setSaveNotice("请先导入并识别图片。");
      return;
    }
    if (!editableAssets.length) {
      setSaveNotice("当前没有可保存的资产项。");
      return;
    }
    const result = await saveImportSnapshot(currentImageHash, editableAssets);
    setSaveNotice(result.saved ? `已保存 ${result.date} 的快照记录。` : "同一图片今天已记录，已自动跳过重复保存。");
    const points = await queryTrendSeries(trendFilter);
    setTrendPoints(points);
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="auto" />
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
          {selectedImageUri ? <Image source={{ uri: selectedImageUri }} style={styles.previewImage} /> : null}
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

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>NetWise 资产识别 MVP</Text>
        <Text style={styles.subtitle}>第一批支持：招行财产/理财、支付宝理财/基金、微信钱包</Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>截图导入 + OCR 识别</Text>
          <Pressable
            style={styles.previewTile}
            onPress={() => {
              if (selectedImageUri) {
                setPreviewModalVisible(true);
              } else {
                setSourceModalVisible(true);
              }
            }}
          >
            {selectedImageUri ? (
              <Image source={{ uri: selectedImageUri }} style={styles.previewTileImage} />
            ) : (
              <Text style={styles.previewTileHint}>点击选择图片（相册或文件）</Text>
            )}
          </Pressable>
          {selectedImageUri ? <Text style={styles.muted}>点击方格可反复预览图片</Text> : null}
          {ocrLoading ? <Text style={styles.muted}>识别中...</Text> : null}
          {ocrError ? <Text style={styles.error}>{ocrError}</Text> : null}
          <Text style={styles.muted}>识别后会自动分类，只展示可编辑的资产结果。</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>解析结果（可修改）</Text>
          <Text style={styles.line}>页面类型: {parsed.screenType}</Text>
          {editableAssets.map((asset, index) => (
            <View style={styles.assetRow} key={`${asset.name}-${index}`}>
              <TextInput
                value={asset.name}
                onChangeText={(value) => updateAssetName(index, value)}
                style={styles.assetNameInput}
                placeholder="资产名称"
              />
              <TextInput
                value={asset.amount.toFixed(2)}
                onChangeText={(value) => updateAssetAmount(index, value)}
                style={styles.assetAmountInput}
                keyboardType="decimal-pad"
                placeholder="金额"
              />
              <View style={styles.classPickerWrap}>
                <View style={styles.classDisplayRow}>
                  <Text style={styles.classLabelText}>{ASSET_CLASS_LABEL[asset.assetClass]}</Text>
                  <Text style={styles.classArrowText}>▼</Text>
                </View>
                <Picker
                  mode="dialog"
                  selectedValue={asset.assetClass}
                  onValueChange={(value) => updateAssetClass(index, value as AssetClass)}
                  style={styles.classPickerOverlay}
                >
                  {ASSET_CLASS_ORDER.map((assetClass) => (
                    <Picker.Item
                      key={assetClass}
                      label={ASSET_CLASS_LABEL[assetClass]}
                      value={assetClass}
                    />
                  ))}
                </Picker>
              </View>
            </View>
          ))}
          {parsed.warnings.map((warn) => (
            <Text style={styles.warn} key={warn}>
              {warn}
            </Text>
          ))}
          <Pressable style={styles.confirmButton} onPress={handleConfirmSnapshot}>
            <Text style={styles.confirmButtonText}>确认并记录到数据库</Text>
          </Pressable>
          {saveNotice ? <Text style={styles.muted}>{saveNotice}</Text> : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>统计汇总</Text>
          {summary.map((line) => (
            <Text style={styles.line} key={line}>
              {line}
            </Text>
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>资金趋势折线图</Text>
          <View style={styles.trendPickerWrap}>
            <Picker
              selectedValue={trendFilter}
              onValueChange={(value) => setTrendFilter(value as TrendFilter)}
              style={styles.trendPicker}
            >
              {TREND_FILTER_ORDER.map((filter) => (
                <Picker.Item key={filter} value={filter} label={TREND_FILTER_LABEL[filter]} />
              ))}
            </Picker>
          </View>
          <TrendLineChart points={trendPoints} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f7fb"
  },
  content: {
    gap: 12,
    padding: 16
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#0f172a"
  },
  subtitle: {
    fontSize: 14,
    color: "#475569"
  },
  card: {
    backgroundColor: "white",
    borderRadius: 10,
    padding: 12,
    gap: 8
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "600"
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
    color: "#0f172a"
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
    backgroundColor: "#e2e8f0",
    paddingVertical: 10,
    alignItems: "center"
  },
  sheetCancelButtonText: {
    color: "#0f172a",
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
  previewTile: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderStyle: "dashed",
    borderRadius: 10,
    backgroundColor: "#f8fafc",
    height: 170,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden"
  },
  previewTileImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover"
  },
  previewTileHint: {
    color: "#475569",
    fontSize: 14
  },
  assetRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  assetNameInput: {
    flex: 1,
    borderColor: "#cbd5e1",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: "#f8fafc"
  },
  assetAmountInput: {
    width: 110,
    borderColor: "#cbd5e1",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: "#f8fafc"
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
    backgroundColor: "#0f766e",
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center"
  },
  confirmButtonText: {
    color: "white",
    fontWeight: "700"
  },
  trendPickerWrap: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#f8fafc"
  },
  trendPicker: {
    width: "100%",
    height: 42
  },
  line: {
    color: "#1e293b"
  },
  warn: {
    color: "#b45309"
  },
  error: {
    color: "#b91c1c"
  },
  muted: {
    color: "#64748b",
    fontSize: 12
  }
});
