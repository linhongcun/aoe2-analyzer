# Codex 维护纪律 / CODEX-MAINTENANCE

给 Codex（及同类无人值守编码代理）用的维护纪律。人类与角色代理仍以 [CONTRIBUTING.md](../CONTRIBUTING.md) 为准；本文件与 CONTRIBUTING / [AGENTS.md](../AGENTS.md) 冲突时，以 CONTRIBUTING 为准，并在 issue 里指出。

入口：先读 AGENTS.md → 本文件 → 要做的那条 issue。

## 1. 产品主题（是什么 / 不是什么）

**是什么**：帝国时代 II 决定版（AoE2 DE）的**中文资料站 + 计算工具**——文明/单位/科技/建筑百科、科技树与加成，以及对比、对局助手、模拟器、单位 PK、开局、市场预算等可分享的计算页。线上：https://linhongcun.github.io/aoe2-analyzer/。界面文字全部简体中文。数据版本以页脚与 `scripts/data_sources.json` 为准。

**不是什么**：

- **不编造游戏数值。** 数字只从生成数据与固定 `.dat` 派生结果读；记忆、旧帖、猜测一律不算。issue / 设计稿 / 测试与数据冲突时，以数据为准并在 issue 说明。
- **不做无关大功能。** 不做实时读盘、账号系统、自动推荐最优策略、改游戏平衡、爬站批量抓内容、自建天梯后端等偏离「资料 + 计算」主题的扩展，除非 hongcun / Steve 在 issue 里明示并写入范围。
- **不做无人监督的批量合多 issue。** 禁止一次开多个功能 PR、禁止自己 ACCEPT / 设计通过 / 合并。过往低质量批量合入已明确禁止复现。

## 2. 工作节奏

1. **一次只认领 1 个 issue**（一个执行者、一个 PR）。
2. **同时在审的 PR ≤ 2**（含别人的）。审阅位满时只准备草稿，不新开 PR。
3. 当前 PR **合完再拿下一个**；不要并行囤积分支等合。
4. 开 PR 前先查该 issue 是否已有 open PR，有则跳过。
5. 版本内工作以当前 `release/vX.Y.Z` 为目标并先 rebase；仅线上数据错误热修对 `main`。

## 3. 门禁（对齐 CONTRIBUTING）

只认 **PR 会话里审查人本人留言**，且**第一句带已验证的提交 SHA**：

| 谁 | 留言格式 | 何时需要 |
| --- | --- | --- |
| Kent | `ACCEPT @ <exact SHA>` | 除「只改文档或只改样式」外的 PR |
| Steve | `设计通过 @ <exact SHA>` | 涉及界面（CSS / 组件 / 文案）的 PR |
| CI | 绿 | 所有 PR |

- 未写明 SHA、群聊里说的、定时任务自动发的，**一律不算**。
- 只改文档或只改样式（不动逻辑和测试）的 PR：CI 绿即可，不需 Kent ACCEPT（见 CONTRIBUTING）。
- **Codex 不能自己写 ACCEPT / 设计通过 / Product PASS，不能合并、删分支、改仓库设置。** 合并由 Linus 按顺序手动做。
- rebase 后若 `git range-diff` 证明自身改动不变，只看 CI，不要求重新验收（CONTRIBUTING）。

## 4. Hold 表（勿开）

| Issue | 说明 |
| --- | --- |
| **#364** | a11y：单位 PK 标题层级整树上移——跨页面共享组件，范围大；**Hold，勿开** |
| **#372** | 单位 PK 波希米亚预置对战——**Hold，勿开** |

更新 hold 列表或解 hold **必须** hongcun 或 Steve 明示。Codex / 其他代理不得自行开 hold 上的 issue。

## 5. 跳过（不要开工）

遇到下列任一情况，**跳过**该 issue：

