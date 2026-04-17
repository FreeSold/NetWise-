/**
 * 应用内中文文案集中管理（与解析规则 templates 分离，便于维护与后续 i18n）。
 */

/** 解锁门 / 安全初始化界面 */
export const lockScreen = {
  initializingTitle: "NetWise 安全初始化中",
  initializingSubtitle: "正在准备本地加密密钥...",
  unlockTitle: "输入口令解锁",
  firstRunTitle: "首次使用，先设置口令",
  unlockSubtitle: "本地资产数据已加密，解锁后才会展示。",
  firstRunSubtitle: "请设置 6 位数字口令，后续启动 App 时需要输入。",
  passcodePlaceholder: "输入 6 位数字口令",
  passcodeConfirmPlaceholder: "再次输入口令",
  unlock: "解锁",
  saveAndEnter: "保存并进入",
  biometricUnlock: "使用生物识别解锁"
} as const;

export const common = {
  cancel: "取消",
  delete: "删除",
  save: "保存",
  ok: "知道了",
  close: "关闭",
  done: "完成",
  next: "下一步",
  prev: "上一步",
  submit: "提交",
  loading: "加载中…",
  processing: "处理中…",
  saving: "保存中…",
  dash: "—"
} as const;

export const errors = {
  unknownDb: "未知数据库错误",
  rulesLoadFailed: "规则加载失败",
  customModulesLoadFailed: "自定义模块加载失败",
  saveFailed: "保存失败",
  saveAfterDeleteFailed: "删除后保存失败",
  deleteFailed: "删除失败",
  unknownSave: "未知保存错误",
  unknown: "未知错误",
  ocrNotInBuild: "本地 OCR 模块尚未编进当前 App，请重新安装调试包或重新打 APK。",
  ocrGeneric: "OCR 识别失败",
  ocrNetwork: "OCR 服务连接失败，请检查当前网络，或稍后再试。",
  ocrEmptyText: "OCR 没有识别出文字，请换一张更清晰的截图再试。"
} as const;

export const alerts = {
  deleteRow: {
    title: "删除该行？",
    message: "将从当前解析列表移除，不影响已保存的历史。"
  },
  deleteRule: {
    title: "删除此规则？",
    message: "将从本机规则列表移除。"
  },
  deleteCustomModule: {
    title: "删除自定义模块"
  },
  seedWrite: {
    title: "确认写入测试数据？",
    message:
      "将在你的导入记录中插入约 20 天的模拟快照，与真实导入混在一起，首页「目前为止总资产」和三平台折线图都会受影响，容易造成误判。仅建议在明确调试时使用。\n\n可通过本页「清除测试数据」移除测试快照，或使用「清空全部导入」清空全部记录。",
    confirm: "仍要写入"
  },
  seedWritten: {
    title: "已写入",
    message: "已生成支付宝 / 招行 / 微信各约 20 个时点的测试曲线。若不再需要，请到本页清除测试数据。"
  },
  seedWriteFailedTitle: "写入失败",
  seedClear: {
    title: "清除测试数据？",
    message: "将删除所有带测试标记的快照，不会影响其它真实导入记录。",
    confirm: "清除"
  },
  seedClearDoneTitle: "完成",
  seedClearFailedTitle: "清除失败",
  /** 加密快照库解密失败（见 AssetStoreDecryptError） */
  assetStoreReadFailedTitle: "无法读取资产快照"
} as const;

