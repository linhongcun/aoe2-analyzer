# #442 开局与一局入门的公开来源

基线：main `a0ed295de41bf835b41ea80be4fd8a1c20f99c10`，v0.40.0，游戏数据 DE185872。此项修复来源展示，预计发布 v0.40.1。

## 范围与不变项

7 份 AOE2 Guide 开局在原始 `license`、`sources/0/ref`、`sources/0/section` 中保留提交或源码定位，共 21 处。一局入门的 `sources.pinned-techs.version` 还有 1 处技术定位。跟练、完整步骤单、打印及展开的开局列表改用公开来源；一局入门改用公开版本。普通玩家正文不再显示这些内部定位。

全部原始 JSON 保持逐字节不变，固定提交、文件路径、原始许可、作者证据继续可在仓库核查。8 条开局的步骤、动作、模拟、分享参数、公开链接、作者及核对日期不变；入门六卡的正文、链接和状态不变。保留 MIT License、Mehmet Kaan Demir、Microsoft 归属及骑士开局追加的攻略参考/转载说明。不处理其它游戏内容、数字或 Hold 项。

## 三层边界

1. **严格 raw 结构**：先按 JSON Schema 检查原始数据，固定对象拒绝未知字段。只为已识别的 AOE2 Guide 来源与本站固定科技快照定义明确 provenance 分支；其他来源仍使用现有 `source-text` 和公开 URL 规则。
2. **同一个纯公开投影**：`src/domain/sourcePresentation.mjs` 与 `.d.mts` 供 React 和 Node CLI 同时使用；不依赖 React、Ajv 或游戏数据。投影只识别本项的具体 provenance，不做通用“删除哈希”的清洗。
3. **严格公开 DTO**：独立 `scripts/check-source-presentation.mjs` 从开局目录及入门文件发现输入，在 raw 结构合法后，对实际投影再次按闭合的公开 schema 校验。标题、作者、许可、公开章节、版本与 URL 继续严格检查，不能靠隐藏错误字段通过。两个公开 DTO 的局部文本格式还明确拒绝 main/master 加短 pin 语法，包括纯数字或纯字母、大写的形式；通用 policy 不改变。页面只消费此公开 DTO，不再读取原始技术字段。

AOE2 Guide 的 provenance 来源分支限定真实 `https://aoe2guide.com/en/builds/<slug>/` URL、`themkdemiiir/aoe2-guide@<hex>` 和 `src/content/build-orders/<slug>.yaml` 形式；公开投影仅隐藏这种内部 ref/path。公开 URL、原标题、作者和日期原样保留。许可仅在对应 AOE2 Guide 来源存在时，移除 MIT 授权括号中单一 `，提交 <hex>` 定位片段，其他字符保留；不识别或含额外内部词的文本不会被通用清洗，仍由严格公开 schema 拒绝。

一局入门只对 `pinned-techs` 的固定 GitHub `techs.json` 链接及其 `main <hex> / DE<build>` 证据采用公开投影：显示 DE 游戏版本，原始完整证据仍留在 JSON。其他来源的版本文字原样保留且仍执行 `source-text`。不得放开官方来源 version 的既有反例。

## 校验迁移

22 条旧迁移清单清零，CI 从 `content:check --ratchet` 转为 `--strict`，全部 46 份原始输入必须零错误；随后执行独立公开来源 checker，9 份来源输入必须零错误，再验证 standalone 可复现。`--ratchet` 可兼容零基线的严格行为，但不得再接受任意新增候选条目。通用 `content-schema.mjs`、compiler/catalog、公开来源 policy、五份 standalone 与数据生成输入均不改变。

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
- 运行相关单测、页面交互、静态/类型/严格分层、构建与 standalone 再生成检查。通用引擎不改，CI 增加保守的 builds/gameGuide profiles：相关原始快照、五组 #285 单测、来源反例及页面回归；只显式登记独立 checker/公开投影/两份 DTO，两份 raw schema 还需来源子树比较，原有 step/card/其它定义必须相等。基线仅整个 after 模块精确等于空冻结导出时走来源范围，任何新增条目或额外代码仍 full。通用引擎、共享 policy、compiled 和未知文件仍 full，数据/依赖仍 full/data；范围不可靠时保守回退。main/Release 按相同树可信证据复用并构建真实 SHA。
- 发布短烟测覆盖一个开局跟练/打印来源、入门固定版本来源的公开展示与链接/归属，在真实线上确认本次清理，再完成正式 Release 与相同部署产物的 ZIP 核验。

## 已完成的本地验证

- 实际红灯先于产品改动取得：7 条现有 `visibleSources` 泄露内部字段，严格 CLI 因旧 22 条失败；正常加载后的跟练与入门来源也各因旧定位文字失败。
- 严格原始检查 46 份零告警、零错误，独立来源检查 9 份零错误，五个 standalone 再生成一致。逐 Git blob 核对全部 46 份 raw JSON 未变，通用引擎/登记表/common policy、五份 compiled、unit snapshots 与 e2e fixtures 均无差异。
- 25 个相关 unit 文件通过：656 passed、1 todo；最后补充 full fallback 保留来源 feature 的新断言后，单独运行 scope/releaseSmoke 8 项通过，不重复未变范围。
- 5 个相关浏览器文件共 77 项通过，包含 27 项本次来源用例、既有跟练/入门/开局入口及受保护默认文本金标准。四宽明暗保留 24 张来源区域截图，涵盖跟练、print media 和入门来源。
- 实际生产工作树 smoke 通过跟练、打印、入门两条新增分支，保留真实公开 URL、核对日期、DE 版本与完整归属。该本地产物页脚为当时 HEAD `51371e1`，不冒充最终提交或线上验证；CI 与 main 将按最终真实 SHA 构建。
- lint、类型、严格分层、构建、变更文件格式与差异检查通过；仅保留已有 8 个文件长度告警。已记录 105 份被测生产 JS 的文件名与 SHA256，供独立复核比对。

最终独立审查、远端 CI、实际 main 构建与真实线上烟测、正式 Release 的结果由交付记录补齐。
