# 贡献约定 / Contributing

## 角色

产品 Steve Jobs（兼项目管理、UI/设计审查与玩家反馈），开发 Linus Torvalds，测试 Kent Beck；hongcun lin 最终拍板。

## 版本工作流

按小版本批次发版：每版 3–5 项、约一周。一起开发、一起验收、部署一次、复验一次，然后发版。Steve 签字后范围即冻结，版本中途冒出的新问题一律记进下一版，不插队。版本号一律写三段（`vX.Y.Z`）。

### 1. 定版（Steve 牵头，开工前一次做完）

- **范围**：Steve 在版本 issue 里写明本版范围并签字，定下即冻结。
- **验收标准**：每个 issue 写成可测的条件（具体数值、宽度、状态或可复现链接）。Kent 定版时逐条核对，写不成测试的当场退回 Steve 改。
- **设计稿**：只有改界面（CSS、组件或文案）的 issue 需要 Steve 出稿。稿子覆盖全部状态（空、加载、置灰、上限、未计入等）和 360/375/390/1280 四档宽度，颜色、字号标成设计令牌和数值；提交到 `docs/design/` 并链接在 issue 上，才算定稿、才能开工。开工后发现的设计问题记进下一版，版本中途不补勘误。
- **失败用例**：Kent 为每个 issue 挂上失败用例。纯数据/逻辑的 issue 有验收标准和失败用例即可开工。
- **合并顺序**：Steve 按改动文件排合并顺序，改同一文件的串行做。每个 issue 只由一个执行者负责。
- **版本分支**：开发用脚本建 `release/vX.Y.Z`，同时建好版本号和 CHANGELOG 骨架。开发随每个 issue 在 CHANGELOG 里写一句玩家能看懂的话。本版 PR 以版本分支为目标，合入前先 rebase 到其最新提交。
- **main 只接热修**：只有线上数据错误单独热修，直接提到 main，作为 `x.y.z` 补丁版本发布（修订号 +1），合入后同步回当前版本分支。

### 2. 开发和验收

- **PR 门禁**：只改文档或只改样式（不动逻辑和测试）的 PR，CI 绿即可合并，不需要 Kent ACCEPT。其他 PR 需 CI 绿 + Kent 在该 SHA 上 ACCEPT（代表产品要求已满足）；涉及界面的再加 Steve 设计通过。Steve 不再逐个 PR 给 Product PASS。
- **只认 PR 上的本人留言**：第一句写「ACCEPT @ <已验证的提交 SHA>」或「设计通过 @ <已验证的提交 SHA>」，未写明 SHA 的不算；群里说的、定时任务发的都不算。审查人：Kent，设计类再加 Steve。
- **能量化的交给 CI**：对比度、溢出等写进 e2e，CI 绿即过；设计只看机器量不出的层级、对齐、与稿是否一致。
- **rebase 不重验**：rebase 后用 `git range-diff` 证明 PR 自身改动不变，只看 CI，不重新验收。
- **工作目录**：每个 PR 用单独的 `git worktree` 和本地端口；不在共享目录切分支，不用 `git stash` 搬改动。
- **谁来合并**：只由开发在门禁满足后、按定版的合并顺序手动合并。
- **结果汇报**：执行者完成后在群里 @Steve 汇报结果，附 PR 链接和建议的下一步。
- **定时任务**：只能开 PR、跑测试、汇报结果；不能合并、删分支、改仓库设置，也不能给 ACCEPT、设计通过或 Product PASS（自动发出的结论无效）；只在 CI 变红或线上出问题时出声。开 PR 或处理某个 issue 前，先查该 issue 有没有已打开的 PR，有就跳过。

### 3. 发版

- **手动全量只做两次**：PR 首次验收，以及 release 整版验收。
- **流程**：Kent 整版验收 → Steve 在发版 issue 上给整版 Product PASS → 开发用发版脚本完成：release 合入 main（merge commit）、等部署、核对线上页脚、打 annotated tag `vX.Y.Z`、用 CHANGELOG 对应小节起草 GitHub Release → Kent 线上复验 → 发布 GitHub Release，核对本版 issue 均已关闭（合到非默认分支时 `Closes #N` 不会自动关闭）。
- **发版脚本**：`npm run release -- vX.Y.Z`（`scripts/release.mjs`）。参数：`--dry-run` 只打印每一步要执行的命令和要核对的内容，不改任何分支、tag、Release；`--site-url` 线上地址，默认 `https://linhongcun.github.io/aoe2-analyzer/`；`--footer-timeout` 等部署的秒数，默认 600。任一步失败进程以非 0 退出，`npm run release` 会原样传出该退出码。**不要用管道吞掉退出码**；若需要留日志，先 `set -o pipefail`，再 `npm run release -- vX.Y.Z 2>&1 | tee release.log`（或事后检查 `${PIPESTATUS[0]}`）。
  - 前置检查：`release/vX.Y.Z` 头部 CI 为绿；远端 tag 不存在，或已指向合并后的 main 头部（视为已完成、跳过），指向别的提交则报错退出。
  - 步骤：合入 main（merge commit）→ 用 Playwright 读线上渲染后的页脚，版本号和构建号都等于合并后的 main 头部才通过（超时或不一致报错，不打 tag）→ fetch tags 后打 annotated tag（本地或远端已有指向 main 头部的同名 tag 则跳过；指向别的提交则失败）→ 用 CHANGELOG 对应小节起草 draft Release。
  - 每一步做没做完都看远端仓库和线上的实际状态，不写本地状态文件；失败停在那一步并打印已完成的步骤和原因，修好后直接重跑，已完成的步骤自动跳过。
  - 需要本机已登录 `gh`、对 main 有推送权限，并已安装 Playwright 浏览器（`npx playwright install chromium`）。
