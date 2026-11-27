# 软件开发经验与维护交接

给后来改这个仓库的人。本文只讲代码、数据、验证和上线怎么核对。产品范围见 [CONTRIBUTING「角色」](../CONTRIBUTING.md#角色)，Issue 阶段与同一正文交接见 [CONTRIBUTING「Issue 生命周期」](../CONTRIBUTING.md#issue-lifecycle)，体验设计原则与交接见 [experience-design.md](experience-design.md)，目录分层的长表见 [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md)。三处冲突时，流程以 CONTRIBUTING 为准，游戏数字以仓库里的数据和脚本为准。

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

维护约定（写在 CONTRIBUTING，不是编译器规则）：站点由维护者自己使用，旧布局、旧入口、旧链接协议可以有理由换掉，不为旧行为再加兼容层。需求、产品范围、完成态设计图、授权依据、代码和上线证据始终记录在同一 Issue 正文；体验设计者核对原范围、规格、可查看设计图和重要状态后直接交软件开发，不设 PM 设计确认往返。只有无实际 UI 改动（纯 docs/data，或经逐组件核实零界面/交互/状态/文案改动的纯逻辑修复）时可由产品经理记录 UX 不适用。进入软件开发即获得该 Issue 既定范围内的开发授权，无需维护者再次批准，符合阶段与认领协议的事项允许自动认领。阶段单向推进，发现设计或范围问题留在当前阶段记录阻塞并串行协调补齐，不回退或扩大范围。持续发布授权不代替阶段、认领和就绪检查。详见 [Issue 生命周期](../CONTRIBUTING.md#issue-lifecycle)。

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

**训练单价**只有一条叠加实现：`src/domain/unitCost.ts` 的 `unitCost`。它先走 `src/domain/costDiscount.ts` 的 `discountedCost`（常驻文明费用折扣），再按已选科技的费用效果逐条做 set / mul / add：含资源标记（`res`）或操作无法解码的单条效果不套用、记入返回值的 `undecoded`，同科技内其余无条件费用效果仍正常套用（例如马普切「布图马普 1380」放行掷石绳骑兵 `-15%`，同时把 `res: 33` 留在 `undecoded`）。折扣对不上的项在 `discount.unsupported`。

**费用科技是否适用**在运行时判断，不写死科技名单。`src/domain/duelTrainingCost.ts` 的 `applicableTrainingTechs` 要求：时代够、文明有、科技树点亮，并且 `DAT.techs[en].eco` 里属性 100 或 103–106 的目标包含当前单位。`supported === false` 表示该科技没有可套用的费用效果，勾选只作记录、不改价；`supported === true` 且 `partial === true` 表示部分费用效果已套用但仍有未解码条目，全站自动预设跳过 `partial`、仅允许手动或显式 URL 勾选并在界面明示未解码边界。

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

用 Chromium 检查数字与单位是否同一行时，同一个行内元素可能返回多个矩形。例如「1.8 秒」在桌面和手机测试中有两个左右相邻的矩形，顶边相同。读取元素的 `getClientRects()`，检查矩形的 `top` 是否只有一个值，就能区分字体分段与实际折行。[#1231 的浏览器回归测试](https://github.com/linhongcun/aoe2-analyzer/blob/b79b857b78d5f7e34c73e9d0ddbc0e336505cb8c/tests/e2e/unitAttackTiming1218.spec.ts#L101-L103)

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
npm run lint         # 含注册表、数据族、费用/可用性、文档边界、颜色与 CSS 检查；不等于下面的 static 阶段全文
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

历史 e2e 分片权重文件 `scripts/ci-browser-weights.json` 及 `lint:browser-weights` 门禁已移除（#1523），新增 `tests/e2e/*.spec.ts` 无需再手动登记权重。

CI 作业被跳过不等于通过：`deploy` 在 PR 上不运行；`check` 失败就没有部署。不要把 skip 或本地命令写成「CI 实跑」。

## 7. 从改动到可以称上线

1. 从最新 `main` 建分支。一个事项沿原 Issue 开一个 PR；正文与唯一阶段标签一致处于软件开发，即已获得既定范围内的开发授权，不再索要单独实施许可。编码或创建实现 PR 前仍核对范围、非目标、验收、适用 UX 交付、认领、关联 PR 及真实阻塞。开实现 PR 前先在正文「软件开发」节写技术方案（TRD）：改动位置/模块、数据与路由影响、测试计划、风险与回滚；`feature`/`data` 由实现者之外的复核者审阅并留技术评审记录，`bug`/`docs`/`chore` 可一句话写明并并入 PR 独立复核。
2. 游戏数字从当前数据和脚本读。改生成逻辑后在本地跑对应的 `npm run data`、`effects` 或 `eco`，并提交脚本产出。默认 CI 不会重跑 `data` 阶段。
3. 本地跑与 diff 直接相关的测试，加上必要冒烟。报告写明没跑的部分。
4. 合入前由实现者之外的人复核，记下实际提交 SHA、范围、结果和未解决问题。界面改动同时对一下规格。
5. PR 标题要能通过 `scripts/check-pr-title.mjs`：`类型(范围): 描述`，范围可以省略。类型含 `docs`、`feat`、`fix` 等。仓库默认 squash 合并，PR 标题会成为 `main` 上的提交说明；例外是双提交策略/阵容同步 PR（Commit 2 在 `civ-formations.json` 与 `civ-formations-contract.json` 中固定引用 Commit 1 的 `DOC_SHA`），这类 PR 必须用常规 `merge` 合入以保留 Commit 1 在 `main` 祖先链内（如 [#1369](https://github.com/linhongcun/aoe2-analyzer/issues/1369)、[#1385](https://github.com/linhongcun/aoe2-analyzer/issues/1385)、[#1386](https://github.com/linhongcun/aoe2-analyzer/issues/1386)、[#1398](https://github.com/linhongcun/aoe2-analyzer/issues/1398)）。涉及网站的实现 PR 写 `Relates #N`，避免一合并就把还没上线的 issue 关掉。纯文档、合入即完成的事项才用 `Fixes #N`（经验回写 PR 仍按约定只写 `Relates #N`）。
6. 看 CI 时以最终 head 为准。PR 检查的是合并结果，不是分支上某次更早的绿。准备再推或改历史之前，先看这个 PR 是否已经 merged、`main` 是否已经有对应提交。维护者可能已经 squash 合入；合入后的新工作从新的 `main` 另开分支。
7. squash 之后，`main` 上的 SHA 不是 PR 分支尖。例如 #979 的分支尖是 `484798c3`，合入 `main` 的是 `471c1368`。部署、页脚和 tag 都对 `main` 这个 SHA。
8. 称上线之前核对这三件事：该 `main` push 的 CI 里 `check` 与 `deploy` 都成功；Pages 完成；线上页脚「构建」的 7 位与这个 SHA 的前 7 位一致，并且这次改动的页面或资源确实在线上。已合并、PR 绿、只有祖先关系，都还不是上线。
9. 正式 Release 还要再看。`release.yml` 在 `main` 的成功 push 型 CI 之后接续。生成 draft 不等于发布完成。当前公开的 `v0.77.92` 不是 draft，annotated tag 指向 `0db9c309`。发版步骤见 [docs/RELEASING.md](../docs/RELEASING.md)。
10. 网站事项仍在原 Issue 更新上线证据，并在范围已上线、正式 Release 核实后转 `阶段:已上线`，加 `已部署` 并关闭。`Relates` 不会在合并时自动关。纯仓库文档事项在原 Issue 记录“仓库交付，无网站发布”，不标 `已部署`；驳回/重复事项写理由关闭，不伪标上线。

合入前的独立复核要留下。必要 CI 在最终 head 上通过之后，仓库约定不再加一轮人工产品走查当作关闭条件。运营意见用来记录具体卡点，CONTRIBUTING 写明它不是上线门禁。

## 8. 已经核对过的失败和后续上线

本节随工作继续积累：完成阶段交接后按 [CONTRIBUTING「经验回写」](../CONTRIBUTING.md#experience-writeback) 追加或修订条目，没有可复用经验就不写。

**URL 分隔符编码的表单非法草稿须按 `location.key` 与导航类型隔离，窄屏固定底栏露出新报错须在提交前采样可视字段并排除外部哈希导航。** 使用逗号/冒号分隔多行参数的 URL 同步表单（如 `Production.tsx` 的 `rows=u:b:c`、`TrainTotal.tsx` 的 `units=u:q`）若直接把含 `,` 或 `:` 的输入（如 `1,000`、`1:2`）写进 URL，会被解码器拆坏行或误判成链接格式错误；而仅用组件内草稿叠加时，若只比对 `location.search`、不随删行重排清理也不监听 `location.key` 与 `useNavigationType()`，在离开再浏览器后退（含两条同 URL 历史记录）时会复活已失效草稿与 `aria-invalid`。以后含协议分隔符的非法草稿在 URL 侧按空值占位，在组件侧绑定 `{ key: location.key, search: location.search }` 且仅在同条目 `REPLACE` 时保留，删行、刷新或 `POP`/`PUSH` 立即清空并把草稿纳入分享链接 `stateKey`；同时在 390 宽带固定底栏（`CalcDock`）页面为字段就近报错做自动露出时，不能在 DOM 提交后才判断原控件是否可见（新错因下推与底栏撑高会把它误判为离屏），也不能让未溢出的上排字段压低 `maxScroll` 或在外部 `window.location.hash` 变更时误触发 `window.scrollBy`——须在用户交互提交前先 `captureVisibleFieldIds`、提交后仅让实际溢出的目标参与 `maxScroll` 计算，并在 E2E 中覆盖「含 `,`/`:` 粘贴 + 删行 + 同 URL 后退」「紧贴底栏输入与切时代双错因 `elementFromPoint` 命中」及「直接改 `window.location.hash` 零滚动」。[Issue #1455](https://github.com/linhongcun/aoe2-analyzer/issues/1455) / [PR #1511](https://github.com/linhongcun/aoe2-analyzer/pull/1511)

**跨页复用按需数据勿静默拆出双懒加载分包，多阶科技回归须以前置链作基准隔离增量。** 当常驻或另一页面（如 `TechDetail`）静态导入懒加载专题的领域模块（如 `src/domain/relicIncome.ts`）时，Vite 会将专题拆成数据与领域逻辑两份 `relicIncome-*.js` 分包，导致按 `/\/assets\/relicIncome-[^/]+\.js/` 拦截失败状态的 `#412` 懒加载 E2E 阻断页面挂载；需跨页判定专题数据覆盖范围时，只直接读取类型化原始入口（如 `src/data/relicIncome.ts` 的 `RELIC_INCOME_RAW`）并本地校验，或由离线脚本向既有轻量文件派生精简索引（如在 31 KB `data/game/garrison_techs.json` 导出 28 项 `numericEffectTechs`，避免拉入 777 KB `garrison_general.json`），构建后核查单分包数量并重跑对应懒加载 E2E。另在会自动补齐 `tech.pre` 前置链的工具（如 `construction.ts` 的 `effectiveConstructionTechs`）中，用 `techs: []` 对照 `[高阶科技]` 即使目标科技自身失效也会因前置科技生效而假绿；多阶科技（如 `#203/#221/#182/#279`）回归须按 `core.techById[tid]?.pre` 派生前置链，以 `techs: prereqs` 对照 `[...prereqs, tid]` 隔离自身增量，并对带默认零步距参数的采集科技（如 `#13 重犁` 在 `realCost.ts` 默认 `farmTiles=0` 不变、`farmTiles=3` 增长）分别断言默认与非默认路径。[Issue #1448](https://github.com/linhongcun/aoe2-analyzer/issues/1448) / [PR #1495](https://github.com/linhongcun/aoe2-analyzer/pull/1495)

**Fail-closed 校正规则不得以真值判空跳过显式无效项，本地 `ciBuild659` 须在最终提交后重建，线上 Pages 实测改用单页哈希切换避开 429。** `scripts/civs_build.py` 最初用 `if not correction: return text` 读取 `tb`/`tbEn`，会把配置中显式写入的 `{}` 或 `null` 静默当作未配置而放行旧文本并写盘；须改用 `key not in corrections` 严格区分键缺失与无效规则，并在单测中用 `{}` / `None` 断言进程非零退出且不写盘。先跑 `npm run build` 再 `git commit` 会把父提交的短 SHA 嵌入 `dist/`，造成独立复核检查现有 `dist/` 时与 PR HEAD 漂移，本地验证构建身份前应先完成最终提交再重建并跑 `ciBuild659`；补全 `.num.nw` 防折行时也应同步检查详情页英文副标题（`DetailPage.en`）与弹层英文原文。另对线上 GitHub Pages 直接运行多 worker 连续 `page.goto()` 的 Playwright 套件易触发 Varnish HTTP 429 突发限流，线上验收应先单次加载入口页，再通过单会话页内 `window.location.hash` 切换复用静态资源缓存。[Issue #1445](https://github.com/linhongcun/aoe2-analyzer/issues/1445) / [PR #1484](https://github.com/linhongcun/aoe2-analyzer/pull/1484)

**页内锚点去重须按当前访问 `key:hash` 复位，多源合并视图的共享证据门控须早于单槽状态早退且禁止渲染失效子项标题。** 同组件挂载期内从 `#formation-*` 跳往同页另一章节（如 `#techtree`）再浏览器后退 `POP`，若仍沿用此前 `REPLACE` 切 Tab 写入的 `completed`/`lastHandledHash`，会被误判为已处理而跳过滚动定位；而跨文明往返会重挂载组件，无法暴露该缺陷。以后锚点去重须同步追踪当前访问 `key:hash`，离开即复位已处理状态，并在 E2E 中覆盖「同页跳章节 → 后退」不卸载往返。另在多源合并投影（如 `formationScenarios.ts`）中，若先登记共享链接引用再因单槽 `hidden`/`unavailable` 提前 `continue`，会连带删除底部无门控的主轴证据（如移除古拉姆 `1747/1749` 隐藏可选局面却误删主轴火枪链接）；多条调整部分失效时渲染失败项原 `when` 也会泄漏缺失科技名（如日本缺 `484` 仍显示「射箭孔研究已完成」）。以后跨槽共享的底部证据门控须在单槽分流前独立求值，失效子块仅渲染安全兜底、不渲染原 `when` 标题，且对新增实体 gate 与引用依赖在内容校验脚本中核验固定目录（`units`/`buildings`/`techs`）ID 存在性，避免内容与契约同步写错虚构 ID 仍静默通过。[Issue #1436](https://github.com/linhongcun/aoe2-analyzer/issues/1436) / [PR #1476](https://github.com/linhongcun/aoe2-analyzer/pull/1476)

**文明专属经济科技须独立于 `ecoTechs` 并跨工具显式隔离，开局模拟负向回归须锁可达检查点与注入正对照。** `realCost.ts` 在缺省 `techIds` 时自动启用 `eco.ecoTechs` 全表，`buildSim.ts` 也直接消费 `eco.ecoTechs`，且 `armySupplyResearch()` 经 `productionTechs()` 判定支持度、`#486` 教学审计锁定 `ecoTechs` 投影指纹；若把文明经济独科（如印度斯坦大干道 `506`）直接塞入 `ecoTechs` 或仅改 `productionTechs`，会静默污染其余 55 国默认真实费用、施工停采、持续供给旧链接（`done: ['t:506']`）、团战计划、开局模拟与 `#486` 指纹。以后新增文明专属采集科技须单独导出顶层 `civEcoTechs`，在 `gatherModel()` 默认关闭 `includeCivEcoTechs` 仅由目标工具显式开启，并在 `armySupply`/`teamPlan`/`trainCompare` 显式排除 `isCivEcoTech`。另写 `buildSim` 负向回归时，若脚本触发人口上限等 `timeout` 异常，对照组与实验组会双双落到占位库存造成假绿；必须同时断言无 `timeout`、研究完成时间 `doneAt < 采样 startAt`、实际采到目标资源，并配一条把同科技临时注入 `ecoTechs` 后库存严格升高的正对照，确保回归非空过。同源告警合并亦须在首条匹配来源原位输出，且做 `-`/`−` 归一化避免重复追加加成原文已出现的同项数值（同时不误抑不同资源/属性的相同百分比）。[Issue #1410](https://github.com/linhongcun/aoe2-analyzer/issues/1410) / [PR #1465](https://github.com/linhongcun/aoe2-analyzer/pull/1465)

**`vite-node` 生成器须拆离纯库与薄 CLI，`.dat` 反事实归因按单资源与规范运算符校验，44px 行内链接忌用负垂直外边距。** 同时被单测导入与 `vite-node` / `vite-node --script` 执行的脚本，靠 `argv[1]` 或 `Error.stack` 判定直接运行会在依赖加载、`Error.stackTraceLimit = 0` 或改写 `Error.prepareStackTrace` 时失效并误触发写盘副作用；应将纯逻辑拆至零顶层副作用的 `*_lib.ts`，由无导出、无条件调用 `main()` 的薄 CLI `*_build.ts` 承载入口。对 `.dat` 命令做 1 对 1 反事实归因时，科技费用 `add` 存在 `C=1` 与 `C=-1` 两种等价编码，按原始 `C` 值排序会打乱容差配对，须先统一映射规范运算符再排序；检测未归属折价与联合摘除残余时须按单资源 `anyResourceLower` 判定，避免另一项独立效果的异资源加价掩盖团队折价，并在移除单条加成命令时按精确 `(Type, A, B, C, D)` 归属索引防止跨来源串扰。另在 360px 窄屏多行工具说明列表（如 `.busage`）中，给 `min-height: 44px` 行内链接加 `margin-block: -12px` 会把触控热区盖到上一行文字导致误跳转；应移除负垂直外边距让行内真实留出 44px 高度，并用窄屏实点相邻行锁定零重叠。[Issue #1429](https://github.com/linhongcun/aoe2-analyzer/issues/1429) / [PR #1437](https://github.com/linhongcun/aoe2-analyzer/pull/1437)

**修正 `effects.json` 展示链接须核对 `#652` 审核指纹，`.dat` 槽位回退与未建模科技收窄须分别锁定异值回退与显式 ID 清理。** `positionScenarioReview.json` 与 `routeReview.json` 按 `reviewPayload(civ)` 校验签名（含 `idx` 与派生 `fresh`），改动 `effects.json` 即使零机制变化（如越南 `-4..-33 → bon[1]` 仅更新展示链接）也会令签名漂移并阻断该文明首页场景与两时代路线，而 `ageRoutes652` / `mechanism652` 不在默认 PR 窄冒烟内；以后凡改动 `effects.json` 须主动运行这两组单测，并在逐项确认 `rules` / `eco` / `dat` / `team` 零漂移后再同步刷新签名。派生字段采用 `.dat` 槽位优先与回退时（如 `units_build.py` 按 `u['b']` 查 `TrainAt`），未命中槽位须回退固定 `.dat` 的 `TrainTime` 而非 `aoe2techtree` 目录值 `u['tt']`——当前固定数据中两来源恰巧相等（如单位 `1811` 的 `30 == 30`）会掩盖来源分叉，单测须显式注入相异的目录回退值并与 `stats_crosscheck` 互验。另对仅限部分兵种的未建模科技（如箭毒 `1393`），不能只在结算/展示层 `selectTrainingIds` 过滤，否则切换单位后隐藏 ID 会残留在 `spec.techs` 与分享链接中静默阻断升级对比（`UpgradeComparison`）并在切回时复活；须在切单位（`switchSideUnit`）与普通模式（`!hasUpgrade`）URL 规范化时剥离不适用科技，同时保留外部比较链接的严格拒收。[Issue #1403](https://github.com/linhongcun/aoe2-analyzer/issues/1403) / [PR #1428](https://github.com/linhongcun/aoe2-analyzer/pull/1428)

**过滤 `.dat` 不可达死科技须先排除 `-1` 占位、`BuildTech` 建筑触发与效果命令激活，回滚已发版本须用新补丁号。** 固定 `.dat` 中 `RequiredTechs` 为固定 6 槽（空槽填 `-1`），直接比较 `len(RequiredTechs)` 命中数为 0；剔除 `-1` 后满足 `RequiredTechCount > len(有效前置)` 的 88 项科技里，有 32 项是引擎故意借空前置防止开局自触发、改由 `Building.tech_id`（`A['BuildTech']`）触发的真实建筑科技（如亚美尼亚 `t:949 → 建筑 1118 → BuildTech['1118']=957 → 圣物 285`），另有 `Type ∈ {8, 18}, B=12, D∈{1, 3}` 效果激活科技（如 `t:707`）。若把 `t:957` 一并从 `effects.json` 删掉，`bonusUsage.ts` 的 `bonusTechs('Armenians-3')` 会从 `[949, 957]` 缩水为 `[949]`，导致 `bonusUsage317` 移除对照在 `eco.json` 留下孤立 `957` 并触发 `armenianEconomy.ts` 部分组拒算。以后判定真正死科技（如中国 `t:396`、柏柏尔 `t:598`）须先排除 `BuildTech` 与 `Type 8/18 B=12 D∈{1,3}` 再比较有效前置数；另写网站回滚方案时，切勿直接 `git revert` 退回已发布的旧版本号，而须同步分配新的未使用三段补丁版本号，避免 `.github/workflows/release.yml` 检测到同名正式 Release 而跳过发布。[Issue #1408](https://github.com/linhongcun/aoe2-analyzer/issues/1408) / [PR #1426](https://github.com/linhongcun/aoe2-analyzer/pull/1426)

**`.dat` `Type=102` 禁用须按三层来源分治，全站回归不得用被测字段做门控。** 处理研究可用性与完成历史时，`Type=102` 禁用分布在三处：`civ.disabled`（须合并 `TechTreeID + TeamBonusID`，避免漏读越南团队禁用 `t:656`）、条件禁用节点（如 `t:656`、`t:788/789`）和全局开局/模式节点（`civ=-1, loc<=0, req=[], cnt=0`）。若只在报价层拦截条件禁用而不在 `researchResolver` 阶段拦截，非拥有国传入 `done: ['t:655']` 会先把前置 `t:98` 推导为 `inferred-done` 导致漏计费用；反之若把全局开局/模式节点一并当作条件禁用，弑君专属 `t:117`（`Disable Spies (Regicide only)`）又会在标准随机地图把全部 56 国合法的 `done: ['t:408']` 误判为 `invalid`。以后区域禁用走 `globalRegionalDisabled + civ.enabled`（同时提取 `Type ∈ {8, 18}, B=12, D=1`），`civConditionalDisablers` 显式跳过全局开局/模式节点。写全站回归时，须从独立科技树可用性（如 `productionUnits`）推导预期升级条目，不以被测的 `ARMY_RESEARCH.civs[c].enabled` 做门控，也不整文明跳过存在部分分单缺陷的文明（如中国仅豁免 `#1409` 的 `res:85` 报价与 `t:243` 喷火船线 `529/532/1302`，训练行与区域升级条目仍全量断言），并做内存删项突变检查防止静默漏检；浏览器防折行断言遇到含图标的 `.res` 时，`<img>` 与文本基线 `top` 天然相差 `1–3px`，需以阈值（如 `max(top) - min(top) > 6`）替代单值比较。[Issue #1402](https://github.com/linhongcun/aoe2-analyzer/issues/1402) / [PR #1420](https://github.com/linhongcun/aoe2-analyzer/pull/1420)

**队列纵深模型须与实时存活数解耦，且不能用极小容差对 float32 半径取整截断排数。** `contactFight.ts` 若按动态 `ceil(sqrt(row.alive))` 分配排宽，每当 `alive` 跨过 `k² + 1 → k²`，前排停火区容量骤减，会把已停火单位向后瞬移重启开火（全量 29 个 `minr > 0` 单位出现 4,631 次战中反弹与 10 处 `na` 倒挂）；同时 `.dat` 碰撞半径为 float32（如 `0.20000000298023224`），用 `1e-9` 容差计算 `floor(rng / diameter)` 会因精度误差多截断整排。以后对带最小射程的群体纵深使用与存活数无关的固定逐排容量（如递增排容 `cap(r) = 2r + 1`），移除 `maxRanksByRange` 硬截断，并把全量目标单位 `na = 1..100` 单调性与减员零反弹测试纳入回归门禁。[Issue #1296](https://github.com/linhongcun/aoe2-analyzer/issues/1296) / [PR #1321](https://github.com/linhongcun/aoe2-analyzer/pull/1321)

**新增 `.dat` 衍生字段须核对原始语义、剥离副形态透传，混编同侧列表不得只用阵营作 React `key`。** `.dat` 字段不能粗粒度假设：`chargeType === 4/5` 是闪避/格挡护盾而非额外攻击、`chargeType === 1 && chargeEvent === 0`（日本武士）是加速冲锋、`chargeType ∈ {6, 7}` 须结合 `MaxTotalProjectiles > 1 && TotalProjectiles <= 1` 才区分多箭齐射与单发充能、`blast === 0 && blastDamage === -5` 是常规近战默认值而非溅射；给 `units.json` 增字段时须同步检查 `data/schemas/data-units.json`（`additionalProperties: false`）和 `unitFormDetail.ts`（避免 `...formOwner` 把主形态字段透传到副形态如 `1962 → 1980`），同时留意 `effects_build.py` 中建筑与单位异构字段（如 `atks` 数组 vs 字典）。混编允许同侧同时编入普通与精锐同系单位（如 `2703 + 2704` 瓦兰吉），组件 React `key` 必须带唯一行键 `rowKey`，不能只用 `'a' | 'b'`。[Issue #1296](https://github.com/linhongcun/aoe2-analyzer/issues/1296) / [PR #1321](https://github.com/linhongcun/aoe2-analyzer/pull/1321) · [Issue #1293](https://github.com/linhongcun/aoe2-analyzer/issues/1293) / [PR #1318](https://github.com/linhongcun/aoe2-analyzer/pull/1318)

**部分可解码费用科技须在全站预设中跳过，且费用叠加不得向不存在资源键写 `0`。** 按单条 effect 放行混合科技（如 `Butalmapu 1380`）后，`applyCostEffect` 遇到 `exact[key] === undefined` 在 `mul` 或非正 `add` 下必须直接跳过，否则 `a: 100` 会向原本不存在的资源写入幽灵 `0`（而原有资源合法降为 `0` 如波斯免金弓须保留显示）。全站自动预设只勾选 `supported && !partial`，跨单位合并保守保留 `partial = Boolean(prev.partial || item.partial)`，避免混编满科技跳转训练总价被 fail-closed 拦截。[Issue #1297](https://github.com/linhongcun/aoe2-analyzer/issues/1297) / [PR #1320](https://github.com/linhongcun/aoe2-analyzer/pull/1320)

**跨工作区共用 `?age=` 时，快捷时代切换须按当前工作区隔离或联动裁剪超龄科技。** 建筑详情折后卡与驻军预览共用 `?age=`，在 `tab=garrison` 下直接降低 `?age=` 会残留帝王 `gtechs`（护腕 `201` / 化学 `47`），使驻军校验器立刻阻断计算并持久化到刷新；单位模拟器若未按 `x.t.age <= age` 过滤 `ok`，携带高时代费用科技直链（如 `#/unit/74/Malay/2/625?tab=sim`）还会导致左栏勾选、右栏未折价与空书名号文案分裂。以后在含严格校验的工作区内用局部状态隔离预览型时代切换，在可裁剪工作区降时代时同步过滤超龄科技，并保持单位/建筑两端模拟器的时代过滤口径一致，组件对空提示名加防御守卫。[Issue #1297](https://github.com/linhongcun/aoe2-analyzer/issues/1297) / [PR #1320](https://github.com/linhongcun/aoe2-analyzer/pull/1320)

**跨模式切换回退须走完整合法性校验，辅助栏位须核对键盘焦点 DOM 顺序。** `#/duel` 混编退回单兵种时，若直接复用旧侧状态会把降时代前的帝王科技泄漏回单兵种，或令火骆驼、爆破兵、黑暗长枪等单位卡死在混编无法退出；吸顶结果栏若放在主选择区之后也会导致键盘 `Tab` 序列失真。以后统一经单一校验函数核对年代、科技树与目标模式约束后再恢复，跨模式保留来源回链使用已校验的 `location.state` 而不破坏严格 URL 协议，并用键盘 `Tab` 实测验证 DOM 焦点顺序。[Issue #1279](https://github.com/linhongcun/aoe2-analyzer/issues/1279) / [PR #1312](https://github.com/linhongcun/aoe2-analyzer/pull/1312)

**修订阵容/策略文案须对照渲染器的 `.num.nw` 分词词表、共享去重不变量与双提交合并边界。** `FormationPresentation.tsx` 的 `<FormationText>` 同时处理正文与 `evidence.links[].label`，其 `.num.nw` 分词正则不仅单位字表有限（不含 `弹/伤/击/炮/台/游戏秒`），`FORMATION_COUNTED_NOUN` 前瞻也不含闭括号 `）` 及动作词（如 `站桩/拉扯/剩`），且不包裹斜杠数字后接词元（如 `0/2/4 圣物`）或裸量词 `对/只`。修改 `civ-formations.json` 时不能只看 Markdown 可读性，须用真实 `<FormationText>` 与 360 宽渲染核对零断行并验证 `#1285` `dedupeFormationClauses` 不被打散；单测负向防折行守卫须覆盖含非纯数字串的 span（`[^<]*\d[^<]*`），并对汉语兼类词（交战介词「对」、副词「只够」）按当前命中偏移锚定前后文白名单而不是用全局 `test()` 或开放动词表；脚本改写 JSON 后须跑 `prettier --write` 确保其余未改动文明逐字节零漂移，且当 Commit 2 固定引用 Commit 1 的 `DOC_SHA` 时必须用常规 `merge`（禁止 `squash`）合入 `main`。另在复算成对训练单位（`trainCount > 1`，如 `2581` 图皮精锐黑檀木步弓手）时，须用 `resolveSideBudgetCount(..., unitTrainCount(u))` 而非仅算批数的 `countForBudget`，满血零损断言应直接比较原始 `fight.hpLeft` 避免 `Math.round()` 掩盖小数失血。[Issue #1299](https://github.com/linhongcun/aoe2-analyzer/issues/1299) / [PR #1319](https://github.com/linhongcun/aoe2-analyzer/pull/1319) · [Issue #1398](https://github.com/linhongcun/aoe2-analyzer/issues/1398) / [PR #1411](https://github.com/linhongcun/aoe2-analyzer/pull/1411)

**本机冷缓存下载固定 `.dat` 遇认证或证书报错时清理环境变量并指定系统 CA。** 在 macOS 本机无缓存运行 `npm run data` 或 `npm run effects` 拉取固定 `.dat` 时，若 shell 带有受限 `GITHUB_TOKEN` 或 Python 未指向系统根证书，会触发鉴权失败或 TLS 校验错误；临时 `unset GITHUB_TOKEN` 并设置 `SSL_CERT_FILE=/etc/ssl/cert.pem` 即可稳定复现与仓库一致的生成产物。[Issue #1293](https://github.com/linhongcun/aoe2-analyzer/issues/1293) / [PR #1318](https://github.com/linhongcun/aoe2-analyzer/pull/1318) · [Issue #1296](https://github.com/linhongcun/aoe2-analyzer/issues/1296) / [PR #1321](https://github.com/linhongcun/aoe2-analyzer/pull/1321)

**数值显示精度与模型精度分开。** 驻军炮塔的单兵显示为 4.93，五人合计显示为 24.64，把两项用等号连起来会显得算错。两名达罗毗荼精锐掷矛手距离下一箭还有微小正差值，两位小数也会将它显示为零。推导继续用模型原始值，显示值因舍入偏离等式时写「≈」，会舍入为零的正差值写「小于 0.01」。用固定数据核对显示公式，并验证实际增加一名单位后的弹丸数。[PR #1273](https://github.com/linhongcun/aoe2-analyzer/pull/1273)

**修正加成译文时，检查同屏的手写引文和静态分享说明。** 女真加成从文明目录读取，阿拉伯天梯的新手理由却手写了一份原文，改完目录后一行里仍出现两个兵名。已有测试只核对加成有一小段被引用，因此未发现差异。修正这类译文时，搜索旧原文的手写副本，对需要保持逐字引用的位置断言完整加成，并重生成拼音索引和静态分享元数据。验收时打开实际消费页面核对对应字段。[PR #1271](https://github.com/linhongcun/aoe2-analyzer/pull/1271)

**并行扩展 DAT 字段时，为整合后的精简数据分配独立缓存版本。** `dat_source.parse()` 按缓存版本和原文件哈希复用 JSON。同一个 DAT 可以生成两种字段集合。隔离复现中，将只有范围攻击字段的缓存置于相同键下，1911 的范围字段仍正确，准确度散布却缺失。整合时用新缓存键从固定 DAT 重建，再按 ID 核对两个分支的字段和已有字段。目录与 DAT 表分别取数时，也要核对索引是否在目标数组长度内；生成器回归应覆盖超界和显式零，缺行保留为未知。[缓存复现实验](https://github.com/linhongcun/aoe2-analyzer/pull/1255#issuecomment-7062230038) · [整合验证](https://github.com/linhongcun/aoe2-analyzer/pull/1255#issuecomment-7062213993) · [缺行回归](https://github.com/linhongcun/aoe2-analyzer/commit/ea842d3f6d6ef1087e2bb63c79fd65ed46f92a7e)

**合并名称的详情需核对每个模式下的实际操作。** 科技 408 把随机地图的「间谍」研究和弑君模式的「叛徒」付费指令放在同一条目，后者可反复付费使用。目录中的重复研究字段只说明科技规则。给合并条目写文案时，先核对名称对应的动作和模式，再分别验证研究限制与指令说明。[PR #1254 的评审与修复](https://github.com/linhongcun/aoe2-analyzer/pull/1254#discussion_r4652304525)

**检查跨实体章节链接时，从另一个实体点击并验证实际视口。** 战象资料链接到僧侣的招降章节时，子组件先定位章节，父详情页随后因单位 ID 改变而滚回顶部。测试只检查 URL 和正文会漏掉这个问题。让处理实体切换的滚动逻辑统一处理章节锚点，在浏览器中断言目标标题已进入视口。[复核记录](https://github.com/linhongcun/aoe2-analyzer/pull/1257#discussion_r4652361168) · [修复与测试](https://github.com/linhongcun/aoe2-analyzer/commit/4ddde2e489a58ee5a3b8ea3eedc99a5143c86898)

**在拼音生成后核对目录中的大整数。** 两个单位的恢复速率在 Python 导出时均为 `3199999949781598208`，原拼音脚本读写整份 JSON 后写成了 `3199999949781598000`。在 JavaScript 中把两边都转成 `Number` 再比较，会漏掉这个差异。新增可能超出安全整数范围的字段时，用 Python 整数或其他无损解析器按 ID 比较固定源与最终提交的 JSON，并运行拼音的 `--check` 验证重跑稳定。[PR #1250](https://github.com/linhongcun/aoe2-analyzer/pull/1250)

**从目录入口和静态分享地址分别验证替代形态。** 保加利亚骑兵的目录去重保留城堡训练记录 1225／1227，落马关系却在营垒记录 1254／1255。新增形态时，沿目录实际保留的记录走到对应档位，再打开复制的 `/unit/<id>/` 地址核对生产构建生成了该页。前者能发现训练记录与形态归属不同造成的断链，后者能发现静态页面登记遗漏。[目录入口复核](https://github.com/linhongcun/aoe2-analyzer/pull/1251#discussion_r4651359756) · [PR #1251](https://github.com/linhongcun/aoe2-analyzer/pull/1251)

**浅克隆仓库且 SSH 22 端口被阻断时，经 HTTPS 单分支拉取并加 `--no-tags`。** 本机仓库为浅克隆（`git rev-parse --is-shallow-repository` 为 `true`，含 `.git/shallow`）且 `origin` 配置为 SSH（`git@github.com:linhongcun/aoe2-analyzer.git`）。代理断开 22 端口时，直接 `git pull` 会报 `Connection closed ... port 22`；若只临时切 HTTPS 跑不限分支的 `git pull`，拉取全部远端分支和标签时 pack delta 会引用浅边界之外的缺失对象，报 `Could not read ...` 与 `pack has ... unresolved deltas`。以后不改仓库的 `remote.origin.url`，拉取目标分支改用 `git -c url."https://github.com/".insteadOf="git@github.com:" fetch --no-tags origin <branch>` 再快进合并（如 `git merge --ff-only origin/main`）；在 `gh` 已配置 HTTPS 凭据的前提下，推送分支遇同一 SSH 阻断也对单条 `git push` 加相同的 `-c url."https://github.com/".insteadOf="git@github.com:"` 参数。该做法仅用于受限网络或浅克隆同步，不解除浅克隆历史，也不修改远端配置。

**测请求乱序，先确认有两个不同的请求。** 实体详情共用 `loadCivUpdates()` 的待完成请求；只延迟响应再切换科技，两个页面等的是同一个 Promise，测不到旧响应晚归。历史回归先让首次加载失败，挂起重试请求，再切换科技，确认新请求已发出并先返回。随后分别让旧请求成功、失败，两种情况下都检查当前科技仍无记录、没有旧错误。测试共享加载器时还要检查：旧请求失败不能清掉新请求的缓存。[Issue #1149](https://github.com/linhongcun/aoe2-analyzer/issues/1149) / [PR #1166](https://github.com/linhongcun/aoe2-analyzer/pull/1166)

**跨工具带入，用目标工具的手填结果作对照。** 混编 PK 能接受带「布图马普」的阵容，但训练总价无法完整换算该科技；只检查来源合法或链接能打开，会漏掉计价条件。把生成的链接交给训练总价解码、计价，逐行与同条件手填方案比较形态、数量、单价，再核对总价。负例只改一方的条件：不能完整计价的一方应点明原因，不删行凑小计；另一合法方仍能独立带入。[Issue #1194](https://github.com/linhongcun/aoe2-analyzer/issues/1194) / [PR #1212](https://github.com/linhongcun/aoe2-analyzer/pull/1212)

定向 E2E 失败若拟归因为既存问题，须在未修改的基线 SHA 上用相同命令重跑同一用例，并保留两边的原始输出与 SHA；只有基线复现相同失败后，才按既存问题记录，不弱化断言或门禁。[#1142](https://github.com/linhongcun/aoe2-analyzer/issues/1142) / [PR #1159](https://github.com/linhongcun/aoe2-analyzer/pull/1159) 的 `#364 共享模拟器默认标题层级保留` 两例在实现 `d0a5cc0ab75b883b9316ddd0391e3c5089422fec` 与未修改基线 `95824f3851c78d6a89eb9cbc14861c2965412f6b` 上均预期 `heading-order` 的 H3 违规、实际收到空结果。

注入静态 JSON 的 E2E 先对生产预览确认数据从哪里加载。[#1144](https://github.com/linhongcun/aoe2-analyzer/issues/1144) / [PR #1163](https://github.com/linhongcun/aoe2-analyzer/pull/1163) 的阵容历史回退在 Vite 开发服务能拦截 JSON 请求，但生产把同一载荷内联到文明详情分包，原 mock 根本未命中。以后同时断言注入命中和页面进入目标状态，并在默认的构建预览实跑；如保留开发服务入口，也核对该路径。不为测试把内联数据改成生产网络请求。

粘性章节栏的滚动定位与当前节判断应共用实测几何。[#1137](https://github.com/linhongcun/aoe2-analyzer/issues/1137) / [PR #1146](https://github.com/linhongcun/aoe2-analyzer/pull/1146) 的窄屏复核发现，360/390 宽度下章节栏虽已受全局样式影响而折行，固定 140px active 阈值仍会在阵容跳转后高亮兵种；这不是原先完全不能换行。后续 1280 西班牙复现中，nav.bottom=97、active boundary=109、techtree.top=109.046875，严格比较仍漏选标题已可见的科技树。原因是固定阈值不随实际栏高变化，且布局坐标含亚像素值。以后显式允许本组件换行且不横溢，以同一实测栏底几何计算锚点偏移和 active 阈值；本例用 0.5 CSS px 容差修正，不将该数值当作通用常数。active 继续由滚动驱动，不能只看 hash，ResizeObserver 只更新高亮、不重滚。按受影响的窄屏换行布局与桌面边界定向验证直接跳转和手动滚动，并确认相邻章节不会被提前吞并。

同一访问的模态关闭与跨访问卸载须分开测试。[#1121](https://github.com/linhongcun/aoe2-analyzer/issues/1121) / [PR #1133](https://github.com/linhongcun/aoe2-analyzer/pull/1133) 的独立复核发现：对话框卸载时浏览器原生回焦，旧访问仍在采样，覆盖了正确的滚动快照；焦点断言通过，但 Forward 偏约 90 px。以后打开模态时先保存真实背景位置和触发器，模态期间停止背景采样；用两个不同的非零偏移断言 Back、Forward 的位置、焦点、弹窗卸载和解锁，并与同页 Esc 对照。档案回链同样区分可信上一访问与刷新回退：前者恢复原访问及独立错误提示，后者由已校验字段重建单层地址；不因一个坏字段丢掉其余合法上下文，也不放宽任意来路的白名单。分别实走含失效目标、混合版本和非法来路的原页往返与刷新。[独立复核](https://app.devin.ai/sessions/3f253305fcb8479fa12e5a7aea78bdd3) 和 [v0.89.0 交付](https://github.com/linhongcun/aoe2-analyzer/releases/tag/v0.89.0) 已核实，线上定向验收范围见原 Issue。

焦点正确不等于焦点可见。[#1118](https://github.com/linhongcun/aoe2-analyzer/issues/1118) / [PR #1127](https://github.com/linhongcun/aoe2-analyzer/pull/1127) 的独立实现复核发现，速览内部已滚动后切换文明，直接 `focus({ preventScroll: true })` 会把焦点移到仍被裁切的关闭按钮；窄回归在旧构建复现了内部滚动偏移残留。修复只在打开面板或切换文明时先复位所属面板，再聚焦，不随筛选输入重置。以后先断言面板确实滚动、控件确已被裁切，再同时检查焦点、控件与面板/视口的边界、外层滚动和关闭回焦；不能只断言 `toBeFocused()`。自动点击工具可能另行滚动定位，须把它与产品滚动区分；键盘用例也不能冒充指针操作。[修复后 main CI/Pages](https://github.com/linhongcun/aoe2-analyzer/actions/runs/44129249013)、[v0.86.1](https://github.com/linhongcun/aoe2-analyzer/releases/tag/v0.86.1) 及原 Issue 的线上真实滚轮→指针切换已通过。同类问题在 [#1119](https://github.com/linhongcun/aoe2-analyzer/issues/1119) / [PR #1129](https://github.com/linhongcun/aoe2-analyzer/pull/1129) 的收起回焦中重现：面板尚未移除时聚焦入口，DOM 收缩后入口仍会落到固定栏后。以后等收起提交后再聚焦，量测实际页头和章节栏的安全区，必要时滚动；同时断言完整可视边界和 `elementFromPoint` 命中。修复后本地 360×740/480 及 v0.87.0 真实 Pages 360×740 定向验收通过，具体证据与未验证边界见该 Issue。

44px 最小高度不能保证双向触控热区。同一 [#1118](https://github.com/linhongcun/aoe2-analyzer/issues/1118) 的长无效条件挤压 flex chip 后，移除按钮虽足够高，实际宽度只有 41.90625px；补上移动范围内的 `min-width: 44px` 后，原宽高断言通过。以后用真实长条件和组合条件量测每个移除控件的宽与高，不仅看字号、高度或正常短标签；不放宽断言掩盖挤压。修复、专项回归和上述同一版本的上线证据见 [PR #1127](https://github.com/linhongcun/aoe2-analyzer/pull/1127)。

跨页返回须在发送端和目标读者执行完整的路由/视图校验。[#1084](https://github.com/linhongcun/aoe2-analyzer/issues/1084) / [PR #1114](https://github.com/linhongcun/aoe2-analyzer/pull/1114) 的独立复核发现，建筑发送端已校验，文明目标读者的旧兜底仍接受嵌套返回、解码后的控制字符、重复键和非法版本；单位详情还接受多余的对象参数。以后先解码并逐键/值拒绝重复、嵌套和控制字符，再按目标路由/视图校验允许字段与取值；详情不接受总览专属对象参数。正负例同时覆盖返回校验、目标读者错误提示及局部恢复，保留合法文明/单位/建筑往返。[修复后 main CI/Pages](https://github.com/linhongcun/aoe2-analyzer/actions/runs/44075093247) 与 [v0.85.0](https://github.com/linhongcun/aoe2-analyzer/releases/tag/v0.85.0) 已通过，真实线上返回和受控失败重试的范围见原 Issue，不把本地夹具当作线上故障。

合法的返回凭证还须有恢复生命周期。[#1119](https://github.com/linhongcun/aoe2-analyzer/issues/1119) / [PR #1129](https://github.com/linhongcun/aoe2-analyzer/pull/1129) 的独立实现复核发现，返回后只用组件 ref 防重复聚焦、收起只清 React state，源 history entry 仍保留展开和旧焦点；随后从原树普通条目进入详情再 back，会复活已收起汇总。以后恢复完成即消费一次性焦点，显式收起同步清本功能的恢复记录，保留 root、usr、key、idx 及无关字段；组件 ref 不能替代跨挂载的 history 消费。回归实际走“汇总详情→back→收起→原树详情→back”，断言仍收起且不重放旧焦点，并保留新一次返回、显式返回和跨建筑精确行的正例。修复已获精确 SHA 独立补评、相关自动化及 [main CI/Pages](https://github.com/linhongcun/aoe2-analyzer/actions/runs/44154692040) 通过，[v0.87.0](https://github.com/linhongcun/aoe2-analyzer/releases/tag/v0.87.0) 真实线上也实走该连续链路；不把首次往返通过当作后续生命周期已验证。多来源返回的 owner 应按精确 entry 有效性定序并缓存整次到达：有效 bonus/阵容实体返回优先于完整历史返回，章节 hash 不等于实体返回。[#1137](https://github.com/linhongcun/aoe2-analyzer/issues/1137) / [PR #1146](https://github.com/linhongcun/aoe2-analyzer/pull/1146) 的 TRD 首评暴露，历史 owner 必须阻断通用 hash 和阵容恢复；一次性凭证被消费后，陈旧 snapshot 重新参与仲裁存在夺权风险，pending→ready 期间也应沿用缓存 owner。仅让与当前 entry 精确匹配的凭证参与竞争，owner 选定后不因一次性记忆消费或异步内容加载而重算。组合回归覆盖旧 snapshot、保留的章节/单条 hash 及不同返回 owner，确认恢复不互抢。

按路由参数重置状态前，先确认哪些子区需要保持挂载。[#1120](https://github.com/linhongcun/aoe2-analyzer/issues/1120) / [PR #1131](https://github.com/linhongcun/aoe2-analyzer/pull/1131) 首次实现用文明 `key` 重挂整页以重置阵容折叠项，导致科技树里原应保持展开的不可用项汇总也被收起。修复把 `key` 下移到阵容和加成，科技树保持挂载并按当前文明更新分组。以后给需要重置的子区设 `key`，并从已展开状态切换实体来验证相邻区的保留状态和归属。此例在原基线通过、首评提交失败、修复后独立复核的 25 条科技树回归通过。[main CI/Pages](https://github.com/linhongcun/aoe2-analyzer/actions/runs/44169918423) 与 [v0.88.0](https://github.com/linhongcun/aoe2-analyzer/releases/tag/v0.88.0) 已完成。

同一返回协议扩展到科技时，[#1085](https://github.com/linhongcun/aoe2-analyzer/issues/1085) / [PR #1124](https://github.com/linhongcun/aoe2-analyzer/pull/1124) 的复核和实际点击又发现：全局存在的事件未必属于当前对象；建筑搜索选择只读显式返回参数，会丢掉查询中的合法返回。以后按目标对象的实际 relation/event 集合校验定位，局部恢复或切换对象只清无关事件，保留合法筛选、上下文与单层返回；所有搜索、清筛选和对象选择入口都要走同一安全候选校验。中央分发先拒绝混合路由/视图，再调用各实体校验器，避免相互委派递归。回归既要有“全局存在但不属于此对象”的负例，也要实际走总览搜索、换对象、清筛选、返回并核对原事件焦点；[修复后 main CI/Pages](https://github.com/linhongcun/aoe2-analyzer/actions/runs/44115030765)、[v0.86.0](https://github.com/linhongcun/aoe2-analyzer/releases/tag/v0.86.0) 和原 Issue 的真实线上录像已通过，未把返回合法等同于来源事实已核实。

事件驱动模型不能先把每次间隔量化再累乘。[#1054](https://github.com/linhongcun/aoe2-analyzer/issues/1054) / [PR #1104](https://github.com/linhongcun/aoe2-analyzer/pull/1104) 的 TRD 首评发现，逐次舍入会拆散本应同刻的攻击，改变攻击者快照与战果。以后从原始间隔和事件序号计算绝对时间，先排除严格超过模型上限的事件，再按既定容差归组；用固定数据反例、边界和单行退化对照锁住语义，不改旧公式或放宽断言来掩盖差异。具体规则和独立复核保留在原 Issue，不把模型结论当作游戏实战胜率。

**位置决定攻击距离，冷却跟随存活单位。** 短射程近战原用纵深层保存攻击时钟。敌方伤亡使前排缩窄，同一单位换到新层后会提前再次攻击。多层移动时用稳定的存活编号保留该单位的攻击冷却，实际离开射程时才清除瞄准状态。同刻结算前冻结出手人数和距离。测试应让首击改变阵面，再分别截取换列后和冷却即将结束时的结果，比较双方存活数与剩余生命。保留一组幸存者能承受一次额外命中的配置，用剩余生命检出提前发生的非致死伤害，再用固定数据复算。[PR #1275](https://github.com/linhongcun/aoe2-analyzer/pull/1275)

复制确认等瞬时反馈必须有配置归属，成功也不能统一用错误播报。[#1054](https://github.com/linhongcun/aoe2-analyzer/issues/1054) 首次上线后，复制成功再同标签打开坏链接，旧确认残留且仍是 `alert`；只在编辑回调清状态，覆盖不到外部导航和延迟 Promise。[修复 PR #1105](https://github.com/linhongcun/aoe2-analyzer/pull/1105) 显式区分 `status` 与错误，配置或资料变化时清反馈，异步成功、失败均核对当前 URL 和请求号；仅比 URL 无法覆盖离开再返回原地址。以后把连续导航、延迟成功/失败和返回原配置纳入直接回归，并在真实发布后短验连续操作，不只看初始成功页。[修复后 main CI](https://github.com/linhongcun/aoe2-analyzer/actions/runs/44018895234) 与 [v0.82.1](https://github.com/linhongcun/aoe2-analyzer/releases/tag/v0.82.1) 已通过，线上补验证据及未验边界见原 Issue；请求失效只阻止旧反馈回写，不撤回系统剪贴板操作。

跨工具复用集合或模型前，要核对它服务的计算范围和动作语义。[#1009](https://github.com/linhongcun/aoe2-analyzer/issues/1009) / [PR #1096](https://github.com/linhongcun/aoe2-analyzer/pull/1096) 的首次方案只传 PK 的 `side.sel`，独立复核用显式解锁科技复现了遗漏：战斗/费用选择集合不一定保留纯训练解锁项。以后区分解析后的数值选择和显式解锁来源，先筛源有效选择及目标允许项，再判断形态；不要凭预设补源未选科技，也不要把支持度或数量合法性当成形态可选性。定向用例锁住这些语义，导航与历史行为同时以本节前面的当前实现为准，避免沿用旧「切模式清空行」假设。同样，[#1051](https://github.com/linhongcun/aoe2-analyzer/issues/1051) / [PR #1099](https://github.com/linhongcun/aoe2-analyzer/pull/1099) 把最早训练时代当成最早外部进入时代，初始已有单位因此被推迟；空行对照还可能改变模型自动纳入的科技，不能替代带精确目标行的零数量探测。以后先明确目标动作，用公开 API 有界验证配置，遇早期未知不跳过；摘要和链接共用最终配置，并对初始单位、负例、未知及容量异常保留定向回归。

新增生成器只登记 schema 和数据族，仍可能漏掉补丁更新入口。[#1064](https://github.com/linhongcun/aoe2-analyzer/issues/1064) / [PR #1090](https://github.com/linhongcun/aoe2-analyzer/pull/1090) 的专用 `--check` 已可复现，但首次遗漏 `data/sources/data_update_coverage.json`，使 `data:update` / `data:status` 在预检就失败；[修复提交](https://github.com/linhongcun/aoe2-analyzer/commit/a9b37d75d23e8be8f2d43a6d02e6cd24a5eb1f2b) 补齐登记后通过。以后新增生成链时同时核对 schema catalog、数据族、更新覆盖清单和 data 检查组，并运行覆盖清单预检与生成器 `--check`；两者证明的事情不同。证据只覆盖固定来源时，在覆盖清单写明不自动迁移的原因、维护责任和检查命令，换 pin 后重新取证，不把通用补丁更新成功当作新配置已认证。[#1082](https://github.com/linhongcun/aoe2-analyzer/issues/1082) / [PR #1092](https://github.com/linhongcun/aoe2-analyzer/pull/1092) 还暴露了嵌套校验缺口：只限制旧映射的文明范围，漏验效果级 `scope`，使越界效果通过生成与 `--check`。以后映射和效果复用文明子集约束，对真实生成命令和 `--check` 分别运行负例，并保留 null 继承、合法跨文明投影和团队 provider 正例；直接调用 build 函数不能记作 CLI 端到端验证。修复后的 [main CI](https://github.com/linhongcun/aoe2-analyzer/actions/runs/43910896095) 通过默认检查，CLI 负例与独立复核的实际范围仍以该 PR 记录为准。 [#1083](https://github.com/linhongcun/aoe2-analyzer/issues/1083) / [PR #1107](https://github.com/linhongcun/aoe2-analyzer/pull/1107) 的独立实现复核又发现，生成器只查关系引用存在，运行时却要求 direct 关系的每个效果含精确目标实体，导致生成成功、读取失败。以后生成与运行时共用同一语义约束，direct、related 与 identity-pending 分别校验，不能靠强改待核身份通过；对真实生成和 --check 分别注入同一错误关系，断言非零且已有输出逐字节不变，并保留运行时同一负例。

实体投影不能把事件级范围当作每个效果的范围，来源定位也必须从实际渲染结果派生。[#1083](https://github.com/linhongcun/aoe2-analyzer/issues/1083) / [PR #1107](https://github.com/linhongcun/aoe2-analyzer/pull/1107) 首次实现把混合事件中已登记的文明效果一起标成待核，还为另一形态或被筛选隐藏的事件生成了无效定位按钮。原因是用事件顶层范围分组、用来源全量事件建锚点。以后按每个效果的有效范围分组，冲突双方保持原子；来源按钮仅指向当前已渲染的唯一锚点，隐藏关系给明确提示。用真实混合数据、标注冲突夹具和逐个点击后进入视口的断言回归，不只检查按钮或ID存在。[修复后main CI/Pages](https://github.com/linhongcun/aoe2-analyzer/actions/runs/44028814607) 与 [v0.83.0](https://github.com/linhongcun/aoe2-analyzer/releases/tag/v0.83.0) 已通过，真实线上范围分组与来源定位验收见原Issue；不把这些界面证据当作全部历史事实认证。

隐藏事件的恢复还须验证筛选的完整交集。[#1085](https://github.com/linhongcun/aoe2-analyzer/issues/1085) / [PR #1124](https://github.com/linhongcun/aoe2-analyzer/pull/1124) 首次独立复核发现，各筛选单独都匹配，合起来仍会隐藏目标；逐键独立判断因此没有解除任何阻碍。以后“显示这条关联记录”按完整剩余查询寻找最少需要解除的筛选，保留未导致隐藏的条件以及对象、事件、排序、上下文和合法返回。用“单项分别匹配、交集不匹配”的真实组合回归，断言仅必要键被移除、事件实际可见且聚焦，不只断言返回 URL 或按钮存在；修复、独立补评及 v0.86.0 真实线上组合恢复证据见同一 Issue。

同类问题还包括效果文本和摘要的范围。[#1084](https://github.com/linhongcun/aoe2-analyzer/issues/1084) / [PR #1114](https://github.com/linhongcun/aoe2-analyzer/pull/1114) 虽已使用精确关系 ID，新增箭塔 direct effect 及卡片标题仍混入哨站免石料机制，原因是把完整混合主张当成本体摘要。以后 direct 只表达精确目标变化，related 机制说明、旧 effect/key 和完整原文另行保留；对真实 payload 同时断言 direct 标题不含另一实体机制、来源证据仍完整，而不只检查实体引用存在。修订后的上述 v0.85.0 已完成独立补评、main CI/Pages 与真实线上摘要/原文核对，具体边界见原 Issue。类似的自由文本泄漏也会发生在阵容投影：[#1139](https://github.com/linhongcun/aoe2-analyzer/issues/1139) / [PR #1148](https://github.com/linhongcun/aoe2-analyzer/pull/1148) 中，可选实体虽被过滤，路线或 choice 的自由文本仍保留依赖该实体的具体建议，根因是只过滤实体、没有把自由文本与实体可用性绑定。以后将实体专属建议放在对应 `role` 或带依赖和安全 `fallback` 的 adjustment；回归逐个移除候选及全部缺失时核对组件实际可见的 condition、role、路线文案和 adjustment 文本，并确认依赖可用时建议仍呈现、否定性和类别风险边界仍保留。

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
