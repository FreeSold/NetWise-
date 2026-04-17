# NetWise Mobile (MVP)

个人资产截图归集 App 的第一版骨架，当前目标：
- 选择截图并 OCR 识别文本
- 自动识别页面类型
- 提取资产金额并归类
- 展示汇总统计

## 第一批支持页面

- 招商银行 `财产页`
- 招商银行 `理财页`
- 支付宝 `理财页`
- 支付宝 `基金页`
- 微信 `钱包页`

## 给 Java 开发者的快速理解

你可以把这套工程理解为：
- `package.json` ~= Maven 的 `pom.xml`（依赖 + 脚本）
- `npm install` ~= `mvn dependency:resolve`（下载依赖）
- `npm run start` ~= 启动开发服务（热更新）
- `npm run typecheck` ~= 编译前的类型检查（类似 Java 编译期校验）

## 环境准备（Windows）

1. 安装 Node.js LTS（推荐 20+）
2. 本项目含 **原生模块**（如本地 OCR），需使用 **开发构建（Expo Dev Client）** 或 `expo run:android` 安装的包；**不能**指望仅靠官方 `Expo Go` 商店版完整承载全部能力（与 `package.json` 中 `--dev-client` 脚本一致）
3. 真机联调时确保手机与电脑在同一局域网（若使用 LAN 模式）
4. 安装完成后，在项目目录执行：

```bash
node -v
npm -v
```

能看到版本号就说明基础环境没问题。

### Android SDK 安装（目录固定到 `D:\Environment`）

如果你要用 `a` 启动安卓模拟器，必须先有 Android SDK。  
本项目推荐统一放在：

- SDK 根目录：`D:\Environment\Android\Sdk`

已验证可用的最小组件：
- `platform-tools`（提供 `adb`）
- `platforms;android-34`
- `build-tools;34.0.0`
- `emulator`

环境变量（PowerShell）：

```powershell
setx ANDROID_HOME "D:\Environment\Android\Sdk"
setx ANDROID_SDK_ROOT "D:\Environment\Android\Sdk"
setx PATH "$($env:PATH);D:\Environment\Android\Sdk\platform-tools;D:\Environment\Android\Sdk\emulator;D:\Environment\Android\Sdk\cmdline-tools\latest\bin"
```

执行后请关闭并重新打开终端，再验证：

```powershell
adb --version
adb devices
```

如果 `adb --version` 能输出版本号，说明 SDK 路径配置成功。

如果你要用模拟器（按 `a`）而不是真机，还需要在 Android Studio 里创建一个 AVD：
- 打开 `Android Studio > More Actions > Virtual Device Manager`
- 新建一个设备（例如 Pixel）
- 选择已安装的系统镜像（建议 Android 14）
- 启动模拟器后，再回到 Expo 终端按 `a`

## 本地运行

```bash
npm install
npm run start
```

如果经常遇到 `8081` 端口被占用，使用：

```bash
npm run start:clean
```

该命令会先自动清理占用 `8081` 的 Metro 进程，再启动 Expo。

启动后终端会出现二维码或连接提示：
- 使用已安装的 **Dev Client** 应用扫码连接 Metro（与当前工程匹配的安装包）
- 或在终端按 `a` 启动 Android 模拟器（需已配置 AVD）

## OCR 说明（已接入）

当前已接入截图识别流程：
1. 点击选择图片来源（相册或文件）
2. 可选 **多张** 截图（有上限，以界面为准，当前约 6 张）
3. App 使用 **本地 ML Kit** 对所选图做 OCR
4. 自动进入资产分类与统计（默认不展示整段 OCR 原文）
5. 在“解析结果”里直接修改资产名称/金额/分类（分类为下拉框）
6. 用户点击“确认并记录”后，将 **加密快照** 写入本地存储并更新趋势图

当前分类固定为：
- 现金
- 基金
- 保险
- 股票
- 理财

## 数据落库与去重

- **持久化方式**：应用文档目录下单文件 `netwise-asset-history.json`，内容为 **AES 加密后的 JSON**（实现见 `src/storage/assetHistoryDb.ts`）。`package.json` 中的 `expo-sqlite` 为依赖项，**当前业务快照未使用 SQLite 表存储**。
- **其它本地配置**（明文 JSON，同在文档目录）：
  - `netwise-ocr-custom-rules.json`：自定义 OCR 规则
  - `netwise-custom-recognition-modules.json`：自定义识别模块与折线隐藏状态
- 记录时机：用户点击“确认并记录”
- 去重规则：同一天内，`同一图片 hash` 只记录一次
- 记录内容（解密后的逻辑结构）：
  - 图片 `hash` 列表
  - 导入日期
  - 资产明细（名称 / 分类 / 金额）及按页面类型或自定义模块的 **分桶** 信息；可选保存各图 OCR 全文供自定义模块匹配

## 隐私与安全

- App 首次启动会要求设置 `6 位数字口令`
- 后续每次启动都需要先解锁，支持设备已开通时使用生物识别
- 快照文件内为 **加密后的资产数据**，不是明文堆在磁盘上可读的 JSON
- 原始截图 **不会** 写入上述快照文件，只在本次导入流程里暂时保留
- 用户点击“确认并记录”后，会立即清掉当前导入图片的预览和内存引用
- OCR 全量原文仅在 **开发构建**（`__DEV__` 为真，如 Metro）时写入控制台；**Release APK 不会打印**，避免系统日志泄露金融原文

## 趋势图

