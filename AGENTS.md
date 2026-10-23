# AGENTS.md — AI 编码代理工作说明

## Codex / 无人值守维护（必读）

批量或无人值守改代码前，先读 **[docs/CODEX-MAINTENANCE.md](docs/CODEX-MAINTENANCE.md)**：产品边界、一次一 issue、同时在审 PR ≤2、门禁（Kent `ACCEPT @ <SHA>` / Steve `设计通过 @ <SHA>`）、Hold 表（**#364 / #372 勿开**）、跳过条件与选 issue checklist。

与 CONTRIBUTING 冲突时以 [CONTRIBUTING.md](CONTRIBUTING.md) 为准。

### 数字不换行（`.num` / `.nw`）

界面上的数值与「数字+单位」必须不折行：用 **`.num`**（tabular 数字）和/或 **`.nw`**（nowrap）包住；360 宽下「1个村民」一类折行视为 bug。详见 CODEX-MAINTENANCE「设计硬规则」。

### Hold（勿开）

| # | 状态 |
| --- | --- |
| #364 | Hold — 单位 PK heading-order 整树上移 |
| #372 | Hold — 波希米亚竞技场火药预置对战 |

解 hold 仅 hongcun / Steve 明示后才可开工。

给批量处理 issue 的 AI 代理（DeepSeek、Codex 等）看的入口文件。人类贡献者看 [CONTRIBUTING.md](CONTRIBUTING.md)；两者冲突时以 CONTRIBUTING.md 为准，并在 issue 里指出。

## 项目是什么

帝国时代 II 决定版（AoE2 DE）的中文资料站和计算工具：文明、单位、科技、建筑、科技树、文明加成百科，加上文明对比、对局助手、科技模拟器、单位 PK 等工具。

- 线上：https://linhongcun.github.io/aoe2-analyzer/（GitHub Pages，push 到 `main` 才部署）
- 数据版本：DE Update 185872，所有上游固定版本见 `scripts/data_sources.json`
- 界面文字全部是简体中文

## 技术栈

Vite 6 + React 18 + TypeScript（strict、`noUncheckedIndexedAccess`）+ react-router 6 `HashRouter`（路由都是 `#/...`，例如 `#/unit/:id`、`#/duel`；路由表在 `src/app/routes.tsx`）+ lucide-react。无运行时 CDN。数据脚本用 Python 3.10+。详细分层见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。

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
- 主观评分改 `scripts/civ_ratings.json`。社区来源（攻略、别名、俗称）只收 2020 年以后的；没能核对的标「未核实」。

## 命令（均已在仓库核对）

```bash
npm ci                     # .npmrc 已设 legacy-peer-deps
npx playwright install chromium   # 首次跑 e2e 前
npm run dev                # http://localhost:5173
npm run lint               # ESLint + 颜色令牌检查 + CSS 检查
npx tsc -p . --noEmit      # 类型检查（与 CI 一致）
npx prettier --check .     # 格式检查（CI 不跑；改格式用 npm run format）
npx vitest run             # 单测，等同 npm test
npm run build              # tsc + vite build → dist/
npm run pinyin:check       # 拼音索引 search-py.json 是否最新（改了名称/别名/加成文本后跑）
npm run test:py            # Python 测试
python3 docs/design/contrast.py   # 设计令牌对比度（WCAG AA，CI 会跑）
```

e2e：Playwright 默认自己起 `vite preview --port 4173 --strictPort`（先 `npm run build`）。端口被旧进程占用时先释放：

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

`npm run lint`、`npx tsc -p . --noEmit`、`npx vitest run`、`npm run build`、Playwright 全套。PR 描述里贴出本地结果（单测/e2e 通过条数）。CI 另外跑 Python 测试、对比度、`.dat` 数据校验和开局数据校验。

## 测试规则

- **不要改 `tests/**/v0*-acceptance*` 里的期望值。** 这些是 Kent（测试）写的验收用例。验收用例和产品决定冲突时，不改测试，在 issue 里写清楚冲突，等人决定。
- 改了领域逻辑就补 `tests/unit/` 单测；修 bug 先写能复现的失败用例。
- 界面改动在 **360 / 375 / 390 / 1280** 四个宽度检查：没有横向滚动、没有页面报错（console error / pageerror）。

