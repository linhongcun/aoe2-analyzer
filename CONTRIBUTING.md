# 贡献约定 / Contributing

## 角色

产品 Steve Jobs，项目经理 Jeff Sutherland，开发 Linus Torvalds，测试 Kent Beck，设计 Jony Ive，产品运营 Reid Hoffman；hongcun lin 最终拍板。

## 按版本批次开发

按批次发版：一起开发、一起验收、部署一次、复验一次，然后发版。范围定下即冻结，期间发现的新问题记进下一版，不插队；只有线上数据错误单独热修。

1. **定范围**：产品（Steve Jobs）在版本 issue（例如 #58）里写明本版范围，定下即冻结。
2. **版本分支**：本版开发都在 `release/vX.Y.Z` 上进行，PR 以它为目标分支，合入前先 rebase 到版本分支最新提交。
3. **PR 合入条件**：CI 绿 + Kent 测试 ACCEPT；涉及界面的 PR 还需 Jony 在 PR 上给出设计结论（「设计通过」，或提出的必改项都已改完并复核）；开局内容的改动还需 Steve 内容通过。
4. **发版条件**：全部合进版本分支 → Kent 整版验收 → 合入 main 部署一次 → 线上复验一次 → 发版（打 tag `vX.Y.Z`，用 CHANGELOG 对应小节建 GitHub Release，核对本版 issue 均已关闭；合到非默认分支时 `Closes #N` 不会自动关闭）。
5. **热修**：只有线上数据错误单独热修，直接提到 main（修订号 +1），合入后同步回当前版本分支。

部署只在 main 上触发，版本分支只跑测试。

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

## 工作目录

每个 PR 用单独的 `git worktree`，不要在共享目录里切分支，也不要用 `git stash` 在分支之间搬改动。

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
