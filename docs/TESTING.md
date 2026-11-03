# 测试指南 / TESTING

给写测试、跑测试的人（含编码代理）看：目录、命令、四宽、axe、验收用例命名，以及 CI 范围、分片和阶段复用。

现行流程是执行者准备实现、规格、失败用例和证据，由实现者之外的独立代理复核，在 PR 记录实际提交 SHA、复核范围、结果和未解决问题；不再依赖指定人员签字。见 [CONTRIBUTING.md「持续审阅授权」](../CONTRIBUTING.md#维护者的持续审阅授权2026-10-25) 与「开发和验收」。持续审阅和发布授权不降低测试要求；本文件与 CONTRIBUTING 冲突时以 CONTRIBUTING 为准。

## 1. 测试放哪

| 目录          | 工具              | 收集                                                                                                                             |
| ------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `tests/unit/` | Vitest            | `*.test.ts`。`vite.config.ts` 的 `test.include` 只有 `tests/unit/**/*.test.ts`，环境 `node`                                      |
| `tests/e2e/`  | Playwright        | `*.spec.ts`。`playwright.config.ts`：`testDir` 为 `tests/e2e`，默认视口 **1280×900**，`baseURL` 默认 `http://localhost:4173/`    |
| `tests/py/`   | Python `unittest` | `npm run test:py`，即 `python3 -m unittest discover -s tests/py -v`（该目录下全部用例，不限于 CI 步骤标题里的补丁号 / 差异摘要） |

单测另有 `tests/setup/yieldEventLoop.ts`：每个用例结束后让出一次事件循环（#145）。不要删这个 `setupFiles`。

页面路由是 hash（`#/unit/:id` 这种）。e2e 打开页面用 `page.goto('./#/...')`。

## 2. 命令

下面保留完整检查命令供风险触发或手动诊断使用，不是普通更新的默认清单。普通更新只执行计划指定的相关测试；CI 的范围与复用规则见第 6 节。

与 [AGENTS.md](../AGENTS.md)「命令」、`package.json` 一致。装依赖：`npm ci`（`.npmrc` 已设 `legacy-peer-deps`）。第一次跑 e2e 前：`npx playwright install chromium`。CI 用的是 `npx playwright install --with-deps chromium`。

```bash
npm test                         # vitest run，等同 npx vitest run
npm run test:py
npm run build && npx playwright test --reporter=line
# 同上：npm run build && npm run e2e
```

没设 `BASE_URL` 时，Playwright 自己起 `npx vite preview --port 4173 --strictPort`（`reuseExistingServer: false`）。preview 读 `dist/`，所以要先 `npm run build`。4173 被旧进程占住时先释放：

```bash
fuser -k 4173/tcp; npm run build && npx playwright test --reporter=line
```

自己托管 `dist/` 时设置 `BASE_URL`。设了就不会自动起服务器：

```bash
npm run build
(cd dist && python3 -m http.server 4173) &   # 站点用相对路径，可直接托管 dist
BASE_URL=http://localhost:4173/ npx playwright test --reporter=line
```

README 里的 `BASE_URL=<线上地址>` 同样走这条：配置只认 `BASE_URL`，预览端口在 `playwright.config.ts` 里写死 4173，没有另一个 PORT 变量。多个代理并行时，每人自己的 `git worktree`；要避开 4173，就自己起静态服务并设 `BASE_URL`。不在共享目录切分支，不用 `git stash`。

## 3. 四宽

界面改动查 **360 / 375 / 390 / 1280**：没有横向滚动，没有 `console` error / `pageerror`。设计硬规则的摘要在 [CODEX-MAINTENANCE.md](CODEX-MAINTENANCE.md) §6。

`garrisonHealing229.spec.ts`、`castleDefense242.spec.ts` 的常见形状：`beforeEach` 收集 `pageerror`，以及 `console` 里 `type === 'error'` 的文本；`afterEach` 断言这份列表为 `[]`，并检查

```ts
expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
```

宽度用 `await page.setViewportSize({ width, height: 900 })`，经常和 `light` / `dark` 套两层循环。`editorial6.spec.ts` 在每次 `goto` 之后当场查溢出和错误。`afterEach` 只能看到用例结束时留下的那一页，中途换路由要在循环里查。

窄屏可点区域的设计要求是不小于 **44×44**（CODEX-MAINTENANCE §6、[docs/design/DESIGN-SYSTEM.md](design/DESIGN-SYSTEM.md)）。具体怎么量跟同页已有 spec：`castleDefense242.spec.ts` 量页内控件高度，`garrisonHealing229.spec.ts` 量宽和高，`editorial6.spec.ts` 用自己的 `undersizedMobileControls`。

## 4. axe

e2e 使用 `@axe-core/playwright` 的 `AxeBuilder`。仓库没有一份全站统一的 tag 清单，跟同页已有用例：

- 只查对比度：`.withRules(['color-contrast'])`。`editorial6.spec.ts` 扫整页；`garrisonHealing229.spec.ts` 先 `.include('[data-testid="garrison-healing-page"]')`。
- 一组 WCAG tag：`.include(...).withTags(['wcag2a', 'wcag2aa'])`，见 `castleDefense242.spec.ts`。有的页再加 `wcag21aa`（如 `mixedArmy241.spec.ts`）；有的 `analyze()` 不加 tag、不加 rule（如 `teamPlan243.spec.ts`）。

```ts
import AxeBuilder from '@axe-core/playwright';

const violations = (await new AxeBuilder({ page }).include('[data-testid="castle-defense-page"]').withTags(['wcag2a', 'wcag2aa']).analyze()).violations;
expect(violations).toEqual([]);
```

设计令牌对比度另跑 `python3 docs/design/contrast.py`（WCAG AA，CI 会跑）。文字不小于 12px、可点区域不小于 44×44，仍以设计规范和四宽用例为准。

## 5. 验收用例

执行者将 issue 的验收标准落成先失败的 Vitest 和/或 Playwright，并交独立代理复核。大功能或新页面先备齐规格与失败用例，再实现；缺少材料时可在已授权范围内补齐。历史上 Kent 写的这批文件名匹配 `v0*-acceptance*`，放在 `tests/unit/` 和 `tests/e2e/`。

**未经维护者明确授权，禁止修改** `tests/**/v0*-acceptance*` 及其他受保护验收用例的期望值。和产品决定冲突时，在 issue 写清冲突并交维护者明确决定；获授权的修改由执行者完成并独立复核，不要求指定历史作者重录，不得以删断言、跳过用例或放宽期望凑绿。

当前 `main` 上对上这个名字的文件如下（只说明命名，不把其中任一版写成「现网版本」；版本号以 `package.json` 和页脚为准）：

| 文件                                  | 文件头自述               |
| ------------------------------------- | ------------------------ |
| `tests/unit/v090-acceptance.test.ts`  | v0.9.0 验收（#145）      |
| `tests/e2e/v090-acceptance.spec.ts`   | v0.9.0 验收（#145）C / D |
| `tests/unit/v0100-acceptance.test.ts` | v0.10.0 验收（#156）     |
| `tests/e2e/v0100-acceptance.spec.ts`  | v0.10.0 验收（#156）     |
| `tests/unit/v0110-acceptance.test.ts` | v0.11.0 验收（#162）     |
| `tests/e2e/v0110-acceptance.spec.ts`  | v0.11.0 验收（#162）     |
| `tests/unit/v0270-acceptance.test.ts` | v0.27.0 验收（#299）     |
| `tests/e2e/v0270-acceptance.spec.ts`  | v0.27.0 验收（#299）     |

后来的历史验收用例还有 `tests/unit/v0290-*.test.ts`、`tests/e2e/v0300-*.spec.ts` 这类，文件名不含 `acceptance`，不在上面这条 glob 里。改之前读该文件头；历史作者或重录说明保留为背景，现行期望值变更统一遵守上述维护者明确授权＋独立复核规则。

### Codex 交接

给 Codex 执行者的写法。这不是新的 CI 门禁，也不代替第 3、4、6 节的四宽、axe 和风险范围门禁。未经维护者明确授权，仍然不要改 `tests/**/v0*-acceptance*` 及其他受保护验收用例的期望值。

**先失败，再折入。** 把验收写成 Vitest 和/或 Playwright，并确认它在当前 `main` 上失败。可以先开一份仍红的测试 PR，也可以和修复写在同一个 PR 里。仍红的测试 PR 保持草稿，描述里写明红是预期：审阅可以软通过（确认断言就是验收，红不是要在这条 PR 里修掉的回归）。CI 仍会失败，不能据此合并。实现时把这些用例折进对应的 `feat` / `fix` PR，一起变绿再合。不要 squash-merge 一份单独仍红的测试 PR；折入之后关掉那条红 PR 即可。近例：#620 只交仍红的 `ladder571`，#622 折入后一起变绿。

**Relates 与 Fixes。** 维护者已授权已部署 issue 可直接关闭，见 [2026-11-03持续关闭授权](../CONTRIBUTING.md#已部署-issue-的持续关闭授权2026-11-03)。网站实现 PR 正文使用 `Relates #N`，避免合入时提前关闭；完成实际 Pages 部署、线上核对和正式 Release 后，执行者主动关闭已完成范围的 issue，无需额外产品走查或具名人员决定。合入即完成、无需网站交付的工程或文档事项可使用 `Fixes #N`。合到非默认分支不会自动关 issue。这是选关键词的约定，不是 CI 检查项。#622 的旧 `Relates #571` 走查交接作为历史保留。

**验收要可测。** 验收标准写不成测试就不要开工。每条须点名路由（`#/...`）、页面上的具体状态（例如空态文案「暂无数据」）、从数据文件读到的数字（不凭记忆），以及不在范围。功能建议、问题报告、数据错误的「验收标准」和「Codex 就绪」在 `.github/ISSUE_TEMPLATE/`。缺这些条时按 [CODEX-MAINTENANCE](CODEX-MAINTENANCE.md) §5 跳过，或只在已授权范围内补齐规格，不自行发明产品范围。

<a id="6-按影响验证一次并复用证据"></a>
<a id="ci-659-validation"></a>

## 6. 按影响验证一次并复用阶段证据（#659，2026-11-03）

#431 的一次适用验证原则继续有效。维护者于2026-11-03明确授权 #659，取代 #514 的 PR 绝不完整浏览器限制、#513 的全局壳层 targeted 例外和旧 `browser=none` 维护豁免。完整冻结范围、故障注入、覆盖对照和实验要求见 [ci-659.md](design/ci-659.md)。

`scripts/ci-scope.mjs` 生成 `scope`、`features`、`unit`、`e2e`、`data`、`full` 与浏览器计划；`ci-stage.mjs` 冻结精确检查 ID、文件和 case 集合，再执行各阶段。`full` 明确表示完整范围，不用空列表、零测试或文件请求列表代替实际执行证明。

| 范围          | 适用变化                                                            | 必要覆盖                                                                       |
| ------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `maintenance` | 普通文档、仅项目版本号变化                                          | 核心静态检查、相关 release 单测、新构建与跨路由冷启动 smoke                    |
| `civ-ui`      | 已审计的文明页面及限定 CSS                                          | 核心 smoke，加文明筛选/卡片/详情的正负路径、四宽和明暗主题；包括历史与背景专项 |
| `targeted`    | 已证明完整消费者闭包的功能页面、辅助文件及相关测试                  | 核心 smoke，加受影响闭包的单测、交互、正负路径、四宽和明暗主题；混合改动取并集 |
| `full`        | 公共计算、全局 CSS/tokens、路由、共享壳层、未知范围、依赖、策略自身 | 完整单测和完整浏览器，PR 同样执行；`data` 按实际输入另计                       |

首页 `startGame` 和天梯 `ladderQuery` 只对精确审计路径使用有界 profile。受影响时保留首页空大厅、未知模式/地图、失败恢复和文明保留，以及天梯缺快照/恢复等负路径；文档维护不展开无关首页长测。`insights`、`sourcePresentation`、`civUnits` / `civBuildings` 等现有精确映射以 `ci-scope` 与范围单测为准，新增回归同步登记。`formatTime`、`dupNames`、`glossary`、`linker`、`sharePage`、`simRoute` 尚未证明完整闭包，保守 full；Layout/Icon/PageMeta 与共享 `editorial-shell.css` 同样 full。

feature 目录名称不构成 CSS 作用范围证明。只有登记的局部样式、前后源码均通过选择器/at-rule 审计时才收窄；全局选择器、`@import`、未知样式、解析失败或选择器逃逸均 full。Hotkeys TSX 保留原 profile，其含全局打印规则的 CSS 走 full。既有文明徽标/间距和明确限定的共享卡片 CSS 例外继续接受原有源码审计。

窄计划使用核心 `smoke.spec.ts` 与所属功能回归，保留该功能自己的四宽/主题（例如 `civDlcFilters`）。无关的全站 hash/截图/触控巡检、其它文明矩阵和开局长巡游留在夜间或高风险完整计划；直接修改全站守卫本身也 full。`CI_E2E_FULL=false` 不能降级必要范围。

`package.json` 和锁文件只有结构化证明仅项目版本号变化时可按维护处理。实际数据、生成脚本/输入、来源 pins 和依赖变化才开启 `data`，包括文明背景来源、生成清单、导入器与生成图片。`src/data/index.ts` 运行时加载边界及准确的 `page-metadata.json` 路径保持 full、无需再生成未变游戏数据；混入真实数据输入仍 data。`docs/PATCH-NOTES/**` 是产品输入。

### 并行阶段、同一构建与严格聚合

核心 static 包含 lint、类型、严格内容/公开来源/预编译校验器和严格分层；非 PR 的 unused、contrast 与必要 introductions 检查单列 static-main。static、static-main、unit、必要 data 与 build 并行。build 每次实际构建当前 SHA，并在新构建上执行24路由冷启动 smoke，包括文档维护事件；build 与 static-main 均不可复用。

完整浏览器固定四个 runner，窄计划按原子执行单元使用最多四片。按历史实测时长加权 LPT 分配；缺少历史时明确使用保守权重，不能将文件数平均或原生 shard 当作性能保证。保留 default/serial 组原子性，不全局启用 `fullyParallel`。每片先核对精确 case 选择，所有本次实际分片只消费同一不可变 build snapshot，不能各自构建或在浏览器后向 dist 写收据。

最终 `test` 核对所有必要阶段的真实成功结果、精确 case 并集和交集、允许的既有 skip、数据结果与构建身份。失败、取消、超时、缺片、重复/漏 case、非预期跳过和错构建均阻断证明与 deploy。文件检查、软链接拒绝和无匹配失败继续有效。24路由新构建 smoke 不因源码测试复用而省略。

#338 将1280 hash 与表格断言合并到同次路由访问；保留两类独立失败收集、每路由冷启动/数据就绪、visited/seen 防空转、360表格和六份 golden 原字节。手工 record 仍须完整单 worker，CI/分片/多 worker 禁止 record。不得通过减少断言或更新 golden 换取速度。

### PR 到 main 的 v2 阶段复用

只接受 `ci-stage-evidence.mjs` 验证的 v2 原始执行证明；v1 一律拒绝，不能补字段升级。来源必须是经 GitHub API 核实的同仓库成功 run/attempt/真实数字 job 与所属 artifact；匹配实际 tested tree、策略与工具链指纹、精确检查/文件/case 集合、合法 PR merge/push 来源、artifact 大小/摘要/时间窗口。不能只看 artifact 名、PR head SHA、祖先关系或符号 `GITHUB_JOB`。

复用直接指向原始执行证明，不允许任意继承链。PR 浏览器证明绑定其原始且已核实的构建；同树 main 可复用该源码覆盖，但仍需自己的真实 SHA 构建与冷烟测，原 PR 和 main 页脚字节无需相同。build、static-main 永远补跑。错误仓库、v1、失败/取消、过期、损坏、下载失败、策略/工具链/集合不符均执行所缺必要阶段，不能冒充通过。

收据放在独立 artifact，通过不可变 gate 引用和 manifest 摘要关联构建。最终 `ci-validation-evidence`、Pages 与 `deployed-site` 绑定同一快照；Release 校验准确 main 的外部 v2 gate、实际 test/deploy 与相同产物字节，再打包，流程见 [RELEASING](RELEASING.md)。日志明确区分当前执行与原始复用来源。

### 单次预算与实测时序

每个 CI/Deploy run 从 GitHub `run.created_at` 起共用30分钟，包含初始及阶段排队、同 run 的 rerun/attempt、命令、网络等待、聚合和 deploy 队列。命令运行中和响应/下载期间均受剩余预算约束，到期拒绝成功证明和发布；不能给每个阶段重新30分钟。诊断最多另用90秒，只保存失败证据。平台终止和进程清理可能有延迟，不承诺机器在物理30:00瞬间停止。

Release 自己的 run 也从其 `run.created_at` 计30分钟，下载并核对准确 main gate/产物，不能重建。完成事件触发的独立时序 workflow 使用 GitHub 已完成数据报告 wall、排队、全部 runner 分钟、最慢片和失败反馈；PR→main→deploy→Release 整链与各 run 分别记录。日常10分钟是实测目标，不能将最慢 job 或局部本地计时写成完整交付耗时。

### 后台完整检查

CI/Deploy 每日北京时间04:17（cron `17 20 * * *`，UTC）及手动 full 运行保留完整套件；手动 full 默认开启。nightly 和强制 full 禁用复用并强制 full/data，仍共享同一30分钟预算，真实失败需定位。这些事件不部署、不触发 Release。

## 7. 合并前要绿什么（摘要）

按变更范围做必要的本地检查和对应 CI。没有新修改、失败或未解决问题时不扩大测试范围，范围以已审计的消费者闭包为准；全局 Icon 改动按高风险 full 处理，不能按文案修改推定其影响。记录实际通过、跳过或中止的数量，不能将部分执行写成全量通过。

独立代理复核实际提交，界面核对受影响状态和四宽。当前 CI 的真实 test 可以记录经核实的复用证据；main 的真实 test/deploy 和上线结果仍须确认。空 statuses、只有 PR 绿灯或仅提交祖先关系不代表已验证部署。使用 release 分支时按同一证据规则处理，不为阶段名称重复全量。不得伪造结论、提高超时、增加重试或放宽产品断言。

### 异步数据就绪（#412）

标题可见只代表页面外壳已渲染。圣物页的数据分包未到时还没有来源 details，此时一次性展开操作会空转；稍后产生的 details 保持关闭，`toHaveCount(1)` 也不能证明内部链接可见。操作依赖数据的内容前，应等真实数据区/来源折叠区就绪，再展开并确认可见后点击。

加载回归用受控请求闸门覆盖这一顺序，先证明旧行为失败，再证明放行后真实内容可操作。不用固定 sleep、提高 timeout、自动 retry 或删除断言代替就绪条件。本地全量失败、单独复跑通过、受控延迟复现和远端整套结果须分别报告；既有竞态已成为 release CI 的真实失败时，应先修复再发布。

## 8. 局部跑和别的检查

- 单个文件：`npx playwright test tests/e2e/castleDefense242.spec.ts --reporter=line`，或 `npx vitest run tests/unit/v0270-acceptance.test.ts`。
- 本地 worker 参数按测试要求选择；受保护 golden 录制仍用 `--workers=1`。CI 的四 runner 与每片执行参数由冻结计划和 `ci-worker.mjs` 管理，不全局启用 `fullyParallel`。
- 分层边界：`npm run lint:layers -- --strict`（CI，#281，有违规即失败）。不带 `--strict` 只报告，退出码仍是 0。规则见 AGENTS.md「目录」。
- 入口 JS 的 gzip 上限在 `tests/e2e/v080-123.spec.ts`（#280，注释里有算法）。本文件不复制那个字节数。

### 搜索加载回归（#371）

`searchLoading371.spec.ts` 分别扣住搜索分包和单位数据分包，确认拦截命中后检查占位不是 `option`，再放行并等待真实结果。产品没有 `aria-busy`；按 v0.31.0 冻结范围，以受控请求及结果出现作为加载完成条件，不修改产品属性或原验收期望。别名随搜索依赖加载，没有独立的别名 HTTP 接口。

```bash
# 单 worker 确定性重复
npx playwright test tests/e2e/searchLoading371.spec.ts --workers=1 --repeat-each=3 --retries=0 --reporter=line
# 4 worker ×5 沿用 v0300-343 的加压规模；测试各用独立浏览器上下文
npx playwright test tests/e2e/searchLoading371.spec.ts tests/e2e/aliases.spec.ts --workers=4 --repeat-each=5 --retries=0 --reporter=line
```

证明测试灵敏度时，可在未提交的临时副本中恢复“只等任意 li”再立即读取结果，或把加载占位的 `role` 突变为 `option`。闸门仍关闭时应稳定失败，恢复测试/产物后应通过。故障副本不提交；保留实际失败和正常日志，不把人为故障当作当前产品故障。

### 文件规模与未使用导出（#288）

`npm run lint` 对全部 TS/TSX 的 500 行以上文件报警，对未列入固定存量基线的 600 行以上文件报错；计数包含空行与注释。`eslint.config.js` 的基线固定于本次改造前的提交，不会自动加入新文件。CSS 超过 800 行只报警，语法错误仍阻断。

`npm run unused:check` 使用固定版本 ts-prune 输出未使用导出；发现本身不阻断 CI，工具安装或执行故障仍失败。报告用于后续逐项核实，不应据此直接删除动态入口或测试导出。阈值与报告退出行为由 `tests/unit/fileSize288.test.ts` 保护。

### JSON 结构与公开来源（#285）

`npm run content:check` 从文件系统发现 `src/content`、`src/data` 中的全部 JSON（排除 schema 目录），按登记的明确结构检查，默认列出告警。`--strict` 对所有问题返回非零；#442 清理完全部 22 处旧来源展示后，CI 使用 `--strict`，当前 46 份原始输入必须零告警、零错误。

`scripts/content-baseline.mjs` 现在仅导出空冻结清单，不能再新增迁移豁免；兼容的 `--ratchet` 与严格模式具有相同阻断效果。开局与入门的原始来源证据保留，页面读取共享公开投影；独立 `node scripts/check-source-presentation.mjs` 再验证这 9 份输入对应的公开 DTO，拒绝内部定位、伪造或不一致的 pin、未知字段和坏链接。原编译器、登记表、公开格式 policy 与五个运行时边界保持不变。边界与归属规则见 [公开来源规格](design/source-presentation-442.md)，初始迁移过程见 [#285 规格](design/issue285-json-validation.md)。

来源 UI 的 CI 范围明确限定在两类页面、纯公开投影、独立 checker 和四份来源 schema。两份 raw schema 仅来源子树变化可走相关检查；步骤、卡片、其它结构、通用引擎、共享 policy、预编译校验器或未知文件变化仍走 full，原始数据或依赖变化仍 full/data。清空基线的例外要求整个文件精确等于空冻结导出；任何新增条目或其它代码仍 full。规则及反例由 `sourcePresentationScope442` 验证。

五处前端读取边界使用独立的预编译校验器。修改对应 schema 或共享格式后运行 `npm run content:validators`；`npm run content:validators -- --check` 验证生成结果可复现。不要手改 `src/content/schema/compiled`。相关单测为 `contentSchema285`、`contentSources285`、`generatedSchemas285`、`jsonBoundary285`、`sourcePolicy285`；体积继续由 `v080-123` 入口 gzip 和 `pageBudget282` 的施工冷加载预算保护。

### #364 Duel标题与共享展示闭包

`duel` profile覆盖标题语义、四宽明暗截图、URL/金标准、伤害/时代/回放/升级/费用/盈亏平衡的原有回归。仅 `src/shared/ui/sim/SimPanel.tsx` 和 `src/shared/ui/RealCost.tsx` 两个展示文件使用已核消费者的Duel、单位、建筑联合范围，并补共享默认标题合同检查；直接消费者新增时，`headingScope364` 的实际导入审计会失败，要求重新核对范围。其他shared文件、核心domain算式、全局CSS仍使用完整检查。

所有Duel局部CSS修改都要有前后源码证据：每个selector以 `#duel` 限定，不能有外部兄弟选择器、未限定的嵌套规则或全局at-rule；不满足则回退完整检查。#442既有source-only schema与内部字段检查保持。main/Release短烟测检查实际构建的Duel默认/展开/不可用/浮层和共享默认大纲；184对零容差视觉守恒的本地工具、固定两项页脚元数据归一化与真实基线复用说明见 [验证工具](design/duel-heading-364-visual/README.md)。
