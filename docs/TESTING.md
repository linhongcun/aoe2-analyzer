# 测试指南 / TESTING

给写测试、跑测试的人（含编码代理）看：目录、命令、四宽、axe、验收用例命名，以及 CI 何时跳过 Playwright。

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

## 6. 按影响验证一次并复用证据

维护者在 #431 明确授权移除重复全量门禁。`scripts/ci-scope.mjs` 生成计划：`scope`、`features`、`unit`、`e2e`、`data` 和 `full`。`scripts/ci-run.mjs` 只执行计划中的相关测试；完整范围由 `full` 表示，不将空测试列表误写成全量通过。

| 范围          | 适用变化                                                    | 当前必要验证                                         |
| ------------- | ----------------------------------------------------------- | ---------------------------------------------------- |
| `maintenance` | 允许的文档、工作流与发布策略维护、仅版本号变化              | 静态检查、构建及相关 release 策略单测                |
| `civ-ui`      | 已有文明卡片与限定共享 CSS 范围                             | 相关文明筛选、卡片、目录和模拟器布局检查             |
| `targeted`    | 能可靠映射到功能的页面、局部样式、纯展示/路由辅助与相关测试 | 相关单测、页面交互和四宽明暗；组合变化取所需范围并集 |
| `full`        | 核心计算、依赖、共享基础设施、未知或不能可靠判断的范围      | 一次完整单测和浏览器验证；数据管线由 `data` 单独决定 |

例如补丁展示与 `domain/patches.ts` 运行补丁分组单测和补丁页检查；对局助手和轻量 `simRoute.ts` 运行路由/模拟器相关单测与对局页面检查。共享样式涉及多个页面时覆盖这些页面；共享基础设施或无法可靠映射的改动仍保守选择 full 一次。

`package.json` 和锁文件结构化比较，只有版本号变化才可按版本维护处理；依赖、脚本、锁定内容变化不能伪装成小 UI。生成数据、数据脚本、来源和确需再生成的依赖变化才开启 `data`；普通 UI 与未改数据的核心逻辑不反复再生所有数据。`docs/PATCH-NOTES/**` 是产品输入，不作为普通文档例外。

### release/main 结果复用

CI 用 `scripts/ci-evidence.mjs --find` 查找成功证据，在本次适用检查成功后用 `--record` 生成 `ci-validation-evidence`。证据包含实际 `tested_commit`、`tested_tree`、策略指纹、验证范围和来源 run。PR 默认 checkout merge ref，不能只把 run 的 PR head SHA 当成实际被测树。

只有 GitHub API 核实的同仓库 CI/Deploy 成功 run、实际成功 test、正确 artifact 归属、合法 push/PR merge 来源、相同代码树与策略，并且验证范围覆盖当前计划时，release/main 才复用。错误仓库、失败/取消、损坏产物、tree/策略不匹配或覆盖不足不能复用；没有有效证据时执行当前必要计划，不自动膨胀成额外整站回归。

日志和产物须区分实际执行与复用，保留原执行范围和来源；不把复用写成当前 SHA 重新跑过全套。main 仍重建真实 SHA 并做少量构建烟测，Pages 和 `deployed-site` 使用同一 dist。Release 只对经真实 main test/deploy 核实的准确 run 产物检查版本/SHA/tree/tag 和本次功能，直接打包该产物，不再默认执行 594 项线上检查或二次构建。

### 后台完整检查

CI/Deploy 每日北京时间 04:17（cron `17 20 * * *`，UTC）及手动 full 运行保留完整套件；手动 full 默认开启。nightly 和强制 full 关闭证据复用，强制 full/data，避免后台完整检查被旧成功结果跳过。这些事件不部署、不触发 Release。

普通 UI 发布以 5–10 分钟为目标，需记录实际耗时验证；不得把目标或部分执行报告为全量成功。

## 7. 合并前要绿什么（摘要）

按变更范围做必要的本地检查和对应 CI。没有新修改、失败或未解决问题时不扩大测试范围，不因简单图标或文案改动跑无关计算与全站静态扫描。记录实际通过、跳过或中止的数量，不能将部分执行写成全量通过。

独立代理复核实际提交，界面核对受影响状态和四宽。当前 CI 的真实 test 可以记录经核实的复用证据；main 的真实 test/deploy 和上线结果仍须确认。空 statuses、只有 PR 绿灯或仅提交祖先关系不代表已验证部署。使用 release 分支时按同一证据规则处理，不为阶段名称重复全量。不得伪造结论、提高超时、增加重试或放宽产品断言。

### 异步数据就绪（#412）

标题可见只代表页面外壳已渲染。圣物页的数据分包未到时还没有来源 details，此时一次性展开操作会空转；稍后产生的 details 保持关闭，`toHaveCount(1)` 也不能证明内部链接可见。操作依赖数据的内容前，应等真实数据区/来源折叠区就绪，再展开并确认可见后点击。

加载回归用受控请求闸门覆盖这一顺序，先证明旧行为失败，再证明放行后真实内容可操作。不用固定 sleep、提高 timeout、自动 retry 或删除断言代替就绪条件。本地全量失败、单独复跑通过、受控延迟复现和远端整套结果须分别报告；既有竞态已成为 release CI 的真实失败时，应先修复再发布。

## 8. 局部跑和别的检查

- 单个文件：`npx playwright test tests/e2e/castleDefense242.spec.ts --reporter=line`，或 `npx vitest run tests/unit/v0270-acceptance.test.ts`。
- `playwright.config.ts` 没有写 `workers`。现有注释里自己传的例子：`tests/e2e/v0290-322-golden.spec.ts` 录制时用 `--workers=1`。这里不另定并发数。
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

`npm run content:check` 从文件系统发现 `src/content`、`src/data` 中的全部 JSON（排除 schema 目录），按登记的明确结构检查，默认列出告警。`--strict` 对所有问题返回非零；CI 迁移期使用 `--ratchet`，只有冻结清单中的 22 处既有来源文案可以告警，任何新的文案、URL、结构、施工字典索引或未登记文件问题都会失败。

旧问题按文件、JSON Pointer 和原值指纹固定在 `scripts/content-baseline.mjs`，不得自动扩展；清理某条时同步删除条目，陈旧条目也会失败。旧来源展示由 #442 跟进，归属和许可需保留。清单清零后改用 `--strict`。策略及来源/内部证据的边界见 [规格](design/issue285-json-validation.md)。

五处前端读取边界使用独立的预编译校验器。修改对应 schema 或共享格式后运行 `npm run content:validators`；`npm run content:validators -- --check` 验证生成结果可复现。不要手改 `src/content/schema/compiled`。相关单测为 `contentSchema285`、`contentSources285`、`generatedSchemas285`、`jsonBoundary285`、`sourcePolicy285`；体积继续由 `v080-123` 入口 gzip 和 `pageBudget282` 的施工冷加载预算保护。
