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

窄屏可点区域的设计要求是不小于 **44×44**（MAINTENANCE §6、[体验设计接手指南](../role/experience-design.md)）。具体怎么量跟同页已有 spec：`castleDefense242.spec.ts` 量页内控件高度，`garrisonHealing229.spec.ts` 量宽和高，`editorial6.spec.ts` 用自己的 `undersizedMobileControls`。

## 4. axe

2026-11-10：axe 不是每 PR 门禁。只有这次改动直接涉及对比度或可访问性时，才对受影响区域抽查，不扫全站。需要时跟同页已有用例：

- 只查对比度：`.withRules(['color-contrast'])`。`editorial6.spec.ts` 扫整页；`garrisonHealing229.spec.ts` 先 `.include('[data-testid="garrison-healing-page"]')`。
- 一组 WCAG tag：`.include(...).withTags(['wcag2a', 'wcag2aa'])`，见 `castleDefense242.spec.ts`。有的页再加 `wcag21aa`（如 `mixedArmy241.spec.ts`）；有的 `analyze()` 不加 tag、不加 rule（如 `teamPlan243.spec.ts`）。

```ts
import AxeBuilder from '@axe-core/playwright';

const violations = (await new AxeBuilder({ page }).include('[data-testid="castle-defense-page"]').withTags(['wcag2a', 'wcag2aa']).analyze()).violations;
expect(violations).toEqual([]);
```

设计令牌对比度脚本是 `python3 scripts/contrast.py`。文字不小于 12px、可点区域不小于 44×44 属于设计规范，不因普通 PR 默认重跑，也不做成每 PR 的宽度矩阵。

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

2026-11-10 的每 PR 义务只有：必要冒烟，加上与本次 diff 直接相关的测试。纯布局不跑无关单测、数据再生成或 Python 数据测试。计算或数据只跑能核对这次结果的测试。#431 的「小改动不等长回归」仍然有效。

CI 由 `.github/workflows/` 下的两个验证工作流组成（Release 另见 [RELEASING](RELEASING.md)）：

| 工作流                  | 触发                                    | 内容                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ci.yml`（CI / Deploy） | 每个 PR、main push                      | `check`：安装依赖一次 → PR 标题检查 → `node scripts/ci-commands.mjs static`（lint、tsc、`content:check --strict`、`check-source-presentation`、`content:validators --check`、`lint:layers --strict`）→ `npm run build` → 安装 Chromium → `node scripts/ci-commands.mjs smoke`。main push 成功后 `deploy` 用 `actions/deploy-pages` 发布同一份 `dist`，并上传 `site` 产物供 Release 打包。PR 不部署。 |
| `full.yml`（CI full）   | 每日北京时间 02:30，或 Actions 手动触发 | 同样的 static，再加 `unused:check`、对比度、`introductions:check`、全部 Vitest、`node scripts/ci-commands.mjs data`（Python 测试、`.dat` 复现、生成数据与报告一致性、开局库校验）、构建和整站 Playwright。不部署，不触发 Release。                                                                                                                                                                   |

窄冒烟固定 7 条，由 `scripts/ci-scope.mjs` 的 `GATE_NARROW_SMOKE` 和 `BUILD_IDENTITY_TITLE` 定义、`ci-commands.mjs` 以 `--grep` 选出：`tests/e2e/smoke.spec.ts` 的首页、`#civs`、`#/civ/Franks`、`#unit/569` 无控制台错误，Ctrl+K 搜索，法兰克圣骑士满科技 192 HP；加 `tests/e2e/ciBuild659.spec.ts` 的构建身份（页脚版本与提交等于本次检出）。改这组用例的标题要同步改 `GATE_NARROW_SMOKE`。

默认门禁不随 diff 扩成 full，也不复用其他 run 的结果：每次 PR/main 都实跑 static、构建和窄冒烟。`scripts/ci-scope.mjs` 的 `planChanges` 仍保留 `maintenance` / `civ-ui` / `targeted` / `full` 分类，只供本地判断该补哪些直接相关测试和数据管线，不改变 CI 范围。

CI full 失败不阻塞 PR 合并，但须有人认领：定位真实失败，建 Issue 或修复，不提高超时、增加重试或放宽断言。#338 的 hash 与表格检查、24 条冷路由、四宽与明暗矩阵都只在 CI full 或本地排查时跑。

CI 钉的是 Node `20.19.5`，CI full 另钉 Python `3.12`。e2e 权重文件 `scripts/ci-browser-weights.json` 仍由 `lint:browser-weights` 要求覆盖每个 spec（新增 spec 要加一条权重），它不再用于分片。

## 7. 合并前要绿什么（摘要）