- 标签 **`待确认`** 或 **`阻塞`**
- 该 issue **已有 open PR**
- 在上方 **Hold 表** 中
- 正文缺少可测的 **「验收标准」**，或缺少 **「不要做」/「不在范围」**（未就绪；可先评论请 Steve 补全，不要自己发明范围）
- 标题形如「待村长确认」的版本范围

## 6. 设计硬规则（摘要）

完整规范见 [docs/design/DESIGN-SYSTEM.md](design/DESIGN-SYSTEM.md) 与 [docs/design/README.md](design/README.md)（`ERRATA.md` 优先于 SPEC）。

- **图标**：只用 Lucide，经 `src/shared/ui/Icon.tsx` 的 `ICONS` 登记后 `<Icon name="..." />`；禁止 emoji / Unicode 符号当图标（ESLint 会拦）；游戏美术图标除外。
- **颜色**：只用 `src/shared/styles/tokens.css` 设计令牌；`npm run lint:colors`。
- **无障碍**：文字对比度 WCAG AA；可点区域 ≥ **44×44**；文字不小于 12px。
- **数字不换行**：数值与「数字+单位」用 **`.num`**（等宽数字）与/或 **`.nw`**（`white-space: nowrap`）包住，360 宽也不能折行。
- **四宽截图**：界面 PR 附 **360 / 375 / 390 / 1280**，无横向滚动、无 console error / pageerror。
- **中文 UI**：文案与相邻页面一致；新增路由登记导航/首页时遵循现有分组（合入 #388 后见 pageRegistry 段）。

## 7. 测试规则

- **禁止修改** `tests/**/v0*-acceptance*` 里的期望值——这些是 **Kent 专属**验收用例。与产品决定冲突时不改测试，在 issue 写清冲突等人决定。
- 改领域逻辑补 `tests/unit/`；修 bug 先写能复现的失败用例。
- e2e 命令、端口、并行 worktree、BASE_URL、四宽、axe 与 CI 跳过条件，见 [docs/TESTING.md](TESTING.md)（Kent 维护）。

## 8. 选 issue 流程（checklist）

开工前逐项勾选：

- [ ] 已读 AGENTS.md + 本文件 + CONTRIBUTING 门禁段
- [ ] issue **不在** Hold / 待确认 / 阻塞；无 open PR
- [ ] 正文有 **验收标准** 与 **不要做**；主题仍是「中文资料站 + 计算工具」
- [ ] 当前在审 PR 数 **&lt; 2**
- [ ] **优先从 `候选` + `chore` 单发**开始练手，例如 **#277**（库曼攻城厂规则去重）、**#284**（CI 校验 data / pinyin 产物）
- [ ] 大功能 / 新页面（如 #308、#33）需 Steve 设计稿与 Kent 失败用例就绪后再动；不要自行扩范围
- [ ] 分支名与 PR 标题符合 Conventional Commits：`类型(#issue): 描述`

## 9. 发版

- 开发发版：`npm run release -- vX.Y.Z`（详见 [docs/RELEASING.md](RELEASING.md) 与 CONTRIBUTING「发版」）。
- Codex **默认不跑发版**；除非 hongcun 明示。
- CHANGELOG 写**玩家可见**的一句中文说明，不写内部实现黑话。

## 10. pageRegistry（待 #388 合入后）

合入 **#388** 后，**以 `pageRegistry` 为页面登记的唯一来源**（导航、首页卡片、面包屑、搜索等共用）。具体 API、文件路径与迁移步骤以届时更新的 [docs/ARCHITECTURE.md](ARCHITECTURE.md) 与 [AGENTS.md](../AGENTS.md) 为准——**本文不编造 API**。在 #388 合入前新增页面，仍按现有 `routes.tsx` / 导航登记方式，并避免与 #388 冲突的大范围改同一文件。

## 11. 交给人类的事

- Hold 变更、版本冻结、ACCEPT / 设计通过 / 合并 / 发版 / 改仓库设置
- 验收用例期望值变更（Kent）
- 产品范围与「待确认」拍板（Steve / hongcun）
