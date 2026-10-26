# #442 开局与一局入门的公开来源

基线：main `a0ed295de41bf835b41ea80be4fd8a1c20f99c10`，v0.40.0，游戏数据 DE185872。此项修复来源展示，预计发布 v0.40.1。

## 范围与不变项

7 份 AOE2 Guide 开局在原始 `license`、`sources/0/ref`、`sources/0/section` 中保留提交或源码定位，共 21 处。一局入门的 `sources.pinned-techs.version` 还有 1 处技术定位。跟练、完整步骤单、打印及展开的开局列表改用公开来源；一局入门改用公开版本。普通玩家正文不再显示这些内部定位。

全部原始 JSON 保持逐字节不变，固定提交、文件路径、原始许可、作者证据继续可在仓库核查。8 条开局的步骤、动作、模拟、分享参数、公开链接、作者及核对日期不变；入门六卡的正文、链接和状态不变。保留 MIT License、Mehmet Kaan Demir、Microsoft 归属及骑士开局追加的攻略参考/转载说明。不处理其它游戏内容、数字或 Hold 项。

## 三层边界

1. **严格 raw 结构**：先按 JSON Schema 检查原始数据，固定对象拒绝未知字段。只为已识别的 AOE2 Guide 来源与本站固定科技快照定义明确 provenance 分支；其他来源仍使用现有 `source-text` 和公开 URL 规则。
2. **同一个纯公开投影**：`src/domain/sourcePresentation.mjs` 与 `.d.mts` 供 React 和 Node CLI 同时使用；不依赖 React、Ajv 或游戏数据。投影只识别本项的具体 provenance，不做通用“删除哈希”的清洗。
3. **严格公开 DTO**：CLI 在 raw 结构合法后，对实际投影再次按闭合的公开 schema 校验。标题、作者、许可、公开章节、版本与 URL 继续严格检查，不能靠隐藏错误字段通过。页面只消费此公开 DTO，不再读取原始技术字段。

AOE2 Guide 的 provenance 来源分支限定真实 `https://aoe2guide.com/en/builds/<slug>/` URL、`themkdemiiir/aoe2-guide@<hex>` 和 `src/content/build-orders/<slug>.yaml` 形式；公开投影仅隐藏这种内部 ref/path。公开 URL、原标题、作者和日期原样保留。许可仅在对应 AOE2 Guide 来源存在时，移除 MIT 授权括号中单一 `，提交 <hex>` 定位片段，其他字符保留；不识别或含额外内部词的文本不会被通用清洗，仍由严格公开 schema 拒绝。

一局入门只对 `pinned-techs` 的固定 GitHub `techs.json` 链接及其 `main <hex> / DE<build>` 证据采用公开投影：显示 DE 游戏版本，原始完整证据仍留在 JSON。其他来源的版本文字原样保留且仍执行 `source-text`。不得放开官方来源 version 的既有反例。

## 校验迁移

22 条旧迁移清单清零，CI 从 `content:check --ratchet` 转为 `--strict`，全部 46 份输入必须零错误。`--ratchet` 可兼容零基线的严格行为，但不得再接受任意新增候选条目。没有改变公开来源 policy、结构闭合规则或数据生成输入。

`contentSchema285.test.ts` 原先从生产迁移清单取第一条并修改/删除，在清单清零后已无真实夹具；将该组测试迁为更强的零基线行为：所有新问题都是错误、任何候选基线均被拒绝。原 `generatedSchemas285` 的 hybrid 来源 ref/section/license 反例，以及 `contentSources285` 的官方 version 反例全部保持原期望。

## 界面与状态

沿用来源区域现有布局、令牌、字体、标题和交互。公开来源继续是外部链接，作者、核对日期和归属文字仍可见；DE185872 数字继续使用现有不换行样式。来源条目没有新增控制或状态，也不新增“内部来源已隐藏”等技术提示。

开局列表 details 展开、跟练、完整步骤单及浏览器 print media 都显示同一公开来源。一局入门在六卡切换和展开来源时使用同一公开 source 映射；分享、未知参数、无效来源和非标准范围提示的行为不变。360/375/390 为原单列，1280 保持原布局；明暗主题与 44px 点击区域沿用现有样式。

## 保护用例与验证

- 不改两份包含原始来源的 unit snapshots，不重录任何 v0 验收 fixture；现有 builds 文本金标准必须保持。已审计 e2e fixtures 没有这些旧提交/路径字面量，列表来源默认折叠；仍需运行相关金标准核对。
- 先在现有 `visibleSources` 上写实际断言失败：8 条开局公开数据不带 ref 或源码 section；保留 URL、作者、日期，原始数据不变。
- 先页面红灯：旧跟练来源显示 `f09ed56`/`src/content/build-orders`，入门 ages 来源显示 `main 8d669ac`。不是缺模块或网络错误。
- 实施后补合法 provenance、伪造 provenance、公开标题/作者/许可内部词、坏 URL、未知字段、投影校验及 strict CLI 零错误用例。
- 8 条开局的跟练与完整步骤单来源均核对；打印 media、展开列表和入门来源也核对。360/375/390/1280 明暗覆盖最长双来源开局及入门，保存来源区域截图，无横向溢出、console error 或 pageerror。
- 运行相关单测、页面交互、静态/类型/严格分层、构建与 standalone 再生成检查。通用 checker 改动做一次 full 验证，原始数据未变，`data:false` 不重生成数据；main/Release 按相同树可信证据复用并构建真实 SHA。
- 发布短烟测覆盖一个开局跟练/打印来源、入门固定版本来源的公开展示与链接/归属，在真实线上确认本次清理，再完成正式 Release 与相同部署产物的 ZIP 核验。