- **公告**：每周小版本只写 CHANGELOG 里的玩家说明，不发外部公告。玩家可见的功能攒够时（新工具、文明解锁等），Steve 才起草外部公告，由 hongcun 决定是否发。有外部公告的版本：Kent 整版验收通过后，Steve 在 release 头上实测填数，每个数字附可复现链接；定稿挂在发版 issue，Kent 在那里确认。外部渠道由 hongcun 本人发。

部署只在 main 上触发，版本分支只跑测试。

### 4. 沟通

- 群里只说阻塞和需要拍板的事，不发重复进度。
- 定时任务只在 CI 变红或线上出问题时出声。

## 提交信息与 PR 标题

遵循 [Conventional Commits](https://www.conventionalcommits.org/zh-hans/v1.0.0/)：`类型(范围): 描述`，范围写对应 issue 号。PR 标题会被 CI 检查（`scripts/check-pr-title.mjs`），squash 合并时 PR 标题即提交信息。

| 类型    | 用途               | 示例                               |
| ------- | ------------------ | ---------------------------------- |
| `feat`  | 新功能             | `feat(#19): 开局分享卡`            |
| `fix`   | 修复 bug、数据错误 | `fix(#13): 科技涉及单位只显示一处` |
| `docs`  | 文档               | `docs(#44): 别名表说明`            |
| `chore` | 杂项、仓库维护     | `chore: 添加 CONTRIBUTING`         |
| `test`  | 只改测试           | `test(#57): 主要卡点 e2e 用例`     |
| `ci`    | CI 配置            | `ci: release/** 分支也跑测试`      |

另外允许 `refactor`、`style`、`perf`、`build`、`revert`、`hotfix`。不兼容变化在类型后加 `!`，例如 `feat(#70)!: 分享链接改用新格式`。

## 数据来源

- 只引用自己实际打开核对过的来源，写明链接或文件版本。
- 没能核对的数据在界面和文档中标「未核实」。
- 社区来源（攻略、别名、俗称）只收 2020 年以后的；官方名称和游戏数据文件（.dat）不受此限。
- 游戏数据以固定版本的 .dat 为准，CI 会校验可复现性。

## 设计与代码规范

- **图标**：自定义界面图标禁止使用 emoji 或 Unicode 符号字形（⚔ ← → ★ ✓ ✕ ▲▼ 🔍 等）。统一使用 [Lucide](https://lucide.dev)（ISC License），通过 `lucide-react` 本地打包（不使用 CDN，站点需在中国可访问）。在 `src/shared/ui/Icon.tsx` 的 `ICONS` 表登记后以 `<Icon name="..." />` 使用；颜色用 `currentColor`，尺寸由 CSS（`.ic`）控制。ESLint 规则 `no-restricted-syntax` 会拦截代码中的 emoji/箭头符号。
- 游戏美术图标（文明/单位/科技/建筑/DLC/属性）保持使用 `public/img/` 下的素材。
- 样式：颜色只用 `src/shared/styles/tokens.css` 中的设计令牌（CSS 变量），保持深色中世纪主题（`npm run lint:colors` 检查），规范见 `docs/DESIGN-SYSTEM.md`。
- 同时检查 1280 与 390 宽、浅色与深色，对比度满足 WCAG AA。
- 领域逻辑（`src/domain`）必须是纯函数、无 React 依赖，并配 Vitest 单测。
- 数据：`npm run data` 重新生成 `src/data/*.json` 与 `public/img/*`，不要手改生成的 JSON；主观评分改 `scripts/civ_ratings.json`。

## 本地检查

```bash
npm ci --legacy-peer-deps
npm run lint && npx tsc -p . --noEmit && npm test
npm run build && npm run e2e
```