本地按文首 2026-11-10：必要冒烟和与本次改动直接相关的测试。没有新修改时不扩大范围。全局 Icon、共享样式不因此要求每 PR 跑 full。

报告写清三件事：本地实际命令和结果；这次 CI 的范围（默认：static、构建身份、7 条窄冒烟；CI full 另计）；没跑的宽度、主题、计算或数据。跳过、中止不要写成通过。

部署是否成功看 main 的真实 check、deploy 和线上结果。空 statuses、只有 PR 绿灯或仅提交祖先关系不算已部署。不得伪造结论、提高超时、增加重试，或放宽断言掩盖算错和数据错误。

### 异步数据就绪（#412）

标题可见只代表页面外壳已渲染。圣物页的数据分包未到时还没有来源 details，此时一次性展开操作会空转；稍后产生的 details 保持关闭，`toHaveCount(1)` 也不能证明内部链接可见。操作依赖数据的内容前，应等真实数据区/来源折叠区就绪，再展开并确认可见后点击。

加载回归用受控请求闸门覆盖这一顺序，先证明旧行为失败，再证明放行后真实内容可操作。不用固定 sleep、提高 timeout、自动 retry 或删除断言代替就绪条件。本地全量失败、单独复跑通过、受控延迟复现和远端整套结果须分别报告；既有竞态已成为 release CI 的真实失败时，应先修复再发布。

## 8. 局部跑和别的检查

下列命令和历史专项按需使用。其中「走 full」或「必须保留四宽」不再作为每 PR 门禁。

- 单个文件：`npx playwright test tests/e2e/castleDefense242.spec.ts --reporter=line`，或 `npx vitest run tests/unit/v0270-acceptance.test.ts`。
- 本地 worker 参数按测试要求选择；受保护 golden 录制仍用 `--workers=1`。CI 使用 `playwright.config` 默认 worker 数，不全局启用 `fullyParallel`。
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

`npm run content:check` 从文件系统发现 `data/content`、`data/game` 中的全部 JSON，按登记的明确结构检查，默认列出告警。`--strict` 对所有问题返回非零；#442 清理完全部 22 处旧来源展示后，CI 使用 `--strict`，当前 52 份原始输入必须零告警、零错误。

`scripts/content-baseline.mjs` 现在仅导出空冻结清单，不能再新增迁移豁免；兼容的 `--ratchet` 与严格模式具有相同阻断效果。开局与入门的原始来源证据保留，页面读取共享公开投影；独立 `node scripts/check-source-presentation.mjs` 再验证这 9 份输入对应的公开 DTO，拒绝内部定位、伪造或不一致的 pin、未知字段和坏链接。原编译器、登记表、公开格式 policy 与五个运行时边界保持不变。历史边界与初始迁移记录见[来源规格](https://github.com/linhongcun/aoe2-analyzer/blob/362f1ed7a7acebbecb08f43dfa04684828eba923/docs/design/source-presentation-442.md)和[#285 原始规格](https://github.com/linhongcun/aoe2-analyzer/blob/362f1ed7a7acebbecb08f43dfa04684828eba923/docs/design/issue285-json-validation.md)。

来源 UI 的检查笔记仍限定在两类页面、纯公开投影、独立 checker 和四份来源 schema。这些变化不自动变成每 PR 的 full 或 data。改到原始数据时只核对这次正确性。规则及反例由 `sourcePresentationScope442` 验证。

五处前端读取边界使用独立的预编译校验器。修改对应 schema 或共享格式后运行 `npm run content:validators`；`npm run content:validators -- --check` 验证生成结果可复现。不要手改 `src/content/schema/compiled`。相关单测为 `contentSchema285`、`contentSources285`、`generatedSchemas285`、`jsonBoundary285`、`sourcePolicy285`；体积继续由 `v080-123` 入口 gzip 和 `pageBudget282` 的施工冷加载预算保护。

### #364 Duel标题与共享展示闭包

`duel` 的旧笔记覆盖标题、URL、伤害、时代、回放、升级、费用和盈亏平衡。仅 `src/shared/ui/sim/SimPanel.tsx` 和 `src/shared/ui/RealCost.tsx` 两个展示文件使用已核消费者的 Duel、单位、建筑联合范围；直接消费者新增时，`headingScope364` 会要求重新核对范围。其他 shared 文件、核心 domain 算式、全局 CSS 不因此要求每 PR 跑完整检查。算式或数据有改动时只核对该结果。

Duel 局部 CSS 的选择器审计、#442 的 schema 检查，以及 184 对视觉守恒工具，都不是每 PR 门禁。历史审计见[基线原件](https://github.com/linhongcun/aoe2-analyzer/blob/362f1ed7a7acebbecb08f43dfa04684828eba923/docs/design/duel-heading-364-visual/README.md)。
