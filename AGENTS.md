# AGENTS.md — AI 编码代理工作说明

## Codex / 无人值守维护（必读）

批量或无人值守改代码前，先读 **[docs/CODEX-MAINTENANCE.md](docs/CODEX-MAINTENANCE.md)**：产品边界、一次一 issue、同时在审 PR ≤2、门禁（独立代理复核＋按风险选择的 CI）、当前 Hold 表、跳过条件与选 issue checklist。

与 CONTRIBUTING 冲突时以 [CONTRIBUTING.md](CONTRIBUTING.md) 为准。

**一次验证与快速发布（#431）**：普通已授权更新默认一个 issue、一个 PR 直接合入 `main`；只有需要多项冻结集成时才建 `release/vX.Y.Z`。同一代码树的真实成功验证可由 release/main 复用，main 仍构建真实 SHA 并做短烟测，发布 ZIP 使用已部署产物。全量回归在夜间后台或重大变更时执行一次，不作为普通 UI 更新逐阶段重复等待的门槛。现行规则见 [CONTRIBUTING「验证投入」](CONTRIBUTING.md#按改动风险控制验证投入2026-10-25)。

**持续发布授权**：hongcun 已要求已授权更新完成适用审查和测试后直接部署，不再逐次询问发布；不能停在 release 分支便称完成上线。发布授权及边界以 [CONTRIBUTING「维护者的持续发布授权」](CONTRIBUTING.md#维护者的持续发布授权2026-10-24) 为准；现行审阅流程以 [「维护者的持续审阅授权」](CONTRIBUTING.md#维护者的持续审阅授权2026-10-25) 为准，由实现者之外的独立代理复核，记录实际提交 SHA、复核范围、结果和未解决问题，不再依赖指定人员签字。

### 数字不换行（`.num` / `.nw`）

界面上的数值与「数字+单位」必须不折行：用 **`.num`**（tabular 数字）和/或 **`.nw`**（nowrap）包住；360 宽下「1个村民」一类折行视为 bug。详见 CODEX-MAINTENANCE「设计硬规则」。

### Hold（勿开）

当前没有暂停条目。仅本轮已明确解除的 #372 按下方记录更新，其它issue仍需各自范围授权。

解 hold 必须获得维护者明确授权后才可开工；审阅流程变更不解除 Hold。

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

多个代理并行时每个用自己的 `git worktree` 和端口，不在共享目录切分支，不用 `git stash`。写法、四宽、axe、验收用例命名，以及 CI 何时跳过 Playwright，见 [docs/TESTING.md](docs/TESTING.md)。

## 合并前必须通过

按 [CONTRIBUTING「验证投入」](CONTRIBUTING.md#按改动风险控制验证投入2026-10-25) 为每份代码做一次适用验证。`ci-scope` 选择 `maintenance`、`civ-ui`、`targeted` 或 `full`，功能页面及纯展示/路由辅助改动使用相关单测、交互和布局检查；UI 改动不重生成未变数据。核心计算、依赖、共享基础设施、未知或不可靠范围仍做一次完整验证；只有确需再生成时才执行数据管线。

**PR 不跑完整浏览器（#514）**：`pull_request` 即使 `full=true`，也不跑约 189 个 Playwright spec。PR 浏览器是部署烟测 + `tests/e2e/smoke.spec.ts` + 已识别功能的 e2e；没有可识别功能时只跑 smoke。Kent §C 黑名单（`v0300-338`、四宽主题截图守卫、多文明 `*197` 矩阵、非本 PR 的开局长巡游）不进入这份 capped 列表。只改 `pageRegistry` 或共享 CSS 时，浏览器最多是 smoke 加上本次改到的功能。完整浏览器只在 main/release 的 full 计划、夜间 schedule、以及 `workflow_dispatch` 且 `CI_FULL`（环境变量 `CI_E2E_FULL`，pull_request 恒为 false）。Layout / Icon / `editorial-shell.css` 以及已审计的展示文件走 targeted，不会先被标成 full。详见 [CODEX-MAINTENANCE](docs/CODEX-MAINTENANCE.md)「PR 浏览器上限」。

`ci-validation-evidence` 记录实际测试提交、Git tree、策略指纹、范围和来源 run。release/main 仅在同仓库真实成功的 CI、代码树、策略和必要范围均匹配时复用；缺少有效证据就执行当前必要范围，不因发布阶段变化重复全量。main 仍重建真实 SHA，执行短烟测并部署。PR 描述记录实际执行、复用、跳过或中止的范围及结果，不把复用结果写成当前提交重新跑过全套。详见 [TESTING](docs/TESTING.md)。

## 测试规则

- **未经维护者明确授权，不要改 `tests/**/v0*-acceptance*` 及其他受保护验收用例的期望值。** 验收用例和产品决定冲突时，在 issue 里写清楚冲突，交维护者决定；获授权的修改须独立复核，不能通过放宽期望凑绿，也不要求指定历史作者重录。
- 改了领域逻辑就补 `tests/unit/` 单测；修 bug 先写能复现的失败用例。
- 界面改动在 **360 / 375 / 390 / 1280** 四个宽度检查：没有横向滚动、没有页面报错（console error / pageerror）。

## 界面约定

- 中文界面，用语和已有页面一致；新增文案参照相邻页面的写法。
- **数字不换行**：数值、「数字+单位」不能被折到两行（例如「1个村民」在 360 宽折行就是 bug）。
- 图标只用 Lucide（在 `src/shared/ui/Icon.tsx` 登记后 `<Icon name="..." />`），禁止 emoji 和 Unicode 符号当图标（ESLint 会拦）；游戏美术图标除外。
- 文字不小于 12px；可点区域不小于 44×44；颜色只用设计令牌，对比度满足 WCAG AA。
- 完整设计规范：[docs/design/DESIGN-SYSTEM.md](docs/design/DESIGN-SYSTEM.md)，既有设计稿和规格索引：[docs/design/README.md](docs/design/README.md)（`ERRATA.md` 优先于 SPEC）。

## 怎么读 issue

- **版本范围 issue**：标题形如「vX.Y.Z 版本范围（已冻结）」，正文按 A/B/C… 列出本版每一项的改动位置、要跟着动的测试和门禁（参考 #162）。只做范围内的项；范围定好就冻结，做的过程中发现的新问题不要顺手改，记成下一版候选（如「[v0.12.0 候选] …」或写进范围 issue 的「不在范围」）。
- 「待村长确认」的范围还没定，不要开工。
- 标签分三组：
  - 类型：`bug`、`feature`、`data`（游戏数据、开局数据的补充或校正）、`docs`、`chore`
  - 优先级：`P0`（尽快）、`P1`（下一两个版本内）、`P2`（排期时再定）
  - 状态：`候选`（版本候选，未进入范围）、`待确认`（等维护者明确决定）、`阻塞`（被其他 issue 或决定卡住）
- **带 `待确认` 或 `阻塞` 的 issue 不要动手。**
- issue 类型看标签，不看标题前缀。验收标准写在 issue 里，按它做。
- 动手前先查这个 issue 有没有已打开的 PR，有就跳过。

## 工作流

1. 一个 issue 一个 PR，一个执行者。普通已授权更新默认直接对最新 `main` 提 PR；仅需要多项冻结集成时以 `release/vX.Y.Z` 为目标。使用版本分支时先更新到其最新提交，不为简单更新额外建立发布分支。
2. PR 标题必须是 Conventional Commits，CI 会检查：`类型(#issue): 描述`，类型为 `feat fix docs chore data test ci refactor style perf build revert hotfix`。例：`fix(#13): 科技涉及单位只显示一处`。静态数据快照用 `data`。
3. PR 描述写 `Fixes #N`（合到非默认分支不会自动关 issue，发版时人工核对），附本地测试结果；界面 PR 附 360/375/390/1280 四张截图。按需在 CHANGELOG 当前版本小节写一句玩家能看懂的话。
4. 默认审阅门禁：实现者之外的独立代理复核＋按风险选择的一次验证；PR 留下实际验证的提交 SHA、复核范围、结果和未解决问题，界面改动同时核对规格与四宽。执行者可在已授权范围补齐规格和失败用例并交独立复核；大功能或新页面须先具备这些材料再实现。只改文档或纯样式且不动逻辑和测试的 PR 可走 CI 绿的轻量规则。release/main 可以按代码树、策略、范围和真实来源复用成功证据，不机械重跑相同验证。不得伪造他人结论、删除分支、修改仓库权限或放宽测试；已获授权时按顺序集成并发布。
5. 版本号一律三段 `vX.Y.Z`。完成独立复核和适用验证后合入 main；main 的真实 `test` 检查可记录可信复用结果，仍须完成真实 SHA 构建、短烟测和 Pages 部署。Release 核对线上版本/构建、本次功能及 tag，直接打包同一已部署产物和校验文件后正式发布，不再二次构建或默认跑大范围线上回归。按持续发布授权自动继续，无需再问是否上线；不要在 main 的检查和部署尚未结束时让脚本等待部署。

## 提交身份

- 不要用 `@users.noreply.github.com` 邮箱提交（会把提交归到别的 GitHub 用户）。用仓库现有的身份或维护者指定的身份，提交前 `git config user.email` 确认。
- 不要提交 `.dat`、`scripts/.cache/`、`dist/`、截图 png、`node_modules`。
