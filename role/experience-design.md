# 体验设计接手指南

核查日期：2026-11-13。

基线：`main` `0db9c30924dc5a2acaa66d3924d2f655fc17a6c2`（`style(#1002)`，2026-11-13 13:44 UTC）。该提交的 `package.json` 版本是 `0.77.92`。游戏数据版本以 [`scripts/data_sources.json`](../scripts/data_sources.json) 为准，当前为 DE Update 188329。下文「本基线」指这次读到的源码。本次没有打开线上 Pages，也没有把页脚构建号核成这个 SHA。

文中四类信息分开写：

- **现行约定**：Issue 从提出到交付由各角色在同一正文接续；阶段与交接按 [CONTRIBUTING「Issue 生命周期」](../CONTRIBUTING.md#issue-lifecycle)，设计通过不代替实现授权。
- **实际实现**：本基线源码里已经如此。
- **历史案例**：已发生过、能迁移的机制；修过的缺陷不再写成当前页面。
- **待验范围**：本次没有用浏览器重测，也不能把旧 PR 的本地结果写成今天的通过。

## 这份文档负责什么

接手体验设计时用本文：先看哪份源码，一次交付交什么，以及哪几类界面错误会反复出现。Issue 生命周期、阶段和正文交接以 [CONTRIBUTING「Issue 生命周期」](../CONTRIBUTING.md#issue-lifecycle) 为准。

视觉令牌和组件草案在 [`docs/design/DESIGN-SYSTEM.md`](../docs/design/DESIGN-SYSTEM.md)。逐项规格索引在 [`docs/design/README.md`](../docs/design/README.md)。产品范围、测试投入、实现队列分别在 [`CONTRIBUTING.md`](../CONTRIBUTING.md)、[`docs/TESTING.md`](../docs/TESTING.md)、[`docs/MAINTENANCE.md`](../docs/MAINTENANCE.md)。当前事项的决定、规格、完成态设计图和交接写在同一 Issue 正文；实际 UX 交付必须嵌入可直接查看的设计图。复杂/可复用规格可另附或链接补充，但不能代替正文图片，也不为阶段记录新建文档。只有纯 docs/data 且无 UI 时由产品经理记录 UX 不适用及理由。

本文是可复用的设计知识；阶段交接使用既有 Issue，不另增审批链。实现授权仍按维护者明确记录的范围执行。

## 从哪些文件看起

按这个顺序看，够开始一页的设计。改到哪一页，再打开该页自己的组件和样式。

| 要确认的事                             | 先打开                                                                                                                                                                                                                        |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 这一页在导航和首页的哪一组、路径和标题 | [`src/shared/nav/pageRegistry.ts`](../src/shared/nav/pageRegistry.ts)。懒加载 import 在 [`src/app/pageRegistry.tsx`](../src/app/pageRegistry.tsx)，登记规则见 [`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md)「页面登记表」 |
| 路由在 hash 里                         | [`src/app/App.tsx`](../src/app/App.tsx)、[`src/app/routes.tsx`](../src/app/routes.tsx)                                                                                                                                        |
| 浅色 / 深色实际色值                    | [`src/shared/styles/tokens.css`](../src/shared/styles/tokens.css)。切换逻辑在 [`src/app/theme/theme.ts`](../src/app/theme/theme.ts)、[`src/app/theme/useTheme.ts`](../src/app/theme/useTheme.ts)                              |
| 界面图标                               | [`src/shared/ui/Icon.tsx`](../src/shared/ui/Icon.tsx) 的 `ICONS`                                                                                                                                                              |
| 游戏原版图标、费用                     | [`src/shared/ui/art.tsx`](../src/shared/ui/art.tsx)，文件在 `public/img/`                                                                                                                                                     |
| 页头、面包屑、搜索                     | [`src/shared/ui/layout.tsx`](../src/shared/ui/layout.tsx) 的 `ListHead`、`Breadcrumbs`；[`src/shared/ui/widgets.tsx`](../src/shared/ui/widgets.tsx) 的 `SearchInput`                                                          |
| 工具页壳                               | [`src/shared/ui/ToolPageHeader.tsx`](../src/shared/ui/ToolPageHeader.tsx)、[`src/shared/ui/ToolShell.tsx`](../src/shared/ui/ToolShell.tsx) 的 `ToolGrid`                                                                      |
| 顶栏、焦点、窄屏抽屉                   | [`src/app/Layout.tsx`](../src/app/Layout.tsx)、[`src/shared/styles/editorial-shell.css`](../src/shared/styles/editorial-shell.css)                                                                                            |
| 对象更新历史                           | [`src/shared/ui/PatchHistory.tsx`](../src/shared/ui/PatchHistory.tsx)；站点列表是登记表里的 `/patches`                                                                                                                        |
| 已通过的短稿和勘误                     | [`docs/design/README.md`](../docs/design/README.md)。短稿目录里若有 `ERRATA.md`，以勘误为准；当前索引写明只有 `docs/design/mockups/issue24-v3/ERRATA.md`                                                                      |
| 游戏数字从哪来                         | 生成数据与 [`scripts/data_sources.json`](../scripts/data_sources.json)。界面只读这些结果，不手写玩法数字                                                                                                                      |

本基线最新提交是 [#1002](https://github.com/linhongcun/aoe2-analyzer/issues/1002) / [PR #1003](https://github.com/linhongcun/aoe2-analyzer/pull/1003)。界面只改持续生产、施工、驻军治疗三份页面 CSS，同提交还有规格、版本号和 CHANGELOG。规格写明训练总价和跨文明对照不动，见 [`docs/design/support-tools-ui-20261113.md`](../docs/design/support-tools-ui-20261113.md)。看生产页卡片时用这份，不用更早的截图。

## 现行职责

设计同时对好用和美观负责。字体、字号、字重、对比、间距、对齐、图标、组件和页面密度都是这份工作。

每一页先写清核心任务，再分成主要、次要和辅助。用字号、字重、对比、分组、对齐和留白把注意力交给任务，让人第一眼看到重点，接着读懂，并找到下一步。主操作和次操作要分得开。页面没有自然的主操作时，不强造一颗大按钮。

相关内容靠近，无关内容分开。留白用来建立节奏。工具页保持能扫读的密度：默认不把整页折进一层，不改成一屏一张大卡，也不拆成一页只做一件事。展示页可以保留氛围；工具页优先让人读完并做完。边框、阴影和颜色要有任务。减噪声和折叠是两种手段，折叠不是复杂页的默认答案。

优先复用上一节的组件、字号和令牌。可以提出合并、替换或重排，并写明它对核心任务的价值。产品决定范围。旧布局、旧入口和旧链接可以按这个理由重组；重组之后，游戏数据和计算结果保持改前口径，除非产品写明新口径和来源。

不认识的玩法先查生成数据和既有领域函数，或查得到出处的资料。查不到就在稿和 issue 里标「待确认」或「未核实」。教学示意图和记忆不能当成机制。

对象的更新历史是常用主任务。单位、科技、建筑详情和文明详情都有这一节，站点入口是 `#/patches`。改详情结构时，让它留在章节导航里能够到达的位置，不要收成页尾才发现的边角。空态文案以 `PatchHistory.tsx` 里的 `HISTORY_EMPTY` 为准：尚未收录不等于从未改动。

## 现行界面从哪里来

**实际实现。** 现行皮肤是浅色编辑风。`tokens.css` 开头仍写「方向 C」。深色使用同一套语义令牌，写在 `:root[data-theme='dark']`。`useTheme` 把解析结果写到 `document.documentElement.dataset.theme`。偏好存在本机 `aoe2-theme`，不进分享链接。未存储或值无法识别时，`parseThemePreference` 得到 `light`；只有存成 `dark` 或 `system` 才走另外两条。深色与浅色使用同一组件，只换令牌。新稿两套都要能读。

`DESIGN-SYSTEM.md` 映射表里的旧色（例如背景 `#120d08`）是换肤前的记录。本基线的 `tokens.css` 里没有这些旧色值，旧令牌名指向现在的语义色。看到「深色中世纪」时先对 `tokens.css`，再决定要不要改。现状已经是浅色编辑风加可切换深色，不能把旧皮肤当成必须恢复的现行皮肤。

**实际实现。** 界面图标走 `Icon.tsx`。表里主体是 Lucide；GitHub 标记按该文件注释单独登记。玩家界面不用 emoji 或 Unicode 当图标。文明、单位、科技、时代和资源用 `art.tsx` 引用的原版图。

**实际实现。** `body` 已设 `font-variant-numeric: tabular-nums`。`.nw` 在 [`src/shared/styles/base.css`](../src/shared/styles/base.css) 里是 `white-space: nowrap`。`.num` 的 tabular 规则散落在各页样式，没有一条全局 `.num`。数值和「数字+单位」仍要用 `.nw` 包住，避免 360 宽折成两行。

**实际实现。** 颜色只写在 `tokens.css`。[`scripts/check-colors.mjs`](../scripts/check-colors.mjs) 禁止源码里另写十六进制和 `rgb()` / `hsl()`。[`docs/design/contrast.py`](../docs/design/contrast.py) 检查的是脚本内写死的色对，文件说明对应设计规范草案：正文阈值 4.5，大字和 UI 图形 3.0。本基线里，深色 `--color-bad` 在 `tokens.css` 是 `#ff6961`，`contrast.py` 仍是 `#ff6b5e`；深色 `--color-bad-soft` 分别是 `#452323` 和 `#3a1714`。写稿和验收以 `tokens.css` 为准。`contrast.py` 通过只说明它自己的色对过了阈值。

## 协作顺序

人名是 [`CONTRIBUTING.md`](../CONTRIBUTING.md)「角色」（2026-11-10）里的当前分工：hongcun lin 决定产品范围和维护授权；Steve 管核心任务、范围和取舍；Jony 负责好用和美观；运营从使用者路径写卡点；Kent 确认这次功能是否正常。实现由执行代理按队列做。这是当前协作，不是一条永远自动运转的流水线。

一次界面改动沿同一个 Issue 按生命周期阶段推进：

1. 产品先写清用户问题、核心任务、范围、非目标、验收与依据，并判断现有能力是否重复、可替代或可合并。
2. 体验设计在该范围内给出入口、放置、行为、状态、文案与视觉；每次 UX 交付都必须把完成态、可直接查看的设计图嵌入同一 Issue 正文，覆盖主要界面和重要状态。文字、规格、线框、本地文件或 ZIP 不能替代设计图；小改动仍提供覆盖本范围的图，不要求额外制作整套无关页面。
3. 产品对照已记录的任务和范围，确认正文中的设计图可查看、覆盖主要界面和重要状态且符合范围后，才可通过设计确认；设计只说明已核对的部分，未知项保持明确未确认。缺图、图不可查看、关键状态不清或与范围不符时不得交软件开发，须带具体补图/修改要求退回 UX。
4. 设计查重并在原 Issue 正文记录规格、完成态设计图与评审结果；复杂/可复用规格可以链接补充，但不能代替正文图片。若有他人有效认领，先停下协调。自己仍有效认领的事项已有 open PR 时继续同一 PR，不另开 PR；选择新事项时已有 open PR 则不重复认领或实现。

设计完成后交回同一 Issue 的 `阶段:需求评审`，下一步写「设计确认」。产品经理对照原范围复核正文中的设计图：确认其可查看、覆盖主要界面和重要状态并符合范围后，且实现授权已记录，才转软件开发，不重复体验设计；缺图、图不可查看、状态不清或需要修改则带具体要求转回本阶段；范围或授权缺失则留在需求评审并加 `待确认`。只有纯 docs/data 且无 UI 时可由产品经理在体验设计节记录“不适用”、理由和已授权范围；这不适用于实际 UX 工作。产品、设计按同一认领/交接协议串行更新，不并行编辑正文；设计通过本身不等于实现授权。阶段路由和交接详情见 [CONTRIBUTING「Issue 生命周期」](../CONTRIBUTING.md#issue-lifecycle)。

阶段标签只路由到对应角色，不自动认领、开工或合并；类型、优先级和阻塞标签独立保留。当前决定和规格留在原 Issue 正文，不为阶段变化另提单。

[#978](https://github.com/linhongcun/aoe2-analyzer/issues/978) 曾有「仅设计、不提实施 issue」的单项限制；该 Issue 记录了 2026-11-13 的授权覆盖此限制。这是该事项的历史事实，不改变当前通用规则：同一 Issue 继续流转，设计通过本身仍不构成实现授权。

设计不替产品排期，不替实现选定算法或改计算口径，也不替测试做模拟引擎或现网验收。稿上的「设计通过」只覆盖入口、结构和视觉。超时、未点到、未量到的项写成未确认。

设计索引旧版曾记录视觉 PR 的 15 分钟回复要求；该时限不作为现行交接门槛。`MAINTENANCE` 把更早的双路实施记为历史暂停，新工作不把双路门禁写成永恒规则。

## 交付时分成三份

每次交付分成三份，放在一起时也要让人分得开。

**正式界面和逐字文案。** 写明哪些布局、图标和句子照此实现。玩家能读到的中文独立校读：去掉同义空句，不写函数名、文件名和内部编号。必须锁定的 id 放在给实现看的条款里。文案与相邻页面一致。

**示意数据、样卡和短名单。** 每条都标成示意，并写成品用什么替换：真实来源、动态字段、运行时计数或正式组件。示例金额、短名单和某次打开页面时看到的计数都不写死。[#970](https://github.com/linhongcun/aoe2-analyzer/issues/970) 要求 `#/simulator` 的计数现场计算；[#978](https://github.com/linhongcun/aoe2-analyzer/issues/978) 禁止把原型数量和汇总金额写进代码或当成引擎验收。

**审阅说明。** 放在业务画面外面，说明取舍、有意删掉的内容和实现边界。防错句写进实施条款，不写进玩家界面。

状态只覆盖这一次会碰到的：默认、选中、空结果、未知、错误、不可用、恢复、URL 和返回。空、未知和 0 用不同句子。训练总价在没有已计入行时不展示资源卡，见 [`trainTotalCopy.ts`](../src/features/production/trainTotalCopy.ts)。驻军治疗规格写明零秒不是未知，见 [`support-tools-ui-20261113.md`](../docs/design/support-tools-ui-20261113.md)。没有这次的功能就不要为了状态表造一个。

同一 Issue 正文应能读懂当前目标、产品范围、照此实现的界面规格、非目标和验收标准；不依赖打开本地包。每次实际 UX 交付的完成态设计图须以 Markdown 图片或可显示的图片附件直接嵌入正文，并确认可从 Issue 查看；不得以文字、规格、线框、外链、未上传的本地文件或 ZIP 代替，也不得声称本地文件已附上。复杂/可复用规格可链接补充，但不得替代正文中的图、当前决定和可执行规格。

## 这次要检查什么

PC 优先，窄屏做到这次的路径基本可用。设计索引里的桌面参照是 1280。只查这次改到的布局、可读性和关键操作。不把全站、全尺寸、全主题矩阵加回每次 PR，也不为设计评审加无关 CI。全站回归是否在跑，以 [`docs/TESTING.md`](../docs/TESTING.md) 文首为准。

有浮层时写清焦点从哪来、键盘怎样关闭、关闭后回到哪个控件。长中文、图标和费用保持同一阅读基线；一行放不下时整组费用换行，不把单个资源拆到错位的列。浅色和深色都看这次的默认态。有遮罩时看打开与关闭两态。

可点区域按**这一项的交互规格**。适用控件常用至少 44×44 CSS 像素，例如 [`docs/design/touch-targets-481.md`](../docs/design/touch-targets-481.md) 只补开局术语链接和页脚里不足的链接，并写明不放大整站普通内联链接。`MAINTENANCE` 第 6 节的「可点区域 ≥ 44×44」是摘要；同文第 7 节写明四宽截图不是每 PR 测试门禁。

这不是「所有 WCAG 场合都强制 44」。W3C WCAG 2.2 里，[2.5.8 Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) 是 AA，目标至少 24×24 CSS 像素，并有间距、等效控件、行内文本等例外；[2.5.5 Target Size (Enhanced)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html) 是 AAA，目标至少 44×44 CSS 像素，同样有行内文本等例外。引用这两条只说明外部门槛，不表示本站已经按它们全站测过。

下面几样不能互相代替：

- CSS 的 `min-height: 44px` 不是浏览器量到的边框盒，也不是边缘点击命中。
- 令牌对比和 `contrast.py` 不是叠上遮罩之后的渲染对比。
- 用 `::after` 拼出来的热区不是运行时点中的元素。
- 离线原型和合成图不是模拟引擎，也不是现网。
- 点击或测量超时写成未确认。[#970](https://github.com/linhongcun/aoe2-analyzer/issues/970) 记录过文明弹层的鼠标点击关闭曾超时。那次未确认不能改写成通过；本次也没有重跑。

报告写实际看过的视口和主题。没看过的尺寸留在未验证。

## 五条可迁移案例

五条都在本基线的历史上。修过的部分只说明机制；本次没有重新打开浏览器测量。

### 关着的层仍铺满遮罩

**历史案例。** [#970](https://github.com/linhongcun/aoe2-analyzer/issues/970) 的选单位设计走查里，原型用 `hidden` 表示文明弹层和窄屏导航遮罩关闭，作者样式又写了 `display: flex` 或 `display: block`。作者样式盖过用户代理对 `[hidden]` 的 `display: none`，关闭态仍铺 `--color-scrim`，深色正文对比掉下去。处理方式是修状态层。提亮主题消不掉一层不该出现的遮罩。这是原型走查，不是一条「生产代码现在有全屏暗遮罩」的结论。

**实际实现。** [`CivPicker.tsx`](../src/shared/ui/CivPicker.tsx) 在 `open` 时才挂 `.cp-mask` 和 `.cp-panel`。[`Layout.tsx`](../src/app/Layout.tsx) 在 `menu` 为真时才挂 `.nav-backdrop`。[#971](https://github.com/linhongcun/aoe2-analyzer/pull/971) 已把 `#/simulator` 做成可筛选的紧凑行，本基线的 [`SimulatorHub.tsx`](../src/features/simulator/components/SimulatorHub.tsx) 即是这一页。

**仍要防的写法。** [`editorial-shell.css`](../src/shared/styles/editorial-shell.css) 在 `max-width: 900px` 给 `.nav-backdrop` 设 `display: block`。同一元素若再加 `hidden` 而没有更高优先级的 `[hidden] { display: none }`，窄屏会再次铺满遮罩。同文件里 `.theme-menu[hidden]` 和 `.tools-panel[hidden]` 已经显式写了 `display: none`，这是关闭态要跟的写法。

**待验。** 本次没有在浏览器里开关菜单或文明弹层。

### 稀疏网格把费用挤到下一行

**历史案例。** [#972](https://github.com/linhongcun/aoe2-analyzer/issues/972) 的科技目录在桌面宽度上，行 DOM 经 `display: contents` 之后，自动放置顺序是名称、建筑、时代、文明、首发、费用。首发先占第 6 列，费用只能掉到下一行第 5 列。列号写在 CSS 上也不够，默认 `grid-auto-flow: row` 按 DOM 顺序占格。

**实际实现。** [PR #973](https://github.com/linhongcun/aoe2-analyzer/pull/973) 只在 `min-width: 721px` 给 `#techs` 的六个实格写 `grid-row: 1`，见 [`tech-list.css`](../src/features/techs/components/tech-list.css)。没有改 JSX，没有用 `grid-auto-flow: dense`。只把费用挪到首发前面会让文明和首发掉行。`dense` 会去填别的空洞，相邻列跟着错。

**待验。** 本次没有重新量 1280 或 390 的行盒。

### 全局 `nav` 把详情章节居中

**历史案例。** [#976](https://github.com/linhongcun/aoe2-analyzer/issues/976) 里，科技和建筑详情的页内章节在栏内居中，单位详情已经左对齐。原因是 [`base.css`](../src/shared/styles/base.css) 的元素选择器 `nav { justify-content: center }`。顶栏 `nav.mainnav` 在 [`layout.css`](../src/shared/styles/layout.css) 里已经是 `flex-start`，这只覆盖顶栏，不覆盖详情里的 `nav`。

**实际实现。** [PR #977](https://github.com/linhongcun/aoe2-analyzer/pull/977) 给 [`.td-jump`](../src/features/techs/components/tech-detail.css) 和 [`.bd-jump`](../src/features/buildings/components/building-detail.css) 补了 `justify-content: flex-start`，与 [`.ud-jump`](../src/features/units/components/unit-detail.css) 相同。全局 `nav` 规则还在。再遇到局部被居中，先给该页的类写对齐，不要改全局 `nav`。

**待验。** 本次没有重新看这三页的章节导航。

### Hash 里的路由和页内锚点不是同一个 `hash`

**历史案例。** [#974](https://github.com/linhongcun/aoe2-analyzer/issues/974) 里，`#/civ/franks` 把仍在目录中的文明画成历史档案空态，标签却是「法兰克」。`#/civ/Franks` 正常。根因是详情只做英文名精确匹配，大小写不同就落入 `HistoricalEntityDetail`。

**实际实现。** 站点是 `HashRouter`。应用看到的 pathname、search、hash 都在网址的那一个 `#` 后面。`#/civ/franks?tab=techtree` 的路由 search 是 `?tab=techtree`；`#/civ/franks#patches` 的页内 hash 是 `#patches`。`window.location.hash` 是整段 `#/civ/...`，和 `useLocation().hash` 不是同一个值。

本基线用 [`civEnCasePath`](../src/domain/civRoute.ts)：先精确匹配目录英文名，再只认大小写差异。[`CivDetail.tsx`](../src/features/civs/components/CivDetail.tsx) 在画出历史空态之前 `replace` 到规范名，并带上原来的 `search` 和 `hash`。已是规范名时不对自己跳。对不上目录的名字保持原样，`Tartars` 不会被改成 `Tatars`。科技树重定向 [`TreeCivRedirect`](../src/app/routes.tsx) 使用同一匹配。返回应直接回到进入前的页面，中间不闪空态。

**待验。** 本次没有在浏览器里走小写地址、锚点和返回键。

### 训练总价和持续生产的数量不是一回事

**历史案例，现已进同一页的不同模式。** [#978](https://github.com/linhongcun/aoe2-analyzer/issues/978) / [PR #979](https://github.com/linhongcun/aoe2-analyzer/pull/979) 在 `#/production` 增加 `mode=train-total`，没有新开顶级路由。

**实际实现。** 分发在 [`productionMode.ts`](../src/features/production/productionMode.ts)。

- 持续生产的 `count` 是建筑数量。[`production.ts`](../src/domain/production.ts) 里 `BUILDING_LIMIT` 为 100，合法值是 0–100 的整数；0 在界面上是「已暂停」，大于 100 或不是整数才进错误。默认文明是法兰克，默认时代是城堡（`age: 3`）。界面标签是「建筑数量」，见 [`Production.tsx`](../src/features/production/Production.tsx)。
- 训练总价的 `qty` 是训练数量。[`trainTotal.ts`](../src/domain/trainTotal.ts) 里 `TRAIN_TOTAL_QTY_MAX` 为 1000，合法数量是 1–1000 的整数；无合法显式时代时默认帝王（`TRAIN_TOTAL_DEFAULT_AGE = 4`）。单价走 `unitCost`（内部使用折后价）。玩家句子在 [`trainTotalCopy.ts`](../src/features/production/trainTotalCopy.ts)：合计不含科技研究、单位升级和其他转型投入。空方案和有效行为 0 都不展示资源卡；只有部分行计入时，标题用「已计入行小计」，不用整份方案的「训练总价」。

两种数量不能对抄，研究费用不能加进训练总价。原型里的金额只说明布局。#1003 改的是持续生产卡片样式，没有改这个模式分界。

**待验。** 本次没有跑训练总价或持续生产的计算，也没有做引擎验收。

## 开始和交付清单

开始前：

1. 读本文、该页组件和 `pageRegistry` 里的路径与标题。
2. 用一句话写下核心任务，并标出主要、次要、辅助。
3. 把已看到的界面、设计判断、待确认的玩法分成三列。陌生机制先查数据。
4. 产品范围不清时不交设计定稿；回到同一 Issue 的 `阶段:需求评审`，下一步写“补齐范围”，加 `待确认` 并提出具体问题。产品补清后按交接协议决定是否回到体验设计，不另开 Issue。
5. 查其他开放 Issue 和 PR 是否覆盖重复范围；当前生命周期 Issue 是唯一主记录，继续更新它，不因它本身而停。若另有重复 Issue、他人有效认领或另一执行者的 open PR 覆盖同一范围，停止并协调，不另开设计/实施单。

交付前：

1. 正式界面与逐字文案、示意数据、审阅说明三份分得开。示意数字写了成品替代。
2. 这次相关的默认、选中、空、未知、错误、不可用、恢复、URL 和返回都写了；没有的状态不补。
3. 浅色和深色使用现行令牌。PC 和这次相关的窄屏都看过，没看过的写进未验证。
4. 浮层写了焦点、键盘关闭和回焦。费用、长中文和图标的对齐按上面的网格案例检查过。
5. issue 含范围、不改项和验收。本地包没有被写成 GitHub 附件。
6. 没有替产品排期，没有把设计通过写成引擎或现网通过。
7. 完成态设计图已直接嵌入同一 Issue 正文、能查看并覆盖主要界面和重要状态；没有把本地路径或 ZIP 当作已附图。

## 规范冲突时改哪里

发现下面的不一致时，先改本文对应小节，写上新的核查日期和 `main` SHA。体验设计的文档 PR 不顺手改 `README`、`AGENTS.md`、`CONTRIBUTING.md`、`MAINTENANCE` 或其他角色文档。

| 冲突                                                                                                                                                    | 本基线怎么取                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`DESIGN-SYSTEM.md`](../docs/design/DESIGN-SYSTEM.md) 草案（2026-10-11）写手机端优先保证可读，并把深色放到第 4 阶段；样例 CSS 含 `prefers-color-scheme` | 色值和主题开关以 `tokens.css` 与 `src/app/theme/` 为准。本基线的 `tokens.css` 只有 `:root[data-theme='dark']`，没有 `prefers-color-scheme` 块。检查范围以本文「这次要检查什么」为准 |
| 设计索引旧版曾要求视觉 PR 15 分钟内回复；维护文档保留双路暂停                                                                                           | 15 分钟要求是历史记录，不作现行门槛；实际 UX 交付按 CONTRIBUTING 在同一 Issue 正文嵌入可查看设计图。双路暂停也不作为当前流程                                                        |
| `MAINTENANCE` 第 6 节仍列 360 / 375 / 390 / 1280 截图；当前 CONTRIBUTING「版本工作流 / 设计稿」已改为按影响选视口，不设固定四宽                         | 设计说明覆盖这次相关状态。`MAINTENANCE` 第 7 节、CONTRIBUTING 和 TESTING 文首均不把全站全尺寸或四宽矩阵设为每 PR 门禁                                                               |
| `contrast.py`、设计规范草案和 `tokens.css` 的个别深色值不一致                                                                                           | 界面使用 `tokens.css`。改色的实施 issue 再决定是否同步检查脚本                                                                                                                      |
| 历史页面曾要求设计后另提实施 Issue                                                                                                                      | 现行统一流程在原 Issue 正文继续交接；每次实际 UX 交付必须在正文嵌入可查看的完成态设计图，复杂/可复用规格可链接补充；设计通过仍不等于实现授权                                        |

外部规范（WCAG、别的产品的界面）写来源、看过的范围和不适用的地方。引用本身不是本站已经验证。成熟案例按上一节的四段写：当时发生在哪、本基线代码、以后怎样迁移、哪一段还没复测。案例过时或路径改了，就改那一节，不另堆一份 issue 目录。

2026-11-09 的页面任务优先优化在 [`docs/design/task-focused-ui-2026-11.md`](../docs/design/task-focused-ui-2026-11.md)，基线是更早的 `483e513`。用它看当时的筛选、开一局和详情扫描结论；数字和截图位置以那份证据为准，不把它当成 2026-11-13 的全站现状。
