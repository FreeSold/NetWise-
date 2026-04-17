import { Platform, StyleSheet } from "react-native";

export const styles = StyleSheet.create({
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
    padding: 16,
    overflow: "visible"
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
  quickStatsColumn: {
    gap: 8
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
    alignItems: "center",
    justifyContent: "flex-end",
    flexWrap: "nowrap",
    flexShrink: 0,
    gap: 8
  },
  settingsDataCleanupRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "nowrap",
    width: "100%",
    gap: 8
  },
  settingsDataCleanupTitleCluster: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 1,
    minWidth: 0,
    marginRight: "auto"
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
  actionButtonDisabled: {
    opacity: 0.45
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
  moduleHintPopoverCard: {
    backgroundColor: "white",
    borderRadius: 14,
    padding: 14,
    gap: 10,
    maxWidth: 400,
    width: "100%",
    alignSelf: "center",
    maxHeight: "72%"
  },
  moduleHintPopoverTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#163d7a"
  },
  moduleHintPopoverScroll: {
    maxHeight: 320
  },
  moduleHintPopoverBody: {
    fontSize: 14,
    lineHeight: 21,
    color: "#334155"
  },
  moduleHintPopoverOk: {
    borderRadius: 10,
    backgroundColor: "#2563eb",
    paddingVertical: 10,
    alignItems: "center"
  },
  moduleHintPopoverOkText: {
    color: "white",
    fontWeight: "700",
    fontSize: 15
  },
  moduleInfoIconHit: {
    width: 13,
    height: 13,
    borderRadius: 6.5,
    borderWidth: 1,
    borderColor: "#64748b",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.65)"
  },
  moduleInfoIconChar: {
    fontSize: 8,
    fontWeight: "800",
    color: "#475569",
    marginTop: 0
  },
  settingsLabelHintRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8
  },
  settingsSubLabelHintRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 6
  },
  sourceTitleHintRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 4
  },
  sourceTitleFlex: {
    flex: 1
  },
  cardTitleHintRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 1,
    minWidth: 0
  },
  cardTitleHintRowGrow: {
    flex: 1,
    minWidth: 0
  },
  trendHeaderTitleCluster: {
    flex: 1,
    minWidth: 0,
    marginRight: 4
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
  debugDumpLabel: {
    marginTop: 12,
    marginBottom: 6,
    fontSize: 12,
    fontWeight: "600",
    color: "#1e293b"
  },
  debugDumpToolbar: {
    marginTop: 8,
    marginBottom: 8
  },
  debugDumpScrollBox: {
    height: 200,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    backgroundColor: "#f8fafc"
  },
  debugDumpScrollBoxTall: {
    height: 360
  },
  debugDumpScrollContent: {
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 14
  },
  debugDumpMonoText: {
    fontSize: 11,
    ...(Platform.OS === "ios" ? { fontFamily: "Menlo" } : { fontFamily: "monospace" }),
    color: "#0f172a"
  },
  seedTestDebugToggleHint: {
    marginTop: 12,
    fontSize: 12,
    color: "#64748b",
    lineHeight: 18
  },
  seedTestDebugToggleButton: {
    marginTop: 10,
    alignSelf: "stretch"
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
  /** 菜单打开时整张趋势卡抬升，避免下方卡片的 Pressable/下拉盖住当前菜单 */
  trendCardMenuLift: {
    zIndex: 2000,
    elevation: 24
  },
  trendPickerArea: {
    position: "relative",
    zIndex: 10
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
    zIndex: 20,
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
  /** 自定义 OCR 规则表：列与列之间增加 1px 间距 */
  ruleListColumnsGap: {
    gap: 1
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
    paddingHorizontal: 7,
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
  platformHiddenGreenCapsule: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    backgroundColor: "#16a34a",
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  platformHiddenGreenCapsuleText: {
    color: "white",
    fontSize: 13,
    fontWeight: "700"
  },
  platformHiddenGreenCapsuleAction: {
    color: "white",
    fontSize: 14,
    fontWeight: "700"
  },
  customModuleVisiblePill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    maxWidth: "100%",
    borderRadius: 999,
    backgroundColor: "#2563eb",
    overflow: "hidden"
  },
  customModulePillLabel: {
    flexShrink: 1
  },
  customModuleVisiblePillBody: {
    flexShrink: 1,
    justifyContent: "center",
    paddingVertical: 8,
    paddingLeft: 12,
    paddingRight: 6,
    minWidth: 0
  },
  customModuleVisiblePillAction: {
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  customModuleHiddenPill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    maxWidth: "100%",
    borderRadius: 999,
    backgroundColor: "#eef5ff",
    borderWidth: 1,
    borderColor: "#bfdbfe",
    overflow: "hidden"
  },
  customModuleHiddenPillAction: {
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  customModuleHiddenPillBody: {
    flexShrink: 1,
    justifyContent: "center",
    paddingVertical: 8,
    paddingRight: 12,
    paddingLeft: 6,
    minWidth: 0
  },
  customModulePillDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: "stretch",
    minHeight: 24,
    backgroundColor: "rgba(255,255,255,0.35)"
  },
  customModulePillDividerLight: {
    width: StyleSheet.hairlineWidth,
    alignSelf: "stretch",
    minHeight: 24,
    backgroundColor: "#bfdbfe"
  },
  customModuleConfigFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "#bfdbfe",
    backgroundColor: "white"
  },
  customModuleConfigSaveDisabled: {
    opacity: 0.55
  },
  settingsOpacityBarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 4
  },
  settingsOpacityInlineLabel: {
    color: "rgba(255,255,255,0.95)",
    fontSize: 15,
    fontWeight: "700"
  },
  opacityTrackTouch: {
    flex: 1,
    minWidth: 0,
    height: 30
  },
  opacityTrackClip: {
    flex: 1,
    height: 30,
    borderRadius: 10,
    overflow: "hidden",
    position: "relative"
  },
  opacityTrackBg: {
    ...StyleSheet.absoluteFillObject
  },
  opacityTrackFill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    borderTopLeftRadius: 10,
    borderBottomLeftRadius: 10,
    maxWidth: "100%"
  },
  opacityPercentCenter: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center"
  },
  opacityTrackPercentText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#0f172a",
    letterSpacing: 0.3,
    textShadowColor: "rgba(255,255,255,0.85)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 3
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
  },
  customModuleWizardSafe: {
    flex: 1,
    backgroundColor: "#eff6ff"
  },
  customModuleWizardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#bfdbfe",
    backgroundColor: "white"
  },
  customModuleWizardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 8,
    minWidth: 0,
    marginRight: 8
  },
  customModuleWizardTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#163d7a",
    flexShrink: 1
  },
  customModuleWizardHeaderCloseHit: {
    paddingVertical: 4,
    paddingHorizontal: 4
  },
  customModuleWizardCloseText: {
    color: "#2563eb",
    fontSize: 16,
    fontWeight: "700"
  },
  customModuleWizardStep: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    color: "#4f76b3",
    fontSize: 12,
    fontWeight: "600"
  },
  customModuleWizardErr: {
    marginHorizontal: 16,
    marginBottom: 4
  },
  customModuleWizardScrollFlex: {
    flex: 1
  },
  customModuleWizardScroll: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 10
  },
  customModuleWizardStepBody: {
    gap: 10,
    paddingVertical: 8
  },
  customModuleWizardPreview: {
    width: "100%",
    height: 220,
    borderRadius: 10,
    backgroundColor: "#f0f4ff"
  },
  customModuleWizardKeywordInput: {
    minHeight: 120,
    textAlignVertical: "top"
  },
  customModuleWizardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "#bfdbfe",
    backgroundColor: "white",
    flexWrap: "wrap"
  },
  customModuleWizardFooterRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 0
  },
  customModuleWizardExitButton: {
    paddingVertical: 10,
    paddingHorizontal: 8
  },
  customModuleWizardExitText: {
    color: "#64748b",
    fontSize: 15,
    fontWeight: "600"
  }
});