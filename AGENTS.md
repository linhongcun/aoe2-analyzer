# AGENTS.md — AI 编码代理工作说明

## Codex / 无人值守维护（必读）

批量或无人值守改代码前，先读 **[docs/CODEX-MAINTENANCE.md](docs/CODEX-MAINTENANCE.md)**：产品边界、一次一 issue、同时在审 PR ≤2、门禁（独立代理复核＋按风险选择的 CI）、当前 Hold 表、跳过条件与选 issue checklist。先看该文 [「当前状态 / 2026-11-02」](docs/CODEX-MAINTENANCE.md#status-2026-11-02) 再选 issue。

与 CONTRIBUTING 冲突时以 [CONTRIBUTING.md](CONTRIBUTING.md) 为准。

**本轮游戏机制批授权（2026-11-05）**：维护者明确要求处理今天完善游戏机制的 issue。按母单 #703 已锁顺序 **#704 → #705 → #706 → #707 → #709 → #711 → #708 → #712**，再处理 P2 **#710、#713**；单写者、一项一 PR 串行交付。既有持续复核、发布与关闭授权有效，规格与真实来源要求不变。测试门禁见「测试规则」。#570/#573/#574 数据阻塞不在本批范围。

**当前开一局菜单单项授权（2026-11-05）**：维护者明确要求“先在菜单上完善开一局功能最终形态；不完善的菜单可置灰，让后续逐渐完善有方向。” 当前只实施 [#700](https://github.com/linhongcun/aoe2-analyzer/issues/700)：首页内部紧凑功能菜单，已有能力可用，未来能力原生 disabled 且说明原因；不实施未来模型，不改变既有自主选择和状态协议。按独立复核、适用CI、真实部署、正式Release及持续关闭门禁完整交付，无需再逐步询问。前序3项已交付，不重做；#570/#573/#574仍缺原始数据保持阻塞。详见[当前菜单记录](docs/CODEX-MAINTENANCE.md#start-game-menu-2026-11-05)。

**前序非阻塞 backlog 批授权（2026-11-04，已完成）**：维护者已明确要求处理所有非阻塞 issue。本批按 **#688 → #652 → #657** 串行交付；#570/#573/#574仍因可核验原始数据缺失保持阻塞。此次授权取代下文历史11项/13项白名单及上一批对#652/#657的排除，不重开已交付项；规格、来源、单写者、独立复核、适用CI和真实上线/正式Release/关闭门禁不变。详见[当前批次记录](docs/CODEX-MAINTENANCE.md#nonblocking-2026-11-04)与[#688认领记录](https://github.com/linhongcun/aoe2-analyzer/issues/688)。

**一次验证与快速发布（#431）**：普通已授权更新默认一个 issue、一个 PR 直接合入 `main`；只有需要多项冻结集成时才建 `release/vX.Y.Z`。同一代码树的真实成功验证可由 release/main 复用，main 仍构建真实 SHA 并做短烟测，发布 ZIP 使用已部署产物。全量回归在夜间后台或重大变更时执行一次，不作为普通 UI 更新逐阶段重复等待的门槛。现行规则见 [CONTRIBUTING「验证投入」](CONTRIBUTING.md#按改动风险控制验证投入2026-10-25)。

**CI 分阶段门禁（#659，2026-11-03）**：维护者已明确授权处理 #659，取代 #514 的 PR 完整浏览器禁令与 #513 的全局壳层 targeted 例外。2026-11-10 起完整浏览器不再是每 PR 门禁，见「测试规则」。冻结规格见 [ci-659.md](docs/design/ci-659.md)，只在手动 full 使用。

**持续发布授权**：hongcun 已要求已授权更新完成适用审查和测试后直接部署，不再逐次询问发布；不能停在 release 分支便称完成上线。发布授权及边界以 [CONTRIBUTING「维护者的持续发布授权」](CONTRIBUTING.md#维护者的持续发布授权2026-10-24) 为准；现行审阅流程以 [「维护者的持续审阅授权」](CONTRIBUTING.md#维护者的持续审阅授权2026-10-25) 为准，由实现者之外的独立代理复核，记录实际提交 SHA、复核范围、结果和未解决问题，不再依赖指定人员签字。

### 数字不换行（`.num` / `.nw`）

界面上的数值与「数字+单位」必须不折行：用 **`.num`**（tabular 数字）和/或 **`.nw`**（nowrap）包住；360 宽下「1个村民」一类折行视为 bug。详见 CODEX-MAINTENANCE「设计硬规则」。

### Hold（勿开）

单条 Hold 表当前没有新增暂停编号。2026-11-02 较早的双路功能暂停及其后续范围授权，见 [CODEX-MAINTENANCE「当前状态 / 2026-11-02」](docs/CODEX-MAINTENANCE.md#status-2026-11-02)。维护者后来明确授权本轮11项串行处理：#625、#626、#641、#572、#584、#582、#585、#558、#570、#573、#574；该授权已在 [#625 评论](https://github.com/linhongcun/aoe2-analyzer/issues/625#issuecomment-6568916109)记录。只在本轮范围内执行，一个 issue 一个 PR；已交付项不重复认领，数据阻塞项按当前状态等待可核验输入。

解 Hold 或扩大范围仍须维护者明确授权。审阅流程变更本身不解除 Hold，也不恢复双路并行；本轮后来授权不扩展到其它未授权事项。#372 仅按下方既有两条预置授权解除。

2026-10-26 维护者定向要求修复当时仅有的两条 bug（#442、#364），#364 已按[本轮具体授权](CONTRIBUTING.md#364-标题层级定向修复授权2026-10-26)纳入实施。此项授权不涉及 #372。

随后维护者针对 #372 两条预置明确回复“嗯，解除暂停，实施吧”，已按[本轮定向解除暂停记录](CONTRIBUTING.md#372-两条预置定向解除暂停2026-10-26)纳入实施；上方 #364 的旧授权范围作为历史保留。

给批量处理 issue 的 AI 代理（DeepSeek、Codex 等）看的入口文件。人类贡献者看 [CONTRIBUTING.md](CONTRIBUTING.md)；两者冲突时以 CONTRIBUTING.md 为准，并在 issue 里指出。

## 项目是什么

帝国时代 II 决定版（AoE2 DE）的中文资料站和计算工具：文明、单位、科技、建筑、科技树、文明加成百科，加上文明对比、对局助手、科技模拟器、单位 PK 等工具。

- 线上：https://linhongcun.github.io/aoe2-analyzer/（GitHub Pages，push 到 `main` 才部署）
- 数据版本：DE Update 188329，所有上游固定版本见 `scripts/data_sources.json`
- 界面文字全部是简体中文

## 技术栈

Vite 6 + React 18 + TypeScript（strict、`noUncheckedIndexedAccess`）+ react-router 6 `HashRouter`（路由都是 `#/...`，例如 `#/unit/:id`、`#/duel`；路由表在 `src/app/routes.tsx`）+ lucide-react。无运行时 CDN。数据脚本用 Python 3.10+。详细分层见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。

页面的路由、导航、首页分组和静态标题/说明以 `src/shared/nav/pageRegistry.ts` 为唯一登记表。`src/app/pageRegistry.tsx` 只放对应的 `import()`（`shared/` 不能引用功能页）。`routes.tsx`、导航与首页（`HOME_GROUPS`）、`scripts/page_metadata.mjs` 和分享用 `PageMeta` 都从登记表派生，不要手改平行名单。新增或改动页面先改登记表。详见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)「页面登记表」。

## 目录

| 路径                   | 内容                                                                                                                                                                                                                                                                                                             |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/`             | 路由 `routes.tsx`、布局 `Layout.tsx`（页眉/导航/页脚）、`nav/`                                                                                                                                                                                                                                                   |
| `src/data/`            | 数据层：生成的 `civs.json` `units.json` `techs.json` `buildings.json` `trees.json` `effects.json` `eco.json` `search-py.json`（**生成文件，不要手改**）；`index.ts`（异步入口）`hooks.ts` 读取接口，`raw/*.ts`（核心 JSON 唯一的同步入口）；`aliases.ts` `confusables.ts` 手工别名；`build-orders/*.json` 开局库 |
| `src/domain/`          | 领域逻辑，纯函数、不依赖 React，必须配 Vitest 单测（`duel.ts` 战斗、`realCost.ts` 等采集时间、`search.ts` 搜索、`simulator.ts`、`buildSim.ts` 等）                                                                                                                                                               |
| `src/features/<模块>/` | 各页面：`civs` `units` `techs` `buildings` `tree` `bonuses` `dlc` `compare` `matchup` `simulator` `duel` `builds` `search` `home` `about` `feedback`                                                                                                                                                             |
| `src/shared/ui/`       | 通用组件；图标登记在 `Icon.tsx` 的 `ICONS` 表                                                                                                                                                                                                                                                                    |
| `src/shared/styles/`   | 样式，颜色只用 `tokens.css` 里的设计令牌                                                                                                                                                                                                                                                                         |
| `scripts/`             | 数据管线（`build_data.py`、`effects_build.py`、`eco_build.py`、`pinyin_build.mjs` 等）、`release.mjs` 发版脚本、`check-pr-title.mjs`、`check-colors.mjs`、`check-css.mjs`、`check-layers.mjs` 分层边界检查（`npm run lint:layers`）                                                                              |
| `tests/unit/`          | Vitest（`*.test.ts`，只有这里会被收集）                                                                                                                                                                                                                                                                          |
| `tests/e2e/`           | Playwright（`*.spec.ts`），默认宽度 1280                                                                                                                                                                                                                                                                         |
| `tests/py/`            | Python 数据脚本测试                                                                                                                                                                                                                                                                                              |
| `docs/`                | 架构、数据说明、`docs/design/` 设计稿与规格                                                                                                                                                                                                                                                                      |
| `public/img/`          | 游戏图标（生成）                                                                                                                                                                                                                                                                                                 |

分层边界（#281，CI 用 `npm run lint:layers -- --strict` 检查，有任何违规即失败；不带 `--strict` 只报告、总以 0 退出）：`features/X` 不 import `features/Y`（要共享的挪到 `shared/` 或 `domain/`）；`shared/` 不 import `features/`、`app/`；`domain/` 不 import react、`features/`、`app/`、`shared/ui`；核心数据 JSON `src/data/{civs,units,techs,buildings,trees,eco,effects}.json` 只能由 `scripts/check-layers.mjs` 的 `LOADERS` 里逐个登记的 7 个文件直接 import，src 下其他任何文件（含 `shared/`、`app/`、`data/` 其他文件）都要经它们读取：`src/data/index.ts`（异步入口：civs 随主包，units/techs/buildings/trees 动态 import 拆包）、`src/data/raw/civs.ts` `raw/units.ts` `raw/techs.ts` `raw/buildings.ts` `raw/eco.ts`（唯一的同步入口，原样转出）、`src/domain/datEffects.ts`（特例：effects.json 的类型与转换）。新增入口要登记进 `LOADERS` 并同步更新本段和 `docs/ARCHITECTURE.md`。`import type` 和动态 `import()` 同样计入。

## 数据来源规则（最重要）

- **游戏数字只从数据里读，不要凭记忆写。** 来源：`src/data/civs.json` 等生成文件（派生自 [SiegeEngineers/aoe2techtree](https://github.com/SiegeEngineers/aoe2techtree) 固定提交）和由 DE 原版 `.dat` 派生的 `effects.json` / `eco.json`。issue、设计稿、测试里写的数字和数据不一致时，以数据为准，并在 issue 里说明。
- 生成的 `src/data/*.json` 和 `public/img/*` **是提交在仓库里的**，但只能由脚本生成（`npm run data`、`npm run effects`、`npm run eco`），不要手改；CI 会校验 `effects.json`、`eco.json` 可由固定 `.dat` 原样复现。
- **`.dat`（© Microsoft）和下载缓存 `scripts/.cache/` 绝不提交**（已 gitignore），只在构建时下载。
- 新增 #197 开局文明来源证据使用 `scripts/build_sim_source.py` 的有界摘要，完整中间输出留在忽略缓存；`*197*source*.json` 每份限 64 KiB，历史原件仅按固定指纹保留，不追加豁免。命令、固定来源与审阅边界见 [来源证据流程](docs/design/build-sim-source-478.md)。
- 主观评分改 `scripts/civ_ratings.json`。社区来源（攻略、别名、俗称）只收 2020 年以后的；没能核对的标「未核实」。

## 命令（均已在仓库核对）

```bash
npm ci                     # .npmrc 已设 legacy-peer-deps
npx playwright install chromium   # 首次跑 e2e 前
npm run dev                # http://localhost:5173
npm run lint               # ESLint + 颜色令牌检查 + CSS 检查
npx tsc -p . --noEmit      # 类型检查（与 CI 一致）
npx prettier --check .     # 格式检查（CI 不跑；改格式用 npm run format）
npx vitest run             # 完整单测；仅在需要完整范围时运行，等同 npm test
npm run build              # tsc + vite build → dist/
npm run pinyin:check       # 拼音索引 search-py.json 是否最新（改了名称/别名/加成文本后跑）
npm run test:py            # Python 测试
npm run content:check      # 全部内容/数据 JSON 的结构与公开来源检查；默认告警
npm run content:check -- --strict # CI：全部原始内容与数据结构严格检查
node scripts/check-source-presentation.mjs # 开局与一局入门实际公开来源的严格检查
npm run content:validators -- --check # 五处读取边界的预编译校验器与 schema 一致
python3 docs/design/contrast.py   # 设计令牌对比度（WCAG AA，CI 会跑）
```

以下 e2e 全量命令用于手动完整检查；普通更新按相关测试计划执行，不默认跑整站。Playwright 默认自己起 `vite preview --port 4173 --strictPort`（先 `npm run build`）。端口被旧进程占用时先释放：

```bash
fuser -k 4173/tcp; npm run build && npx playwright test --reporter=line
```

或者自己托管 `dist/` 再用 `BASE_URL` 指过去（设了 `BASE_URL` 就不会自动起服务器）：

```bash
npm run build
(cd dist && python3 -m http.server 4173) &   # 站点用相对路径，可直接托管 dist
BASE_URL=http://localhost:4173/ npx playwright test --reporter=line
```

多个代理并行时每个用自己的 `git worktree` 和端口，不在共享目录切分支，不用 `git stash`。测试范围、命令和报告要求见 [docs/TESTING.md](docs/TESTING.md)。

## 合并前必须通过

按 [CONTRIBUTING「验证投入」](CONTRIBUTING.md#按改动风险控制验证投入2026-10-25) 为每份代码做一次适用验证。**默认 CI（#749）**是 static、真实 SHA 构建和 Chromium 单分片窄冒烟；main 在聚合成功后才部署。不要把四片浏览器、24 路由、axe、单测或 data 加回普通 PR。这些只在手动 `workflow_dispatch` 且 `full=true` 时跑，且该次不部署。`planChanges` 的 `maintenance` / `civ-ui` / `targeted` / `full` 分类不再驱动默认门禁。细则见 [ci-749](docs/design/ci-749.md)。

手动 full 不是普通 PR 的合并条件。需要时才跑；其内容仍见 #659 / [ci-749](docs/design/ci-749.md)。默认窄冒烟失败、超时或错构建不得部署。

只接受经 GitHub 核实的 v2 原始阶段证明；v1 无效。复用必须匹配仓库、Git tree、策略、工具链、精确检查/文件/case 集合和来源 run/attempt/数字 job/artifact，不能继承任意复用链。build 与默认 `browser-1` 不复用，main 始终重建真实 SHA。static-main 只属于手动 full。单次 run 从 `run.created_at` 起共享30分钟预算，包含排队、重跑、聚合和部署；诊断最多额外90秒且不能变绿。细则见 [TESTING](docs/TESTING.md)、[ci-749](docs/design/ci-749.md) 和 [ci-659](docs/design/ci-659.md)。

## 测试规则

2026-11-10，以 [TESTING](docs/TESTING.md) 文首为准，取代旧的受保护验收、先红用例和四宽门禁。

- Kent 只确认这次改动的功能是否正常。每 PR：必要冒烟，加与 diff 直接相关的测试。纯布局不重跑无关计算或数据。全站全尺寸主题矩阵不是门禁。
- 旧布局、旧入口、旧链接协议、重复功能不必兼容。有意合并、替代或删除不算 bug，相关旧断言可改成新行为或删除。计算或数据改动要核对该结果，不能靠删断言掩盖错误。
- 报告分开写实际执行、CI 范围（默认是 #749 的 static、构建身份和单分片窄冒烟）和未验证项。`Relates` / `Fixes` 仍见 [TESTING](docs/TESTING.md#codex-交接)。

## 界面约定

- 中文界面，用语和已有页面一致；新增文案参照相邻页面的写法。
- **数字不换行**：数值、「数字+单位」不能被折到两行（例如「1个村民」在 360 宽折行就是 bug）。
- 图标只用 Lucide（在 `src/shared/ui/Icon.tsx` 登记后 `<Icon name="..." />`），禁止 emoji 和 Unicode 符号当图标（ESLint 会拦）；游戏美术图标除外。
- 文字不小于 12px；可点区域不小于 44×44；颜色只用设计令牌，对比度满足 WCAG AA。
- 完整设计规范：[docs/design/DESIGN-SYSTEM.md](docs/design/DESIGN-SYSTEM.md)，既有设计稿和规格索引：[docs/design/README.md](docs/design/README.md)（各短稿目录内如有 `ERRATA.md`，优先于该目录 SPEC；当前只有 `docs/design/mockups/issue24-v3/ERRATA.md`）。

## 怎么读 issue

- **版本范围 issue**：标题形如「vX.Y.Z 版本范围（已冻结）」，正文按 A/B/C… 列出本版每一项的改动位置、要跟着动的测试和门禁（参考 #162）。只做范围内的项；范围定好就冻结，做的过程中发现的新问题不要顺手改，记成下一版候选（如「[v0.12.0 候选] …」或写进范围 issue 的「不在范围」）。
- 「待村长确认」的范围还没定，不要开工。
- 标签分三组：
  - 类型：`bug`、`feature`、`data`（游戏数据、开局数据的补充或校正）、`docs`、`chore`
  - 优先级：`P0`（尽快）、`P1`（下一两个版本内）、`P2`（排期时再定）
  - 状态：`候选`（版本候选，未进入范围）、`待确认`（等维护者明确决定）、`阻塞`（被数据、依赖或决定卡住）、`已部署`（实现、验证、真实部署与正式发布已核实；完成范围可直接关闭）

`已部署` 是已核实的交付状态。加标前核对真实部署、线上结果与正式 Release，不把 PR 绿灯、已合并或待发布当作完成。维护者已授权完成交付后直接关闭 issue，见 [CONTRIBUTING「已部署 issue 的持续关闭授权」](CONTRIBUTING.md#已部署-issue-的持续关闭授权2026-11-03)；不再要求保留 OPEN 等待额外产品走查。网站实现 PR 使用 `Relates`，交付核验后由执行者关闭；不因 OPEN 就重复领取。候选、受阻塞或范围尚未完成的事项不能标成已部署并据此关闭。

- **带 `待确认` 或 `阻塞` 的 issue 不要动手。**
- issue 类型看标签，不看标题前缀。验收标准写在 issue 里。测试只要求能说明功能是否正常，不因缺少宽度或状态矩阵而停工。条目见 `.github/ISSUE_TEMPLATE/`。
- 动手前先查这个 issue 有没有已打开的 PR，有就跳过。

<a id="dev-exec-2026-11-10"></a>

## 开发执行（2026-11-10）

开发重构按维护者当前单独使用这个站点来做，可以改掉旧行为。旧页面结构、入口、链接协议和旧用例都不必留下来兼容。重复功能可以合并，有更好替代可以替换，没有独立价值可以删除。改动说明写清有意舍弃的行为。不为删减本身设目标，不为保住旧行为加兼容层。实现时按该页已经确定的核心任务摆内容。视觉以设计角色的界面稿为准，本节不规定版式，也不用折叠或换皮代替视觉。

选哪些测试、怎样写报告，以「测试规则」和 [TESTING](docs/TESTING.md) 文首为准。产品取舍、出处和视觉目标见 CONTRIBUTING「角色」。本节不另设门禁，不改发布、审阅和关闭授权。

## 工作流

1. 一个 issue 一个 PR，一个执行者。普通已授权更新默认直接对最新 `main` 提 PR；仅需要多项冻结集成时以 `release/vX.Y.Z` 为目标。使用版本分支时先更新到其最新提交，不为简单更新额外建立发布分支。
2. PR 标题必须是 Conventional Commits，CI 会检查：`类型(#issue): 描述`，类型为 `feat fix docs chore data test ci refactor style perf build revert hotfix`。例：`fix(#13): 科技涉及单位只显示一处`。静态数据快照用 `data`。
3. PR 描述按交付条件选关键词，并附本地测试结果，写明实际执行、CI 范围和未验证项。不要求四宽截图。网站实现 PR 写 `Relates #N`，避免合入即提前关闭；Pages、线上核对和正式 Release 通过后，由执行者直接关闭已完成范围的 issue。合入即完成、无需网站交付的工程或文档事项可写 `Fixes #N`。合到非默认分支不会自动关 issue，发版时仍核对实际状态。细则见 [TESTING](docs/TESTING.md#codex-交接)。按需在 CHANGELOG 当前版本小节写一句玩家能看懂的话。
4. 默认审阅门禁：实现者之外的独立代理复核＋按风险选择的一次验证；PR 留下实际验证的提交 SHA、复核范围、结果和未解决问题。测试范围见「测试规则」，不把四宽或先红用例当作门禁。只改文档或纯样式且不动逻辑和测试的 PR 可走 CI 绿的轻量规则。release/main 可以按代码树、策略、范围和真实来源复用成功证据，不机械重跑相同验证。不得伪造他人结论、删除分支、修改仓库权限，或用删断言掩盖计算和数据错误；已获授权时按顺序集成并发布。
5. 版本号一律三段 `vX.Y.Z`。完成独立复核和适用验证后合入 main；main 的真实 `test` 检查可记录可信复用结果，仍须完成真实 SHA 构建、短烟测和 Pages 部署。Release 核对线上版本/构建、本次功能及 tag，直接打包同一已部署产物和校验文件后正式发布，不再二次构建或默认跑大范围线上回归。按持续发布授权自动继续，无需再问是否上线；不要在 main 的检查和部署尚未结束时让脚本等待部署。

## 提交身份

- 不要用 `@users.noreply.github.com` 邮箱做 git author（会把提交归到别的 GitHub 用户）。用仓库现有的身份或维护者指定的身份，提交前 `git config user.email` 确认。不修改用户的 git author 配置。
- `Co-authored-by` 只记录这次实际参与代码、提交说明或 PR 正文的 coding agent。coding agent 指产品或执行工具。底层模型名不是参与者。只写实际参与者；多方都实际参与时，每个参与者各写一行。认不出执行工具时不写代理 trailer，空缺不得填成 DeepSeek Harness，也不得填成任何其他已知身份。
- 下面每行只在对应产品实际参与时使用，整段不是提交模板：
  - Claude Code：`Co-Authored-By: Claude Code <noreply@anthropic.com>`
  - Codex：`Co-authored-by: Codex <noreply@openai.com>`
  - DeepSeek Harness：`Co-authored-by: DeepSeek Harness <noreply@deepseek.com>`。这是本仓库 [#778](https://github.com/linhongcun/aoe2-analyzer/issues/778) 的项目约定。已查阅的 DeepSeek 官方文档没有给出这一固定身份。该邮箱未绑定 GitHub 账号，只有文字署名。
  - Cursor：git author 已是 `Cursor Agent <cursoragent@cursor.com>` 时不必再写同一身份。否则仅在 Cursor 实际参与时写 `Co-authored-by: Cursor Agent <cursoragent@cursor.com>`。Cursor 帮助页中的 Made with Cursor 是 Cursor 自己的 trailer，不表示 Claude Code、Codex 或 DeepSeek Harness 参与过。
- 邮箱、名称和历史别名的核实记录以 [CONTRIBUTING「AI 代理署名」](CONTRIBUTING.md#ai-代理署名) 为准；两处冲突时以 CONTRIBUTING 为准。author/committer 仍用仓库身份；squash 合并后 GitHub 的 author 是合并者。不得用他人或其他账号的 noreply 邮箱冒充归属。
- 不要提交 `.dat`、`scripts/.cache/`、`dist/`、截图 png、`node_modules`。
