# 软件开发经验与维护交接

给后来改这个仓库的人。本文只讲代码、数据、验证和上线怎么核对。产品范围见 [CONTRIBUTING「角色」](../CONTRIBUTING.md#角色)，Issue 阶段与同一正文交接见 [CONTRIBUTING「Issue 生命周期」](../CONTRIBUTING.md#issue-lifecycle)，视觉规格见 [docs/design/README.md](../docs/design/README.md)，目录分层的长表见 [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md)。三处冲突时，流程以 CONTRIBUTING 为准，游戏数字以仓库里的数据和脚本为准。

核对基准是 2026-11-13 的 `main` `0db9c30924dc5a2acaa66d3924d2f655fc17a6c2`（页脚短 SHA `0db9c30`，`package.json` 版本 `0.77.92`）。命令都对照过 `package.json`、工作流或配置文件。没在这次核对里跑过的检查，下面会标明。

## 1. 站点是什么，改动从哪进

线上是 GitHub Pages：<https://linhongcun.github.io/aoe2-analyzer/>。推到 `main` 才会部署。界面是简体中文。技术栈是 Vite 6、React 18、TypeScript（strict、`noUncheckedIndexedAccess`）、react-router 6 的 `HashRouter`、lucide-react。路由在 hash 里，例如 `#/unit/569`。`src/app/App.tsx` 包了一层 `HashRouter`，`vite.config.ts` 的 `base` 是 `./`，所以子路径和本地预览都能开。

页面只有一份登记表：`src/shared/nav/pageRegistry.ts` 的 `PAGES`。路由、导航、首页分组、静态标题都从这里来。新页面先改登记表，再在 `src/app/pageRegistry.tsx` 的 `LOADERS` 里补同名懒加载。`src/app/routes.tsx` 只是 `PAGE_REGISTRY.map`。不要另写一份路由名单。

分层边界在 `scripts/check-layers.mjs`。`features/X` 不引用 `features/Y`；`shared/` 不引用 `features/` 和 `app/`；`domain/` 不引用 React、`features/`、`app/`、`shared/ui`。核心 JSON 只能由 `LOADERS` 里这 7 个文件直接 import：

| 文件                                                                                 | 作用                                                                          |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `src/data/index.ts`                                                                  | `civs` 随主包；科技树动态 import；`loadCore()` 动态 import `src/data/core.ts` |
| `src/data/raw/civs.ts` `raw/units.ts` `raw/techs.ts` `raw/buildings.ts` `raw/eco.ts` | 原样转出，只给 `src/data/**` 内部用                                           |
| `src/domain/datEffects.ts`                                                           | `effects.json` 的类型和转换                                                   |

`src/data/raw/*` 只能由 `src/data/**` import（规则 `raw-direct`，#1029）。其他层要同步读单位、科技、建筑，用 `src/data/core.ts` 的 `CORE`：它和 `loadCore()` / `useCore()` 返回的是同一个对象，已带 `dlc`、`type`、`introducedUpdate` 和 `unitById`、`techById`、`buildingById`、`linker`、`fam`。文明用 `src/data` 的 `civs`，经济数据用 `src/data/eco.ts`。不要再写 `as unknown as { ... }[]` 的局部类型或自建 id 索引。静态 import `CORE` 会把目录数据带进所在 chunk，随主包加载的模块只用 `loadCore()` / `useCore()`。

专题数据统一从 `src/data/garrisonHosts.ts`（只读 `GARRISON_HOST_IDS`）、`ladder.ts`（`ARABIA_SNAPSHOT`、`TEAM_SNAPSHOT`、`BEGINNER_NOTES`）、`mapCatalog.ts`（`MAP_CATALOG`）、`relicIncome.ts`（`RELIC_INCOME_RAW: unknown`，调用方校验）读取。`ui-data-json`（#1031）禁止界面三层直接 import `src/data/**/*.json` 和现位于 `data/game/**/*.json` 的载荷；功能自带 JSON 及 `data/content/`、`data/reference/` 不受限。原来动态加载的地图和圣物仍动态 import 对应 TS 入口，别把它们带进首页主包或删掉失败重试。

本地严格检查：

```bash
npm run lint:layers -- --strict
```

不带 `--strict` 时脚本只报告，退出码仍是 0。默认 CI 的 `static` 阶段带 `--strict`。

数据流可以收成一条：固定上游 → `scripts/` 生成并提交 `data/game/*.json` 与 `public/img/` → `src/data/` 加载器做索引 → `domain/` 纯函数计算 → `features/` 和 `shared/ui` 渲染。计算放 `src/domain/`，并在 `tests/unit/` 配 Vitest。页面状态能放进 URL 的，就放进 URL。

维护约定（写在 CONTRIBUTING，不是编译器规则）：站点由维护者自己使用，旧布局、旧入口、旧链接协议可以有理由换掉，不为旧行为再加兼容层。需求、产品范围、完成态设计图、授权依据、代码和上线证据始终记录在同一 Issue 正文；体验设计者核对原范围、规格、可查看设计图和重要状态后直接交软件开发，不设 PM 设计确认往返。只有纯 docs/data 且无 UI 时可记录 UX 不适用。进入软件开发即获得该 Issue 既定范围内的开发授权，无需维护者再次批准，符合阶段与认领协议的事项允许自动认领。阶段单向推进，发现设计或范围问题留在当前阶段记录阻塞并串行协调补齐，不回退或扩大范围。持续发布授权不代替阶段、认领和就绪检查。详见 [Issue 生命周期](../CONTRIBUTING.md#issue-lifecycle)。

## 2. 游戏数据版本和可核来源

当前补丁钉在 `data/sources/data_sources.json`：

| 项             | 当前值                                                                                               |
| -------------- | ---------------------------------------------------------------------------------------------------- |
| 补丁           | DE Update 188329，日期 2026-10-28                                                                    |
| `.dat`         | `SiegeEngineers/auto-mods` `e293dc106b0f3b0ceac2db98409fbcc5c921190b`，路径 `dat/empires2_x2_p1.dat` |
| `.dat` sha256  | `d0aefd92428e2215d6f4d9b1d544901e6f171e19183f9e0b88218de5153a337f`                                   |
| 目录文本和图标 | `SiegeEngineers/aoe2techtree` `e56728e76b7d08301fba7b18d5f16bc8554c109a`                             |
| 补丁号识别     | `SiegeEngineers/halfon` `7f96c37fc5f63c7141ec7d88e91c627beb375b28`                                   |

页头「数据版本」链到 `#/about-data`。页脚同时显示 `package.json` 版本和构建短 SHA。短 SHA 由 `vite.config.ts` 取 `git rev-parse HEAD` 的前 7 位；取不到时是 `dev`。

生成文件在仓库里，但只由脚本改。不要手改 `data/game/*.json` 和 `public/img/`。`.dat` 与 `scripts/.cache/` 不提交。

| 要更新什么                                           | 命令                   | 脚本                                                         |
| ---------------------------------------------------- | ---------------------- | ------------------------------------------------------------ |
| 文明、单位、科技、建筑、科技树、图标，并重建拼音索引 | `npm run data`         | `scripts/build_data.py`，然后 `scripts/pinyin_build.mjs`     |
| 只检查拼音索引是否过期                               | `npm run pinyin:check` | 同上，`--check`                                              |
| 下载并核对 `.dat` 的 sha256 与补丁标记               | `npm run dat:check`    | `scripts/dat_source.py --check`                              |
| 效果表                                               | `npm run effects`      | `scripts/effects_build.py`，审计 `scripts/effects_audit.ts`  |
| 经济时间、费用、采集                                 | `npm run eco`          | `scripts/eco_build.py`                                       |
| 基础数值对账                                         | `npm run stats:check`  | `scripts/stats_crosscheck.py`                                |
| 只看上游有没有新补丁                                 | `npm run data:status`  | 有更新时退出码 10                                            |
| 按文档走完整补丁更新                                 | `npm run data:update`  | 见 [docs/DATA-UPDATE.md](../docs/DATA-UPDATE.md)，不自动提交 |

2026-11-13 数过当前 JSON 长度：文明 56、单位 248、科技 199、建筑 38。科技和建筑与 README 的个数一致。单位 JSON 是 248 条；README 仍写 163。首页单位数用 `src/domain/family.ts` 的 `unitCount` 做家族折叠，和 JSON 条数不是同一个数。写界面或文档时现算，不要抄 README 的 163。`data_sources.json` 里 `.dat` 标记 `civs: 63` 是补丁标记，也不是页面上的 56 个文明。

主观评分在 `data/sources/civ_ratings.json`。社区攻略、别名只收 2020 年以后的；没核对的标「未核实」。

## 3. 训练价、研究费、适用和不完整结果

这几条是游戏正确性边界。对不上数据时改代码或改说明，不要把缺的效果补成一个完整数字。

**训练单价**只有一条叠加实现：`src/domain/unitCost.ts` 的 `unitCost`。它先走 `src/domain/costDiscount.ts` 的 `discountedCost`（常驻文明费用折扣），再按已选科技的费用效果做 set / mul / add。带资源标记或操作无法解码的费用效果整项不套用，放进返回值的 `undecoded`，单价不改。折扣对不上的项在 `discount.unsupported`。

**费用科技是否适用**在运行时判断，不写死科技名单。`src/domain/duelTrainingCost.ts` 的 `applicableTrainingTechs` 要求：时代够、文明有、科技树点亮，并且 `DAT.techs[en].eco` 里属性 100 或 103–106 的目标包含当前单位。`supported === false` 表示效果打到了这个单位，但 `unitCost` 整项排除了；勾选只作记录，不改价。

**训练总价**已经在 `#/production?mode=train-total`，实现在 `src/domain/trainTotal.ts` 和 `src/features/production/`。同一文明、同一时代，多行「单位形态 × 训练数量」。已计入的行是当前单价乘数量，再相加。数量必须是 1–1000 的整数字符串，上限常量 `TRAIN_TOTAL_QTY_MAX`。无合法显式时代时默认帝王（`age=4`）。化学一类解锁科技只决定能不能选这个形态，研究费用不进合计。升级费、建造、住房也不进合计。

右栏文案以 `src/features/production/trainTotalCopy.ts` 为准，不要把不完整的数说成整份总价：

| 状态                     | 界面怎么说                                                          |
| ------------------------ | ------------------------------------------------------------------- |
| 还没有训练行             | 不出现资源卡，也不出现「部分训练费用」                              |
| 有行，但没有一行可计入   | 标题仍是「训练总价」，写「当前没有已计入的训练行。」                |
| 只有一部分行可计入       | 标题改成「已计入行小计」，标记「部分训练费用」，并写已计入 x / y 行 |
| 已选费用效果没能完整计入 | 另标「估算，未完整计入」。下面的数是估算                            |
| 文明或时代无效           | 右栏报错。复制在这种状态下不可用                                    |

「部分训练费用」只表示有的行没进小计。它和文明加成列表的「部分计入」不是同一个词。加成三档在 `src/domain/bonusUsage.ts` 的 `bonusLevel`：工具都计入为「已计入」，有的计入有的没有为「部分计入」，都没有为「仅文本」。各工具自己的提示才是该工具的支持范围。

**研究费用**是另一笔账。科技模拟器把已选科技的 `cost` 和 `rt` 加总，函数是 `src/domain/simulator.ts` 的 `totalCost`，面板写「累计研究费用」（`src/shared/ui/sim/SimPanel.tsx`）。单位详情也写明：累计研究费用在工作区里，不是训练价。市场页切换行会、大干道时只改费率，不扣研究费。

持续生产（没有 `mode`，或旧参数）仍是每分钟产量和村民分配，建筑数量不是训练数量。跨文明对照是 `mode=train-compare`，当前解码只接受城堡时代和固定的三种单位形态（`src/features/production/trainCompareCodec.ts`）。三种模式不要混用参数。

## 4. 路由、模式、URL 原串、状态和历史

站点地址是 `#` 后面的路径加查询。`productionMode`（`src/features/production/productionMode.ts`）先看查询：损坏的编码直接报错；出现 `mode=train-total` 进训练总价；没有模式、也没有对照保留键时走持续生产；其余按对照解析。保留键是 `v`、`unit`、`n`、`civs`。所以训练总价必须用自己的 `units`，不能靠这些键混进去。

原串要留住的地方：

- 训练总价的数量和非法时代按原文进出链接。`encodeTrainTotal` 在 `ageRaw` 还有值时写回原来的 `age`，数量用 `row.qty` 字符串。`5:0`、`36:abc` 会再次填回输入框并校验，不会先变成数字再丢掉。
- 训练总价遇到 `rows`、`walk`、`farm`、`building` 或其他未知键：提示并忽略，不当成训练数量。编码结果只保留已知键，这些键不会被写回去。
- 对照链接无法完整恢复时，`ProductionCompareError` 把当前查询放进「原始对照参数」，不生成结果。提交后按文本框里的原文导航。
- 模拟器路径是 `#/unit/<id>/<civ>/<age>/<ids>/<team>`。`useSimState` 以 URL 为来源。回写前读 `window.location.hash`，`decideSimCanonical` 在地址已经换成别的单位、或路径里的文明和这次要写的文明不一致时放弃回写，避免一次过期的 `replace` 盖住新导航。

历史怎么回来：

- 模式转换用 `Link` push，浏览器返回回到来源的完整查询。[#1009 / PR #1096](https://github.com/linhongcun/aoe2-analyzer/pull/1096) 后，PK→训练总价、训练总价↔持续生产由 `src/domain/productionTransfer.ts` 按来源协议携带解析后的文明、时代、单位形态及目标允许的已选科技，不再一概清空训练行。PK 保留卡片原形态及实际派出数，不可用卡也不替换形态；两种生产模式之间只带可用形态，不换算训练数量与建筑数量，目标分别用空训练数量、默认建筑数量。完整默认生产方案仍沿旧 `trainTotalHrefFrom` 保留默认时代例外；跨文明对照仍走自己的协议。资料未就绪时不生成会丢行的转换链接。
- 表单编辑用 `navigate(..., { replace: true })`，分享链接保持最新，不把每一次改动堆进历史。训练总价/持续生产的转换说明属于当前 entry 的 router state：表单 replace 和当前模式同址 Link 都要保留 `location.state`；新转换生成新说明；dismiss 仅清本功能字段。刷新、返回/前进可恢复该 entry 的说明，复制 URL 到新标签则没有说明，方案本身仍从 URL 解码，不靠本机存储恢复。
- 刷新和打开分享链接都从 URL 解码。`src/shared/utils/sticky.ts` 的筛选记忆和 `session.lastCiv` 只在这次页面进程里，刷新就没了。
- 外观不进链接。键是 `aoe2-theme`（`src/app/theme/theme.ts`），存在 `localStorage`。复盘、快捷键、开一局另有自己的 `localStorage`，和工具查询不是同一套。

旧路径重定向也在登记表里，例如 `/scouting` 到 `/matchup/scouting`，并可用 `redirectKeepSearch` 保留查询。新工作不必再为已经决定放弃的旧地址加一层。

## 5. 界面复用、深色和小屏

能共用的先找现成组件，再加页面。跨页模拟器在 `src/shared/ui/sim/`（`SimPanel`）。工具页壳有 `ToolPageHeader`、`ToolGrid`、`ToolShell`、`CalcDock`。图标只走 `src/shared/ui/Icon.tsx` 的 `ICONS`，用 `<Icon name="..." />`。游戏美术用 `public/img/`。颜色只用 `src/shared/styles/tokens.css` 的令牌。

深色是令牌覆盖：`tokens.css` 里的 `:root[data-theme='dark']`。偏好是 `light`、`dark`、`system`，解析后写到 `documentElement.dataset.theme`。页头和窄屏抽屉都能改（`src/app/Layout.tsx`）。默认 CI 不跑明暗矩阵。这次改动若会在深色下看不清，就在受影响页面上切一次 `data-theme`。

数字不换行：`base.css` 的 `body` 已有 `font-variant-numeric: tabular-nums`；`.nw` 是 `white-space: nowrap`。各页还在自己的 CSS 里给 `.num` 再设 tabular-nums，`base.css` 没有一条全局的 `.num {}`。数值和「数字+单位」仍用 `.num` 和 `.nw` 包住。360 宽下「1个村民」折成两行，按仓库约定算缺陷。

可点区域的设计要求是不小于 44×44，字号不小于 12px。这是做界面时要满足的条件。它不是每份 PR 的四宽截图门禁。Playwright 默认视口在 `playwright.config.ts`：1280×900。只在这次布局确实依赖某个宽度时，再把视口设到那个宽度。

## 6. 按风险选测试，以及 CI 实际跑什么

推荐的验证和 CI 实际跑的集合是两件事。

推荐：这次改动做必要冒烟，加上与 diff 直接相关的测试。纯布局不重跑无关计算或数据。计算或数据改动要核对这次的结果。报告分开写实际执行、CI 范围、未验证项。本地通过不能写成 CI 已跑。规则在 [docs/TESTING.md](../docs/TESTING.md) 文首（2026-11-10）和 [CONTRIBUTING「验证投入」](../CONTRIBUTING.md#按改动风险控制验证投入2026-10-25)。

和代码直接相关的命令：

```bash
npm ci
npm run dev          # Vite，默认 http://localhost:5173
npm run build        # page_metadata、tsc、vite build、static_pages
npx tsc -p . --noEmit
npm test             # vitest run，只收集 tests/unit/**/*.test.ts
npm run lint         # 含浏览器权重、内容相关的一组检查；不等于下面的 static 阶段全文
npx playwright install chromium   # 第一次跑 e2e
npm run build && npx playwright test tests/e2e/<本次相关>.spec.ts --reporter=line
```

没设 `BASE_URL` 时，Playwright 自己起 `vite preview --port 4173 --strictPort`，读的是已有 `dist/`，所以要先 `npm run build`。设了 `BASE_URL` 就不再起服务。

**当前 CI**（`.github/workflows/ci.yml`，普通 `pull_request` 和 `push` 到 `main`）只有一个 `check` 作业和 main 专用的 `deploy`：

| 步骤   | 内容                                                                                                                                                                                            |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| static | `node scripts/ci-commands.mjs static`：`npm run lint`、`npx tsc -p . --noEmit`、`content:check --strict`、`check-source-presentation.mjs`、`content:validators --check`、`lint:layers --strict` |
| build  | `npm run build`，构建本次检出的提交                                                                                                                                                             |
| smoke  | `node scripts/ci-commands.mjs smoke`：对着这次构建跑 7 条窄冒烟                                                                                                                                 |
| deploy | 仅 `main` 的 push 且 `check` 成功：`actions/deploy-pages` 发布同一份 `dist`，并上传 `site` 产物供 Release                                                                                       |

窄冒烟由 `scripts/ci-scope.mjs` 的 `GATE_NARROW_SMOKE` 固定：`tests/e2e/smoke.spec.ts` 的首页、`#civs`、`#/civ/Franks`、`#unit/569` 可打开且无控制台错误；Ctrl+K 搜索；法兰克圣骑士满科技生命值 192；加 `tests/e2e/ciBuild659.spec.ts` 的构建身份（页脚版本与本次检出的提交一致）。改标题要同步改该常量，否则 `--grep` 选不到用例。

全部单测、`data`、`unused`/对比度/简介检查和整站 Playwright 在 **CI full**（`.github/workflows/full.yml`，每日北京时间 02:30 或 Actions 手动触发）运行，不部署。CI 钉的是 Node `20.19.5`，CI full 另钉 Python `3.12`；README 写的是本机 Node 20+、Python 3.10+。

e2e 权重在 `scripts/ci-browser-weights.json`。`npm run lint` 会跑 `lint:browser-weights`：每个 `tests/e2e/*.spec.ts` 都要有一条正整数权重，多出来的条目也不行；新增 spec 却忘了权重，`static` 会失败。权重现在只是历史记录，不用于分片。

CI 作业被跳过不等于通过：`deploy` 在 PR 上不运行；`check` 失败就没有部署。不要把 skip 或本地命令写成「CI 实跑」。

## 7. 从改动到可以称上线

1. 从最新 `main` 建分支。一个事项沿原 Issue 开一个 PR；正文与唯一阶段标签一致处于软件开发，即已获得既定范围内的开发授权，不再索要单独实施许可。编码或创建实现 PR 前仍核对范围、非目标、验收、适用 UX 交付、认领、关联 PR 及真实阻塞。开实现 PR 前先在正文「软件开发」节写技术方案（TRD）：改动位置/模块、数据与路由影响、测试计划、风险与回滚；`feature`/`data` 由实现者之外的复核者审阅并留技术评审记录，`bug`/`docs`/`chore` 可一句话写明并并入 PR 独立复核。
2. 游戏数字从当前数据和脚本读。改生成逻辑后在本地跑对应的 `npm run data`、`effects` 或 `eco`，并提交脚本产出。默认 CI 不会重跑 `data` 阶段。
3. 本地跑与 diff 直接相关的测试，加上必要冒烟。报告写明没跑的部分。
4. 合入前由实现者之外的人复核，记下实际提交 SHA、范围、结果和未解决问题。界面改动同时对一下规格。
5. PR 标题要能通过 `scripts/check-pr-title.mjs`：`类型(范围): 描述`，范围可以省略。类型含 `docs`、`feat`、`fix` 等。仓库约定 squash 合并，PR 标题会成为 `main` 上的提交说明。涉及网站的实现 PR 写 `Relates #N`，避免一合并就把还没上线的 issue 关掉。纯文档、合入即完成的事项才用 `Fixes #N`。
6. 看 CI 时以最终 head 为准。PR 检查的是合并结果，不是分支上某次更早的绿。准备再推或改历史之前，先看这个 PR 是否已经 merged、`main` 是否已经有对应提交。维护者可能已经 squash 合入；合入后的新工作从新的 `main` 另开分支。
7. squash 之后，`main` 上的 SHA 不是 PR 分支尖。例如 #979 的分支尖是 `484798c3`，合入 `main` 的是 `471c1368`。部署、页脚和 tag 都对 `main` 这个 SHA。
8. 称上线之前核对这三件事：该 `main` push 的 CI 里 `check` 与 `deploy` 都成功；Pages 完成；线上页脚「构建」的 7 位与这个 SHA 的前 7 位一致，并且这次改动的页面或资源确实在线上。已合并、PR 绿、只有祖先关系，都还不是上线。
9. 正式 Release 还要再看。`release.yml` 在 `main` 的成功 push 型 CI 之后接续。生成 draft 不等于发布完成。当前公开的 `v0.77.92` 不是 draft，annotated tag 指向 `0db9c309`。发版步骤见 [docs/RELEASING.md](../docs/RELEASING.md)。
10. 网站事项仍在原 Issue 更新上线证据，并在范围已上线、正式 Release 核实后转 `阶段:已上线`，加 `已部署` 并关闭。`Relates` 不会在合并时自动关。纯仓库文档事项在原 Issue 记录“仓库交付，无网站发布”，不标 `已部署`；驳回/重复事项写理由关闭，不伪标上线。

合入前的独立复核要留下。必要 CI 在最终 head 上通过之后，仓库约定不再加一轮人工产品走查当作关闭条件。运营意见用来记录具体卡点，CONTRIBUTING 写明它不是上线门禁。

## 8. 已经核对过的失败和后续上线

本节随工作继续积累：完成阶段交接后按 [CONTRIBUTING「经验回写」](../CONTRIBUTING.md#experience-writeback) 追加或修订条目，没有可复用经验就不写。

焦点正确不等于焦点可见。[#1118](https://github.com/linhongcun/aoe2-analyzer/issues/1118) / [PR #1127](https://github.com/linhongcun/aoe2-analyzer/pull/1127) 的独立实现复核发现，速览内部已滚动后切换文明，直接 `focus({ preventScroll: true })` 会把焦点移到仍被裁切的关闭按钮；窄回归在旧构建复现了内部滚动偏移残留。修复只在打开面板或切换文明时先复位所属面板，再聚焦，不随筛选输入重置。以后先断言面板确实滚动、控件确已被裁切，再同时检查焦点、控件与面板/视口的边界、外层滚动和关闭回焦；不能只断言 `toBeFocused()`。自动点击工具可能另行滚动定位，须把它与产品滚动区分；键盘用例也不能冒充指针操作。[修复后 main CI/Pages](https://github.com/linhongcun/aoe2-analyzer/actions/runs/44129249013)、[v0.86.1](https://github.com/linhongcun/aoe2-analyzer/releases/tag/v0.86.1) 及原 Issue 的线上真实滚轮→指针切换已通过。同类问题在 [#1119](https://github.com/linhongcun/aoe2-analyzer/issues/1119) / [PR #1129](https://github.com/linhongcun/aoe2-analyzer/pull/1129) 的收起回焦中重现：面板尚未移除时聚焦入口，DOM 收缩后入口仍会落到固定栏后。以后等收起提交后再聚焦，量测实际页头和章节栏的安全区，必要时滚动；同时断言完整可视边界和 `elementFromPoint` 命中。修复后本地 360×740/480 及 v0.87.0 真实 Pages 360×740 定向验收通过，具体证据与未验证边界见该 Issue。

44px 最小高度不能保证双向触控热区。同一 [#1118](https://github.com/linhongcun/aoe2-analyzer/issues/1118) 的长无效条件挤压 flex chip 后，移除按钮虽足够高，实际宽度只有 41.90625px；补上移动范围内的 `min-width: 44px` 后，原宽高断言通过。以后用真实长条件和组合条件量测每个移除控件的宽与高，不仅看字号、高度或正常短标签；不放宽断言掩盖挤压。修复、专项回归和上述同一版本的上线证据见 [PR #1127](https://github.com/linhongcun/aoe2-analyzer/pull/1127)。

跨页返回须在发送端和目标读者执行完整的路由/视图校验。[#1084](https://github.com/linhongcun/aoe2-analyzer/issues/1084) / [PR #1114](https://github.com/linhongcun/aoe2-analyzer/pull/1114) 的独立复核发现，建筑发送端已校验，文明目标读者的旧兜底仍接受嵌套返回、解码后的控制字符、重复键和非法版本；单位详情还接受多余的对象参数。以后先解码并逐键/值拒绝重复、嵌套和控制字符，再按目标路由/视图校验允许字段与取值；详情不接受总览专属对象参数。正负例同时覆盖返回校验、目标读者错误提示及局部恢复，保留合法文明/单位/建筑往返。[修复后 main CI/Pages](https://github.com/linhongcun/aoe2-analyzer/actions/runs/44075093247) 与 [v0.85.0](https://github.com/linhongcun/aoe2-analyzer/releases/tag/v0.85.0) 已通过，真实线上返回和受控失败重试的范围见原 Issue，不把本地夹具当作线上故障。

合法的返回凭证还须有恢复生命周期。[#1119](https://github.com/linhongcun/aoe2-analyzer/issues/1119) / [PR #1129](https://github.com/linhongcun/aoe2-analyzer/pull/1129) 的独立实现复核发现，返回后只用组件 ref 防重复聚焦、收起只清 React state，源 history entry 仍保留展开和旧焦点；随后从原树普通条目进入详情再 back，会复活已收起汇总。以后恢复完成即消费一次性焦点，显式收起同步清本功能的恢复记录，保留 root、usr、key、idx 及无关字段；组件 ref 不能替代跨挂载的 history 消费。回归实际走“汇总详情→back→收起→原树详情→back”，断言仍收起且不重放旧焦点，并保留新一次返回、显式返回和跨建筑精确行的正例。修复已获精确 SHA 独立补评、相关自动化及 [main CI/Pages](https://github.com/linhongcun/aoe2-analyzer/actions/runs/44154692040) 通过，[v0.87.0](https://github.com/linhongcun/aoe2-analyzer/releases/tag/v0.87.0) 真实线上也实走该连续链路；不把首次往返通过当作后续生命周期已验证。

按路由参数重置状态前，先确认哪些子区需要保持挂载。[#1120](https://github.com/linhongcun/aoe2-analyzer/issues/1120) / [PR #1131](https://github.com/linhongcun/aoe2-analyzer/pull/1131) 首次实现用文明 `key` 重挂整页以重置阵容折叠项，导致科技树里原应保持展开的不可用项汇总也被收起。修复把 `key` 下移到阵容和加成，科技树保持挂载并按当前文明更新分组。以后给需要重置的子区设 `key`，并从已展开状态切换实体来验证相邻区的保留状态和归属。此例在原基线通过、首评提交失败、修复后独立复核的 25 条科技树回归通过。[main CI/Pages](https://github.com/linhongcun/aoe2-analyzer/actions/runs/44169918423) 与 [v0.88.0](https://github.com/linhongcun/aoe2-analyzer/releases/tag/v0.88.0) 已完成。

同一返回协议扩展到科技时，[#1085](https://github.com/linhongcun/aoe2-analyzer/issues/1085) / [PR #1124](https://github.com/linhongcun/aoe2-analyzer/pull/1124) 的复核和实际点击又发现：全局存在的事件未必属于当前对象；建筑搜索选择只读显式返回参数，会丢掉查询中的合法返回。以后按目标对象的实际 relation/event 集合校验定位，局部恢复或切换对象只清无关事件，保留合法筛选、上下文与单层返回；所有搜索、清筛选和对象选择入口都要走同一安全候选校验。中央分发先拒绝混合路由/视图，再调用各实体校验器，避免相互委派递归。回归既要有“全局存在但不属于此对象”的负例，也要实际走总览搜索、换对象、清筛选、返回并核对原事件焦点；[修复后 main CI/Pages](https://github.com/linhongcun/aoe2-analyzer/actions/runs/44115030765)、[v0.86.0](https://github.com/linhongcun/aoe2-analyzer/releases/tag/v0.86.0) 和原 Issue 的真实线上录像已通过，未把返回合法等同于来源事实已核实。

事件驱动模型不能先把每次间隔量化再累乘。[#1054](https://github.com/linhongcun/aoe2-analyzer/issues/1054) / [PR #1104](https://github.com/linhongcun/aoe2-analyzer/pull/1104) 的 TRD 首评发现，逐次舍入会拆散本应同刻的攻击，改变攻击者快照与战果。以后从原始间隔和事件序号计算绝对时间，先排除严格超过模型上限的事件，再按既定容差归组；用固定数据反例、边界和单行退化对照锁住语义，不改旧公式或放宽断言来掩盖差异。具体规则和独立复核保留在原 Issue，不把模型结论当作游戏实战胜率。

复制确认等瞬时反馈必须有配置归属，成功也不能统一用错误播报。[#1054](https://github.com/linhongcun/aoe2-analyzer/issues/1054) 首次上线后，复制成功再同标签打开坏链接，旧确认残留且仍是 `alert`；只在编辑回调清状态，覆盖不到外部导航和延迟 Promise。[修复 PR #1105](https://github.com/linhongcun/aoe2-analyzer/pull/1105) 显式区分 `status` 与错误，配置或资料变化时清反馈，异步成功、失败均核对当前 URL 和请求号；仅比 URL 无法覆盖离开再返回原地址。以后把连续导航、延迟成功/失败和返回原配置纳入直接回归，并在真实发布后短验连续操作，不只看初始成功页。[修复后 main CI](https://github.com/linhongcun/aoe2-analyzer/actions/runs/44018895234) 与 [v0.82.1](https://github.com/linhongcun/aoe2-analyzer/releases/tag/v0.82.1) 已通过，线上补验证据及未验边界见原 Issue；请求失效只阻止旧反馈回写，不撤回系统剪贴板操作。

跨工具复用集合或模型前，要核对它服务的计算范围和动作语义。[#1009](https://github.com/linhongcun/aoe2-analyzer/issues/1009) / [PR #1096](https://github.com/linhongcun/aoe2-analyzer/pull/1096) 的首次方案只传 PK 的 `side.sel`，独立复核用显式解锁科技复现了遗漏：战斗/费用选择集合不一定保留纯训练解锁项。以后区分解析后的数值选择和显式解锁来源，先筛源有效选择及目标允许项，再判断形态；不要凭预设补源未选科技，也不要把支持度或数量合法性当成形态可选性。定向用例锁住这些语义，导航与历史行为同时以本节前面的当前实现为准，避免沿用旧「切模式清空行」假设。同样，[#1051](https://github.com/linhongcun/aoe2-analyzer/issues/1051) / [PR #1099](https://github.com/linhongcun/aoe2-analyzer/pull/1099) 把最早训练时代当成最早外部进入时代，初始已有单位因此被推迟；空行对照还可能改变模型自动纳入的科技，不能替代带精确目标行的零数量探测。以后先明确目标动作，用公开 API 有界验证配置，遇早期未知不跳过；摘要和链接共用最终配置，并对初始单位、负例、未知及容量异常保留定向回归。

新增生成器只登记 schema 和数据族，仍可能漏掉补丁更新入口。[#1064](https://github.com/linhongcun/aoe2-analyzer/issues/1064) / [PR #1090](https://github.com/linhongcun/aoe2-analyzer/pull/1090) 的专用 `--check` 已可复现，但首次遗漏 `data/sources/data_update_coverage.json`，使 `data:update` / `data:status` 在预检就失败；[修复提交](https://github.com/linhongcun/aoe2-analyzer/commit/a9b37d75d23e8be8f2d43a6d02e6cd24a5eb1f2b) 补齐登记后通过。以后新增生成链时同时核对 schema catalog、数据族、更新覆盖清单和 data 检查组，并运行覆盖清单预检与生成器 `--check`；两者证明的事情不同。证据只覆盖固定来源时，在覆盖清单写明不自动迁移的原因、维护责任和检查命令，换 pin 后重新取证，不把通用补丁更新成功当作新配置已认证。[#1082](https://github.com/linhongcun/aoe2-analyzer/issues/1082) / [PR #1092](https://github.com/linhongcun/aoe2-analyzer/pull/1092) 还暴露了嵌套校验缺口：只限制旧映射的文明范围，漏验效果级 `scope`，使越界效果通过生成与 `--check`。以后映射和效果复用文明子集约束，对真实生成命令和 `--check` 分别运行负例，并保留 null 继承、合法跨文明投影和团队 provider 正例；直接调用 build 函数不能记作 CLI 端到端验证。修复后的 [main CI](https://github.com/linhongcun/aoe2-analyzer/actions/runs/43910896095) 通过默认检查，CLI 负例与独立复核的实际范围仍以该 PR 记录为准。 [#1083](https://github.com/linhongcun/aoe2-analyzer/issues/1083) / [PR #1107](https://github.com/linhongcun/aoe2-analyzer/pull/1107) 的独立实现复核又发现，生成器只查关系引用存在，运行时却要求 direct 关系的每个效果含精确目标实体，导致生成成功、读取失败。以后生成与运行时共用同一语义约束，direct、related 与 identity-pending 分别校验，不能靠强改待核身份通过；对真实生成和 --check 分别注入同一错误关系，断言非零且已有输出逐字节不变，并保留运行时同一负例。

实体投影不能把事件级范围当作每个效果的范围，来源定位也必须从实际渲染结果派生。[#1083](https://github.com/linhongcun/aoe2-analyzer/issues/1083) / [PR #1107](https://github.com/linhongcun/aoe2-analyzer/pull/1107) 首次实现把混合事件中已登记的文明效果一起标成待核，还为另一形态或被筛选隐藏的事件生成了无效定位按钮。原因是用事件顶层范围分组、用来源全量事件建锚点。以后按每个效果的有效范围分组，冲突双方保持原子；来源按钮仅指向当前已渲染的唯一锚点，隐藏关系给明确提示。用真实混合数据、标注冲突夹具和逐个点击后进入视口的断言回归，不只检查按钮或ID存在。[修复后main CI/Pages](https://github.com/linhongcun/aoe2-analyzer/actions/runs/44028814607) 与 [v0.83.0](https://github.com/linhongcun/aoe2-analyzer/releases/tag/v0.83.0) 已通过，真实线上范围分组与来源定位验收见原Issue；不把这些界面证据当作全部历史事实认证。

隐藏事件的恢复还须验证筛选的完整交集。[#1085](https://github.com/linhongcun/aoe2-analyzer/issues/1085) / [PR #1124](https://github.com/linhongcun/aoe2-analyzer/pull/1124) 首次独立复核发现，各筛选单独都匹配，合起来仍会隐藏目标；逐键独立判断因此没有解除任何阻碍。以后“显示这条关联记录”按完整剩余查询寻找最少需要解除的筛选，保留未导致隐藏的条件以及对象、事件、排序、上下文和合法返回。用“单项分别匹配、交集不匹配”的真实组合回归，断言仅必要键被移除、事件实际可见且聚焦，不只断言返回 URL 或按钮存在；修复、独立补评及 v0.86.0 真实线上组合恢复证据见同一 Issue。

同类问题还包括效果文本和摘要的范围。[#1084](https://github.com/linhongcun/aoe2-analyzer/issues/1084) / [PR #1114](https://github.com/linhongcun/aoe2-analyzer/pull/1114) 虽已使用精确关系 ID，新增箭塔 direct effect 及卡片标题仍混入哨站免石料机制，原因是把完整混合主张当成本体摘要。以后 direct 只表达精确目标变化，related 机制说明、旧 effect/key 和完整原文另行保留；对真实 payload 同时断言 direct 标题不含另一实体机制、来源证据仍完整，而不只检查实体引用存在。修订后的上述 v0.85.0 已完成独立补评、main CI/Pages 与真实线上摘要/原文核对，具体边界见原 Issue。

源码注释中的 Issue 编号也可能触发颜色检查。[#1055](https://github.com/linhongcun/aoe2-analyzer/issues/1055) / [PR #1088](https://github.com/linhongcun/aoe2-analyzer/pull/1088) 的来源注释写了 `#1055`，首次本地 lint 将它识别成四位十六进制颜色；`scripts/check-colors.mjs` 扫描整个源码文本，不区分注释。只把注释改为 `Issue 1055` 后，本地 lint 与 [PR CI](https://github.com/linhongcun/aoe2-analyzer/actions/runs/43830083713) 通过。以后在源码注释中用 `Issue 编号` 或完整 Issue URL 留追溯，照常跑颜色检查，不为编号改检查器或增加豁免；这不是实际 UI 颜色违规。

最初的三件都是公开的 issue、PR 和 Actions。用来记住「聚合成功」「部署成功」和「产品测试失败」不是一回事。

[#974](https://github.com/linhongcun/aoe2-analyzer/issues/974) / [PR #975](https://github.com/linhongcun/aoe2-analyzer/pull/975) 合入 `464b1442`。它的 main push [run 43292061822](https://github.com/linhongcun/aoe2-analyzer/actions/runs/43292061822) 结论是 failure，`run_attempt` 为 1，这个 SHA 没有第二次 push run。`plan`、`build`、`browser-1` 成功，`static` 等作业跳过。`test` 里「Strict aggregate of every required phase」成功，Pages 制品也上传了；下一步 `node scripts/ci-report.mjs` 失败，日志是 `CI HTTP request failed with status 502`（抛出点在 `scripts/ci-budget.mjs`）。`deploy` 随后跳过。这次红在计时报告访问 GitHub，不能说成窄冒烟或圣骑士生命值算错，也不能说 `464b1442` 当时已经上线。

[#976](https://github.com/linhongcun/aoe2-analyzer/issues/976) / [PR #977](https://github.com/linhongcun/aoe2-analyzer/pull/977) 合入 `ba455312`，父提交就是 `464b1442`。[run 43316423229](https://github.com/linhongcun/aoe2-analyzer/actions/runs/43316423229) 的 `test` 和 `deploy` 都成功。两张 issue 随后以 completed 关闭。失败的那次 run 没有重跑。

[#978](https://github.com/linhongcun/aoe2-analyzer/issues/978) / [PR #979](https://github.com/linhongcun/aoe2-analyzer/pull/979) 合入 `471c1368`。[run 43336159305](https://github.com/linhongcun/aoe2-analyzer/actions/runs/43336159305) 的 `deploy` 成功，接着的 [Release run 43336687203](https://github.com/linhongcun/aoe2-analyzer/actions/runs/43336687203) 也成功。训练总价从此在仓库和线上。2026-11-13 再看线上时，页脚已是后继提交 `0db9c30`（比 `471c1368` 超前 16 个提交），`assets/Production-*.js` 里仍有「训练总价」「部分训练费用」「不含研究费用」。不要沿用「还没有 train-total」的旧判断。

## 9. 旧文档口径与当前状态

2026-11-13 基线核查时只加了本文和 README 的一处索引；下表记录当时发现的差异及当前状态。现行验证以本文第 6 节和 TESTING 文首为准。

| 位置                                                                                      | 当时写着的内容                                                | 状态                                                                                                                           |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| [README「部署」](../README.md)                                                            | 每次 push / PR 都跑 Vitest、Python、数据检查和整套 Playwright | 待维护。默认路径不是这套                                                                                                       |
| [README 数据表](../README.md)                                                             | `.dat` 来自 auto-mods 提交 `0c38027`                          | 待维护。当前钉死的是 `data_sources.json` 的 `e293dc1…`                                                                         |
| [README 模块表](../README.md)                                                             | 163 个单位                                                    | 待维护。当前 `units.json` 是 248 条，首页另走 `unitCount`                                                                      |
| [docs/RELEASING.md](../docs/RELEASING.md) 准备步骤第 2 点                                 | 高风险 PR 跑完整单测和四个浏览器 runner，窄范围保留四宽与主题 | 待维护。同文后面的默认门禁已是窄冒烟                                                                                           |
| [CONTRIBUTING 持续审阅](../CONTRIBUTING.md#维护者的持续审阅授权2026-10-25)                | 「CI 的路径分类继续有效」                                     | 待维护。同文验证投入和 `selectCiPlan` 已不让分类扩大默认门禁                                                                   |
| [docs/MAINTENANCE.md](../docs/MAINTENANCE.md) 第 6 节                                     | 界面 PR 附 360 / 375 / 390 / 1280 截图                        | 该文自己注明这不再是每 PR 门禁；条款还在                                                                                       |
| [.github/ISSUE_TEMPLATE/feature_request.md](../.github/ISSUE_TEMPLATE/feature_request.md) | 旧模板要求设计稿覆盖四宽度，PR 另附四宽截图                   | 已按 [Issue 生命周期](../CONTRIBUTING.md#issue-lifecycle) 改为同一正文的阶段区块；开发准备度在交接到软件开发时核验，不固定四宽 |

## 10. 这次没核对完的点

- 没有下载 `v0.77.92` 的 ZIP，也没有把它和 `deployed-site` 做逐字节比对。核对到的是 tag 指向 `0db9c309`、Release 不是 draft、线上页脚短 SHA 一致、生产分包含训练总价文案。
- `43292061822`、`43316423229`、`43336159305` 的 `static` 都是无步骤跳过。按当前 `frozenRequirements`，普通门禁始终要求 `static`，这种跳过来自复用。各次复用到的原始 run id 要以该次 plan 日志里的 `reused` 为准，这里没有逐份打开收据。
- 首页折叠后的单位个数没有在浏览器里再数。JSON 长度是数过的。
- 历史核验曾使用「设计通过不等于开工」的旧授权边界及 #978 的公开正文；2026-11-15 维护者已更正为进入软件开发即获既定范围内的开发授权，无需另行批准。没有把每一张历史 issue 都重读一遍。