export const notices = {
  customRuleFillSourceAndContent: "请填写原文与识别内容（金额名称）。",
  customRuleSaved: "已保存规则。",
  /** 用于判断提示是否为成功态（与 warn 区分） */
  customRuleSavedToken: "已保存",
  customModuleDisplayNameRequired: "请填写模块展示名称。",
  customModuleKeywordsRequired: "请至少填写一个匹配用词（可用空格、逗号、分号分隔）。",
  customModuleMissing: "模块已不存在，请关闭后重试。",
  customModuleSaved: "已保存模块修改。",
  customModuleAdded: "已添加识别模块。",
  customModuleDeleted: "已删除该模块。",
  defaultModuleName: "该模块",
  wizardNoAlbumPermission: "没有相册权限，请在系统设置中允许访问相册。",
  wizardPickImageFirst: "请先选择一张图片。",
  wizardOcrFirst: "请先完成 OCR 识别。",
  wizardKeywordsRequired: "请填写关键词，可用空格、逗号、分号分隔多个词。",
  wizardModuleNameRequired: "请填写模块展示名称。",
  wizardIncomplete: "请完善模块名称与关键词。",
  ocrMaxImages: "最多导入 6 张图片，请先清空后再导入。",
  ocrNoAlbumPermission: "没有相册权限，请在系统设置中允许访问相册。",
  saveDbInitWait: "数据库初始化中，请稍后重试。",
  saveImportFirst: "请先导入并识别图片。",
  saveNoAssets: "当前没有可保存的资产项。",
  saveInProgress: "正在记录数据...",
  saveDuplicateToday: "同一图片今天已记录，已自动跳过重复保存。",
  saveClearedToday: "已清空当前日期数据。",
  saveClearedAll: "已清空全部导入记录（自定义模块与 OCR 规则未改动）。",
  unlockPasscodeLength: "请输入 6 位数字口令。",
  unlockPasscodeMismatch: "两次输入的口令不一致。",
  unlockWrongPasscode: "口令不正确，请重试。",
  debugDbNotReady: "数据库未就绪。"
} as const;

export const labels = {
  moduleInfoAccessibilityHint: "说明",
  clearDataHintTitle: "说明",
  trendMainChartTitle: "资金趋势折线图",
  chartPrimaryAll: "全部",
  parseScreenTypeCaption: "页面类型：",
  keywordSplitPrefix: "当前拆分为：",
  keywordSplitNone: "（无）",
  customModuleConfigSave: "保存修改",
  dataCleanupTitle: "数据清理",
  seedTestDataTitle: "测试数据",
  seedWriteTestData: "写入测试数据",
  debugJsonToggleHint:
    "开启后显示首页各折线图 JSON、导入页写入预览与本页已存快照；关闭后隐藏。",
  snapshotsDebugPlaceholder: "（点击「刷新已存数据」）",
  clearDataTitleStep2: "再次确认：清空全部导入记录？",
  clearDataTitleStep1: "确认清空数据？",
  clearDataNext: "下一步确认",
  clearDataConfirm: "确认清空",
  ocrRuleModalAdd: "添加规则",
  ocrRuleModalEdit: "编辑规则",
  ocrRuleSourceCaption: "原文（锚点关键词）",
  ocrRuleRecognizedCaption: "识别内容（金额名称默认值）",
  ocrRuleAssetClassCaption: "资产分类",
  ocrRuleScopeCaption: "限定页面（防跨 App 误匹配）",
  ocrRuleDelete: "删除规则",
  wizardTitleNew: "新增识别模块",
  wizardTitleEdit: "配置识别模块",
  wizardStep: (step: number) => `步骤 ${step} / 5`,
  wizardOcrLoading: "OCR 识别中…",
  wizardOcrToggleExpand: "收起 OCR 原文",
  wizardOcrToggleCollapse: "查看 OCR 原文",
  wizardModuleNameCaption: "模块展示名称",
  wizardModuleNameHintPopoverTitle: "模块展示名称",
  wizardModuleNameHintPopoverBody: "将显示在首页对应折线图标题与设置中的模块列表中。",
  wizardSubmitHintTitle: "提交说明",
  wizardSubmitHintBody:
    "提交后，新导入在「确认并记录」时会写入 OCR；当某日快照的合并 OCR 命中上述任一词时，该日该次导入解析出的资产总额会计入此模块折线图（与内置微信 / 支付宝 / 招行模块并列）。",
  wizardExit: "退出向导",
  wizardNextWithOcr: "下一步（开始 OCR）",
  configKeywordsCaption: "匹配用词（任一命中即可）",
  configDeleteModule: "删除此模块",
  heroTotalHint: "目前为止总资产(元)",
  importButton: "导入",
  quickStatCash: "余额宝/现金",
  quickStatFund: "基金",
  quickStatInsurance: "保险",
  quickStatStock: "股票",
  quickStatWealth: "理财",
  debugTrendDumpTitle: "本图折线数据结构（调试）",
  settingsTitle: "设置",
  settingsDataTitle: "数据管理",
  opacityLabel: "透明度：",
  privacyTitle: "隐私与安全",
  biometricUnavailable: "当前设备未检测到可用的生物识别能力。",
  biometricToggleOn: "开启生物识别解锁",
  biometricToggleOff: "关闭生物识别解锁",
  moduleDisplayTitle: "模块展示",
  newModuleTitle: "新增识别模块",
  openModuleWizard: "打开配置向导",
  ocrRulesTitle: "自定义 OCR 识别规则",
  ocrRulesAddedCaption: "已添加的规则",
  ruleColSource: "原文",
  ruleColContent: "识别内容",
  ruleColClass: "分类",
  ruleColScope: "限定页面",
  noCustomRules: "暂无自定义规则。点击下方按钮添加。",
  addRule: "添加规则",
  snapshotsDebugTitle: "已存快照（调试用）",
  snapshotsDebugHint: "从本地加密库读取当前所有快照 JSON，便于对照折线。OCR 正文过长会截断。",
  refreshSnapshots: "刷新已存数据",
  clearToday: "清空今日",
  clearAllImports: "清空全部导入",
  clearSeedData: "清除测试数据",
  toggleDebugShow: "显示调试数据",
  toggleDebugHide: "隐藏调试数据",
  cardScreenshotImport: "截图导入",
  retryRecognize: "重新识别",
  recognizing: "识别中...",
  importTileAdd: "+ 导入",
  importCountHint: (n: number) => `已导入 ${n}/6 张，点击可预览`,
  importFailedTitle: "导入失败",
  cardParseResult: "解析结果（可修改）",
  parsePageTotal: "当前页面总额：",
  addRowManual: "+ 手动添加一行",
  fieldAmountName: "金额名称",
  fieldAmount: "金额",
  fieldClass: "分类",
  ocrSourceHint: "OCR 原文（长按可选中部分文字后复制）",
  confirmSave: "确认并记录",
  savingRecord: "记录中...",
  debugPendingSaveTitle: "将写入库的预览（调试用）",
  sourceSheetTitle: "选择图片来源",
  pickFromAlbum: "从相册选择",
  pickFromFiles: "从文件选择",
  previewReselect: "重选图片",
  moduleWizardSummaryKeywords: "匹配用词（任一命中即可）："
} as const;

