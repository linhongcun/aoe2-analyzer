# Codex 维护纪律 / CODEX-MAINTENANCE

给 Codex（及同类无人值守编码代理）用的维护纪律。人类与角色代理仍以 [CONTRIBUTING.md](../CONTRIBUTING.md) 为准；本文件与 CONTRIBUTING / [AGENTS.md](../AGENTS.md) 冲突时，以 CONTRIBUTING 为准，并在 issue 里指出。

入口：先读 AGENTS.md → 本文件 → 要做的那条 issue。

已记录的维护者授权优先于本文件的默认限制。当前项目的[持续发布授权](../CONTRIBUTING.md#维护者的持续发布授权2026-10-24)要求：已授权更新完成适用审查和测试后直接完成上线，不再逐次询问发布。现行审阅流程按 [持续审阅授权](../CONTRIBUTING.md#维护者的持续审阅授权2026-10-25) 执行；#431 已授权一次适用验证、可信证据复用和后台全量，现行验证规则见 [验证投入](../CONTRIBUTING.md#按改动风险控制验证投入2026-10-25)。范围、Hold 和测试保护继续有效。

## 1. 产品主题（是什么 / 不是什么）

**是什么**：帝国时代 II 决定版（AoE2 DE）的**中文资料站 + 计算工具**——文明/单位/科技/建筑百科、科技树与加成，以及对比、对局助手、模拟器、单位 PK、开局、市场预算等可分享的计算页。线上：https://linhongcun.github.io/aoe2-analyzer/。界面文字全部简体中文。数据版本以页脚与 `scripts/data_sources.json` 为准。

**不是什么**：

- **不编造游戏数值。** 数字只从生成数据与固定 `.dat` 派生结果读；记忆、旧帖、猜测一律不算。issue / 设计稿 / 测试与数据冲突时，以数据为准并在 issue 说明。
- **不做无关大功能。** 不做实时读盘、账号系统、自动推荐最优策略、改游戏平衡、爬站批量抓内容、自建天梯后端等偏离「资料 + 计算」主题的扩展，除非维护者在 issue 里明确授权并写入范围。
- **不做未授权的批量集成。** 一个 issue 一个实现 PR，按批准顺序串行；不得伪造他人审阅结论。是否合并、发布按维护者已记录的授权执行，不能把持续发布授权解释成自动领取所有 issue。

## 2. 工作节奏

1. **一次只认领 1 个 issue**（一个执行者、一个 PR）。
2. **同时在审的 PR ≤ 2**（含别人的）。审阅位满时只准备草稿，不新开 PR。
3. 当前 PR **合完再拿下一个**；不要并行囤积分支等合。
4. 开 PR 前先查该 issue 是否已有 open PR，有则跳过。
5. 普通已授权更新默认一个 issue、一个 PR 直接对最新 main；仅需要多项冻结集成时使用 `release/vX.Y.Z` 并更新到其最新提交。

## 3. 门禁（对齐 CONTRIBUTING）

维护者已授权采用**实现者之外的独立代理复核＋按风险选择的 CI**作为现行默认，不再以指定人员签字为前置条件：

- 执行者准备实现、规格、失败用例和验证证据；独立代理核对验收标准、改动范围、代码、测试与数据来源，界面改动同时核对设计规格及四宽。
- 在 PR 中记录**实际验证的提交 SHA、复核范围、结果和未解决问题**。不得由实现者代写独立复核结果，存在未解决问题时不得宣称通过；需要产品决定的交维护者明确授权。
- CI 按功能影响生成 maintenance/civ-ui/targeted/full 计划，每份代码做一次必要验证。小 UI 不运行未变计算、数据再生成或无关整站回归；release/main 仅在同仓库真实成功来源、代码树、策略和覆盖范围匹配时复用证据。缺证据执行当前必要计划，不为阶段名称额外重跑全量，详见 [TESTING](TESTING.md)。
- 只改文档或只改样式（不动逻辑和测试）的 PR：CI 绿即可采用轻量审阅规则。轻量审阅仍须通过对应范围的 CI，不要求额外整站全量。
- **不得伪造他人结论、删除分支、修改仓库权限或放宽测试。** 没有合并/发布授权时不执行相应动作；本项目已记录的授权范围内，完成适用门禁后按顺序集成并发布。
- rebase 后若 `git range-diff` 证明自身改动不变，可沿用相应独立复核并记录新旧 SHA。当前 CI 仍核实实际代码树、策略与范围；不足时补当前必要验证，不无条件冒用旧 run，也不机械重复相同验收。

## 4. Hold 表（勿开）

当前没有暂停条目。#372 仅按本轮明确的两条预置授权解除，不代表自动认领其它候选。

更新 hold 列表或解 hold **必须** 获得维护者明确授权，代理不得自行开 hold 上的 issue。审阅流程变更本身不解除 Hold。

#364 已由维护者 2026-10-26 对当时两条 bug 的定向修复请求纳入本轮，具体原话、范围与记录见 [CONTRIBUTING](../CONTRIBUTING.md#364-标题层级定向修复授权2026-10-26)。#372 当时保持 Hold；随后维护者已对两条明确预置回复“嗯，解除暂停，实施吧”，本轮具体解除记录见 [CONTRIBUTING](../CONTRIBUTING.md#372-两条预置定向解除暂停2026-10-26)和 [issue授权](https://github.com/linhongcun/aoe2-analyzer/issues/372#issuecomment-6411790420)。历史授权记录保留。

## 5. 跳过（不要开工）

遇到下列任一情况，**跳过**该 issue：

- 标签 **`待确认`** 或 **`阻塞`**
- 该 issue **已有 open PR**
- 在上方 **Hold 表** 中
- 正文缺少可测的 **「验收标准」**，或缺少 **「不要做」/「不在范围」**，且无法在已授权范围内补齐；执行者可先补齐规格并交独立代理复核，不得自行发明产品范围
- 标题形如「待村长确认」的版本范围

## 6. 设计硬规则（摘要）

完整规范见 [docs/design/DESIGN-SYSTEM.md](design/DESIGN-SYSTEM.md) 与 [docs/design/README.md](design/README.md)（`ERRATA.md` 优先于 SPEC）。

- **图标**：只用 Lucide，经 `src/shared/ui/Icon.tsx` 的 `ICONS` 登记后 `<Icon name="..." />`；禁止 emoji / Unicode 符号当图标（ESLint 会拦）；游戏美术图标除外。
- **颜色**：只用 `src/shared/styles/tokens.css` 设计令牌；`npm run lint:colors`。
- **无障碍**：文字对比度 WCAG AA；可点区域 ≥ **44×44**；文字不小于 12px。
- **数字不换行**：数值与「数字+单位」用 **`.num`**（等宽数字）与/或 **`.nw`**（`white-space: nowrap`）包住，360 宽也不能折行。
- **四宽截图**：界面 PR 附 **360 / 375 / 390 / 1280**，无横向滚动、无 console error / pageerror。
- **中文 UI**：文案与相邻页面一致；新增页面先改 `pageRegistry`，分组见 [ARCHITECTURE](ARCHITECTURE.md)「页面登记表」。

## 7. 测试规则

- **未经维护者明确授权，禁止修改** `tests/**/v0*-acceptance*` 及其他受保护验收用例的期望值。与产品决定冲突时在 issue 写清冲突，交维护者决定；获授权的修改须独立复核，不得通过放宽期望凑绿，也不要求指定历史作者重录。
- 改领域逻辑补 `tests/unit/`；修 bug 先写能复现的失败用例。
- e2e 命令、端口、并行 worktree、BASE_URL、四宽、axe 与 CI 跳过条件，见 [docs/TESTING.md](TESTING.md)。

### 壳层 PR 的有界验证（#513）

`scripts/ci-scope.mjs` 的壳层白名单是这三个精确路径：`src/app/Layout.tsx`、`src/shared/ui/Icon.tsx`、`src/shared/styles/editorial-shell.css`。仅改这些文件，可附普通文档、CHANGELOG 和仅版本号变更，PR 使用 `targeted`：单测 `nav`、`theme6`、`pageRegistry283`；浏览器固定 6 个 spec：`smoke`、`navigation272`、`editorial6`、`skipLink294`、`searchLoading395`、`feedbackTap295`。覆盖基础页面、首页入口、导航/主题/搜索焦点、跳过导航和页脚，并保留这些用例原有的四宽及明暗主题断言。`FeedbackLink.tsx` 与 `src/shared/utils/feedback.ts` 使用同一套 shell 浏览器检查，并额外跑 `feedback` 单测（#514）。

| 事件 / 混合改动                       | 验证计划                                                     |
| ------------------------------------- | ------------------------------------------------------------ |
| 仅壳层白名单的 PR                     | `targeted`，6 个浏览器 spec，不生成数据                      |
| 壳层 + 已映射功能                     | 两者测试取并集、去重；6 个 spec 上限只针对纯壳层             |
| 包含壳层的 `main` / `release/**` push | 保留此前的 `full` 单测和浏览器回归；不因壳层改动生成未变数据 |
| nightly / `CI_FULL=true`              | `full` + 数据检查，禁用证据复用                              |
| 仅普通文档 / CI 维护                  | 保持既有短路径；其他功能的 #431 计划与复用规则不变           |

未审计的 `src/app/**`、`src/shared/**`、路由登记、设计令牌和计算逻辑仍可触发 `full`，不能将整个 shared 目录视为壳层。例如 `src/domain/realCost.ts` 仍是 `full`（完整单测；main/nightly 仍跑完整浏览器）。#512 的原始完整 diff 含此文件，不能宣称其全部改动会因壳层白名单转为 targeted。`pull_request` 上这类 full 计划不再跑约 189 个浏览器 spec，见下一节。`src/data/**`、数据生成脚本/来源、非仅版本号的依赖或锁文件变更仍保留 `full + data`。显式完整验证和未知提交范围也不降级。PR 的壳层 targeted 证据，以及只跑了 smoke 的 full 计划，都不能冒充 main/release 的完整浏览器成功。

### PR 浏览器上限（#514）

`pull_request` 永远不跑完整 Playwright。`scope=full` 时单测、内容、分层和 `data` 仍按原计划；浏览器改为：

- 部署烟测（`scripts/deployment-smoke.mjs`；该事件去掉 feature `all` 的长巡游，只留首页/页脚和已识别功能）
- 核心包 `tests/e2e/smoke.spec.ts`
- diff 里已经映射到 `PROFILES` 的功能 e2e

识别不到功能时，浏览器只有部署烟测和 `smoke.spec.ts`。`CI_E2E_FULL` 由 `.github/workflows/ci.yml` 设置，`pull_request` 恒为 `false`；`scripts/ci-scope.mjs` 的 `applyBrowserPolicy` 与 `scripts/ci-run.mjs` 都认这个事件，不能靠把 `CI_E2E_FULL=true` 写进 PR 环境把整套 e2e 加回来。

### PR capped 黑名单（Kent §C，#538 / #514）

下面这些 spec **不删除**，main / nightly / `CI_E2E_FULL` 仍会跑到。它们只是不能进入 pull_request 的 `capped` 列表，哪怕 `ci-scope` 给出 `full`，或某个宽 profile 本来选中了它们：

| 模式 | PR capped |
| --- | --- |
| `v0300-338` | 始终排除 |
| `screenshots`、`stepContrast`、`overflow64`、`cardWrap*`、`mobile361-359-366`、`touchTargets481` | 始终排除（四宽×双主题 / 截图 / 触控守卫；壳层那 6 个 spec 仍跑） |
| `*197`、`finalCivs197`、`civDlcFilters` | 不跑整张文明矩阵。只改一个文明时，可以留下该文明自己的 `*197` spec |
| `build41`、`rush35`、`rushGeneric507`、`timeline*` | 本 PR 不是该功能时排除 |

`src/shared/nav/pageRegistry.ts`、`src/app/pageRegistry.tsx` 和 `src/shared/styles/` 下的共享 CSS 仍可让单测保持 `full`。PR 浏览器最多是 `smoke.spec.ts` 加上 diff 里真正改到的功能，不会把上表守卫带进来。

`pull_request` 且 `browser=false` 时不跑 Playwright e2e，构建跳过 OG 截图，短部署烟测也不跑。若 Affected unit 会启动 Chromium（`release108`、`releaseSmoke`，含 maintenance 的 `tests/unit/release*.test.ts`），仍用与 e2e 相同的 `npx playwright install --with-deps chromium` 装上 `chromium_headless_shell`；没有这类单测则不安装。证据复用跳过 unit 时也不为这条路径安装。main 推送仍安装 chromium，以便生成 OG 并部署。`unused:check`、`introductions:check` 和 `docs/design/contrast.py` 只在 main / 夜间 / 手动运行，不挡 PR。

| 事件                                                                 | 浏览器                                                 |
| -------------------------------------------------------------------- | ------------------------------------------------------ |
| `pull_request`                                                       | smoke + 已识别功能；无功能则 smoke。不跑约 189 个 spec |
| `push` 到 `main` / `release/**`，且计划为 `full`（含壳层 push 提升） | 完整 Playwright                                        |
| `schedule` 夜间、`workflow_dispatch` 且 `inputs.full` / `CI_FULL`    | 完整 Playwright，并做数据检查、禁用证据复用            |
| 已映射的 targeted / civ-ui / maintenance                             | 原文件列表。main 的 maintenance 仍短烟测；PR 且 browser=false 不跑 e2e/OG/短烟测。会启动 Chromium 的 unit 仍安装浏览器 |

手动 `workflow_dispatch` 即使关掉 `inputs.full`，事件也没有 PR/push 基线，路径计划仍是 full，且 `CI_E2E_FULL` 为 true，浏览器同样是完整套件。浏览器限流只发生在 `pull_request`。

已审计、只影响展示的路径不再标成 `full`（计算、令牌、路由、`realCost.ts`、`widgets.tsx`、`layout.tsx` 等仍会）：

| 路径                                                             | 计划                          |
| ---------------------------------------------------------------- | ----------------------------- |
| `Layout.tsx`、`Icon.tsx`、`editorial-shell.css`                  | `shell`（#513，6 个 spec）    |
| `FeedbackLink.tsx`、`src/shared/utils/feedback.ts`               | `shell`，并加 `feedback` 单测 |
| `formatTime.ts`                                                  | `clock`                       |
| `dupNames.ts`                                                    | `names`                       |
| `linker.ts`                                                      | `links`                       |
| `sharePage.ts`、`ShareImage.tsx`                                 | `share`                       |
| `glossary.ts` 与 `src/features/glossary/`、`src/features/share/` | `glossary` / `share`          |

证据里的 `browser:"capped"` 不能覆盖以后的 `browser:"full"`。main 不会把一次只跑了 smoke 的 PR 当成完整浏览器已通过。

本地看 PR 会真正执行的浏览器列表（`planRange` 本身不含事件上限）：

```bash
node --input-type=module <<'NODE'
import { execFileSync } from 'node:child_process';
import { applyBrowserPolicy, planRange } from './scripts/ci-scope.mjs';
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const head = git('rev-parse', 'HEAD');
const base = git('merge-base', 'origin/main', head);
const plan = applyBrowserPolicy(planRange(base, head), { GITHUB_EVENT_NAME: 'pull_request', CI_E2E_FULL: 'false' });
console.log(JSON.stringify({ scope: plan.scope, full: plan.full, browser: plan.browser, e2e: plan.e2e }, null, 2));
NODE
```

提交前可预估实际 Git 范围（先 `git fetch origin main`；下例为当前分支与 main 的公共祖先到 HEAD）：

```bash
node --input-type=module <<'NODE'
import { execFileSync } from 'node:child_process';
import { planRange } from './scripts/ci-scope.mjs';
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const head = git('rev-parse', 'HEAD');
const base = git('merge-base', 'origin/main', head);
console.log(JSON.stringify(planRange(base, head), null, 2));
NODE
```

该命令预估路径计划，不包含上表的事件提升；只读取已提交文件，不包含工作区修改。实际 Actions 计划见 `Select affected validation plan` 日志及 `ci-validation-evidence`。6 个 spec 是有界选择，不是固定耗时保证，交付时记录实际执行时间。

## 8. 选 issue 流程（checklist）

开工前逐项勾选：

- [ ] 已读 AGENTS.md + 本文件 + CONTRIBUTING 门禁段
- [ ] issue **不在** Hold / 待确认 / 阻塞；无 open PR
- [ ] 正文有 **验收标准** 与 **不要做**，或已在授权范围内补齐并独立复核；主题仍是「中文资料站 + 计算工具」
- [ ] 当前在审 PR 数 **&lt; 2**
- [ ] 从**当前已授权范围**挑选尚未实现的事项，核对实际代码及已合并 PR；不要继续使用已完成 issue 的旧示例选单，也不要把“超出上一轮小修”解释成“项目无法推进”
- [ ] 大功能 / 新页面（如 #308、#33）先有明确规格、设计材料与失败用例，由执行者准备并交实现者之外的独立代理复核后再实现；不要自行扩范围
- [ ] 分支名与 PR 标题符合 Conventional Commits：`类型(#issue): 描述`

## 9. 发版

- 开发发版：`npm run release -- vX.Y.Z`（详见 [docs/RELEASING.md](RELEASING.md) 与 CONTRIBUTING「发版」）。
- 本项目已有 hongcun 的持续发布授权；已授权更新完成独立复核和一次适用验证后继续上线，不再单独请求发布许可。main 的 test 可以记录经核实的证据复用，仍须构建真实 SHA、短烟测并完成真实 test/deploy。只有 PR 绿灯不等于已上线；正式 Release、tag 和附件也须确认。
- Release 在 main CI/Deploy 成功后自动接续，下载准确 run 的 deployed-site，核对 manifest/版本/SHA/tree/tag 与本次功能，直接打包同一 dist，不再默认 594 项线上回归或二次构建。手动调度用于恢复，不在部署未就绪时提前等待。详细步骤见 RELEASING。
- 全量回归仍每日北京时间 04:17 和手动保留，禁用证据复用并强制 full/data；该后台事件不部署、不发 Release。核心/数据/依赖等重大变化仍需一次适用完整验证，真实失败必须定位。
- CHANGELOG 写**玩家可见**的一句中文说明，不写内部实现黑话。

## 10. pageRegistry（#388 已合入）

页面登记的唯一来源是 `src/shared/nav/pageRegistry.ts`。路由、导航、首页和静态元信息都从它派生，不要手改 `routes.tsx` 或另一份名单。字段、`import()` 所在文件和测试见 [docs/ARCHITECTURE.md](ARCHITECTURE.md)「页面登记表」与 [AGENTS.md](../AGENTS.md)。本文不重复 API。

## 11. 交给人类的事

- Hold 变更、未获授权的范围/产品决定；必须由维护者明确授权，不伪造他人结论
- 合并/发布按已记录授权推进，不反复把同一发布决定交回维护者；没有相应授权的仓库权限变更仍交维护者
- 受保护验收用例期望值冲突：维护者明确决定后，执行者可按授权修改并交独立复核
- 产品范围与「待确认」事项由维护者明确决定
