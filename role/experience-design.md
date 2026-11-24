# 体验设计接手指南

核查日期：2026-11-13。

基线：`main` `0db9c30924dc5a2acaa66d3924d2f655fc17a6c2`（`style(#1002)`，2026-11-13 13:44 UTC）。该提交的 `package.json` 版本是 `0.77.92`。游戏数据版本以 [`data/sources/data_sources.json`](../data/sources/data_sources.json) 为准，当前为 DE Update 188329。下文「本基线」指这次读到的源码。本次没有打开线上 Pages，也没有把页脚构建号核成这个 SHA。

文中四类信息分开写：

- **现行约定**：Issue 从提出到交付由各角色在同一正文接续；阶段与交接按 [CONTRIBUTING「Issue 生命周期」](../CONTRIBUTING.md#issue-lifecycle)，完成设计交软件开发即获得既定范围内的开发授权。
- **实际实现**：本基线源码里已经如此。
- **历史案例**：已发生过、能迁移的机制；修过的缺陷不再写成当前页面。
- **待验范围**：本次没有用浏览器重测，也不能把旧 PR 的本地结果写成今天的通过。

## 这份文档负责什么

接手体验设计时用本文：先看哪份源码，一次交付交什么，以及哪几类界面错误会反复出现。Issue 生命周期、阶段和正文交接以 [CONTRIBUTING「Issue 生命周期」](../CONTRIBUTING.md#issue-lifecycle) 为准。

本文统一维护面向全站的可复用[体验设计原则](#体验设计原则)与体验设计交接规范，全站文档入口见 [docs/README.md](../docs/README.md)。产品范围、测试投入和实现队列分别见 [CONTRIBUTING.md](../CONTRIBUTING.md)、[docs/TESTING.md](../docs/TESTING.md) 和 [docs/MAINTENANCE.md](../docs/MAINTENANCE.md)。当前事项的决定、规格、完成态设计图和交接写在同一 Issue 正文；实际 UX 交付必须嵌入可直接查看的设计图。只有纯 docs/data 且无 UI 时由产品经理记录 UX 不适用及理由。

本文是可复用的设计知识；阶段交接使用既有 Issue，不另增审批链。进入软件开发即获既定范围内的开发授权，不再另行索要实施许可。

## 体验设计原则

这是面向全站的当前可复用原则，不是每个功能的规格。当前目标、授权依据、交互细节和完成态设计图写在对应 Issue；UX 完成后直接交软件开发，进入该阶段即获既定范围内的开发授权，无需维护者另行批准。

### 任务优先

- 先让用户看清当前任务、配置输入、主要结果与可采取的下一步，再呈现次要说明。
- 明确计算范围、数据来源和支持边界；未知、不支持、估算、空结果和错误不可用同一种成功文案表示。
- 保留输入与结果之间的对应关系；提供来源、限制和可恢复错误时，让它们靠近相关结果。
- 以桌面阅读为主，同时保证本次相关窄屏任务可用；不为所有页面强制相同宽度矩阵。

### 层级与样式

- 颜色、间距和其他已定义令牌以 [`src/shared/styles/tokens.css`](../src/shared/styles/tokens.css) 为单一来源；不要在页面复制颜色值或另建令牌表。
- 默认主题为浅色；主题偏好 `light`、`dark`、`system` 及系统主题解析由 [`src/app/theme`](../src/app/theme/) 管理。组件应在两种已实现主题下读取令牌，不写未来阶段或个人设备推断。
- 使用现有 [`ToolShell`](../src/shared/ui/ToolShell.tsx)、[`ToolPageHeader`](../src/shared/ui/ToolPageHeader.tsx)、[`CalcDock`](../src/shared/ui/CalcDock.tsx) 等共用结构时，先检查其实际职责和页面需求；新组件只有在重复任务明确时才抽到 [`src/shared/ui`](../src/shared/ui/)。
- 数值和数字加单位使用现有 `.num` / `.nw` 约定，避免窄屏断行导致数值与单位错读。

### 图标、状态与键盘

- 界面动作图标使用 [`src/shared/ui/Icon.tsx`](../src/shared/ui/Icon.tsx) 登记的 Lucide 图标；游戏单位和文明形象使用仓库中的原版游戏美术，不以 emoji 替代任一类图标。
- 为本次范围涉及的默认、已选、空、错误、未知和不支持状态给出清楚反馈；不要无条件扩展成全站状态矩阵。
- 弹层、菜单与可编辑控件说明焦点入口、键盘关闭和关闭后的回焦；可点尺寸按当前组件与场景核对，项目可点区域参考和 WCAG 适用边界见下文「[这次要检查什么](#这次要检查什么)」。

关于当前基线的描述应能在代码中找到对应令牌、组件或行为。未来目标若有意偏离现状，应写在当前 Issue 中；不要把尚未实现的目标写成现状，也不要把旧样稿当成现状。

## 从哪些文件看起

按这个顺序看，够开始一页的设计。改到哪一页，再打开该页自己的组件和样式。

| 要确认的事                             | 先打开                                                                                                                                                                                                      |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 这一页在导航和首页的哪一组、路径和标题 | [`src/shared/nav/pageRegistry.ts`](../src/shared/nav/pageRegistry.ts)。懒加载 import 在 [`src/app/pageRegistry.tsx`](../src/app/pageRegistry.tsx)，登记规则见 [路由、导航与元数据](../docs/ARCHITECTURE.md) |
| 路由在 hash 里                         | [`src/app/App.tsx`](../src/app/App.tsx)、[`src/app/routes.tsx`](../src/app/routes.tsx)                                                                                                                      |
| 浅色 / 深色实际色值                    | [`src/shared/styles/tokens.css`](../src/shared/styles/tokens.css)。切换逻辑在 [`src/app/theme/theme.ts`](../src/app/theme/theme.ts)、[`src/app/theme/useTheme.ts`](../src/app/theme/useTheme.ts)            |
| 界面图标                               | [`src/shared/ui/Icon.tsx`](../src/shared/ui/Icon.tsx) 的 `ICONS`                                                                                                                                            |
| 游戏原版图标、费用                     | [`src/shared/ui/art.tsx`](../src/shared/ui/art.tsx)，文件在 `public/img/`                                                                                                                                   |
| 页头、面包屑、搜索                     | [`src/shared/ui/layout.tsx`](../src/shared/ui/layout.tsx) 的 `ListHead`、`Breadcrumbs`；[`src/shared/ui/widgets.tsx`](../src/shared/ui/widgets.tsx) 的 `SearchInput`                                        |
| 工具页壳                               | [`src/shared/ui/ToolPageHeader.tsx`](../src/shared/ui/ToolPageHeader.tsx)、[`src/shared/ui/ToolShell.tsx`](../src/shared/ui/ToolShell.tsx) 的 `ToolGrid`                                                    |
| 顶栏、焦点、窄屏抽屉                   | [`src/app/Layout.tsx`](../src/app/Layout.tsx)、[`src/shared/styles/editorial-shell.css`](../src/shared/styles/editorial-shell.css)                                                                          |
| 对象更新历史                           | [`src/shared/ui/PatchHistory.tsx`](../src/shared/ui/PatchHistory.tsx)；站点列表是登记表里的 `/patches`                                                                                                      |
| 可复用设计原则                         | 本文[体验设计原则](#体验设计原则)，具体需求和完成态设计图以原 Issue 为准                                                                                                                                    |
| 游戏数字从哪来                         | 生成数据与 [`data/sources/data_sources.json`](../data/sources/data_sources.json)。界面只读这些结果，不手写玩法数字                                                                                          |

历史页面复核见 [#1002](https://github.com/linhongcun/aoe2-analyzer/issues/1002) / [PR #1003](https://github.com/linhongcun/aoe2-analyzer/pull/1003) 及[基线规格原件](https://github.com/linhongcun/aoe2-analyzer/blob/362f1ed7a7acebbecb08f43dfa04684828eba923/docs/design/support-tools-ui-20261113.md)；它记录当时的持续生产、施工和驻军治疗布局，不作为当前通用组件规范。

## 现行职责

设计同时对好用和美观负责。字体、字号、字重、对比、间距、对齐、图标、组件和页面密度都是这份工作。

每一页先写清核心任务，再分成主要、次要和辅助。用字号、字重、对比、分组、对齐和留白把注意力交给任务，让人第一眼看到重点，接着读懂，并找到下一步。主操作和次操作要分得开。页面没有自然的主操作时，不强造一颗大按钮。

相关内容靠近，无关内容分开。留白用来建立节奏。工具页保持能扫读的密度：默认不把整页折进一层，不改成一屏一张大卡，也不拆成一页只做一件事。展示页可以保留氛围；工具页优先让人读完并做完。边框、阴影和颜色要有任务。减噪声和折叠是两种手段，折叠不是复杂页的默认答案。

优先复用上一节的组件、字号和令牌。可以提出合并、替换或重排，并写明它对核心任务的价值。产品决定范围。旧布局、旧入口和旧链接可以按这个理由重组；重组之后，游戏数据和计算结果保持改前口径，除非产品写明新口径和来源。

不认识的玩法先查生成数据和既有领域函数，或查得到出处的资料。查不到就在稿和 issue 里标「待确认」或「未核实」。教学示意图和记忆不能当成机制。

对象的更新历史是常用主任务。单位、科技、建筑详情和文明详情都有这一节，站点入口是 `#/patches`。改详情结构时，让它留在章节导航里能够到达的位置，不要收成页尾才发现的边角。空态文案以 `PatchHistory.tsx` 里的 `HISTORY_EMPTY` 为准：尚未收录不等于从未改动。

## 现行界面从哪里来

**实际实现。** 现行皮肤是浅色编辑风。`tokens.css` 开头仍写「方向 C」。深色使用同一套语义令牌，写在 `:root[data-theme='dark']`。`useTheme` 把解析结果写到 `document.documentElement.dataset.theme`。偏好存在本机 `aoe2-theme`，不进分享链接。未存储或值无法识别时，`parseThemePreference` 得到 `light`；只有存成 `dark` 或 `system` 才走另外两条。深色与浅色使用同一组件，只换令牌。新稿两套都要能读。

已退役旧设计系统映射表里的旧色（例如背景 `#120d08`）是换肤前的记录。本基线的 `tokens.css` 里没有这些旧色值，旧令牌名指向现在的语义色。看到「深色中世纪」时先对 `tokens.css`，再决定要不要改。现状已经是浅色编辑风加可切换深色，不能把旧皮肤当成必须恢复的现行皮肤。

**实际实现。** 界面图标走 `Icon.tsx`。表里主体是 Lucide；GitHub 标记按该文件注释单独登记。玩家界面不用 emoji 或 Unicode 当图标。文明、单位、科技、时代和资源用 `art.tsx` 引用的原版图。

**实际实现。** `body` 已设 `font-variant-numeric: tabular-nums`。`.nw` 在 [`src/shared/styles/base.css`](../src/shared/styles/base.css) 里是 `white-space: nowrap`。`.num` 的 tabular 规则散落在各页样式，没有一条全局 `.num`。数值和「数字+单位」仍要用 `.nw` 包住，避免 360 宽折成两行。

**实际实现。** 颜色只写在 `tokens.css`。[`scripts/check-colors.mjs`](../scripts/check-colors.mjs) 禁止源码里另写十六进制和 `rgb()` / `hsl()`。[`scripts/contrast.py`](../scripts/contrast.py) 检查的是脚本内写死的色对，文件说明对应设计规范草案：正文阈值 4.5，大字和 UI 图形 3.0。本基线里，深色 `--color-bad` 在 `tokens.css` 是 `#ff6961`，`contrast.py` 仍是 `#ff6b5e`；深色 `--color-bad-soft` 分别是 `#452323` 和 `#3a1714`。写稿和验收以 `tokens.css` 为准。`contrast.py` 通过只说明它自己的色对过了阈值。

## 协作顺序

人名是 [`CONTRIBUTING.md`](../CONTRIBUTING.md)「角色」（2026-11-10）里的当前分工：hongcun lin 决定产品范围和维护授权；Steve 管核心任务、范围和取舍；Jony 负责好用和美观；运营从使用者路径写卡点；Kent 确认这次功能是否正常。实现由执行代理按队列做。这是当前协作，不是一条永远自动运转的流水线。

一次界面改动沿同一个 Issue 按生命周期阶段推进：

1. 产品先写清用户问题、核心任务、范围、非目标、验收与依据，并判断现有能力是否重复、可替代或可合并。
2. 体验设计在该范围内给出入口、放置、行为、状态、文案与视觉；每次 UX 交付都必须把完成态、可直接查看的设计图嵌入同一 Issue 正文，覆盖主要界面和重要状态。文字、规格、线框、本地文件或 ZIP 不能替代设计图；小改动仍提供覆盖本范围的图，不要求额外制作整套无关页面。
3. 体验设计者在本阶段对照已记录的任务和范围，确认正文规格、设计图可查看、覆盖主要界面和重要状态且符合范围；设计只说明已核对的部分，未知项保持明确未确认。缺图、图不可查看、关键状态/文案/规格不清或与范围不符时，UX 尚未完成，留在本阶段记录具体补充要求并与对应角色串行补齐原 Issue。
4. 设计查重并在原 Issue 正文记录规格、完成态设计图与评审结果；复杂/可复用规格可以链接补充，但不能代替正文图片。若有他人有效认领，先停下协调。自己仍有效认领的事项已有 open PR 时继续同一 PR，不另开 PR；选择新事项时已有 open PR 则不重复认领或实现。

设计完成并通过本阶段自查后，体验设计者在同一 Issue 记录产出并直接交 `阶段:软件开发`，不返回 `阶段:产品经理`或等待 PM 另行设计确认。缺图、图不可查看、状态/文案/规格不全或范围不符时留在体验设计阶段，记录具体缺项并与对应角色串行补齐。进入软件开发即获既定范围内的开发授权，无需维护者再次批准。软件开发阶段发现设计或范围问题时留在开发阶段记录阻塞，并串行协调对应角色在原 Issue 补齐，不回退、不扩大范围。只有纯 docs/data 且无 UI 时可由产品经理记录 UX 不适用、理由和范围后直接交软件开发；这不适用于实际 UX 工作。产品、设计按同一认领/交接协议串行更新，不并行编辑正文。阶段路由和交接详情见 [CONTRIBUTING「Issue 生命周期」](../CONTRIBUTING.md#issue-lifecycle)。

阶段标签路由到对应角色，进入软件开发同时授予既定范围内的开发权限；符合认领协议和就绪检查的事项允许自动认领。类型、优先级和真实阻塞标签独立保留，合并仍须通过适用门禁。当前决定和规格留在原 Issue 正文，不为阶段变化另提单。

[#978](https://github.com/linhongcun/aoe2-analyzer/issues/978) 曾有「仅设计、不提实施 issue」的单项限制；该 Issue 记录了 2026-11-13 的授权覆盖此限制。这是该事项的历史事实；现行通用规则为同一 Issue 继续流转，进入软件开发即获既定范围内的开发授权。

设计不替产品排期，不替实现选定算法或改计算口径，也不替测试做模拟引擎或现网验收。稿上的「设计通过」只覆盖入口、结构和视觉。超时、未点到、未量到的项写成未确认。

设计索引旧版曾记录视觉 PR 的 15 分钟回复要求；该时限不作为现行交接门槛。`MAINTENANCE` 把更早的双路实施记为历史暂停，新工作不把双路门禁写成永恒规则。

## 交付时分成三份

每次交付分成三份，放在一起时也要让人分得开。

**正式界面和逐字文案。** 写明哪些布局、图标和句子照此实现。玩家能读到的中文独立校读：去掉同义空句，不写函数名、文件名和内部编号。必须锁定的 id 放在给实现看的条款里。文案与相邻页面一致。

**示意数据、样卡和短名单。** 每条都标成示意，并写成品用什么替换：真实来源、动态字段、运行时计数或正式组件。示例金额、短名单和某次打开页面时看到的计数都不写死。[#970](https://github.com/linhongcun/aoe2-analyzer/issues/970) 要求 `#/simulator` 的计数现场计算；[#978](https://github.com/linhongcun/aoe2-analyzer/issues/978) 禁止把原型数量和汇总金额写进代码或当成引擎验收。

**审阅说明。** 放在业务画面外面，说明取舍、有意删掉的内容和实现边界。防错句写进实施条款，不写进玩家界面。

状态只覆盖这一次会碰到的：默认、选中、空结果、未知、错误、不可用、恢复、URL 和返回。空、未知和 0 用不同句子。训练总价在没有已计入行时不展示资源卡，见 [`trainTotalCopy.ts`](../src/features/production/trainTotalCopy.ts)。驻军治疗规格写明零秒不是未知，见 [`support-tools-ui-20261113.md`](https://github.com/linhongcun/aoe2-analyzer/blob/362f1ed7a7acebbecb08f43dfa04684828eba923/docs/design/support-tools-ui-20261113.md)。没有这次的功能就不要为了状态表造一个。

同一 Issue 正文应能读懂当前目标、产品范围、照此实现的界面规格、非目标和验收标准；不依赖打开本地包。每次实际 UX 交付的完成态设计图须以 Markdown 图片或可显示的图片附件直接嵌入正文，并确认可从 Issue 查看；不得以文字、规格、线框、外链、未上传的本地文件或 ZIP 代替，也不得声称本地文件已附上。复杂/可复用规格可链接补充，但不得替代正文中的图、当前决定和可执行规格。交接前在「体验设计」节写设计评审记录：评审人、日期、结论、遗留问题，由设计者按产品评审范围自查，不设 PM 往返确认。

## 这次要检查什么

PC 优先，窄屏做到这次的路径基本可用。按这次改动检查相关的桌面和窄屏布局、可读性与关键操作；具体范围依 Issue 和实际影响确定，不设固定宽度，也不把全站、全尺寸、全主题矩阵加回每次 PR，更不为设计评审增加无关 CI。全站回归是否在跑，以 [`docs/TESTING.md`](../docs/TESTING.md) 文首为准。

有浮层时写清焦点从哪来、键盘怎样关闭、关闭后回到哪个控件。长中文、图标和费用保持同一阅读基线；一行放不下时整组费用换行，不把单个资源拆到错位的列。浅色和深色都看这次的默认态。有遮罩时看打开与关闭两态。

可点区域按**这一项的交互规格**。适用控件常用至少 44×44 CSS 像素，例如[触控目标历史规格](https://github.com/linhongcun/aoe2-analyzer/blob/362f1ed7a7acebbecb08f43dfa04684828eba923/docs/design/touch-targets-481.md)，只补开局术语链接和页脚里不足的链接，并写明不放大整站普通内联链接。`MAINTENANCE` 第 6 节的「可点区域 ≥ 44×44」是摘要；同文第 7 节写明四宽截图不是每 PR 测试门禁。

这不是「所有 WCAG 场合都强制 44」。W3C WCAG 2.2 里，[2.5.8 Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) 是 AA，目标至少 24×24 CSS 像素，并有间距、等效控件、行内文本等例外；[2.5.5 Target Size (Enhanced)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html) 是 AAA，目标至少 44×44 CSS 像素，同样有行内文本等例外。引用这两条只说明外部门槛，不表示本站已经按它们全站测过。

下面几样不能互相代替：

- CSS 的 `min-height: 44px` 不是浏览器量到的边框盒，也不是边缘点击命中。
- 令牌对比和 `contrast.py` 不是叠上遮罩之后的渲染对比。
- 用 `::after` 拼出来的热区不是运行时点中的元素。
- 离线原型和合成图不是模拟引擎，也不是现网。
- 点击或测量超时写成未确认。[#970](https://github.com/linhongcun/aoe2-analyzer/issues/970) 记录过文明弹层的鼠标点击关闭曾超时。那次未确认不能改写成通过；本次也没有重跑。

报告写实际看过的视口和主题。没看过的尺寸留在未验证。

## 可迁移案例

本节随工作继续积累：完成阶段交接后按 [CONTRIBUTING「经验回写」](../CONTRIBUTING.md#experience-writeback) 追加或修订条目，没有可复用经验就不写。

最初的五条都在本基线的历史上。修过的部分只说明机制；本次没有重新打开浏览器测量。

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

### 旧界面可以借布局，不能当玩法依据

[#1220 载具容量](https://github.com/linhongcun/aoe2-analyzer/issues/1220)的初稿沿用旧界面，把运输船标成「爆炸单位」。要展示的是容量，返工的原因却是容量旁的标签：两张稿因此重画。原单最终图已纠正标签；这不是游戏内装载实测。

复用底图时，把玩家能看到的旧标签也当成本次文案校读。先用当前形态的 ID 查[该版固定来源](https://github.com/SiegeEngineers/aoe2techtree/blob/e56728e76b7d08301fba7b18d5f16bc8554c109a/data/data.json)，再决定画什么。即使源字段有值，也别替它补含义：骆驼兵的容量字段为 1，不能据此写「能载 1 人」。没有依据的背景标签不照搬，也不列入开发范围。

### 先判断属性是否适用，再决定怎样显示读数

同一个「0」可能回答了玩家的问题，也可能根本不该显示。先问这项属性是否适用于当前对象，再区分来源有值、空表或缺失。用反例审稿，比只画一个有数的正常态更容易发现误读：

| 设计依据                                                                      | 对照看什么                                                                                                                   |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| [#1218 出手前摇](https://github.com/linhongcun/aoe2-analyzer/issues/1218)     | 民兵有普通攻击，前摇明确为零就写「0 秒」，不写「立即命中」；有攻击但缺秒值写「暂无数据」；无普通攻击的贸易船不显示前摇读数。 |
| [#1219 建筑攻击明细](https://github.com/linhongcun/aoe2-analyzer/issues/1219) | 兵营的空表是「目录未列出攻击项」，城楼的显式零仍是已知值。若缺类别来源，保留已知面板值并说明缺什么，不补零。                 |

有值还要说明它量的是什么：前摇到出手为止，不含弹道飞行；炮塔的基础穿刺攻击只列一次，对船加成另列，不把两项相加称作「实际伤害」。这些是目录读数的展示口径，不是逐帧计时或实际掉血的结论。

涉及模拟时，把「游戏里是否适用」「本站本次怎样计算」「目录原值是什么」拆开核对。[#1328](https://github.com/linhongcun/aoe2-analyzer/issues/1328#体验设计) 中，「仅文本」说明未计入模拟，「仅蓄力远程攻击适用」说明受影响的攻击，两个条件可以同时成立。审稿用普通适用、部分适用、不适用三种对照；数据里找不到真实反例的分支，明确用测试夹具覆盖。[#1322](https://github.com/linhongcun/aoe2-analyzer/issues/1322#体验设计) 同样把目录准确度和本场估算分列，避免参考读数被误读为引擎输入。

### 从反查入口走一遍，条件才算说清

[#1230 训练建筑](https://github.com/linhongcun/aoe2-analyzer/issues/1230)里，按同名单位只列一个建筑，会把文明替代和科技增加的第二训练点混为一谈。僧侣随文明更换训练建筑；哥特近卫军仍可在城堡训练，兵营旁应写「研究无政府后」，而不是「你已解锁」：目录不知道这局研究了什么。

画完「单位 → 建筑」后，再从该文明的建筑反查同一形态。例如从哥特兵营点精锐近卫军，应回到兵营分支（761），不是同名的城堡分支（555）。审稿时对照两端的文明、建筑、形态和条件文案；图能说明预期去向，不能代替实现后的往返测试。

### 按时代触发的变化，先和单位最早出现的时代比

[#1339 升时代自动变化](https://github.com/linhongcun/aoe2-analyzer/issues/1339#体验设计)按数据规则覆盖全部单位。追踪术进封建时代给步兵视野 +2，但它作用的 76 个步兵里有 67 个目录时代是城堡或帝王。长剑士在城堡时代才出现，出现时视野已经是 6。若照规则写「进入封建时代：视野 +2」，读起来像它还会再升级一次，和城堡版萨金特卫兵「目录 50 生命从来用不到」是同一种误读。

画时代类变化前，把触发时代和该单位在当前文明下最早出现的时代比：触发时代更晚，才是「进入 X 时代」的升级；不晚于出现时代，就合并成「出现时已生效」，写「目录记录 → 出现时值」并注明来自哪个时代。开局单位按黑暗时代算，依据是 `garrison_general.json` 里各文明的 `startingScoutId`，不要写单位白名单。斥候骑兵、鹰斥候、骆驼斥候的目录时代都是封建，但它们是开局单位，封建段仍是升级。

### 画错误态之前，先确认 URL 解码能不能让它出现

[#1384 成对训练](https://github.com/linhongcun/aoe2-analyzer/issues/1384#体验设计)的验收写了「等资源预算 `80` 时提示不够训练 1 对（每对 `85`）」。出图时打开 `bud=80`，页面没有报错，而是显示派出 `1`、投入 `85 / 100`：[`duelParams.ts`](../src/domain/duelParams.ts) 把 `bud` 夹在 `100–100000`，`80` 被规范成 `100`。按现有下限，这个单位在页面上永远触发不了预算不足。

画错误态、空态、边界态之前，先查这个参数在解码和规范化时的范围（`clamp`、默认值、取整），再用真实 URL 打开一次，确认页面真的会进入这个状态。触发不了时，不要改 DOM 硬画出来充当可达状态。把实际表现画出来（那次画的是最低预算 `100` 派出 2 只、投入 `85 / 100`），文案仍按规格写好，并在设计节写明这处与验收不一致、开发可以直接调用领域函数测试这个分支。要不要改下限交给产品决定，设计不顺手扩大范围。

<a id="issue-design-images"></a>

### 完成态设计图用 GitHub Issue 原生附件上传，不再合入代码仓库

[#1216 科技树用色](https://github.com/linhongcun/aoe2-analyzer/issues/1216) 曾沿用 [#1200](https://github.com/linhongcun/aoe2-analyzer/issues/1200) / [PR #1215](https://github.com/linhongcun/aoe2-analyzer/pull/1215) 做法开启纯图片 PR（[PR #1242](https://github.com/linhongcun/aoe2-analyzer/pull/1242)，已关闭），拟将设计稿 PNG 合入 `docs/design/mockups/`。维护者明确要求停止把设计图合进仓库：二进制设计稿会持续撑大代码库体积、引入与源码无关的历史记录，还会增加多余的 PR 或主干构建。

选一种上传方式即可。不论用哪种工具，先重读原 Issue，确认你可以编辑当前阶段的正文。在仓库外准备并逐张查看覆盖主界面和重要状态的图片；公开仓库不要上传含私密信息的图。

**网页：直接在正文贴图。** 在已登录的浏览器打开原 Issue，选正文右上角的「… → Edit」，把光标放在「体验设计」小节。将 PNG 拖入、粘贴或点击编辑框底部选择文件；等上传占位文字变成附件引用，给每张图写明它展示的状态，再保存正文。若从评论编辑框上传，只取 GitHub 生成的附件引用放入正文，清空未发送的评论草稿。保存前核对正文没有他人更新。用远程调试协助操作须经浏览器使用者主动授权，不导出登录凭据。见 [GitHub 网页附件说明](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/attaching-files)。

**命令行：把本地图片嵌在指定段落。** 已认证的 CLI 不依赖网页的登录状态。先用 `gh issue edit --help` 确认有 `--attach`；若没有，升级[官方 GitHub CLI](https://cli.github.com/) 或改用网页。CLI 上传要求账号对仓库有推送权限；能改正文不等于当前凭据能上传附件。自动化平台可从密钥管理器注入 `GH_TOKEN`，不要把令牌写进脚本、Issue 或日志。

1. 用 `gh issue view ISSUE-URL --json body --jq .body` 读取当前**完整正文**（将 `ISSUE-URL` 换为原单网址），另存为 UTF-8 的 `body.md`。在同一工作目录放好两张图，只编辑正文的设计小节，例如：

   ```markdown
   ![桌面：未选择文明时的基础容量](./desktop.png)

   ![窄屏：选定文明后另列运载量加成](./mobile.png)
   ```

2. 保存前再次比对远端正文；若有人更新，先把设计小节合进最新正文，不能用旧稿覆盖。确认后在该目录运行（替换网址和文件名）：

   ```sh
   gh issue edit ISSUE-URL --body-file body.md --attach ./desktop.png --attach ./mobile.png
   ```

   每个 `--attach` 对应一张图，路径与 Markdown 引用一致，CLI 会原位替换为 GitHub 附件地址并保留替代文字。`--body-file` 替换的是整篇正文，不是追加一个小节。若命令报错，先重读原单：可能已有部分图片上传并写入正文。保留已成功的链接，只补失败的图；若凭据被拒，改用获授权的账号或网页，不扩大令牌权限来试错。见[官方附图说明](https://docs.github.com/en/github-cli/github-cli/attaching-files-with-github-cli)和 [`gh issue edit` 手册](https://cli.github.com/manual/gh_issue_edit)。

**保存后，以读者身份验收。** 重读正文，逐张对照数量、顺序和图注；保留稳定附件引用（如 `github.com/user-attachments/assets/…`），不要留下本地路径或下载时跳转的临时签名地址。公开仓库用未登录窗口打开原 Issue，私有仓库用有读取权限的账号；滚动到每张图，确认能加载、能看清相应状态。#1216 在保存前匿名访问曾返回 404；应以保存后的页面为准。[#1340](https://github.com/linhongcun/aoe2-analyzer/issues/1340#体验设计) 保存后立刻逐张下载，有一张附件匿名请求先返回 404，脚本因此在改阶段前停下；带退避重试几次后返回 `image/png`，字节也与原图一致。核验脚本要对单张附件重试，失败时先重读原单：图已写进正文就只补核验，不重复上传。遇到空白或疑似错图，检查实际图片请求（PNG 应返回成功状态及 `image/png`）和解码后的尺寸，必要时比对原图字节。只有 HTTP 200 或编辑预览，不能证明读者看得到图。

可对照 [#1051 的五张完成态图](https://github.com/linhongcun/aoe2-analyzer/issues/1051)（使用官方 CLI v2.104.0 上传）和 [#1220 的四张容量状态图](https://github.com/linhongcun/aoe2-analyzer/issues/1220)（公开原单逐图核验）。这里确认的是设计图已交付，不是应用已实现或玩法已实测。

### 设稿前先对照最新 `main` 实况，不沿用提报时的旧构建快照

[#1231 攻击间隔显示字段](https://github.com/linhongcun/aoe2-analyzer/issues/1231) 运营复核时（构建 `e56a150`）僧侣 `125` 与传教士 `775` 的「攻击间隔」仍显示 `1.6 秒`；进入体验设计时，[#1218](https://github.com/linhongcun/aoe2-analyzer/issues/1218) 已在 `main` 上把无普通攻击单位的该格主值改为「不适用：无普通攻击」。需求提报记录的是当时线上快照，流转期间同一挂点可能已被前序单改动；若照旧表画稿，会把已合入的修正意外回退。

设稿与渲染完成态图前，先拉取最新 `origin/main` 核对目标组件与实渲页面，把本单新增说明叠在现行主态之上（例如保留「不适用：无普通攻击」主值，再紧邻展示静态字段对账），并在交接正文写明与旧提报基线的差异。

### `auto-fit` 网格内不放整宽子项，多组数值分开包 `.nw`

[#1231](https://github.com/linhongcun/aoe2-analyzer/issues/1231) 初稿先把双来源说明条放进「攻击间隔」单卡，390 窄屏两列下说明被挤成窄竖条、桌面左侧「出手前摇」空出大块留白；改放到 `.ud-attack-timing` 内部并设 `grid-column: 1 / -1` 后，桌面端「出手前摇」与「攻击间隔」又收缩到左侧两列、右侧留下两列空洞。原因是 `.ud-attack-timing` 使用 `grid-template-columns: repeat(auto-fit, minmax(min(100%, 9rem), 1fr))`，内部出现跨越全行的子项后，CSS Grid 不会折叠尾部空轨。

整宽补充说明条应作为 `auto-fit` 子网格的同级兄弟挂在父级固定列网格（如 `.ud-stat-grid`）内再设 `grid-column: 1 / -1`，既保持上方并列卡片等高对称，又让 390／360 窄屏自然整宽展开。同时，同一标题含多组数值（如 `基础 1.6 秒 / 显示用 1.0 秒`）时，每组「数字 + 单位」分别包 `.nw`，不要把整句包进同一个 `.nw`，允许在分隔符处换行而不拆断数字与单位。

### 框里的图片按内容区定尺寸，量绘制区而不是元素盒

[#1345 详情页头图标](https://github.com/linhongcun/aoe2-analyzer/issues/1345#体验设计)里，三处页头给图片写的尺寸被 `.uico.big`（`0,2,0`）覆盖，图片在桌面贴在左上角，在窄屏溢出被裁。修优先级之外，原规则本身也有问题：建筑和科技页把图片写成框的外尺寸 `80px`，窄屏写成 `.bd-icon, .bd-icon img { width: 52px }` 这种组合选择器。全站是 `border-box`，框有 `1px` 边框，内容区只有外尺寸减 `2px`，照写也会溢出 `2px`。

给带边框、带 `overflow: hidden` 的框放图片时，图片写 `width: 100%; height: 100%; display: block`，按内容区算，不要和框共用同一条尺寸规则。用新选择器压过 `.uico.big` 这类共用类时，要限定在目标容器内，不要改共用类本身，单位 PK 阵营头就依赖它的 `64px`。验收留白时，要按 `object-fit: contain` 算出图片实际绘制的区域，再量它到框内缘的四边距离；只量 `<img>` 元素盒，会漏掉非方图在盒内留下的空白。素材本身是带底色的整幅方图时，铺满框的内缘比再留一圈边好，窄屏也能多出约 `12px` 的图标尺寸。

### 用颜色区分身份时，量色差，不只量对比度

[#1364](https://github.com/linhongcun/aoe2-analyzer/issues/1364#体验设计) 去掉科技树角标、只用边框色区分身份。原来的区域科技边框是 `--color-text-2`，它和普通边框 `--color-border` 的 CIEDE2000 色差（ΔE00）有 60，对卡底的对比度浅色 `9.63:1`、深色 `9.16:1`，但两者都是灰色，只差深浅，玩家看到的是「一圈深一点的框」，不是「有颜色的框」。

靠颜色承载类别时，在规格里写两类阈值，并给出两套主题的实测值：

- 类别色和普通态之间、新增色和已有类别色之间的 ΔE00 下限（#1364 定为：与普通态 ≥ 40，新增色与其他身份色 ≥ 20），并核对它和相邻状态色（如对照用的绿/红轮廓）也拉得开。已有的两色若低于下限（#1364 里独特单位与区域单位只有 13–16），要写明还靠什么区分（那次靠两种不同的卡底色）。
- 类别色对所在底色的对比度 ≥ `3:1`（WCAG 1.4.11 非文字）。
- 灰阶候选即使过了这两条，也要另外确认有色相。

### 半透明 `*-soft` 底色要按实际父底色合成后再核对比度

在 [#1227](https://github.com/linhongcun/aoe2-analyzer/issues/1227)、[#1228](https://github.com/linhongcun/aoe2-analyzer/issues/1228)、[#1229](https://github.com/linhongcun/aoe2-analyzer/issues/1229) 核对小号提示卡与徽章配色时，按 [`tokens.css`](../src/shared/styles/tokens.css) 现值实算：浅色 `--color-accent`（`#a65a14`）在纯白 `--color-surface` 上为 `5.13:1`，但叠到半透明 `--color-accent-soft`（`#a65a141f`）上时，在 `--color-surface` 复合底色上降至 `4.36:1`，在 `--color-surface-2`（`#f5f5f7`）复合底色上降至 `4.02:1`，均低于 WCAG 2.1 正文 AA `4.5:1`。[`scripts/contrast.py`](../scripts/contrast.py) 只查脚本里写死的色对，不会替半透明底色与父表面的复合结果兜底。

用半透明 `*-soft` 令牌承载 12–13px 正文或徽章前，先按实际父底色做 Alpha 合成再算对比度；需要双主题稳过 AA 的次级说明条与标签，优先选用不透明实底令牌的对应组合：中性底（`--color-surface`、`--color-surface-2`）配 `--color-text` / `--color-muted` / `--color-link` / `--color-warn`（当前令牌下双主题均 ≥ `4.77:1`），或同语义配对 `--color-link` 配 `--color-link-soft`（浅 `4.82:1`、深 `4.99:1`）、`--color-warn` 配 `--color-warn-soft`（浅 `4.64:1`、深 `6.71:1`）。

### 多状态截稿脚本逐页新建页面，模拟缺失态用显式分支判别

[#1225](https://github.com/linhongcun/aoe2-analyzer/issues/1225) 与 [#1227](https://github.com/linhongcun/aoe2-analyzer/issues/1227) 用本地 Playwright 渲染完成态设计图时出现过两类返工：① 复用同一个页面在 `HashRouter` 不同对象间切换并注入样式／节点，前一个对象手动插入的 DOM 会残留在下一张截图中；② 用空值合并（`??`）把模拟覆写值回落到真实数据时，无论传入 `undefined` 还是 `null` 都会静默回落成真实数据，导致缺失态漏画。此外，局部元素截图时顶栏 `position: sticky` 可能压住元素顶部。

本地批量截稿脚本为每个状态单独创建并关闭 `context.newPage()`，局部截图时临时将顶栏设为 `position: static`，模拟字段缺失改用显式哨兵与显式分支（例如用 `override === null` 或 `'override' in opts` 区分「刻意模拟缺失」与「沿用真实值」，不对哨兵直接写 `??`）；渲染结束后必须逐张打开 PNG 目视复核，再执行 `--attach` 上传。

### 计算类样稿在预览页里调用站内函数算数，不改应用代码

[#1340 马普切聚落](https://github.com/linhongcun/aoe2-analyzer/issues/1340#体验设计)要画持续生产选聚落后的秒数、产量和村民数。只改 DOM 里的几个数字，资源合计、村民取整和其他行很容易对不上。那次为了数字自洽，在临时 worktree 里给生产计算加了几行本地补丁，出完图就删掉了，补丁也没提交。但这仍然越过了 [MAINTENANCE](../docs/MAINTENANCE.md) 给体验设计定的「可用本地预览制作设计图，但不得修改应用代码」，不要照做。

改用 [#1339](https://github.com/linhongcun/aoe2-analyzer/issues/1339#体验设计) 的做法：在本地预览页的截稿脚本里动态 `import()` 站内领域函数和数据（如 `baseStats`、`applyEffects`、`loadCore()`），按 PRD 的公式在脚本里算出本单新增的读数，再整块替换目标区域。依赖这些读数的合计（如资源开销、村民数）也在脚本里一并重算，并在图注写明哪些读数由脚本按规格计算。

窄屏整页截图时，底部固定的操作条（如「跳到结果 / 复制方案链接」）会落在图中间、压住内容，截图前先隐藏 `position: fixed` 的元素，并在图注说明。吸顶元素（站点页眉、详情页分段导航，`position: sticky` 且 `top` 不为 `auto`）在整页裁切截图里也会停在图中间：[#1364](https://github.com/linhongcun/aoe2-analyzer/issues/1364#体验设计) 第一版截图里，页眉就压在了科技树中部。截图前把它们改成 `position: static`，横向吸附的列（如科技树左侧时代列）保留。

结果里有一块区域无法按新数字重画时，不替换那一块，也不把它截进图里。[#1366](https://github.com/linhongcun/aoe2-analyzer/issues/1366#体验设计) 的回放舞台按改前战果绘制，只能分段截图：上段是标题和说明行，下段是重算后的结果表，中间用虚线隔开，并在图注写明「回放舞台略」。

### 同一场样例用同一份结果

[#1263 群战 PK](https://github.com/linhongcun/aoe2-analyzer/issues/1263#体验设计) 的初稿把新模型的示意胜负叠在旧页面上，回放和曲线仍显示旧模型结果。定稿统一可见的胜负与存活数，局部图略去未替换的回放和曲线，并在图注写明取景范围。盈亏平衡的说明也从「第一次赢」改为「从该数量到计算上限每一档都赢」，因为增加兵力并不保证每档都赢。

用现有页面合成计算工具样稿时，先沿标题、摘要、表格、回放和曲线读一遍，看数值是否来自同一个样例。阈值文案再用平局、个别档获胜、计算中止等边界核对。运行结果由实现测试验证。

### 对照表的标记要有区分度，并用反例单位压一遍定义

[#1387 各文明满科技对照](https://github.com/linhongcun/aoe2-analyzer/issues/1387#体验设计)第一版把每列最优值都标绿。重装骑马弩兵 10 个文明里有 7 个并列攻击第一、9 个并列移速第一，结果满屏绿色，真正少见的长处（瓦兰吉人 85 生命、法兰克 79 总价）反而不显眼。重型爆破船 25 个文明都有「固有溅射伤害」，每行重复一遍也是同样的噪声。

做跨对象对照表时：

- 最优值只在少于半数对象持有时标记；「各项第一」摘要用同一条阈值，多数并列的指标不列。
- 每一行都有的标签不在行内重复，提到表上方写一次。
- 「缺什么」这类按并集差集定义的列，要拿特殊对象压一遍。那次是僧侣：赎罪、救赎等修道院科技只因阿兹特克「每项修道院科技僧侣 +5 生命」才有数值效果；按「研究后对僧侣有数值效果才算有」取差集，除阿兹特克外的文明都会被标成缺 8–10 项；改成「科技树里有就算有」，仍有大量文明被标缺这些对僧侣没有通用效果的科技。并集只收对该单位有通用效果的科技（`TECH_EFFECTS` 命中），并把这层口径写进设计节，交开发确认。

截稿脚本要用 Lucide 图标时，不要在预览页里直接 `import('/node_modules/lucide-react/…')`：模块内部引用了裸 `react`，浏览器解析不了。改为在 Node 侧读 `lucide-react/dist/esm/icons/<name>.mjs` 里的 `__iconData.node`，在脚本里拼成 SVG 再注入。图标名仍须是 `Icon.tsx` 的 `ICONS` 已登记的。

### 图片裁切留在装饰层

[#1313 文明原画](https://github.com/linhongcun/aoe2-analyzer/issues/1313#体验设计) 的阵营卡既要把原画裁到圆角内，又要让选择器展开到卡片外。整卡用 `overflow: hidden` 会同时裁掉下拉面板。把图片和遮罩放进独立的裁切层，让装饰层不接收指针事件，交互层保留可溢出空间。审稿时展开靠边的选择器，检查面板与相邻卡片的叠放顺序。命中和键盘操作仍需在实现中核对。

### 背景图按最终裁幅核对首屏与对比度

[#1314 首页插画](https://github.com/linhongcun/aoe2-analyzer/issues/1314#体验设计) 的宽图给标题留了晨雾，窄屏沿用宽图焦点可能只切到留白。先在实际容器中定主体焦点和文字留白，再看窄屏裁切是否保留主体、桌面首屏是否仍露出高频入口。在各段文字覆盖的位置检查叠完图片和遮罩后的背景，记录最不利的对比度、所用视口和主题。单查令牌色对无法发现局部亮斑。该单的测量来自设计样稿，数值不作为其他页面的通用门槛。

## 开始和交付清单

开始前：

1. 读本文、该页组件和 `pageRegistry` 里的路径与标题。
2. 用一句话写下核心任务，并标出主要、次要、辅助。
3. 把已看到的界面、设计判断、待确认的玩法分成三列。陌生机制先查数据。
4. 产品范围不清时不交设计定稿；留在当前体验设计阶段，加 `待确认` 并在原 Issue 记录具体问题，串行请产品补齐。补齐后仍在当前阶段完成设计；不回退阶段、不另开 Issue。
5. 查其他开放 Issue 和 PR 是否覆盖重复范围；当前生命周期 Issue 是唯一主记录，继续更新它，不因它本身而停。若另有重复 Issue、他人有效认领或另一执行者的 open PR 覆盖同一范围，停止并协调，不另开设计/实施单。

交付前：

1. 正式界面与逐字文案、示意数据、审阅说明三份分得开。示意数字写了成品替代。
2. 这次相关的默认、选中、空、未知、错误、不可用、恢复、URL 和返回都写了；没有的状态不补。
3. 浅色和深色使用现行令牌。PC 和这次相关的窄屏都看过，没看过的写进未验证。
4. 浮层写了焦点、键盘关闭和回焦。费用、长中文和图标的对齐按上面的网格案例检查过。
5. issue 含范围、不改项和验收。本地包没有被写成 GitHub 附件。
6. 没有替产品排期，没有把设计通过写成引擎或现网通过。
7. 完成态设计图已[直接嵌入同一 Issue 正文](#issue-design-images)、能查看并覆盖主要界面和重要状态；没有把本地路径或 ZIP 当作已附图。

## 依据与核对

当前可复用原则统一维护在本文「[体验设计原则](#体验设计原则)」；实际组件、主题和令牌以代码为准，系统架构见 [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md)，开局模拟来源与扩展点见 [docs/BUILD-SIM-SOURCES.md](../docs/BUILD-SIM-SOURCES.md)。历史草案和复核记录仅说明当时的决策，不覆盖当前实现。外部规范须注明来源、核对范围和不适用项；引用本身不代表本站已验证。每次设计仍按当前 Issue 明确范围、证据和状态，不以历史规格或截图代替。

机器可读来源、生成结果和验证证据统一存放于 [`data/evidence/`](../docs/DATA-LAYOUT.md)，原文件字节与固定哈希保持不变；历史证据中的旧路径字符串是来源记录，不作改写。历史记录中指向已退役设计文档的路径，可在清理基线 [362f1ed7a7acebbecb08f43dfa04684828eba923](https://github.com/linhongcun/aoe2-analyzer/tree/362f1ed7a7acebbecb08f43dfa04684828eba923/docs/design) 的 Git 历史中查阅。
