# 测试指南 / TESTING

Kent 维护。给写测试、跑测试的人（含编码代理）看：目录、命令、四宽、axe、验收用例命名，以及 CI 何时跳过 Playwright。

合并时谁留 `ACCEPT @ <SHA>`、谁留「设计通过」，见 [CONTRIBUTING.md](../CONTRIBUTING.md)「开发和验收」和 [CODEX-MAINTENANCE.md](CODEX-MAINTENANCE.md) §3。本文件与 CONTRIBUTING 冲突时以 CONTRIBUTING 为准。

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

## 5. 验收用例（Kent）

Issue 里的验收标准，落成先失败的 Vitest 和/或 Playwright。Kent 写的这批文件名匹配 `v0*-acceptance*`，放在 `tests/unit/` 和 `tests/e2e/`。

**禁止修改** `tests/**/v0*-acceptance*` 里的期望值。和产品决定冲突时，在 issue 里写清楚冲突，等人决定，不改测试。

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

后来的 Kent 用例还有 `tests/unit/v0290-*.test.ts`、`tests/e2e/v0300-*.spec.ts` 这类，文件名不含 `acceptance`，不在上面这条 glob 里。改之前读该文件头（有的写明期望值只能由 Kent 重录）。

## 6. CI 何时跳过 Playwright

来源：`.github/workflows/ci.yml`（#375）和 [docs/RELEASING.md](RELEASING.md)。

只在 `pull_request` 上按路径判断。`dorny/paths-filter` 使用 `predicate-quantifier: every`。本次改动**全部**落在下面这些路径里，才跳过 `npx playwright test` 以及对应的产物上传：

- `.github/**`
- `docs/**`，但 **`docs/PATCH-NOTES/**` 除外**（补丁说明会进构建）
- `scripts/release.mjs`
- `scripts/check-pr-title.mjs`
- `tests/unit/release*.test.ts`

任一文件在白名单外，或改了 `docs/PATCH-NOTES/**`，就跑全量 e2e。

跳过 Playwright 测试时，CI 仍会 `npx playwright install --with-deps chromium`：发版单测会 `chromium.launch()`（`tests/unit/release108.test.ts`、`scripts/release.mjs`）。装浏览器不等于跑 `playwright test`。

下面这些不看路径，CI 里的 `npx playwright test` 全量都跑：

- push 到 `main` 或 `release/**`
- CI 工作流的 `workflow_dispatch`

Release 工作流（`.github/workflows/release.yml`，须从 `main` 手动调度）是另一条：安装 Chromium，`npm run release` 用 Playwright 核对线上页脚，再设 `BASE_URL=https://linhongcun.github.io/aoe2-analyzer/`，跑该文件里点名的一批 spec。`docs/RELEASING.md` 写「Release 工作流仍跑全量 Playwright」；跑哪些文件以 `release.yml` 里那条命令为准，它不是不带参数的 `npx playwright test`。

白名单 PR 若按 CONTRIBUTING 仍要 Kent `ACCEPT`，只等其余还在跑的门禁，不等被跳过的 Playwright。只改文档，或只改样式且不动逻辑和测试的 PR，CI 绿即可，不需要 Kent ACCEPT。`src/` 里的样式不在路径白名单中，Playwright 仍会跑；免 ACCEPT 和免 e2e 是两件事。

## 7. 合并前要绿什么（摘要）

本地习惯见 [AGENTS.md](../AGENTS.md)「合并前必须通过」：`npm run lint`、`npx tsc -p . --noEmit`、`npx vitest run`、`npm run build`、Playwright 全套。PR 描述里贴通过条数。CI 还跑 Python、`contrast.py`、`.dat` 可复现、开局数据等，以 `ci.yml` 为准。

只认 PR 上审查人本人留言，第一句是 `ACCEPT @ <SHA>` 或 `设计通过 @ <SHA>`。只改文档或只改样式不需要 Kent ACCEPT。细节在 [CONTRIBUTING.md](../CONTRIBUTING.md) 和 [CODEX-MAINTENANCE.md](CODEX-MAINTENANCE.md) §3，不在本文件。

## 8. 局部跑和别的检查

- 单个文件：`npx playwright test tests/e2e/castleDefense242.spec.ts --reporter=line`，或 `npx vitest run tests/unit/v0270-acceptance.test.ts`。
- `playwright.config.ts` 没有写 `workers`。现有注释里自己传的例子：`tests/e2e/v0290-322-golden.spec.ts` 录制时用 `--workers=1`。这里不另定并发数。
- 分层边界：`npm run lint:layers -- --strict`（CI，#281，有违规即失败）。不带 `--strict` 只报告，退出码仍是 0。规则见 AGENTS.md「目录」。
- 入口 JS 的 gzip 上限在 `tests/e2e/v080-123.spec.ts`（#280，注释里有算法）。本文件不复制那个字节数。
