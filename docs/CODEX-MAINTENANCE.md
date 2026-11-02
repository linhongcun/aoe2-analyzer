# Codex 维护纪律 / CODEX-MAINTENANCE

给 Codex（及同类无人值守编码代理）用的维护纪律。人类与角色代理仍以 [CONTRIBUTING.md](../CONTRIBUTING.md) 为准；本文件与 CONTRIBUTING / [AGENTS.md](../AGENTS.md) 冲突时，以 CONTRIBUTING 为准，并在 issue 里指出。

入口：先读 AGENTS.md → 本文件（先看下方当前状态）→ 要做的那条 issue。

已记录的维护者授权优先于本文件的默认限制。当前项目的[持续发布授权](../CONTRIBUTING.md#维护者的持续发布授权2026-10-24)要求：已授权更新完成适用审查和测试后直接完成上线，不再逐次询问发布。现行审阅流程按 [持续审阅授权](../CONTRIBUTING.md#维护者的持续审阅授权2026-10-25) 执行；#431 已授权一次适用验证、可信证据复用和后台全量，现行验证规则见 [验证投入](../CONTRIBUTING.md#按改动风险控制验证投入2026-10-25)。范围、Hold 和测试保护继续有效。

<a id="status-2026-11-02"></a>

## 当前状态 / 2026-11-02

无人值守 Codex 用这一节决定**现在领什么、跳过什么**。功能实现默认由 Codex 认领；产品范围与是否恢复由维护者决定。设计硬规则仍是第 6 节与 `docs/design/`；验收与失败用例仍见 [TESTING](TESTING.md)。不另建一套流程，也不把角色代理自循环当作实现通道。

门禁不变：一次只认领 1 个 issue；同时在审 PR ≤ 2；实现者之外的**独立代理复核**加上按风险选择的 CI；持续发布授权以 CONTRIBUTING 为准。`Fixes #N` 合入默认分支会关 issue。交接、跟进或走查未完成时写 `Relates #N`，issue **保持 OPEN**，直到 Reid 的 PC 走查通过，或 Steve 关闭。不要把 Relates 改成 Fixes 来清队列。Reid / Steve 只决定这类 issue 何时关，**不代替**独立代理复核，也不新增签字角色。

### 本日较早的暂停（历史记录）

2026-11-02 较早的交接暂停了双路功能实施；当时 #584 仅有设计短稿，#625/#626 仍未获恢复实施授权。该决定作为历史保留。随后维护者在本轮聊天明确要求继续逐个处理剩余 issue，强调质量、体验和效果；后续授权及边界见下一段。旧暂停不再是阻止本轮已授权11项的当前禁令。

### 本轮后续授权（当前执行边界）

本轮明确授权清单为 **#625、#626、#641、#572、#584、#582、#585、#558、#570、#573、#574**，见 [#625 授权记录](https://github.com/linhongcun/aoe2-analyzer/issues/625#issuecomment-6568916109)。仍按一个 issue、一个执行者、一个 PR 串行交付，前一项完成适用审查、实际 main 验证、部署和正式发布核对后再合入下一项。它不授权并行囤积实现 PR，不扩大到新 issue，也不改变来源、设计、独立复核、受保护验收、CI范围和证据复用规则。

#625 按已锁定的“模式与 Elo 解耦”交付；#626 沿该项之后的顺序交付。#584 本轮已获范围授权，并沿实际 PR 的规格及复核记录执行；设计短稿、测试草稿本身仍不等于实现授权。已有交付或在审 PR 先核对记录，避免重复认领。#571 已关闭，不要重开；其它未获本轮授权的事项继续按既有 Hold／范围／待确认规则处理。

### 当前交付与依赖

本PR准备时已核验前序 **v0.74.13 / main ef3d0e6f988eaa73a5e111a0eed29013336cc907** 的正式发布。本轮可实施事项为 #625、#626、#641、#572、#584、#582、#585、#558，共8项；前序交付的具体 PR、版本与证据见各 issue 的真实交付评论。#558 目标版本为0.74.14，本项目标版本及最终交付状态以该 issue 最终评论和 Release 为准；实现/验证通过不能提前写成已部署或已正式发布。

七个功能项 #625、#626、#572、#584、#582、#585、#558 仍 OPEN 供产品走查，使用 `Relates`；不要因为代码已交付就重复实现或改用 `Fixes` 清队列。工程项 #641 已按真实交付记录 CLOSED。`已部署` 标签含义与 [AGENTS「怎么读 issue」](../AGENTS.md#怎么读-issue)一致：实现、验证和真实部署/正式 Release 均已核对的交付状态，不等于产品已验收或应关闭，不把 PR 绿灯、已合并或待发布当作完成。

#570、#573、#574 已完成来源/依赖核查，当前是可核验输入不足的数据阻塞，保持 OPEN＋`阻塞`。未提供假数字、空壳矩阵或不可比涨跌来冒充完成：

| Issue         | 目前缺少的输入                                                              | 解阻塞条件与已有记录                                                                                                                                                                                                                                       |
| ------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #570 地图筛选 | 第二张具名地图、同口径且可审计的自有静态快照；4v4全图不能冒充第二张具名地图 | 固定来源/窗口的原始比赛与玩家导出、模式/地图/双方文明或队伍/胜负及必要Elo、发布者映射和文件指纹。经核验可独立生成两张具名地图后继续。见 [6569132939](https://github.com/linhongcun/aoe2-analyzer/issues/570#issuecomment-6569132939)。                     |
| #573 文明对阵 | 文明A/B维度、完整窗口的可审计原始输入与自有聚合                             | 提供比赛身份、时间、模式、地图、双方文明/队伍、胜负、映射及采集规则；独立聚合并记录指纹、真实窗口与样本单位。不能拿文明总胜率推pair胜率或搬竞品聚合JSON。见 [6569133505](https://github.com/linhongcun/aoe2-analyzer/issues/573#issuecomment-6569133505)。 |
| #574 涨跌对照 | 同地图/模式/Elo/采样规则的两份实际快照及真实截止/采集证据                   | 两份真实相邻刷新输入，或可独立核验的补丁/发布时间归属与原始样本；不能用4v4对阿拉伯1v1、不同方法旧档案或任意切两个日期窗伪造对照。见 [6569134204](https://github.com/linhongcun/aoe2-analyzer/issues/574#issuecomment-6569134204)。                         |

补丁号未知可以如实标“未知”，不能把它单独写成所有历史数据均不可用的理由。现有工具未取得完整可审计原始文件，也不等于这些第一方数据在外界不存在；有固定输入后再按来源规则核验。

## 1. 产品主题（是什么 / 不是什么）

**是什么**：帝国时代 II 决定版（AoE2 DE）的**中文资料站 + 计算工具**——文明/单位/科技/建筑百科、科技树与加成，以及对比、对局助手、模拟器、单位 PK、开局、市场预算等可分享的计算页。线上：https://linhongcun.github.io/aoe2-analyzer/。界面文字全部简体中文。数据版本以页脚与 `scripts/data_sources.json` 为准。

**不是什么**：

- **不编造游戏数值。** 数字只从生成数据与固定 `.dat` 派生结果读；记忆、旧帖、猜测一律不算。issue / 设计稿 / 测试与数据冲突时，以数据为准并在 issue 说明。
- **不做无关大功能。** 不做实时读盘、账号系统、自动推荐最优策略、改游戏平衡、爬站批量抓内容、自建天梯后端等偏离「资料 + 计算」主题的扩展，除非维护者在 issue 里明确授权并写入范围。
- **不做未授权的批量集成。** 一个 issue 一个实现 PR，按批准顺序串行；不得伪造他人审阅结论。是否合并、发布按维护者已记录的授权执行，不能把持续发布授权解释成自动领取所有 issue。

## 2. 工作节奏

1. **一次只认领 1 个 issue**（一个执行者、一个 PR）。
2. **同时在审的 PR ≤ 2**（含别人的）。审阅位满时只准备草稿，不新开 PR。
3. 当前 PR **合完再拿下一个**；不要并行囤积分支等合。
4. 开 PR 前先查该 issue 是否已有 open PR，有则跳过。
5. 普通已授权更新默认一个 issue、一个 PR 直接对最新 main；仅需要多项冻结集成时使用 `release/vX.Y.Z` 并更新到其最新提交。

## 3. 门禁（对齐 CONTRIBUTING）

维护者已授权采用**实现者之外的独立代理复核＋按风险选择的 CI**作为现行默认，不再以指定人员签字为前置条件：

- 执行者准备实现、规格、失败用例和验证证据；独立代理核对验收标准、改动范围、代码、测试与数据来源，界面改动同时核对设计规格及四宽。
- 在 PR 中记录**实际验证的提交 SHA、复核范围、结果和未解决问题**。不得由实现者代写独立复核结果，存在未解决问题时不得宣称通过；需要产品决定的交维护者明确授权。
- CI 按功能影响生成 maintenance/civ-ui/targeted/full 计划，每份代码做一次必要验证。小 UI 不运行未变计算、数据再生成或无关整站回归；release/main 仅在同仓库真实成功来源、代码树、策略和覆盖范围匹配时复用证据。缺证据执行当前必要计划，不为阶段名称额外重跑全量，详见 [TESTING](TESTING.md)。
- 只改文档或只改样式（不动逻辑和测试）的 PR：CI 绿即可采用轻量审阅规则。轻量审阅仍须通过对应范围的 CI，不要求额外整站全量。
- **不得伪造他人结论、删除分支、修改仓库权限或放宽测试。** 没有合并/发布授权时不执行相应动作；本项目已记录的授权范围内，完成适用门禁后按顺序集成并发布。
- **Relates 与 Fixes：** `Fixes #N` 合入默认分支会关 issue。`Relates #N` 不关 issue，保持 OPEN，直到 Reid 的 PC 走查通过或 Steve 关闭（#571 即按此在 tip `4b6d35a6` 关闭）。这不新增审阅角色；代码门禁仍是实现者之外的独立代理复核。
- rebase 后若 `git range-diff` 证明自身改动不变，可沿用相应独立复核并记录新旧 SHA。当前 CI 仍核实实际代码树、策略与范围；不足时补当前必要验证，不无条件冒用旧 run，也不机械重复相同验收。

## 4. Hold 表（勿开）

单条 Hold 表当前没有新增暂停编号。#372 仅按既有两条预置授权解除。2026-11-02 较早的双路暂停历史，以及本轮后来对11项的串行授权，统一见 [当前状态](#status-2026-11-02)。本轮清单内不再套用旧的 #584/#625/#626 暂停禁令；清单外的 Hold、未授权范围和待确认事项仍有效。此项授权不恢复双路并行实施。

更新 Hold 或解 Hold 必须获得维护者明确授权，代理不得自行开 Hold 上的 issue；本轮已取得的具体授权按当前状态和链接记录核对，不重复申请相同授权。审阅流程变更本身不解除 Hold。

#364 已由维护者 2026-10-26 对当时两条 bug 的定向修复请求纳入本轮，具体原话、范围与记录见 [CONTRIBUTING](../CONTRIBUTING.md#364-标题层级定向修复授权2026-10-26)。#372 当时保持 Hold；随后维护者已对两条明确预置回复“嗯，解除暂停，实施吧”，本轮具体解除记录见 [CONTRIBUTING](../CONTRIBUTING.md#372-两条预置定向解除暂停2026-10-26)和 [issue授权](https://github.com/linhongcun/aoe2-analyzer/issues/372#issuecomment-6411790420)。历史授权记录保留。

## 5. 跳过（不要开工）

遇到下列任一情况，**跳过**该 issue：

- 标签 **`待确认`** 或 **`阻塞`**
- 该 issue **已有 open PR**
- 在上方仍有效的 Hold 表中，或属于尚未获得恢复/范围授权的暂停事项。已取得的本轮11项授权及三项数据阻塞以 [当前状态](#status-2026-11-02) 为准；已交付项不重复认领
- **#571 已关闭**，不要重开
- 正文缺少可测的 **「验收标准」**，或缺少 **「不要做」/「不在范围」**。只有空的「-」、没有具体数值 / 宽度 / 状态 / 可复现链接，都算没写完。执行者可在已授权范围内先补齐规格并交独立代理复核，不得自行发明产品范围
- 标题形如「待村长确认」的版本范围

### 作者写到 Codex 能领

开写前正文应能逐项勾上。缺任一项，Codex 跳过，或只在已授权范围内补规格，不直接实现：

- [ ] **玩家场景**：谁在什么情况下要用
- [ ] **验收标准**：每条可测（具体数值、宽度、状态或可复现链接），不是空的「-」
- [ ] **不在范围 / 不要做**：写明这次明确不做的事，不是空的「-」
- [ ] **涉及页面 / 路由**（如 `#/ladder`）和数据来源；没核对的写「未核实」
- [ ] 验收默认写清 **PC 1280** 可测；不为窄屏单独加产品范围，除非本 issue 写明。改了界面的 PR 仍按第 6 节附四宽截图
- [ ] 改界面：设计稿或可测规格已挂上（`docs/design/`）。大功能或新页面先有失败用例，再实现

写 issue 和实现时都守这些产品口径：不编造游戏数值；不接 live 天梯；天梯等静态快照标明非当前平衡和统计截止。缺来源就标「未核实」。

## 6. 设计硬规则（摘要）

完整规范见 [docs/design/DESIGN-SYSTEM.md](design/DESIGN-SYSTEM.md) 与 [docs/design/README.md](design/README.md)「[给 Codex 的设计交接](design/README.md#给-codex-的设计交接)」（`ERRATA.md` 优先于 SPEC）。

- **图标**：只用 Lucide，经 `src/shared/ui/Icon.tsx` 的 `ICONS` 登记后 `<Icon name="..." />`；禁止 emoji / Unicode 符号当图标（ESLint 会拦）；游戏美术图标除外。
- **颜色**：只用 `src/shared/styles/tokens.css` 设计令牌；`npm run lint:colors`。
- **无障碍**：文字对比度 WCAG AA；可点区域 ≥ **44×44**；文字不小于 12px。
- **数字不换行**：数值与「数字+单位」用 **`.num`**（等宽数字）与/或 **`.nw`**（`white-space: nowrap`）包住，360 宽也不能折行。
- **四宽截图**：界面 PR 附 **360 / 375 / 390 / 1280**，无横向滚动、无 console error / pageerror。
- **中文 UI**：文案与相邻页面一致；新增页面先改 `pageRegistry`，分组见 [ARCHITECTURE](ARCHITECTURE.md)「页面登记表」。

带界面的 issue 先读 [设计索引「给 Codex 的设计交接」](design/README.md#给-codex-的设计交接)。

UI 须挂 `docs/design/<topic>/` 规格，或 issue 内可测规格。没有对应短稿或规格则跳过，或先补规格，勿空做界面。

方向 C、Lucide、原版游戏图标、tokens、PC-first，以及 Steve / Jony / Codex 的分工，以该节为准。

## 7. 测试规则

- **未经维护者明确授权，禁止修改** `tests/**/v0*-acceptance*` 及其他受保护验收用例的期望值。与产品决定冲突时在 issue 写清冲突，交维护者决定；获授权的修改须独立复核，不得通过放宽期望凑绿，也不要求指定历史作者重录。
- 改领域逻辑补 `tests/unit/`；修 bug 先写能复现的失败用例。
- e2e 命令、端口、并行 worktree、BASE_URL、四宽、axe 与 CI 跳过条件，见 [docs/TESTING.md](TESTING.md)。

### 壳层 PR 的有界验证（#513）

`scripts/ci-scope.mjs` 的壳层白名单是这三个精确路径：`src/app/Layout.tsx`、`src/shared/ui/Icon.tsx`、`src/shared/styles/editorial-shell.css`。仅改这些文件，可附普通文档、CHANGELOG 和仅版本号变更，PR 使用 `targeted`：单测 `nav`、`theme6`、`pageRegistry283`；浏览器固定 6 个 spec：`smoke`、`navigation272`、`editorial6`、`skipLink294`、`searchLoading395`、`feedbackTap295`。覆盖基础页面、首页入口、导航/主题/搜索焦点、跳过导航和页脚，并保留这些用例原有的四宽及明暗主题断言。`FeedbackLink.tsx` 与 `src/shared/utils/feedback.ts` 使用同一套 shell 浏览器检查，并额外跑 `feedback` 单测（#514）。

| 事件 / 混合改动                       | 验证计划                                                     |
| ------------------------------------- | ------------------------------------------------------------ |
| 仅壳层白名单的 PR                     | `targeted`，6 个浏览器 spec，不生成数据                      |
| 壳层 + 已映射功能                     | 两者测试取并集、去重；6 个 spec 上限只针对纯壳层             |
| 包含壳层的 `main` / `release/**` push | 保留此前的 `full` 单测和浏览器回归；不因壳层改动生成未变数据 |
| nightly / `CI_FULL=true`              | `full` + 数据检查，禁用证据复用                              |
| 仅普通文档 / CI 维护                  | 保持既有短路径；其他功能的 #431 计划与复用规则不变           |

未审计的 `src/app/**`、`src/shared/**`、路由登记、设计令牌和计算逻辑仍可触发 `full`，不能将整个 shared 目录视为壳层。例如 `src/domain/realCost.ts` 仍是 `full`（完整单测；main/nightly 仍跑完整浏览器）。#512 的原始完整 diff 含此文件，不能宣称其全部改动会因壳层白名单转为 targeted。`pull_request` 上这类 full 计划不再跑约 189 个浏览器 spec，见下一节。`src/data/**`、数据生成脚本/来源、非仅版本号的依赖或锁文件变更仍保留 `full + data`。显式完整验证和未知提交范围也不降级。PR 的壳层 targeted 证据，以及只跑了 smoke 的 full 计划，都不能冒充 main/release 的完整浏览器成功。

### PR 浏览器上限（#514）

`pull_request` 永远不跑完整 Playwright。`scope=full` 时单测、内容、分层和 `data` 仍按原计划；浏览器改为：

- 部署烟测（`scripts/deployment-smoke.mjs`；该事件去掉 feature `all` 的长巡游，只留首页/页脚和已识别功能）
- 核心包 `tests/e2e/smoke.spec.ts`
- diff 里已经映射到 `PROFILES` 的功能 e2e，以及本次明确新增/修改或由入口指定的专项 e2e（已删除文件不执行）。`full` 单测计划不会丢弃这些专项浏览器验收（#636）

既无功能映射、也无明确专项用例时，浏览器只有部署烟测和 `smoke.spec.ts`。`CI_E2E_FULL` 由 `.github/workflows/ci.yml` 设置，`pull_request` 恒为 `false`；`scripts/ci-scope.mjs` 的 `applyBrowserPolicy` 与 `scripts/ci-run.mjs` 都认这个事件，不能靠把 `CI_E2E_FULL=true` 写进 PR 环境把整套 e2e 加回来。

#636 为首页、天梯加入有界 profile。首页覆盖 `startGame592` 与首页壳层，天梯覆盖现有 `ladder*` 的明确文件列表；新增回归时同步维护列表。`src/domain/startGame.ts` 已审计为首页选择流程与展示投影，只有这一精确路径归入 home；其它计算或未知 domain 文件继续 full。专项清单和 profile 合并、去重后，仍最后应用下方 capped 黑名单。

### PR capped 黑名单（Kent §C，#538 / #514）

下面这些 spec **不删除**，main / nightly / `CI_E2E_FULL` 仍会跑到。它们只是不能进入 pull_request 的 `capped` 列表，哪怕 `ci-scope` 给出 `full`，或某个宽 profile 本来选中了它们：

| 模式                                                                                             | PR capped                                                          |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `v0300-338`                                                                                      | 始终排除                                                           |
| `screenshots`、`stepContrast`、`overflow64`、`cardWrap*`、`mobile361-359-366`、`touchTargets481` | 始终排除（四宽×双主题 / 截图 / 触控守卫；壳层那 6 个 spec 仍跑）   |
| `*197`、`finalCivs197`、`civDlcFilters`                                                          | 不跑整张文明矩阵。只改一个文明时，可以留下该文明自己的 `*197` spec |
| `build41`、`rush35`、`rushGeneric507`、`timeline*`                                               | 本 PR 不是该功能时排除                                             |

`src/shared/nav/pageRegistry.ts`、`src/app/pageRegistry.tsx` 和 `src/shared/styles/` 下的共享 CSS 仍可让单测保持 `full`。PR 浏览器最多是 `smoke.spec.ts` 加上 diff 里真正改到的功能，不会把上表守卫带进来。

`pull_request` 且 `browser=false` 时不跑 Playwright e2e，构建跳过 OG 截图，短部署烟测也不跑。若 Affected unit 会启动 Chromium（`release108`、`releaseSmoke`，含 maintenance 的 `tests/unit/release*.test.ts`），仍用与 e2e 相同的 `npx playwright install --with-deps chromium` 装上 `chromium_headless_shell`；没有这类单测则不安装。证据复用跳过 unit 时也不为这条路径安装。main 推送仍安装 chromium，以便生成 OG 并部署。`unused:check`、`introductions:check` 和 `docs/design/contrast.py` 只在 main / 夜间 / 手动运行，不挡 PR。

| 事件                                                                 | 浏览器                                                                                                                 |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `pull_request`                                                       | smoke + 已识别功能；无功能则 smoke。不跑约 189 个 spec                                                                 |
| `push` 到 `main` / `release/**`，且计划为 `full`（含壳层 push 提升） | 完整 Playwright                                                                                                        |
| `schedule` 夜间、`workflow_dispatch` 且 `inputs.full` / `CI_FULL`    | 完整 Playwright，并做数据检查、禁用证据复用                                                                            |
| 已映射的 targeted / civ-ui / maintenance                             | 原文件列表。main 的 maintenance 仍短烟测；PR 且 browser=false 不跑 e2e/OG/短烟测。会启动 Chromium 的 unit 仍安装浏览器 |

手动 `workflow_dispatch` 即使关掉 `inputs.full`，事件也没有 PR/push 基线，路径计划仍是 full，且 `CI_E2E_FULL` 为 true，浏览器同样是完整套件。浏览器限流只发生在 `pull_request`。

已审计、只影响展示的路径不再标成 `full`（计算、令牌、路由、`realCost.ts`、`widgets.tsx`、`layout.tsx` 等仍会）：

| 路径                                                             | 计划                          |
| ---------------------------------------------------------------- | ----------------------------- |
| `Layout.tsx`、`Icon.tsx`、`editorial-shell.css`                  | `shell`（#513，6 个 spec）    |
| `FeedbackLink.tsx`、`src/shared/utils/feedback.ts`               | `shell`，并加 `feedback` 单测 |
| `formatTime.ts`                                                  | `clock`                       |
| `dupNames.ts`                                                    | `names`                       |
| `linker.ts`                                                      | `links`                       |
| `sharePage.ts`、`ShareImage.tsx`                                 | `share`                       |
| `glossary.ts` 与 `src/features/glossary/`、`src/features/share/` | `glossary` / `share`          |

证据里的 `browser:"capped"` 不能覆盖以后的 `browser:"full"`。main 不会把一次只跑了 smoke 的 PR 当成完整浏览器已通过。

本地看 PR 会真正执行的浏览器列表（`planRange` 本身不含事件上限）：

```bash
node --input-type=module <<'NODE'
import { execFileSync } from 'node:child_process';
import { applyBrowserPolicy, planRange } from './scripts/ci-scope.mjs';
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const head = git('rev-parse', 'HEAD');
const base = git('merge-base', 'origin/main', head);
const plan = applyBrowserPolicy(planRange(base, head), { GITHUB_EVENT_NAME: 'pull_request', CI_E2E_FULL: 'false' });
console.log(JSON.stringify({ scope: plan.scope, full: plan.full, browser: plan.browser, e2e: plan.e2e }, null, 2));
NODE
```

提交前可预估实际 Git 范围（先 `git fetch origin main`；下例为当前分支与 main 的公共祖先到 HEAD）：

```bash
node --input-type=module <<'NODE'
import { execFileSync } from 'node:child_process';
import { planRange } from './scripts/ci-scope.mjs';
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const head = git('rev-parse', 'HEAD');
const base = git('merge-base', 'origin/main', head);
console.log(JSON.stringify(planRange(base, head), null, 2));
NODE
```

该命令预估路径计划，不包含上表的事件提升；只读取已提交文件，不包含工作区修改。实际 Actions 计划见 `Select affected validation plan` 日志及 `ci-validation-evidence`。6 个 spec 是有界选择，不是固定耗时保证，交付时记录实际执行时间。

## 8. 选 issue 流程（checklist）

开工前逐项勾选：

- [ ] 已读 AGENTS.md + 本文件（含 [当前状态](#status-2026-11-02)）+ CONTRIBUTING 门禁段
- [ ] 已核对当前具体授权；issue 不在仍有效的 Hold／待确认／阻塞中，无重复 open PR，不重开 #571；已交付待产品走查的 OPEN issue 不重复实现
- [ ] 正文有可测 **验收标准**（不是空的「-」）与写明事项的 **不要做 / 不在范围**，或已在授权范围内补齐并独立复核；主题仍是「中文资料站 + 计算工具」
- [ ] 当前在审 PR 数 **&lt; 2**
- [ ] 从**当前已授权范围**挑选尚未实现的事项，核对实际代码及已合并 PR；不要继续使用已完成 issue 的旧示例选单，也不要把“超出上一轮小修”解释成“项目无法推进”
- [ ] 大功能 / 新页面（如 #308、#33）先有明确规格、设计材料与失败用例，由执行者准备并交实现者之外的独立代理复核后再实现；不要自行扩范围
- [ ] 分支名与 PR 标题符合 Conventional Commits：`类型(#issue): 描述`
- [ ] 测试交接（先失败再折入、`Relates` / `Fixes`、含糊验收则跳过）按 [TESTING](TESTING.md#codex-交接) 与 [AGENTS.md](../AGENTS.md)「工作流」；此处不另写门禁

## 9. 发版

- 开发发版：`npm run release -- vX.Y.Z`（详见 [docs/RELEASING.md](RELEASING.md) 与 CONTRIBUTING「发版」）。
- 本项目已有 hongcun 的持续发布授权；已授权更新完成独立复核和一次适用验证后继续上线，不再单独请求发布许可。main 的 test 可以记录经核实的证据复用，仍须构建真实 SHA、短烟测并完成真实 test/deploy。只有 PR 绿灯不等于已上线；正式 Release、tag 和附件也须确认。
- Release 在 main CI/Deploy 成功后自动接续，下载准确 run 的 deployed-site，核对 manifest/版本/SHA/tree/tag 与本次功能，直接打包同一 dist，不再默认 594 项线上回归或二次构建。手动调度用于恢复，不在部署未就绪时提前等待。详细步骤见 RELEASING。
- 全量回归仍每日北京时间 04:17 和手动保留，禁用证据复用并强制 full/data；该后台事件不部署、不发 Release。核心/数据/依赖等重大变化仍需一次适用完整验证，真实失败必须定位。
- CHANGELOG 写**玩家可见**的一句中文说明，不写内部实现黑话。

## 10. pageRegistry（#388 已合入）

页面登记的唯一来源是 `src/shared/nav/pageRegistry.ts`。路由、导航、首页和静态元信息都从它派生，不要手改 `routes.tsx` 或另一份名单。字段、`import()` 所在文件和测试见 [docs/ARCHITECTURE.md](ARCHITECTURE.md)「页面登记表」与 [AGENTS.md](../AGENTS.md)。本文不重复 API。

## 11. 交给人类的事

- Hold 变更、未获授权的范围/产品决定；必须由维护者明确授权，不伪造他人结论
- 合并/发布按已记录授权推进，不反复把同一发布决定交回维护者；没有相应授权的仓库权限变更仍交维护者
- 受保护验收用例期望值冲突：维护者明确决定后，执行者可按授权修改并交独立复核
- 产品范围与「待确认」事项由维护者明确决定