export const placeholders = {
  ocrRuleSourceExample: "如 创业板指、存款",
  ocrRuleContentExample: "如 存款",
  keywordsMulti: "多个词用空格、逗号或分号分隔",
  moduleDisplayExample: "例如：创业板指关注",
  amountName: "金额名称",
  amount: "金额"
} as const;

export const fmt = {
  dbInitFailed: (detail: string) => `数据库初始化失败：${detail}`,
  ocrRequestFailed: (rawMessage: string) => `OCR 服务请求失败：${rawMessage}`,
  saveFailedLine: (line: string) => `记录失败：${line}`,
  savedSnapshot: (date: string) => `已保存 ${date} 的快照记录。`,
  deleteCustomModuleBody: (name: string) =>
    `确定删除「${name}」吗？绑定「仅该模块」的 OCR 规则将变成无效引用，请到规则列表中自行调整。`,
  seedCleared: (removed: number) => (removed > 0 ? `已清除 ${removed} 条测试快照。` : "当前没有测试快照。"),
  wizardModuleSummary: (name: string) => `模块名称：${name || "—"}`,
  parseGroupTitle: (index: number) => `页面 ${index + 1}`,
  /** 与 labels.moduleInfoAccessibilityHint 文案一致 */
  moduleInfoAccessibilityLabel: (title: string) => `${title}说明`,
  scopePickerOnlyModule: (displayName: string) => `仅「${displayName}」`,
  customModuleTrendTitle: (displayName: string) => `${displayName}趋势`,
  debugPendingSaveEmpty:
    "（暂无解析行：导入并识别后，此处展示将写入库的 JSON 预览）",
  debugPreviewFailed: (msg: string) => `预览生成失败：${msg}`,
  debugSerializeFailed: (msg: string) => `序列化失败：${msg}`,
  ocrTextPreviewInJson: (t: string) => (t.length > 400 ? `${t.slice(0, 400)}…(全文${t.length}字)` : t),
  heroDbErrorLine: (detail: string) => `数据库异常：${detail}`
} as const;
