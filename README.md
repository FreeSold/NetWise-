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
2. 安装手机 `Expo Go` App（安卓/iOS 都可）
3. 确保手机和电脑在同一个局域网
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

启动后终端会出现二维码：
- 用 `Expo Go` 扫码即可在手机运行
- 或在终端按 `a` 启动 Android 模拟器

## OCR 说明（已接入）

当前已接入截图识别流程：
1. 点击“选择截图并识别”
2. 从相册选一张金融 App 截图
3. App 调用 OCR 服务提取文本
4. 自动进入资产分类与统计（默认不展示整段 OCR 原文）
5. 在“解析结果”里直接修改资产名称/金额/分类（分类为下拉框）
6. 用户点击“确认并记录到数据库”后，保存快照并更新趋势图

当前分类固定为：
- 现金
- 基金
- 保险
- 股票
- 理财

## 数据落库与去重

- 数据库：`SQLite`（本地）
- 记录时机：用户点击“确认并记录到数据库”
- 去重规则：同一天内，`同一图片 hash` 只记录一次
- 记录内容：
  - 图片 `hash`
  - 导入日期
  - 已加密的资产明细（名称 / 分类 / 金额）

## 隐私与安全

- App 首次启动会要求设置 `6 位数字口令`
- 后续每次启动都需要先解锁，支持设备已开通时使用生物识别
- 数据库存储的是 `加密后的资产快照`，不是明文资产记录
- 原始截图不会写入数据库，只在本次导入流程里暂时保留
- 用户点击“确认并记录到数据库”后，会立即清掉当前导入图片的预览和内存引用
- 当前开发阶段仍保留 OCR 全量日志，便于调试；正式发布前建议关闭

## 趋势图

- 在页面底部新增“资金趋势折线图”
- 默认显示“全部”资金趋势
- 可切换查看：现金 / 基金 / 保险 / 股票 / 理财

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
- 当前默认用的是 OCR.Space 的测试 key（`helloworld`），适合开发验证
- 正式使用建议替换成你自己的 OCR 服务 key
- 截图涉及隐私数据，建议仅在你信任的网络和服务环境下使用

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
2. 查看启动终端里的 OCR 原文日志
3. 在 `parseOcrText` 内打 `console.log` 观察：
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

- `App.tsx`：MVP 页面（文本输入、解析结果、汇总）
- `src/parsers/templates.ts`：页面识别与解析规则
- `src/domain/types.ts`：统一资产模型
- `src/aggregation/summary.ts`：统计汇总

## 下一步（建议）

1. 接入手机端 OCR（优先本地识别）
2. 解析结果增加人工确认/修正
3. 持久化存储（SQLite）
4. 加入历史快照与趋势图
