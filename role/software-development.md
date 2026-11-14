# 软件开发经验与维护交接

给后来改这个仓库的人。本文只讲代码、数据、验证和上线怎么核对。产品范围见 [CONTRIBUTING「角色」](../CONTRIBUTING.md#角色)，Issue 阶段与同一正文交接见 [CONTRIBUTING「Issue 生命周期」](../CONTRIBUTING.md#issue-lifecycle)，视觉规格见 [docs/design/README.md](../docs/design/README.md)，目录分层的长表见 [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md)。三处冲突时，流程以 CONTRIBUTING 为准，游戏数字以仓库里的数据和脚本为准。

核对基准是 2026-11-13 的 `main` `0db9c30924dc5a2acaa66d3924d2f655fc17a6c2`（页脚短 SHA `0db9c30`，`package.json` 版本 `0.77.92`）。命令都对照过 `package.json`、工作流或配置文件。没在这次核对里跑过的检查，下面会标明。

## 1. 站点是什么，改动从哪进

线上是 GitHub Pages：<https://linhongcun.github.io/aoe2-analyzer/>。推到 `main` 才会部署。界面是简体中文。技术栈是 Vite 6、React 18、TypeScript（strict、`noUncheckedIndexedAccess`）、react-router 6 的 `HashRouter`、lucide-react。路由在 hash 里，例如 `#/unit/569`。`src/app/App.tsx` 包了一层 `HashRouter`，`vite.config.ts` 的 `base` 是 `./`，所以子路径和本地预览都能开。

页面只有一份登记表：`src/shared/nav/pageRegistry.ts` 的 `PAGES`。路由、导航、首页分组、静态标题都从这里来。新页面先改登记表，再在 `src/app/pageRegistry.tsx` 的 `LOADERS` 里补同名懒加载。`src/app/routes.tsx` 只是 `PAGE_REGISTRY.map`。不要另写一份路由名单。

分层边界在 `scripts/check-layers.mjs`。`features/X` 不引用 `features/Y`；`shared/` 不引用 `features/` 和 `app/`；`domain/` 不引用 React、`features/`、`app/`、`shared/ui`。核心 JSON 只能由 `LOADERS` 里这 7 个文件直接 import：

| 文件 | 作用 |
| --- | --- |
| `src/data/index.ts` | 异步入口。`civs` 随主包；单位、科技、建筑、科技树动态 import |
| `src/data/raw/civs.ts` `raw/units.ts` `raw/techs.ts` `raw/buildings.ts` `raw/eco.ts` | 同步原样转出 |
| `src/domain/datEffects.ts` | `effects.json` 的类型和转换 |

本地严格检查：

```bash
npm run lint:layers -- --strict
```

不带 `--strict` 时脚本只报告，退出码仍是 0。默认 CI 的 `static` 阶段带 `--strict`。

数据流可以收成一条：固定上游 → `scripts/` 生成并提交 `src/data/*.json` 与 `public/img/` → 加载器做索引 → `domain/` 纯函数计算 → `features/` 和 `shared/ui` 渲染。计算放 `src/domain/`，并在 `tests/unit/` 配 Vitest。页面状态能放进 URL 的，就放进 URL。

维护约定（写在 CONTRIBUTING，不是编译器规则）：站点由维护者自己使用，旧布局、旧入口、旧链接协议可以有理由换掉，不为旧行为再加兼容层。需求、产品范围、完成态设计图、授权、代码和上线证据始终记录在同一 Issue 正文；每次体验设计交付都必须有覆盖主要界面和重要状态、可直接查看的正文设计图，且由产品确认后才能转软件开发。只有纯 docs/data 且无 UI 时可记录 UX 不适用。设计通过和阶段标签都不等于可以改代码；转入软件开发前必须有针对该事项的维护者实现授权。持续发布授权也不自动认领所有开放 Issue。详见 [Issue 生命周期](../CONTRIBUTING.md#issue-lifecycle)。

## 2. 游戏数据版本和可核来源

当前补丁钉在 `scripts/data_sources.json`：

| 项 | 当前值 |
| --- | --- |
| 补丁 | DE Update 188329，日期 2026-10-28 |
| `.dat` | `SiegeEngineers/auto-mods` `e293dc106b0f3b0ceac2db98409fbcc5c921190b`，路径 `dat/empires2_x2_p1.dat` |
| `.dat` sha256 | `d0aefd92428e2215d6f4d9b1d544901e6f171e19183f9e0b88218de5153a337f` |
| 目录文本和图标 | `SiegeEngineers/aoe2techtree` `e56728e76b7d08301fba7b18d5f16bc8554c109a` |
| 补丁号识别 | `SiegeEngineers/halfon` `7f96c37fc5f63c7141ec7d88e91c627beb375b28` |

页头「数据版本」链到 `#/about-data`。页脚同时显示 `package.json` 版本和构建短 SHA。短 SHA 由 `vite.config.ts` 取 `git rev-parse HEAD` 的前 7 位；取不到时是 `dev`。

生成文件在仓库里，但只由脚本改。不要手改 `src/data/*.json` 和 `public/img/`。`.dat` 与 `scripts/.cache/` 不提交。

| 要更新什么 | 命令 | 脚本 |
| --- | --- | --- |
| 文明、单位、科技、建筑、科技树、图标，并重建拼音索引 | `npm run data` | `scripts/build_data.py`，然后 `scripts/pinyin_build.mjs` |
| 只检查拼音索引是否过期 | `npm run pinyin:check` | 同上，`--check` |
| 下载并核对 `.dat` 的 sha256 与补丁标记 | `npm run dat:check` | `scripts/dat_source.py --check` |
| 效果表 | `npm run effects` | `scripts/effects_build.py`，审计 `scripts/effects_audit.ts` |
| 经济时间、费用、采集 | `npm run eco` | `scripts/eco_build.py` |
| 基础数值对账 | `npm run stats:check` | `scripts/stats_crosscheck.py` |
| 只看上游有没有新补丁 | `npm run data:status` | 有更新时退出码 10 |
| 按文档走完整补丁更新 | `npm run data:update` | 见 [docs/DATA-UPDATE.md](../docs/DATA-UPDATE.md)，不自动提交 |

2026-11-13 数过当前 JSON 长度：文明 56、单位 248、科技 199、建筑 38。科技和建筑与 README 的个数一致。单位 JSON 是 248 条；README 仍写 163。首页单位数用 `src/domain/family.ts` 的 `unitCount` 做家族折叠，和 JSON 条数不是同一个数。写界面或文档时现算，不要抄 README 的 163。`data_sources.json` 里 `.dat` 标记 `civs: 63` 是补丁标记，也不是页面上的 56 个文明。

主观评分在 `scripts/civ_ratings.json`。社区攻略、别名只收 2020 年以后的；没核对的标「未核实」。

## 3. 训练价、研究费、适用和不完整结果

这几条是游戏正确性边界。对不上数据时改代码或改说明，不要把缺的效果补成一个完整数字。

**训练单价**只有一条叠加实现：`src/domain/unitCost.ts` 的 `unitCost`。它先走 `src/domain/costDiscount.ts` 的 `discountedCost`（常驻文明费用折扣），再按已选科技的费用效果做 set / mul / add。带资源标记或操作无法解码的费用效果整项不套用，放进返回值的 `undecoded`，单价不改。折扣对不上的项在 `discount.unsupported`。

**费用科技是否适用**在运行时判断，不写死科技名单。`src/domain/duelTrainingCost.ts` 的 `applicableTrainingTechs` 要求：时代够、文明有、科技树点亮，并且 `DAT.techs[en].eco` 里属性 100 或 103–106 的目标包含当前单位。`supported === false` 表示效果打到了这个单位，但 `unitCost` 整项排除了；勾选只作记录，不改价。

**训练总价**已经在 `#/production?mode=train-total`，实现在 `src/domain/trainTotal.ts` 和 `src/features/production/`。同一文明、同一时代，多行「单位形态 × 训练数量」。已计入的行是当前单价乘数量，再相加。数量必须是 1–1000 的整数字符串，上限常量 `TRAIN_TOTAL_QTY_MAX`。无合法显式时代时默认帝王（`age=4`）。化学一类解锁科技只决定能不能选这个形态，研究费用不进合计。升级费、建造、住房也不进合计。

右栏文案以 `src/features/production/trainTotalCopy.ts` 为准，不要把不完整的数说成整份总价：

| 状态 | 界面怎么说 |
| --- | --- |
| 还没有训练行 | 不出现资源卡，也不出现「部分训练费用」 |
| 有行，但没有一行可计入 | 标题仍是「训练总价」，写「当前没有已计入的训练行。」 |
| 只有一部分行可计入 | 标题改成「已计入行小计」，标记「部分训练费用」，并写已计入 x / y 行 |
| 已选费用效果没能完整计入 | 另标「估算，未完整计入」。下面的数是估算 |
| 文明或时代无效 | 右栏报错。复制在这种状态下不可用 |

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

- 模式切换用的是 `Link`，会留下一条历史。从别的模式进入训练总价时，`trainTotalHrefFrom` 只带合法文明和合法显式时代，训练行是空的。点当前模式时链接就是当前地址。浏览器返回回到上一跳的完整查询。
- 表单编辑用 `navigate(..., { replace: true })`。训练总价、持续生产、攻城等工具都这样写，分享链接保持最新，同时不把每一次改动堆进历史。
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

**当前默认 CI**（普通 `pull_request` 和 `push`，含 `main`）由 `scripts/ci-scope.mjs` 的 `selectCiPlan` 固定成窄门禁。`planChanges` 仍能在本地看出旧的风险分类，但 CI 入口不会因此把 PR 扩成 full。规格在 [docs/design/ci-749.md](../docs/design/ci-749.md)，作业在 `.github/workflows/ci.yml`。

| 作业 | 普通 PR / main push |
| --- | --- |
| `plan` | 每次都跑。冻结选择，并决定后面哪些作业可以复用 |
| `static` | 需求里始终有。检查是 `npm run lint`、`npx tsc -p . --noEmit`、`content:check --strict`、`check-source-presentation.mjs`、`content:validators --check`、`lint:layers --strict` |
| `build` | 每次都跑，不可复用。`npm run build`，再加构建身份烟测（页脚版本与这次检出的提交） |
| `browser-1` | 每次都跑，窄门禁下不可复用。对着这次构建，Chromium 单分片 |
| `test` | 每次都跑。聚齐本次需求里的阶段；失败则不部署 |
| `deploy` | 仅 `main` 的 push，且 `plan` 与 `test` 都成功 |
| `unit`、`data`、`static-main` | 普通路径不纳入需求，作业会被跳过 |
| `browser-2` 到 `browser-4` | 只在手动 full |

窄冒烟固定为 `tests/e2e/smoke.spec.ts` 的 6 条：首页、`#civs`、`#/civ/Franks`、`#unit/569` 可打开且无控制台错误；Ctrl+K 搜索 `paladin`；法兰克圣骑士满科技生命值 192。缺一条，规划失败。构建身份是 `tests/e2e/ciBuild659.spec.ts` 里标题为 fresh build identity 的那一条。手动 full 才保留 24 条冷路由。

手动 full：Actions 里对 **CI / Deploy** 做 workflow_dispatch，`full` 默认为 true。那一次跑 `static-main`、全部单测、`data`、四片浏览器，并且不部署。`ci-probe.yml`、`ci-timing.yml` 不在默认 PR 路径。CI 钉的是 Node `20.19.5` 和 Python `3.12`（`ci.yml`）。README 写的是本机 Node 20+、Python 3.10+。

e2e 权重在 `scripts/ci-browser-weights.json`。`npm run lint` 会跑 `lint:browser-weights`：每个 `tests/e2e/*.spec.ts` 都要有一条正整数权重，多出来的条目也不行。权重是历史种子，供手动 full 把用例分到四个 runner；它不是实测耗时承诺，也不把该文件拉进默认窄冒烟。新增 spec 却忘了权重，默认 `static` 会失败。

跳过要分开看：

- `unit`、`data`、`static-main` 在普通路径没有步骤，是没被选进需求。跳过不等于跑过，更不等于通过。
- `static` 在需求里。它被跳过且没有步骤，是因为已有匹配仓库、tree、策略、工具链和精确检查集合的复用证明（`scripts/ci-stage-evidence.mjs`）。`build` 和窄门禁的 `browser-1` 标成不可复用，普通路径应当实跑。
- 作业页面上看，两种跳过都是空步骤。要分清，读该次 `plan` 日志里的 `reused` 和 `missing`，以及 `test` 的聚合收据。不要把 skip 或本地命令写成「CI 实跑」。

`test` 成功之后，main push 才上传 `deployed-site` 并部署同一份 `dist`。PR 不部署。

## 7. 从改动到可以称上线

1. 从最新 `main` 建分支。一个事项沿原 Issue 开一个 PR；先确认该 Issue 正文已有实现授权；设计通过或阶段标签都不代替这一步。
2. 游戏数字从当前数据和脚本读。改生成逻辑后在本地跑对应的 `npm run data`、`effects` 或 `eco`，并提交脚本产出。默认 CI 不会重跑 `data` 阶段。
3. 本地跑与 diff 直接相关的测试，加上必要冒烟。报告写明没跑的部分。
4. 合入前由实现者之外的人复核，记下实际提交 SHA、范围、结果和未解决问题。界面改动同时对一下规格。
5. PR 标题要能通过 `scripts/check-pr-title.mjs`：`类型(范围): 描述`，范围可以省略。类型含 `docs`、`feat`、`fix` 等。仓库约定 squash 合并，PR 标题会成为 `main` 上的提交说明。涉及网站的实现 PR 写 `Relates #N`，避免一合并就把还没上线的 issue 关掉。纯文档、合入即完成的事项才用 `Fixes #N`。
6. 看 CI 时以最终 head 为准。PR 检查的是合并结果，不是分支上某次更早的绿。准备再推或改历史之前，先看这个 PR 是否已经 merged、`main` 是否已经有对应提交。维护者可能已经 squash 合入；合入后的新工作从新的 `main` 另开分支。
7. squash 之后，`main` 上的 SHA 不是 PR 分支尖。例如 #979 的分支尖是 `484798c3`，合入 `main` 的是 `471c1368`。部署、页脚和 tag 都对 `main` 这个 SHA。
8. 称上线之前核对这三件事：该 `main` push 的 CI 里 `test` 与 `deploy` 都成功；Pages 完成；线上页脚「构建」的 7 位与这个 SHA 的前 7 位一致，并且这次改动的页面或资源确实在线上。已合并、PR 绿、只有祖先关系，都还不是上线。
9. 正式 Release 还要再看。`release.yml` 在 `main` 的成功 push 型 CI 之后接续。生成 draft 不等于发布完成。当前公开的 `v0.77.92` 不是 draft，annotated tag 指向 `0db9c309`。发版步骤见 [docs/RELEASING.md](../docs/RELEASING.md)。
10. 网站事项仍在原 Issue 更新上线证据，并在范围已上线、正式 Release 核实后转 `阶段:已上线`，加 `已部署` 并关闭。`Relates` 不会在合并时自动关。纯仓库文档事项在原 Issue 记录“仓库交付，无网站发布”，不标 `已部署`；驳回/重复事项写理由关闭，不伪标上线。

合入前的独立复核要留下。必要 CI 在最终 head 上通过之后，仓库约定不再加一轮人工产品走查当作关闭条件。运营意见用来记录具体卡点，CONTRIBUTING 写明它不是上线门禁。

## 8. 已经核对过的失败和后续上线

下面三件都是公开的 issue、PR 和 Actions。用来记住「聚合成功」「部署成功」和「产品测试失败」不是一回事。

[#974](https://github.com/linhongcun/aoe2-analyzer/issues/974) / [PR #975](https://github.com/linhongcun/aoe2-analyzer/pull/975) 合入 `464b1442`。它的 main push [run 43292061822](https://github.com/linhongcun/aoe2-analyzer/actions/runs/43292061822) 结论是 failure，`run_attempt` 为 1，这个 SHA 没有第二次 push run。`plan`、`build`、`browser-1` 成功，`static` 等作业跳过。`test` 里「Strict aggregate of every required phase」成功，Pages 制品也上传了；下一步 `node scripts/ci-report.mjs` 失败，日志是 `CI HTTP request failed with status 502`（抛出点在 `scripts/ci-budget.mjs`）。`deploy` 随后跳过。这次红在计时报告访问 GitHub，不能说成窄冒烟或圣骑士生命值算错，也不能说 `464b1442` 当时已经上线。

[#976](https://github.com/linhongcun/aoe2-analyzer/issues/976) / [PR #977](https://github.com/linhongcun/aoe2-analyzer/pull/977) 合入 `ba455312`，父提交就是 `464b1442`。[run 43316423229](https://github.com/linhongcun/aoe2-analyzer/actions/runs/43316423229) 的 `test` 和 `deploy` 都成功。两张 issue 随后以 completed 关闭。失败的那次 run 没有重跑。

[#978](https://github.com/linhongcun/aoe2-analyzer/issues/978) / [PR #979](https://github.com/linhongcun/aoe2-analyzer/pull/979) 合入 `471c1368`。[run 43336159305](https://github.com/linhongcun/aoe2-analyzer/actions/runs/43336159305) 的 `deploy` 成功，接着的 [Release run 43336687203](https://github.com/linhongcun/aoe2-analyzer/actions/runs/43336687203) 也成功。训练总价从此在仓库和线上。2026-11-13 再看线上时，页脚已是后继提交 `0db9c30`（比 `471c1368` 超前 16 个提交），`assets/Production-*.js` 里仍有「训练总价」「部分训练费用」「不含研究费用」。不要沿用「还没有 train-total」的旧判断。

## 9. 旧文档口径与当前状态

2026-11-13 基线核查时只加了本文和 README 的一处索引；下表记录当时发现的差异及当前状态。现行验证以本文第 6 节、[ci-749](../docs/design/ci-749.md) 和 TESTING 文首为准。

| 位置 | 当时写着的内容 | 状态 |
| --- | --- | --- |
| [README「部署」](../README.md) | 每次 push / PR 都跑 Vitest、Python、数据检查和整套 Playwright | 待维护。默认路径不是这套 |
| [README 数据表](../README.md) | `.dat` 来自 auto-mods 提交 `0c38027` | 待维护。当前钉死的是 `data_sources.json` 的 `e293dc1…` |
| [README 模块表](../README.md) | 163 个单位 | 待维护。当前 `units.json` 是 248 条，首页另走 `unitCount` |
| [docs/RELEASING.md](../docs/RELEASING.md) 准备步骤第 2 点 | 高风险 PR 跑完整单测和四个浏览器 runner，窄范围保留四宽与主题 | 待维护。同文后面的默认门禁已是窄冒烟 |
| [CONTRIBUTING 持续审阅](../CONTRIBUTING.md#维护者的持续审阅授权2026-10-25) | 「CI 的路径分类继续有效」 | 待维护。同文验证投入和 `selectCiPlan` 已不让分类扩大默认门禁 |
| [docs/CODEX-MAINTENANCE.md](../docs/CODEX-MAINTENANCE.md) 第 6 节 | 界面 PR 附 360 / 375 / 390 / 1280 截图 | 该文自己注明这不再是每 PR 门禁；条款还在 |
| [.github/ISSUE_TEMPLATE/feature_request.md](../.github/ISSUE_TEMPLATE/feature_request.md) | 旧模板要求设计稿覆盖四宽度，PR 另附四宽截图 | 已按 [Issue 生命周期](../CONTRIBUTING.md#issue-lifecycle) 改为同一正文的阶段区块；开发准备度在交接到软件开发时核验，不固定四宽 |

## 10. 这次没核对完的点

- 没有下载 `v0.77.92` 的 ZIP，也没有把它和 `deployed-site` 做逐字节比对。核对到的是 tag 指向 `0db9c309`、Release 不是 draft、线上页脚短 SHA 一致、生产分包含训练总价文案。
- `43292061822`、`43316423229`、`43336159305` 的 `static` 都是无步骤跳过。按当前 `frozenRequirements`，普通门禁始终要求 `static`，这种跳过来自复用。各次复用到的原始 run id 要以该次 plan 日志里的 `reused` 为准，这里没有逐份打开收据。
- 首页折叠后的单位个数没有在浏览器里再数。JSON 长度是数过的。
- 「设计通过不等于开工」核对了 CONTRIBUTING 的授权边界和 #978 的公开正文，没有把每一张历史 issue 都重读一遍。
