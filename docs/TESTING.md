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

## 6. 按风险选择 CI 范围

维护者已明确要求测试辅助交付，不让简单 UI 修改等待整站回归。`scripts/ci-scope.mjs` 是共享判定入口，PR、release push 和 main push 使用同一规则；不能只优化 PR 后又在 main 重跑全套。

| 范围          | 适用变化                                                         | 检查                                                                                                                    |
| ------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `civ-ui`      | 文明列表展示、限定的文明卡样式、相应 e2e、普通文档及仅版本号变化 | lint、类型、分层、构建、对比度，以及 `civDlcFilters`、`civRequirements206`、`v0290-326`、`catalogLayout187`、`layout62` |
| `maintenance` | 允许的文档和发布流程维护                                         | 静态检查、构建与相关发布单元测试，不跑整站浏览器回归                                                                    |
| `full`        | 领域逻辑、游戏数据、依赖、未知或无法可靠确定的范围               | 原有完整单测、Python、数据再生成、完整 Playwright                                                                       |

`package.json` 和锁文件必须结构化比较，除了版本号之外的变化不能走小 UI 通道。共享 CSS 仅允许限定的文明卡规则和注释变化；其他全局样式变化退回完整验证。`docs/PATCH-NOTES/**` 会进入产品构建，不作为普通文档例外。

Release 只信任同仓库、已通过的 main CI 范围产物，并核对准确 head SHA；缺失或不符时完整验证。`civ-ui` 上线后仅检查文明筛选、卡片/模拟器布局，保留实际页脚版本、构建、tag 和附件验证。

## 7. 合并前要绿什么（摘要）

按变更范围做必要的本地检查和对应 CI。没有新修改、失败或未解决问题时不扩大测试范围，不因简单图标或文案改动跑无关计算与全站静态扫描。记录实际通过、跳过或中止的数量，不能将部分执行写成全量通过。

独立代理复核实际提交，界面核对受影响状态和四宽。最终 release 头部及 main 的真实 test/deploy 检查仍须成功；空 statuses 或只列 PR 的查询不代表绿灯。不得伪造结论、提高超时、增加重试或放宽产品断言。

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