## 界面约定

- 中文界面，用语和已有页面一致；新增文案参照相邻页面的写法。
- **数字不换行**：数值、「数字+单位」不能被折到两行（例如「1个村民」在 360 宽折行就是 bug）。
- 图标只用 Lucide（在 `src/shared/ui/Icon.tsx` 登记后 `<Icon name="..." />`），禁止 emoji 和 Unicode 符号当图标（ESLint 会拦）；游戏美术图标除外。
- 文字不小于 12px；可点区域不小于 44×44；颜色只用设计令牌，对比度满足 WCAG AA。
- 完整设计规范：[docs/design/DESIGN-SYSTEM.md](docs/design/DESIGN-SYSTEM.md)，已签字的设计稿和规格索引：[docs/design/README.md](docs/design/README.md)（`ERRATA.md` 优先于 SPEC）。

## 怎么读 issue

- **版本范围 issue**：标题形如「vX.Y.Z 版本范围（已冻结）」，正文按 A/B/C… 列出本版每一项的改动位置、要跟着动的测试和门禁（参考 #162）。只做范围内的项；范围定好就冻结，做的过程中发现的新问题不要顺手改，记成下一版候选（如「[v0.12.0 候选] …」或写进范围 issue 的「不在范围」）。
- 「待村长确认」的范围还没定，不要开工。
- 标签分三组：
  - 类型：`bug`、`feature`、`data`（游戏数据、开局数据的补充或校正）、`docs`、`chore`
  - 优先级：`P0`（尽快）、`P1`（下一两个版本内）、`P2`（排期时再定）
  - 状态：`候选`（版本候选，未进入范围）、`待确认`（等村长或团队决定）、`阻塞`（被其他 issue 或决定卡住）
- **带 `待确认` 或 `阻塞` 的 issue 不要动手。**
- issue 类型看标签，不看标题前缀。验收标准写在 issue 里，按它做。
- 动手前先查这个 issue 有没有已打开的 PR，有就跳过。

## 工作流

1. 一个 issue 一个 PR，一个执行者。版本内的项以当前 `release/vX.Y.Z` 分支为目标（先 rebase 到它的最新提交）；只有线上数据错误的热修直接对 `main`（补丁版本，修订号 +1）。
2. PR 标题必须是 Conventional Commits，CI 会检查：`类型(#issue): 描述`，类型为 `feat fix docs chore test ci refactor style perf build revert hotfix`。例：`fix(#13): 科技涉及单位只显示一处`。
3. PR 描述写 `Fixes #N`（合到非默认分支不会自动关 issue，发版时人工核对），附本地测试结果；界面 PR 附 360/375/390/1280 四张截图。按需在 CHANGELOG 当前版本小节写一句玩家能看懂的话。
4. 门禁（只认 PR 上本人留言，第一句带 SHA）：CI 绿；Kent「ACCEPT @ <SHA>」；涉及界面的加 Steve「设计通过 @ <SHA>」。只改文档或纯样式的 PR CI 绿即可。代理不能自己给这些结论，也不合并、不删分支、不改仓库设置；合并由开发（Linus）按顺序手动做。
5. 版本号一律三段 `vX.Y.Z`。发版：Kent 整版验收 + Steve Product PASS 后，开发跑 `npm run release -- vX.Y.Z`（`scripts/release.mjs`：合入 main、等部署、核对线上页脚版本号和构建号、打 tag、起草 Release），脚本通过后直接发布 GitHub Release，不再做人工线上复验。

## 提交身份

- 不要用 `@users.noreply.github.com` 邮箱提交（会把提交归到别的 GitHub 用户）。用仓库现有的身份或维护者指定的身份，提交前 `git config user.email` 确认。
- 不要提交 `.dat`、`scripts/.cache/`、`dist/`、截图 png、`node_modules`。
