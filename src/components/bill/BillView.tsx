import { Image, Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useState } from "react";
import { billStyles as styles } from "./billStyles";
import {
  type BillEntry,
  type BillPlatform,
  type BillTradeType,
  BILL_PLATFORM_LABEL,
  BILL_TRADE_TYPE_LABEL
} from "../../storage/billHistoryDb";

// 筛选条件类型
export type BillFilter = {
  tradeTypes: BillTradeType[];
  platforms: BillPlatform[];
  dateRange: { start: string; end: string };
  amountRange: { min: string; max: string };
};

export const defaultBillFilter: BillFilter = {
  tradeTypes: [],
  platforms: [],
  dateRange: { start: "", end: "" },
  amountRange: { min: "", max: "" }
};

export type BillViewProps = {
  summary: {
    totalIncome: number;
    totalExpense: number;
    balance: number;
  };
  filter: BillFilter;
  onFilterChange: (filter: BillFilter) => void;
};

// 交易类型标签
const ALL_TRADE_TYPES: BillTradeType[] = ["catering", "shopping", "transfer", "service", "other", "utility", "refund", "salary"];
// 平台类型
const ALL_PLATFORMS: BillPlatform[] = ["alipay", "wechat", "cmb", "meituan", "other"];

// 筛选弹窗组件
export type BillFilterModalProps = {
  visible: boolean;
  filter: BillFilter;
  onClose: () => void;
  onApply: (filter: BillFilter) => void;
};