- 页面展示 **总资金趋势** 及 **支付宝 / 招商银行 / 微信** 分平台趋势；支持 **自定义识别模块** 折线（在设置中配置）
- 主图与各平台卡片可独立切换「全部」或按资产类：现金 / 基金 / 保险 / 股票 / 理财
- 实现见 `src/components/TrendLineChart.tsx`（子模块在 `src/components/trendLineChart/`）与 `assetHistoryDb.ts` 中的查询函数
- **已优化**：首页刷新各折线与汇总时，改为单次解密快照文件后批量计算（`queryTrendDashboardBundle`），详见根目录《代码优化计划》**§2.1【已优化】**

如果模拟器里“相册选图”不稳定，可改用按钮：
- `从文件导入图片（模拟器推荐）`

模拟器导图建议（更稳）：
```powershell
adb push "D:\your-image-path\asset.png" /sdcard/Pictures/
```
然后在 App 里点“从文件导入图片（模拟器推荐）”从文件管理器选择。

实现位置：
- `src/ocr/ocrSpace.ts`

注意：
- 当前默认使用的是 **本地 OCR（Google ML Kit Text Recognition）**
- OCR 在设备本地完成，不依赖外部 OCR 服务
- 首次接入本地 OCR 后，需要重新安装调试包或重新打 APK，热更新无法把原生模块带进现有 App
- 截图涉及隐私数据，但当前 OCR 不再上传到外部识别服务

## 调试指南（重点）

### 1) 最常用调试方式：看屏幕 + 看控制台

- 修改 `App.tsx` 后会自动热更新
- `console.log(...)` 日志会在启动终端里显示
- 页面异常会直接弹红色报错层（Red Screen）

### 2) 调试解析规则

核心解析文件：
- `src/parsers/templates.ts`
- `src/parsers/shared.ts`

建议做法：
1. 在 App 里导入测试截图
2. 在 App 的“解析结果”区域展开“`查看 OCR 原文`”
3. 如需更细日志，在开发构建下可查看启动终端里的 OCR 原文日志（Release 无此项）
4. 在 `parseOcrText` 内打 `console.log` 观察：
   - 识别到的 `screenType`
   - 每条规则是否命中
   - 金额是否被 `parseMoney` 正确提取

### 3) TypeScript 报错排查

```bash
npm run typecheck
```

这条命令建议每次改完规则都跑一次。  
如果你是 Java 背景，可以把它当作“先过编译再运行”。

### 4) 常见问题

- `npm install` 很慢：切换网络或稍后重试
- 扫码打不开：手机和电脑不在同一网段，或防火墙拦截
- PowerShell 里 `&&` 报错：用分号 `;` 连接命令（例如 `npm install; npm run start`）
- 改代码没生效：在启动终端按 `r` 手动刷新
- `Failed to resolve the Android SDK path`：说明 SDK 没装好或环境变量缺失，按上面的 `ANDROID_HOME` 配置并重开终端
- 按 `a` 无反应：通常是没有启动模拟器，或 `adb devices` 没检测到设备

## 打 APK 到手机安装

如果你只是想打一个安卓安装包自己手机使用，按下面做：

### 1) 安装 EAS CLI

```bash
npm install -g eas-cli
```

### 2) 登录 Expo

```bash
eas login
```

### 3) 打测试 APK

本项目已经配置好 `preview` 打包参数，直接执行：

```bash
eas build -p android --profile preview
```

这一步会在 Expo 云端打包，完成后终端会返回一个下载链接。

### 4) 下载并安装到手机

- 打开打包完成后的链接
- 下载 `.apk` 文件到安卓手机
- 手机上允许“安装未知来源应用”
- 点击 APK 安装

### 5) 打正式上架包（可选）

如果以后要上架应用市场，使用：

```bash
eas build -p android --profile production
```

这会生成更适合上架的 `aab` 包。

## 当前结构

- `App.tsx`：主界面（解锁、多图导入、解析编辑、确认落库、设置、自定义模块向导等；体量已部分拆到 `src/app/`）
- `src/app/AppStyles.ts`：主界面 `StyleSheet` 样式
- `src/app/homeUiConstants.ts`：首页 / 设置相关 UI 常量与说明文案键
- `src/app/importSnapshot.ts`：导入编辑校验与快照 payload 构建
- `src/app/formatOcrRuleScopeLabel.ts`：OCR 规则作用域展示名
- `src/app/components/AppLockGate.tsx`：安全初始化与解锁界面
- `src/parsers/templates.ts`、`src/parsers/shared.ts`：内置页面识别与解析规则
- `src/domain/types.ts`：统一资产模型、自定义规则与模块类型
- `src/aggregation/summary.ts`：统计汇总
- `src/storage/assetHistoryDb.ts`：加密快照读写、去重、趋势序列查询
- `src/security/appSecurity.ts`：口令哈希、加密密钥、生物识别开关
- `src/ocr/ocrSpace.ts`：本地 OCR 封装
- `src/components/TrendLineChart.tsx` + `src/components/trendLineChart/*`：趋势图（样式、几何、布局计算、手势已拆分）
- `src/storage/ocrCustomRulesStore.ts`、`src/storage/customRecognitionModulesStore.ts`：规则与模块的 JSON 读写

更完整的操作说明与需求归纳见项目根目录：`操作文档.md`、`需求分析文档.md`。

## 下一步（建议）

1. 扩充内置银行/证券类页面模板与回归用截图集
2. 数据备份 / 导出 / 恢复（加密包或用户可控迁移）
3. 若需复杂查询或体量增大，再评估 **SQLite 迁移**（与现有加密 JSON 方案做迁移脚本）
4. 发布前复核测试入口开关（OCR 全量控制台日志已对 Release 关闭）
