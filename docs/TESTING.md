# 测试指南 / TESTING

给写测试、跑测试的人（含编码代理）看。目录和命令仍在下面。审阅、发布和产品范围不在本文改写，仍以 [CONTRIBUTING.md](../CONTRIBUTING.md) 为准。

**2026-11-10（优先于下文，以及 AGENTS / CONTRIBUTING / MAINTENANCE 里冲突的测试门禁）**：Kent 只确认这次改动的功能是否正常。本站仅自己使用，历史包袱小，允许重构并接受回归。旧布局、旧入口、旧链接协议、重复功能不必兼容；有意合并、替代或删除不算 bug。每份 PR 只做必要冒烟，加上与本次 diff 直接相关的测试。纯布局不重跑无关计算或数据测试。不把全站、全尺寸、全主题矩阵设为每 PR 门禁。改到计算或数据时，只核对该改动的正确性。报告分开写实际执行、CI 实际范围、未验证项；没跑的不要写成通过。

CI 的当前执行范围以本节和仓库工作流为准。设计文档里的宽度或截图要求不自动变成测试门禁。

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

2026-11-10：360 / 375 / 390 / 1280 和明暗主题不是每 PR 门禁，也不做全站矩阵。只有这次改动本身要核对某一宽度或主题上的功能时，才查受影响页面。下面是既有写法，按需使用，不是清单。

`garrisonHealing229.spec.ts`、`castleDefense242.spec.ts` 的常见形状：`beforeEach` 收集 `pageerror`，以及 `console` 里 `type === 'error'` 的文本；`afterEach` 断言这份列表为 `[]`，并检查

```ts
expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
```

宽度用 `await page.setViewportSize({ width, height: 900 })`，经常和 `light` / `dark` 套两层循环。`editorial6.spec.ts` 在每次 `goto` 之后当场查溢出和错误。`afterEach` 只能看到用例结束时留下的那一页，中途换路由要在循环里查。

窄屏可点区域的设计要求是不小于 **44×44**（MAINTENANCE §6、[docs/design/DESIGN-SYSTEM.md](design/DESIGN-SYSTEM.md)）。具体怎么量跟同页已有 spec：`castleDefense242.spec.ts` 量页内控件高度，`garrisonHealing229.spec.ts` 量宽和高，`editorial6.spec.ts` 用自己的 `undersizedMobileControls`。

## 4. axe

2026-11-10：axe 不是每 PR 门禁。只有这次改动直接涉及对比度或可访问性时，才对受影响区域抽查，不扫全站。需要时跟同页已有用例：

- 只查对比度：`.withRules(['color-contrast'])`。`editorial6.spec.ts` 扫整页；`garrisonHealing229.spec.ts` 先 `.include('[data-testid="garrison-healing-page"]')`。
- 一组 WCAG tag：`.include(...).withTags(['wcag2a', 'wcag2aa'])`，见 `castleDefense242.spec.ts`。有的页再加 `wcag21aa`（如 `mixedArmy241.spec.ts`）；有的 `analyze()` 不加 tag、不加 rule（如 `teamPlan243.spec.ts`）。

```ts
import AxeBuilder from '@axe-core/playwright';

const violations = (await new AxeBuilder({ page }).include('[data-testid="castle-defense-page"]').withTags(['wcag2a', 'wcag2aa']).analyze()).violations;
expect(violations).toEqual([]);
```

设计令牌对比度脚本是 `python3 docs/design/contrast.py`。文字不小于 12px、可点区域不小于 44×44 属于设计规范，不因普通 PR 默认重跑，也不做成每 PR 的宽度矩阵。

## 5. 功能是否正常

Kent 只确认这次改动的功能是否正常，用与 diff 直接相关的 Vitest 或 Playwright 即可。不要求先开仍红的验收 PR，也不把验收矩阵或签字当作测试门禁。

`tests/**/v0*-acceptance*` 以及后来文件名不含 `acceptance` 的 `v0290-*`、`v0300-*` 等，是历史快照，不是兼容合同。改动有意换掉旧布局、入口、链接或重复功能时，把对应用例改成新行为或删掉；这种失败不判 bug，也不为保住旧期望把旧界面加回来。计算或数据改动仍要核对该结果；不得用删断言、跳过或放宽期望掩盖算错或数据错误。

