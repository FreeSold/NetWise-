import { StyleSheet } from "react-native";

export const billStyles = StyleSheet.create({
  heroCard: {
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 8
  },
  heroTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8
  },
  heroHint: {
    color: "#93c5fd",
    fontSize: 13
  },
  filterButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#334155",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8
  },
  filterButtonText: {
    color: "white",
    fontSize: 13,
    fontWeight: "500"
  },
  filterBadge: {
    marginLeft: 6,
    backgroundColor: "#3b82f6",
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 4
  },
  filterBadgeText: {
    color: "white",
    fontSize: 11,
    fontWeight: "600"
  },
  heroTotal: {
    color: "white",
    fontSize: 44,
    fontWeight: "700",
    textAlign: "center",
    marginVertical: 12
  },
  quickStatsColumn: {
    gap: 12,
    marginTop: 8
  },
  quickStatRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 40
  },
  quickStatItem: {
    alignItems: "center"
  },
  quickStatLabel: {
    color: "#93c5fd",
    fontSize: 12,
    marginBottom: 4
  },
  quickStatValue: {
    color: "white",
    fontSize: 18,
    fontWeight: "700"
  },
  card: {
    marginHorizontal: -20,
    marginTop: 12,
    padding: 16,
    borderRadius: 16,
    backgroundColor: "#1e3a5f"
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12
  },
  sectionTitle: {
    color: "white",
    fontSize: 15,
    fontWeight: "600"
  },
  emptyText: {
    color: "#64748b",
    fontSize: 13,
    textAlign: "center",
    paddingVertical: 20
  },
  billItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)"
  },
  billItemLeft: {
    flex: 1
  },
  billItemRight: {
    alignItems: "flex-end"
  },
  billItemPlatform: {
    color: "white",
    fontSize: 14,
    fontWeight: "500",
    marginBottom: 4
  },
  billItemDate: {
    color: "#64748b",
    fontSize: 12
  },
  billItemAmount: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 4
  },
  billItemTradeType: {
    color: "#93c5fd",
    fontSize: 12
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20
  },
  modalContent: {
    backgroundColor: "#1e3a5f",
    borderRadius: 16,
    padding: 20,
    width: "100%",
    maxHeight: "80%"
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16
  },
  modalTitle: {
    color: "white",
    fontSize: 18,
    fontWeight: "600"
  },
  modalClose: {
    color: "#93c5fd",
    fontSize: 20
  },
  modalImage: {
    width: "100%",
    height: 200,
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: "#0f172a"
  },
  imageHint: {
    color: "#64748b",
    fontSize: 11,
    textAlign: "center",
    marginBottom: 16
  },
  imagePlaceholder: {
    width: "100%",
    height: 120,
    borderRadius: 8,
    backgroundColor: "#0f172a",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderStyle: "dashed"
  },
  imagePlaceholderText: {
    color: "#64748b",
    fontSize: 13
  },
  previewOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.9)",
    justifyContent: "center",
    alignItems: "center"
  },
  previewCloseArea: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 80
  },
  previewImage: {
    width: "100%",
    height: "70%"
  },
  previewCloseBtn: {
    position: "absolute",
    bottom: 30,
    paddingHorizontal: 30,
    paddingVertical: 12,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 20
  },
  previewCloseText: {
    color: "white",
    fontSize: 14,
    fontWeight: "500"
  },
  // 筛选弹窗样式
  filterOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end"
  },
  filterContent: {
    backgroundColor: "#1e3a5f",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: "85%"
  },
  filterHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20
  },
  filterTitle: {
    color: "white",
    fontSize: 18,
    fontWeight: "600"
  },
  filterClose: {
    color: "#93c5fd",
    fontSize: 20
  },
  filterSection: {
    marginBottom: 20
  },
  filterSectionTitle: {
    color: "#93c5fd",
    fontSize: 14,
    fontWeight: "500",
    marginBottom: 12
  },
  filterTags: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  filterTag: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)"
  },
  filterTagActive: {
    backgroundColor: "#3b82f6",
    borderColor: "#3b82f6"
  },
  filterTagText: {
    color: "#94a3b8",
    fontSize: 13
  },
  filterTagTextActive: {
    color: "white",
    fontWeight: "500"
  },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  filterInput: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: "white",
    fontSize: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)"
  },
  filterInputDivider: {
    color: "#64748b",
    fontSize: 14
  },
  filterActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.1)"
  },
  filterResetBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center"
  },
  filterResetText: {
    color: "#94a3b8",
    fontSize: 15,
    fontWeight: "500"
  },
  filterApplyBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#3b82f6",
    alignItems: "center"
  },
  filterApplyText: {
    color: "white",
    fontSize: 15,
    fontWeight: "600"
  },
  toolbarOuter: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    paddingBottom: 20
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "white",
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 16,
    width: "92%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8
  },
  toolbarButton: {
    paddingVertical: 8,
    paddingHorizontal: 16
  },
  toolbarButtonText: {
    color: "#2563eb",
    fontSize: 15,
    fontWeight: "600"
  },
  toolbarAddButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#2563eb",
    alignItems: "center",
    justifyContent: "center"
  },
  toolbarAddText: {
    color: "white",
    fontSize: 20,
    fontWeight: "700",
    lineHeight: 24
  },
  toolbarSubmitButton: {
    backgroundColor: "#2563eb",
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 20
  },
  toolbarSubmitText: {
    color: "white",
    fontSize: 15,
    fontWeight: "600"
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)"
  },
  detailLabel: {
    color: "#93c5fd",
    fontSize: 14
  },
  detailValue: {
    color: "white",
    fontSize: 14,
    fontWeight: "500"
  }
});
