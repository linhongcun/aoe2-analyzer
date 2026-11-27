# 体验设计接手指南

给接手界面设计、状态规格与完成态设计图交付的人。本文统一维护全站可复用[体验设计原则](#体验设计原则)、源码速查、验收边界与按主题归档的[可迁移案例](#可迁移案例)。Issue 生命周期、角色职责与授权以 [CONTRIBUTING「Issue 生命周期」](../CONTRIBUTING.md#issue-lifecycle) 为准，游戏数据以 [data_sources.json](../data/sources/data_sources.json) 及生成数据为准。

## 体验设计原则

面向全站的可复用原则（具体需求、交互细节与完成态设计图写在原 Issue 正文；UX 完成后按原范围自查直交 `阶段:软件开发`，不设 PM 设计确认往返）：

### 任务优先

- 先呈现核心任务、配置输入、主要结果与下一步，再放次要说明；没有自然主操作时不强造大按钮。
- 明确计算范围、数据来源与支持边界；未知、不支持、估算、空结果与错误绝不用同一成功样式或文案。
- 来源、限制与可恢复错误紧邻对应结果；桌面优先，保证本次相关窄屏任务可用，不强求全站同宽矩阵。
- 工具页保持可扫读密度，默认不把整页折进折叠层、不改一屏一大卡；对象更新历史（[PatchHistory.tsx](../src/shared/ui/PatchHistory.tsx)）留在章节导航可达处，空态以 `HISTORY_EMPTY` 为准。

### 层级与样式

- 颜色与间距以 [tokens.css](../src/shared/styles/tokens.css) 为单一来源（浅色编辑风默认 + `:root[data-theme='dark']` 语义令牌，偏好存 `aoe2-theme` 不进 URL）；[check-colors.mjs](../scripts/check-colors.mjs) 禁源码硬编码色值，验收与设稿以 `tokens.css` 为准（[contrast.py](../scripts/contrast.py) 仅查脚本写死的色对，不兜底遮罩与半透明合成）。
- 优先复用 [ToolShell](../src/shared/ui/ToolShell.tsx)、[ToolPageHeader](../src/shared/ui/ToolPageHeader.tsx)、[CalcDock](../src/shared/ui/CalcDock.tsx) 等现有结构，重复任务明确时才下沉至 `src/shared/ui/`。
- 数值与「数字+单位」用 `.num` / `.nw` 包住，防 360 宽折行（`base.css` 全局 `body` 已设 `tabular-nums`、`.nw` 设 `nowrap`）。

### 图标、状态与键盘

- 界面图标只用 [Icon.tsx](../src/shared/ui/Icon.tsx) `ICONS` 登记的 Lucide 图标，游戏形象走 [art.tsx](../src/shared/ui/art.tsx)（`public/img/`），禁 emoji 与 Unicode 符号。
- 仅覆盖本次范围涉及的默认、已选、空、错误、未知与不支持状态；不无条件造全站状态矩阵。
- 浮层、菜单与可编辑控件写清焦点入口、键盘关闭与回焦；可点尺寸见「[这次要检查什么](#这次要检查什么)」。

## 从哪些文件看起

| 要确认的事             | 先打开                                                                                                                                                                                                   |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 导航分组、路径与标题   | [pageRegistry.ts](../src/shared/nav/pageRegistry.ts)、[pageRegistry.tsx](../src/app/pageRegistry.tsx)、[ARCHITECTURE](../docs/ARCHITECTURE.md)                                                           |
| Hash 路由与顶栏/抽屉   | [App.tsx](../src/app/App.tsx)、[routes.tsx](../src/app/routes.tsx)、[Layout.tsx](../src/app/Layout.tsx)、[editorial-shell.css](../src/shared/styles/editorial-shell.css)                                 |
| 令牌、主题与图标/美术  | [tokens.css](../src/shared/styles/tokens.css)、[theme.ts](../src/app/theme/theme.ts)、[Icon.tsx](../src/shared/ui/Icon.tsx)、[art.tsx](../src/shared/ui/art.tsx)                                         |
| 列表页头、工具壳、历史 | [layout.tsx](../src/shared/ui/layout.tsx)、[widgets.tsx](../src/shared/ui/widgets.tsx)、[ToolPageHeader.tsx](../src/shared/ui/ToolPageHeader.tsx)、[PatchHistory.tsx](../src/shared/ui/PatchHistory.tsx) |
| 游戏数字来源           | `data/game/*.json` 与 [data_sources.json](../data/sources/data_sources.json)（界面只读派生结果，陌生机制先查数据，未知标「待确认/未核实」）                                                              |

## 交付三份与协作边界

每次实际 UX 交付写在同一 Issue「体验设计」节，**完成态设计图须直接嵌入正文且可查看**（文字、线框、本地路径或 ZIP 均不能替代），并留设计评审记录（评审人/日期/结论/遗留）；纯逻辑/数据无 UI 改动才由 PM 走 UX 不适用路径。交付内容清晰分成三份：

1. **正式界面与逐字文案**：标明照此实现的布局、图标与玩家中文（独立校读，禁函数名/文件名/内部编号，须锁定的 ID 放实施条款）。
2. **示意数据与替换来源**：标清示意项及成品动态来源，不把原型数量或汇总金额写死进代码或引擎验收（[#970](https://github.com/linhongcun/aoe2-analyzer/issues/970)、[#978](https://github.com/linhongcun/aoe2-analyzer/issues/978)）。
3. **审阅说明**：放业务画面外，写取舍、删减理由与实现边界；防错句写进实施条款不进玩家界面。

设计不替产品排期或改计算口径，也不代替引擎与现网验收；未量到或超时的项明确记为未确认。

## 这次要检查什么

- **视口与主题**：PC 优先、窄屏保本次路径可用；浅色与深色均核对默认态及遮罩开闭两态，只按改动影响选视口（不设固定四宽门禁），报告写明实测宽度与未验证项。
- **排布与焦点**：长中文、图标与费用同基线对齐，行满整组换行不拆列；浮层明示焦点入口、键盘关闭与关闭回焦。
- **可点区域**：按交互规格落实，常用 ≥ 44×44 CSS px（参考 WCAG 2.2 [2.5.8 Minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) 24×24 AA 与 [2.5.5 Enhanced](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html) 44×44 AAA，均有行内文本等例外，不盲目放大整站行内链接）。
- **不可互相替代**：CSS `min-height: 44px` ≠ 实测边框盒与边缘命中；令牌对比度 ≠ 叠遮罩/背景图后对比度；`::after` 热区 ≠ 运行时命中元素；离线原型 ≠ 模拟引擎或现网；操作超时记未确认（[#970](https://github.com/linhongcun/aoe2-analyzer/issues/970)）。

## 可迁移案例

本节按主题归档；完成阶段交接后按 [CONTRIBUTING「经验回写」](../CONTRIBUTING.md#experience-writeback) 合并或修订条目（单条 3–5 行，无新经验不写）。

### 布局、网格与防折行

- **稀疏网格、`auto-fit` 整宽兄弟与全局 `nav` 居中**：`display: contents` 网格行在 `grid-auto-flow: row` 下须写死 `grid-row: 1` 防费用掉行，忌用 `dense`（[#972](https://github.com/linhongcun/aoe2-analyzer/issues/972)/[PR #973](https://github.com/linhongcun/aoe2-analyzer/pull/973)）；`auto-fit` 网格内放 `grid-column: 1 / -1` 会令尾部空轨不折叠，整宽说明须提为父级固定列网格的同级兄弟（[#1231](https://github.com/linhongcun/aoe2-analyzer/issues/1231)）；详情章节被全局 `nav { justify-content: center }` 居中时仅给目标类补 `flex-start`，不改全局 `nav`（[#976](https://github.com/linhongcun/aoe2-analyzer/issues/976)/[PR #977](https://github.com/linhongcun/aoe2-analyzer/pull/977)）。
- **多段 `.nw` 标签、长数字容器查询与断行测量**：多组数值分别包 `.nw` 允许分隔符换行；flex 换行标签把全角标点并入前段 `.nw` 并设 `gap: 0`，防 360 宽行首出现孤立「·」或多余折行（[#1399](https://github.com/linhongcun/aoe2-analyzer/issues/1399#体验设计)）；`360px` 宽带 A/B 选入列的 `UnitCivRankTable` 标签区仅 `110px`（内宽 `98px`），`CivRankMechTag` 单段 `.nw` 短语含 ` ·` 须控在 ≤ 7 汉字防右溢（反例：9 字「弹丸追踪与弹速提升 ·」实测 `115px` 溢 `17px`，定稿「弹丸追踪与提速 ·」`91px` 零溢出，[#1509](https://github.com/linhongcun/aoe2-analyzer/issues/1509#体验设计)）；数字变长时按卡片宽度用 `@container` 切列而非视口，用 `getBoundingClientRect().width` 量行内宽度，小数提示须在去 float32 尾数取整后判定（[#1402](https://github.com/linhongcun/aoe2-analyzer/issues/1402#体验设计)）；断行断言看宽度 > 0 的 `getClientRects()` 唯一 `top` 数，不用 `length > 1`。
- **表单行与并排短输入的字段错误**：输入框+按钮 flex 行设 `flex-wrap`，错误条作 `width: 100%` 兄弟节点防窄屏挤成窄竖条（[#1455](https://github.com/linhongcun/aoe2-analyzer/issues/1455#体验设计)）；并排短数值 CSS Grid（如当前/目标 HP）保持同行两列，错误条作 `grid-column: 1 / -1` 兄弟节点并经条件 `aria-describedby` 关联，不另加 `role="alert"` 抢占汇总区（[#1460](https://github.com/linhongcun/aoe2-analyzer/issues/1460#体验设计)）。
- **窄屏只读状态卡徽章与图片框内尺寸**：带 20px 左侧图标的只读卡把 `nowrap` 状态胶囊提升至子标题行右端，避免 360 宽正文孤字折行与缩进错位（[#1481](https://github.com/linhongcun/aoe2-analyzer/issues/1481#体验设计)）；带 1px 边框与 `overflow: hidden` 的图标框内图片写 `width: 100%; height: 100%; display: block`（不与外框共用像素值防 `border-box` 溢出 2px），覆盖 `.uico.big` 限定在目标容器内，留白按 `object-fit: contain` 实际绘制区测量（[#1345](https://github.com/linhongcun/aoe2-analyzer/issues/1345#体验设计)）。

### 视觉层级、色彩与对比度

- **身份色区分量 ΔE00、对比度与色相**：仅靠边框色区分类别须同时给出双主题实测——对底色对比度 ≥ `3:1`、与普通态 ΔE00 ≥ 40、与其他身份色 ΔE00 ≥ 20（不足时明示辅助区分如卡底色），并确认带色相而非纯灰阶。[#1364](https://github.com/linhongcun/aoe2-analyzer/issues/1364#体验设计)
- **半透明 `*-soft` 与背景图复合对比度**：`*-soft` 承载 12–13px 正文前按实际父底色做 Alpha 合成核 AA `4.5:1`（浅色 `--color-accent` 叠 `--color-accent-soft` 低于 4.5，优先中性实底或 `--color-link`/`--color-warn` 配对 [#1227](https://github.com/linhongcun/aoe2-analyzer/issues/1227)–[#1229](https://github.com/linhongcun/aoe2-analyzer/issues/1229)）；原画裁切放在独立装饰层且 `pointer-events: none` 防裁掉浮层（[#1313](https://github.com/linhongcun/aoe2-analyzer/issues/1313#体验设计)）；背景图按最终桌面首屏与窄屏焦区在各段文字位实测最不利复合对比度（[#1314](https://github.com/linhongcun/aoe2-analyzer/issues/1314#体验设计)）。
- **对照表标记克制与模拟做差反例**：最优值与「各项第一」仅在少于半数对象持有时标绿，全行共有标签提到表上方写一次；「缺什么」并集用模拟前后本表可见属性真有变化判定，避免僧侣、船坞与城镇中心误报。[#1387](https://github.com/linhongcun/aoe2-analyzer/issues/1387#体验设计) · [#1393](https://github.com/linhongcun/aoe2-analyzer/issues/1393#体验设计)

### 共享组件穿透、数据口径与状态可达性

- **共享组件宿主样式穿透与删除线**：Chromium 不将 `<s>` 删除线穿透到 `inline-flex` 子盒，须把 `text-decoration: line-through` 写到内层条目；`#duel span.nw { display: inline-block }`（`1,1,1`）会压过共享面板 `inline-flex`；[civ-read.css](../src/features/civs/components/civ-read.css) 的 `.civ-read .num` 会穿透文明页证据弹层染橙加粗，往 `BonusBody` 新增 `.num` 须在 `base.css` 补 `color/font-weight: inherit` 并在弹层图复核。[#1496](https://github.com/linhongcun/aoe2-analyzer/issues/1496#体验设计) · [#1497](https://github.com/linhongcun/aoe2-analyzer/issues/1497#体验设计)
- **关闭态遮罩、`HashRouter` 与生产模式分界**：作者样式 `display: block/flex` 会盖过 `[hidden]`，关闭态层须条件卸载或显式 `[hidden] { display: none }`（[#970](https://github.com/linhongcun/aoe2-analyzer/issues/970)）；`HashRouter` 下 `window.location.hash` ≠ `useLocation().hash`，大小写规范化走 `civEnCasePath` `replace` 保留 `search`/`hash`（[#974](https://github.com/linhongcun/aoe2-analyzer/issues/974)）；持续生产 `count`（建筑数）与训练总价 `qty`（训练数）不可混用，研究费不进训练总价（[#978](https://github.com/linhongcun/aoe2-analyzer/issues/978)）。
- **底图校读、属性适用、时代比较与指令翻译**：复用旧底图须同步校读背景标签并核固定数据（[#1220](https://github.com/linhongcun/aoe2-analyzer/issues/1220)）；先判属性适用再分清零值/空表/缺失，拆开游戏适用、本站计算与目录原值（[#1218](https://github.com/linhongcun/aoe2-analyzer/issues/1218)、[#1219](https://github.com/linhongcun/aoe2-analyzer/issues/1219)、[#1322](https://github.com/linhongcun/aoe2-analyzer/issues/1322#体验设计)、[#1328](https://github.com/linhongcun/aoe2-analyzer/issues/1328#体验设计)）；单位↔建筑双向反查确认形态分支（[#1230](https://github.com/linhongcun/aoe2-analyzer/issues/1230)）；时代自动变化先比单位最早出现时代（开局单位看 `startingScoutId`），不晚于出现时代改写「出现时已生效」（[#1339](https://github.com/linhongcun/aoe2-analyzer/issues/1339#体验设计)）；展示 `.dat` 原始指令按 `Type` 读字段，覆盖型 `SET` 倍率只标当前生效项（[#1409](https://github.com/linhongcun/aoe2-analyzer/issues/1409#体验设计)）；同样例各区块数值须同源一致（[#1263](https://github.com/linhongcun/aoe2-analyzer/issues/1263#体验设计)）。
- **画状态前先核 URL 可达性、挂载条件与最新 `main`**：先查参数 `clamp` 与 `supports*` 挂载条件（如 [#1384](https://github.com/linhongcun/aoe2-analyzer/issues/1384#体验设计) `bud` 下限 100、[#1403](https://github.com/linhongcun/aoe2-analyzer/issues/1403#体验设计) 单文明单位不渲对照表），不可达态不硬改 DOM 冒充可达而写明差异；收窄选项后用含被剔除值的旧链实测报错与恢复态（[#1404](https://github.com/linhongcun/aoe2-analyzer/issues/1404#体验设计)）；设稿前先拉最新 `origin/main` 核实挂点现况，不沿用旧提报快照（[#1231](https://github.com/linhongcun/aoe2-analyzer/issues/1231)）。

### 预览截稿与附件交付

<a id="issue-design-images"></a>

- **完成态设计图一律用 GitHub Issue 原生附件上传（禁止提交到代码仓库或纯图片 PR）**：[#1216](https://github.com/linhongcun/aoe2-analyzer/issues/1216) 确立禁把二进制设计稿合入仓库。网页端直接在原 Issue 正文编辑框粘贴/拖入 PNG；命令行先 `gh issue view ISSUE-URL --json body --jq .body > body.md`，正文写入相对图片引用（如 `![说明](./desktop.png)`），保存前核对远端无人更新再运行 `gh issue edit ISSUE-URL --body-file body.md --attach ./desktop.png`（报错先重读仅补失败图，不把令牌写进脚本日志）。**保存后以读者身份验收**：正文只留稳定 `github.com/user-attachments/assets/…` 引用，匿名访问或带退避重试确认返回 `image/png` 且尺寸/字节与原图一致（参考 [#1051](https://github.com/linhongcun/aoe2-analyzer/issues/1051)、[#1220](https://github.com/linhongcun/aoe2-analyzer/issues/1220)、[#1340](https://github.com/linhongcun/aoe2-analyzer/issues/1340#体验设计)）。
- **无改代码预览截稿数据注入**：体验设计严禁改应用代码出图（[#1340](https://github.com/linhongcun/aoe2-analyzer/issues/1340#体验设计)）。按场景选：动态 `import()` 领域函数算新值（[#1339](https://github.com/linhongcun/aoe2-analyzer/issues/1339#体验设计)）、`structuredClone` 传数据参数（[#1409](https://github.com/linhongcun/aoe2-analyzer/issues/1409#体验设计)）、对按需读模块注入字段（[#1410](https://github.com/linhongcun/aoe2-analyzer/issues/1410#体验设计)）或用 `context.route('**/data/game/*.json*')` 内存变换（重命名类别同步改 `atks`/`armc`/`arms`/`.form.*` [#1445](https://github.com/linhongcun/aoe2-analyzer/issues/1445#体验设计)）；复杂结果卡用页面同源 Vite React 实例 `createRoot` 渲染真实组件（[#1402](https://github.com/linhongcun/aoe2-analyzer/issues/1402#体验设计)），姊妹功能复挂上线 CSS（[#1393](https://github.com/linhongcun/aoe2-analyzer/issues/1393#体验设计)），Lucide 图标由 Node 读 `__iconData.node` 拼 SVG（[#1387](https://github.com/linhongcun/aoe2-analyzer/issues/1387#体验设计)）。
- **批量截稿与裁切防坑**：每状态独立 `context.newPage()`，模拟缺失用显式哨兵不写 `??`（[#1225](https://github.com/linhongcun/aoe2-analyzer/issues/1225)、[#1227](https://github.com/linhongcun/aoe2-analyzer/issues/1227)）；借底图换对象用 `TreeWalker` 替换页眉/页脚上下文（跳过 `<option>`，`select.size` 示意展开 [#1410](https://github.com/linhongcun/aoe2-analyzer/issues/1410#体验设计)）；整页/局部裁切前隐藏 `position: fixed` 底栏、将纵向吸顶 `position: sticky` 置 `static`（保留横向时代列）、先滚入目标区将懒加载 `<img>` 置 `eager` 等全部 `complete && naturalWidth > 0` 再 `window.scrollTo(0, 0)` 取 `clip`（[#1364](https://github.com/linhongcun/aoe2-analyzer/issues/1364#体验设计)、[#1404](https://github.com/linhongcun/aoe2-analyzer/issues/1404#体验设计)、[#1478](https://github.com/linhongcun/aoe2-analyzer/issues/1478#体验设计)）；无法重画区块分段截并注明略去（[#1366](https://github.com/linhongcun/aoe2-analyzer/issues/1366#体验设计)）。

## 开始和交付清单

- **开始前**：读本文、目标页组件与 `pageRegistry` → 一句话定核心任务并分主/次/辅 → 拆清已见现状、设计判断与待核玩法 → 核无重复 Issue/PR 或他人认领；产品范围不清留在当前阶段标 `待确认` 串行请产品补齐。
- **交付前**：正式界面与逐字文案 / 示意数据与替换来源 / 审阅说明三份分开；仅覆本次相关状态；浅/深色走现行令牌，PC 与相关窄屏已核；浮层焦点/回焦与网格折行已查；完成态设计图已[嵌入原 Issue 正文](#issue-design-images)并读者验收；留设计评审记录，不替产品排期、不冒充引擎或现网验收。

## 依据与核对

可复用原则以本文「[体验设计原则](#体验设计原则)」为准，实现以源码和 [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) 为准，开局来源见 [docs/BUILD-SIM-SOURCES.md](../docs/BUILD-SIM-SOURCES.md)，机器证据在 [`data/evidence/`](../docs/DATA-LAYOUT.md) 保持原字节与哈希不变；已退役的旧 `docs/design/` 仅通过基线 [362f1ed7](https://github.com/linhongcun/aoe2-analyzer/tree/362f1ed7a7acebbecb08f43dfa04684828eba923/docs/design) Git 历史查阅。