当前 `main` 上文件名匹配 `v0*-acceptance*` 的如下（只说明命名，不把其中任一版写成「现网版本」；版本号以 `package.json` 和页脚为准）：

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

后来的历史用例还有 `tests/unit/v0290-*.test.ts`、`tests/e2e/v0300-*.spec.ts` 这类。改之前读该文件头。期望值按上一段处理。

### 编码代理交接

给编码代理执行者的写法。这不是新的 CI 门禁。测试范围以文首 2026-11-10 为准，不把第 3、4、6 节的旧四宽、axe 和风险表当作每 PR 义务。

**先看功能是否正常。** 不要求先交一份仍红的测试 PR，再折进实现。#620 / #622 的先红流程只作历史，不再沿用。

**Relates 与 Fixes。** 维护者已授权已部署 issue 可直接关闭，见 [2026-11-03持续关闭授权](../CONTRIBUTING.md#已部署-issue-的持续关闭授权2026-11-03)。网站实现 PR 正文使用 `Relates #N`，避免合入时提前关闭；完成实际 Pages 部署、线上核对和正式 Release 后，执行者主动关闭已完成范围的 issue，无需额外产品走查或具名人员决定。合入即完成、无需网站交付的工程或文档事项可使用 `Fixes #N`。合到非默认分支不会自动关 issue。这是选关键词的约定，不是 CI 检查项。#622 的旧 `Relates #571` 走查交接作为历史保留。

**怎样算正常。** 能说明这次功能怎样算正常即可。不要求每条都写宽度、全状态和数据矩阵；写不出矩阵不构成不能开工。计算或数据改动仍核对这次结果，数字从数据文件读，不凭记忆。产品范围、待确认和阻塞仍按 [MAINTENANCE](MAINTENANCE.md) 的非测试条款处理。

<a id="6-按影响验证一次并复用证据"></a>
<a id="ci-659-validation"></a>

## 6. 每 PR 跑什么，以及 CI 实际覆盖

2026-11-10 的每 PR 义务只有：必要冒烟，加上与本次 diff 直接相关的测试。纯布局不跑无关单测、数据再生成或 Python 数据测试。计算或数据只跑能核对这次结果的测试。全站、四宽、明暗、axe、完整单测和 data 不是每 PR 门禁，也不是普通 PR 的合并条件。

普通 PR 与 main push 的实际门禁由工作流执行；当前范围为 static、真实 SHA 构建和 Chromium 单分片窄冒烟，main 聚合成功后才上传 deployed-site 并部署。多分片、24 路由、axe、全量单测和 data 属于手动 full，不是默认部署门槛。下表只供手动 full 或本地排查对照。

#431 的「小改动不等长回归」仍然有效。#659 的历史冻结规格与实验记录见[基线原件](https://github.com/linhongcun/aoe2-analyzer/blob/362f1ed7a7acebbecb08f43dfa04684828eba923/docs/design/ci-659.md)；当前执行范围以本节和工作流为准。

`scripts/ci-scope.mjs` 仍会生成 `scope`、`features`、`unit`、`e2e`、`data`、`full` 与浏览器计划；`ci-stage.mjs` 在手动 full 时冻结精确检查 ID、文件和 case 集合。手动 full 若声称跑了完整范围，须有真实执行证明，不能用空列表或文件请求列表代替。这不是每 PR 要跑 full。

| 范围          | 适用变化                                                            | 只在手动 full 或本地排查时                                                  |
| ------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `maintenance` | 普通文档、仅项目版本号变化                                          | 必要冒烟；不扩成计算或数据                                                  |
| `civ-ui`      | 已审计的文明页面及限定 CSS                                          | 受影响页面的必要冒烟；四宽和主题仅在这次要核对它们时                        |
| `targeted`    | 已证明完整消费者闭包的功能页面、辅助文件及相关测试                  | 与 diff 直接相关的测试；不取全站并集                                        |
| `full`        | 公共计算、全局 CSS/tokens、路由、共享壳层、未知范围、依赖、策略自身 | 仅手动 full，不是每 PR 门禁。计算或数据只核对该次结果；纯布局不重生未变数据 |

上表和旧的消费者闭包（未证明闭包则 full、全局 CSS、Layout/Icon/PageMeta、功能自己的四宽主题必须保留）都不再扩大每 PR 的测试。默认 CI 不会因 diff 打开 data 或四片浏览器。`CI_E2E_FULL=false` 不能把默认 CI 实际会跑的窄冒烟说成没跑。

### 并行阶段、同一构建与严格聚合

核心 static 包含 lint、类型、严格内容/公开来源/预编译校验器和严格分层。默认不跑 static-main、unit 或 data。手动 full 才把 unused、contrast 与必要 introductions 放进 static-main，并跑全部单测和 data。build 每次实际构建当前 SHA。默认构建烟测只核对页脚版本和 HEAD；24 路由冷启动只在 full。build 与 static-main 均不可复用。默认 `browser-1` 也不可复用，必须对着本次构建执行。

手动 full 的浏览器固定四个 runner。默认门禁固定 1 片，不把窄冒烟拆成矩阵，也不把 24 路由加回默认。按历史实测时长加权 LPT 分配仍只用于 full；缺少历史时明确使用保守权重，不能将文件数平均或原生 shard 当作性能保证。保留 default/serial 组原子性，不全局启用 `fullyParallel`。每片先核对精确 case 选择，所有本次实际分片只消费同一不可变 build snapshot，不能各自构建或在浏览器后向 dist 写收据。

最终 `test` 核对本次计划内各阶段的真实成功结果、精确 case 并集和交集、允许的既有 skip、数据结果与构建身份。失败、取消、超时、缺片、重复/漏 case、非预期跳过和错构建均阻断证明与 deploy。文件检查、软链接拒绝和无匹配失败继续有效。full 的 24 路由新构建 smoke 不因源码测试复用而省略；默认窄冒烟本身不可复用。

#338 的 hash 与表格检查留在手动 full，不回默认门禁。有意替换旧布局或旧表时，更新或去掉对应 golden 不算放水；不能用改 golden 掩盖计算或数据错误。

### PR 到 main 的 v2 阶段复用

只接受 `ci-stage-evidence.mjs` 验证的 v2 原始执行证明；v1 一律拒绝，不能补字段升级。来源必须是经 GitHub API 核实的同仓库成功 run/attempt/真实数字 job 与所属 artifact；匹配实际 tested tree、策略与工具链指纹、精确检查/文件/case 集合、合法 PR merge/push 来源、artifact 大小/摘要/时间窗口。不能只看 artifact 名、PR head SHA、祖先关系或符号 `GITHUB_JOB`。

复用直接指向原始执行证明，不允许任意继承链。PR 浏览器证明绑定其原始且已核实的构建；同树 main 可复用该源码覆盖，但仍需自己的真实 SHA 构建与冷烟测，原 PR 和 main 页脚字节无需相同。build、static-main 永远补跑。错误仓库、v1、失败/取消、过期、损坏、下载失败、策略/工具链/集合不符均执行所缺必要阶段，不能冒充通过。

收据放在独立 artifact，通过不可变 gate 引用和 manifest 摘要关联构建。最终 `ci-validation-evidence`、Pages 与 `deployed-site` 绑定同一快照；Release 校验准确 main 的外部 v2 gate、实际 test/deploy 与相同产物字节，再打包，流程见 [RELEASING](RELEASING.md)。日志明确区分当前执行与原始复用来源。

### 单次预算与实测时序

每个 CI/Deploy run 从 GitHub `run.created_at` 起共用30分钟，包含初始及阶段排队、同 run 的 rerun/attempt、命令、网络等待、聚合和 deploy 队列。命令运行中和响应/下载期间均受剩余预算约束，到期拒绝成功证明和发布；不能给每个阶段重新30分钟。诊断最多另用90秒，只保存失败证据。平台终止和进程清理可能有延迟，不承诺机器在物理30:00瞬间停止。

Release 自己的 run 也从其 `run.created_at` 计30分钟，下载并核对准确 main gate/产物，不能重建。完成事件触发的独立时序 workflow 使用 GitHub 已完成数据报告 wall、排队、全部 runner 分钟、最慢片和失败反馈；PR→main→deploy→Release 整链与各 run 分别记录。日常10分钟是实测目标，不能将最慢 job 或局部本地计时写成完整交付耗时。

### 后台完整检查

CI/Deploy 不再有日更 schedule。手动 full（`workflow_dispatch`，`full` 默认 true）保留完整套件，禁用复用并强制 full/data，仍共享同一30分钟预算，真实失败需定位。该次运行不部署、不触发 Release。

## 7. 合并前要绿什么（摘要）

本地按文首 2026-11-10：必要冒烟和与本次改动直接相关的测试。没有新修改时不扩大范围。全局 Icon、共享样式不因此要求每 PR 跑 full。

报告写清三件事：本地实际命令和结果；这次 CI 的范围（默认 #749：static、构建身份、单分片窄冒烟；手动 full 另计）；没跑的宽度、主题、计算或数据。跳过、复用、中止不要写成通过。

部署是否成功看 main 的真实 test、deploy 和线上结果。空 statuses、只有 PR 绿灯或仅提交祖先关系不算已部署。不得伪造结论、提高超时、增加重试，或放宽断言掩盖算错和数据错误。

### 异步数据就绪（#412）

标题可见只代表页面外壳已渲染。圣物页的数据分包未到时还没有来源 details，此时一次性展开操作会空转；稍后产生的 details 保持关闭，`toHaveCount(1)` 也不能证明内部链接可见。操作依赖数据的内容前，应等真实数据区/来源折叠区就绪，再展开并确认可见后点击。

加载回归用受控请求闸门覆盖这一顺序，先证明旧行为失败，再证明放行后真实内容可操作。不用固定 sleep、提高 timeout、自动 retry 或删除断言代替就绪条件。本地全量失败、单独复跑通过、受控延迟复现和远端整套结果须分别报告；既有竞态已成为 release CI 的真实失败时，应先修复再发布。

## 8. 局部跑和别的检查

下列命令和历史专项按需使用。其中「走 full」或「必须保留四宽」不再作为每 PR 门禁。

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

`scripts/content-baseline.mjs` 现在仅导出空冻结清单，不能再新增迁移豁免；兼容的 `--ratchet` 与严格模式具有相同阻断效果。开局与入门的原始来源证据保留，页面读取共享公开投影；独立 `node scripts/check-source-presentation.mjs` 再验证这 9 份输入对应的公开 DTO，拒绝内部定位、伪造或不一致的 pin、未知字段和坏链接。原编译器、登记表、公开格式 policy 与五个运行时边界保持不变。历史边界与初始迁移记录见[来源规格](https://github.com/linhongcun/aoe2-analyzer/blob/362f1ed7a7acebbecb08f43dfa04684828eba923/docs/design/source-presentation-442.md)和[#285 原始规格](https://github.com/linhongcun/aoe2-analyzer/blob/362f1ed7a7acebbecb08f43dfa04684828eba923/docs/design/issue285-json-validation.md)。

来源 UI 的检查笔记仍限定在两类页面、纯公开投影、独立 checker 和四份来源 schema。这些变化不自动变成每 PR 的 full 或 data。改到原始数据时只核对这次正确性。规则及反例由 `sourcePresentationScope442` 验证。

五处前端读取边界使用独立的预编译校验器。修改对应 schema 或共享格式后运行 `npm run content:validators`；`npm run content:validators -- --check` 验证生成结果可复现。不要手改 `src/content/schema/compiled`。相关单测为 `contentSchema285`、`contentSources285`、`generatedSchemas285`、`jsonBoundary285`、`sourcePolicy285`；体积继续由 `v080-123` 入口 gzip 和 `pageBudget282` 的施工冷加载预算保护。

### #364 Duel标题与共享展示闭包

`duel` 的旧笔记覆盖标题、URL、伤害、时代、回放、升级、费用和盈亏平衡。仅 `src/shared/ui/sim/SimPanel.tsx` 和 `src/shared/ui/RealCost.tsx` 两个展示文件使用已核消费者的 Duel、单位、建筑联合范围；直接消费者新增时，`headingScope364` 会要求重新核对范围。其他 shared 文件、核心 domain 算式、全局 CSS 不因此要求每 PR 跑完整检查。算式或数据有改动时只核对该结果。

Duel 局部 CSS 的选择器审计、#442 的 schema 检查，以及 184 对视觉守恒工具，都不是每 PR 门禁。历史审计见[基线原件](https://github.com/linhongcun/aoe2-analyzer/blob/362f1ed7a7acebbecb08f43dfa04684828eba923/docs/design/duel-heading-364-visual/README.md)。