export function BillFilterModal({ visible, filter, onClose, onApply }: BillFilterModalProps) {
  const [localFilter, setLocalFilter] = useState<BillFilter>(filter);

  const toggleTradeType = (type: BillTradeType) => {
    setLocalFilter(prev => ({
      ...prev,
      tradeTypes: prev.tradeTypes.includes(type)
        ? prev.tradeTypes.filter(t => t !== type)
        : [...prev.tradeTypes, type]
    }));
  };

  const togglePlatform = (platform: BillPlatform) => {
    setLocalFilter(prev => ({
      ...prev,
      platforms: prev.platforms.includes(platform)
        ? prev.platforms.filter(p => p !== platform)
        : [...prev.platforms, platform]
    }));
  };

  const handleReset = () => {
    const reset = defaultBillFilter;
    setLocalFilter(reset);
  };

  const handleApply = () => {
    onApply(localFilter);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.filterOverlay}>
        <View style={styles.filterContent}>
          <View style={styles.filterHeader}>
            <Text style={styles.filterTitle}>筛选条件</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={styles.filterClose}>✕</Text>
            </Pressable>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            {/* 交易类型 */}
            <View style={styles.filterSection}>
              <Text style={styles.filterSectionTitle}>账单类型</Text>
              <View style={styles.filterTags}>
                {ALL_TRADE_TYPES.map(type => (
                  <Pressable
                    key={type}
                    style={[styles.filterTag, localFilter.tradeTypes.includes(type) && styles.filterTagActive]}
                    onPress={() => toggleTradeType(type)}
                  >
                    <Text style={[styles.filterTagText, localFilter.tradeTypes.includes(type) && styles.filterTagTextActive]}>
                      {BILL_TRADE_TYPE_LABEL[type]}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* 时间区间 */}
            <View style={styles.filterSection}>
              <Text style={styles.filterSectionTitle}>时间区间</Text>
              <View style={styles.filterRow}>
                <TextInput
                  style={styles.filterInput}
                  placeholder="开始日期"
                  placeholderTextColor="#64748b"
                  value={localFilter.dateRange.start}
                  onChangeText={text => setLocalFilter(prev => ({ ...prev, dateRange: { ...prev.dateRange, start: text } }))}
                />
                <Text style={styles.filterInputDivider}>至</Text>
                <TextInput
                  style={styles.filterInput}
                  placeholder="结束日期"
                  placeholderTextColor="#64748b"
                  value={localFilter.dateRange.end}
                  onChangeText={text => setLocalFilter(prev => ({ ...prev, dateRange: { ...prev.dateRange, end: text } }))}
                />
              </View>
            </View>

            {/* 金额区间 */}
            <View style={styles.filterSection}>
              <Text style={styles.filterSectionTitle}>金额区间</Text>
              <View style={styles.filterRow}>
                <TextInput
                  style={styles.filterInput}
                  placeholder="最小金额"
                  placeholderTextColor="#64748b"
                  keyboardType="numeric"
                  value={localFilter.amountRange.min}
                  onChangeText={text => setLocalFilter(prev => ({ ...prev, amountRange: { ...prev.amountRange, min: text } }))}
                />
                <Text style={styles.filterInputDivider}>至</Text>
                <TextInput
                  style={styles.filterInput}
                  placeholder="最大金额"
                  placeholderTextColor="#64748b"
                  keyboardType="numeric"
                  value={localFilter.amountRange.max}
                  onChangeText={text => setLocalFilter(prev => ({ ...prev, amountRange: { ...prev.amountRange, max: text } }))}
                />
              </View>
            </View>

            {/* 平台 */}
            <View style={styles.filterSection}>
              <Text style={styles.filterSectionTitle}>支付平台</Text>
              <View style={styles.filterTags}>
                {ALL_PLATFORMS.map(platform => (
                  <Pressable
                    key={platform}
                    style={[styles.filterTag, localFilter.platforms.includes(platform) && styles.filterTagActive]}
                    onPress={() => togglePlatform(platform)}
                  >
                    <Text style={[styles.filterTagText, localFilter.platforms.includes(platform) && styles.filterTagTextActive]}>
                      {BILL_PLATFORM_LABEL[platform]}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </ScrollView>

          {/* 按钮区域 */}
          <View style={styles.filterActions}>
            <Pressable style={styles.filterResetBtn} onPress={handleReset}>
              <Text style={styles.filterResetText}>重置</Text>
            </Pressable>
            <Pressable style={styles.filterApplyBtn} onPress={handleApply}>
              <Text style={styles.filterApplyText}>应用筛选</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function BillSummaryCard({ summary, filter, onFilterChange }: BillViewProps) {
  const [filterVisible, setFilterVisible] = useState(false);

  // 计算已选条件数量
  const activeFilterCount = filter.tradeTypes.length + filter.platforms.length +
    (filter.dateRange.start ? 1 : 0) + (filter.dateRange.end ? 1 : 0) +
    (filter.amountRange.min ? 1 : 0) + (filter.amountRange.max ? 1 : 0);

  return (
    <>
      <View style={styles.heroCard}>
        <View style={styles.heroTopRow}>
          <Text style={styles.heroHint}>账单汇总</Text>
          <Pressable style={styles.filterButton} onPress={() => setFilterVisible(true)}>
            <Text style={styles.filterButtonText}>筛选</Text>
            {activeFilterCount > 0 && <View style={styles.filterBadge}><Text style={styles.filterBadgeText}>{activeFilterCount}</Text></View>}
          </Pressable>
        </View>
        <Text style={styles.heroTotal}>{summary.balance.toFixed(2)}</Text>
        <View style={styles.quickStatsColumn}>
          <View style={styles.quickStatRow}>
            <View style={styles.quickStatItem}>
              <Text style={styles.quickStatLabel}>收入</Text>
              <Text style={[styles.quickStatValue, { color: "#34d399" }]}>+{summary.totalIncome.toFixed(2)}</Text>
            </View>
            <View style={styles.quickStatItem}>
              <Text style={styles.quickStatLabel}>支出</Text>
              <Text style={[styles.quickStatValue, { color: "#f87171" }]}>-{summary.totalExpense.toFixed(2)}</Text>
            </View>
          </View>
        </View>
      </View>
      <BillFilterModal
        visible={filterVisible}
        filter={filter}
        onClose={() => setFilterVisible(false)}
        onApply={onFilterChange}
      />
    </>
  );
}

export type BillListCardProps = {
  entries: BillEntry[];
  onEntryPress: (entry: BillEntry) => void;
};

export function BillListCard({ entries, onEntryPress }: BillListCardProps) {
  if (entries.length === 0) {
    return (
      <View style={styles.card}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>账单记录</Text>
        </View>
        <Text style={styles.emptyText}>暂无账单记录</Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>账单记录</Text>
        <Text style={styles.heroHint}>{entries.length} 笔</Text>
      </View>
      {entries.map((entry) => (
        <Pressable
          key={entry.id}
          style={styles.billItem}
          onPress={() => onEntryPress(entry)}
        >
          <View style={styles.billItemLeft}>
            <Text style={styles.billItemPlatform}>{BILL_PLATFORM_LABEL[entry.platform as BillPlatform]}</Text>
            <Text style={styles.billItemDate}>{entry.date}</Text>
          </View>
          <View style={styles.billItemRight}>
            <Text style={[styles.billItemAmount, { color: entry.type === "income" ? "#34d399" : "#f87171" }]}>
              {entry.type === "income" ? "+" : "-"}{entry.amount.toFixed(2)}
            </Text>
            <Text style={styles.billItemTradeType}>{BILL_TRADE_TYPE_LABEL[entry.tradeType]}</Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

export type BillDetailModalProps = {
  entry: BillEntry | null;
  visible: boolean;
  onClose: () => void;
};

export function BillDetailModal({ entry, visible, onClose }: BillDetailModalProps) {
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  if (!entry) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>账单详情</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={styles.modalClose}>✕</Text>
            </Pressable>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            {/* 图片区域 */}
            {entry.imageUri ? (
              <Pressable onPress={() => setPreviewImage(entry.imageUri!)}>
                <Image source={{ uri: entry.imageUri }} style={styles.modalImage} resizeMode="cover" />
                <Text style={styles.imageHint}>点击查看大图</Text>
              </Pressable>
            ) : (
              <View style={styles.imagePlaceholder}>
                <Text style={styles.imagePlaceholderText}>暂无截图</Text>
              </View>
            )}
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>金额</Text>
              <Text style={[styles.detailValue, { color: entry.type === "income" ? "#34d399" : "#f87171" }]}>
                {entry.type === "income" ? "+" : "-"}{entry.amount.toFixed(2)} 元
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>交易类型</Text>
              <Text style={styles.detailValue}>{BILL_TRADE_TYPE_LABEL[entry.tradeType]}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>平台</Text>
              <Text style={styles.detailValue}>{BILL_PLATFORM_LABEL[entry.platform as BillPlatform]}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>日期</Text>
              <Text style={styles.detailValue}>{entry.date}</Text>
            </View>
            {entry.transactionId && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>交易编号</Text>
                <Text style={styles.detailValue}>{entry.transactionId}</Text>
              </View>
            )}
            {entry.description && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>描述</Text>
                <Text style={styles.detailValue}>{entry.description}</Text>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
      {/* 图片预览弹窗 */}
      <Modal visible={!!previewImage} transparent animationType="fade" onRequestClose={() => setPreviewImage(null)}>
        <View style={styles.previewOverlay}>
          <Pressable style={styles.previewCloseArea} onPress={() => setPreviewImage(null)} />
          {previewImage && (
            <Image source={{ uri: previewImage }} style={styles.previewImage} resizeMode="contain" />
          )}
          <Pressable style={styles.previewCloseBtn} onPress={() => setPreviewImage(null)}>
            <Text style={styles.previewCloseText}>关闭</Text>
          </Pressable>
        </View>
      </Modal>
    </Modal>
  );
}

export type BillPageProps = {
  summary: BillViewProps["summary"];
  entries: BillEntry[];
  filter?: BillFilter;
  onFilterChange?: (filter: BillFilter) => void;
};

export function BillPage({ summary, entries, filter = defaultBillFilter, onFilterChange }: BillPageProps) {
  return (
    <>
      <BillSummaryCard summary={summary} filter={filter} onFilterChange={onFilterChange!} />
      <BillListCard entries={entries} onEntryPress={() => {}} />
    </>
  );
}
