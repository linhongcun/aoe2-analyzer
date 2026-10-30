# ladder-33 · `#/ladder` 天梯数据 设计包

[#33](https://github.com/linhongcun/aoe2-analyzer/issues/33) 的视觉交互稿，依据 Steve 的 MVP 要点（comment 6535487119）出稿。供 Steve 设计审阅，审完交给 Codex。**本包不定产品优先级。**

| 文件 | 内容 |
| --- | --- |
| `ladder-33.md` | 规格：路由与登记、快照契约、IA、组件、排序、状态、深链、a11y、Lucide 图标、data-testid、对 MVP 的逐条核对、待 Steve 的问题 |
| `wire-ladder.html` | 可点的单文件线框（响应式，断点 960）。可以切换分段、排序、展开行、复制链接、切换主题 |
| `shots/` | 截图（浅色 1280 / 390 / 375 / 360，暗色 1280 / 390，分段加展开，加载 / 空 / 错误 / 非法分段回落） |

## 怎么看线框

在仓库里直接用浏览器打开 `docs/design/ladder-33/wire-ladder.html`。文明图标用相对路径引用 `public/img/civs/`，所以要在仓库内打开。

线框可以带这些查询参数（模拟状态用的，不是实现的深链）：

- `?elo=1000-1200`：分段。`?elo=bogus`：演示非法值回落
- `?open=Franks`：展开某一行
- `?sort=play&dir=asc`：排序
- `?state=loading|empty|error`：三种状态
- `?theme=dark`：暗色

顶部黑条是线框说明，不是页面的一部分。

## 数字口径

线框里的胜率、出场率、样本局数都是**示意数字**，页面上标了「示意」，不能当成 aoestats 数据引用。友好度理由是示意编辑文案，引用的是 `src/data/civs.json` 里的加成原文。实现时数字只读快照，理由只读编辑表。

## 给 Codex 的实现要点

1. 改 `pageRegistry.ts` 的 `ladder` 条目（见规格第 1 节），新增 `Ladder` lazy 组件。
2. 快照 JSON 和友好度编辑表分开放（规格第 2 节）。快照缺 `fetchedAt` 就走错误态。
3. 深链只锁定 `elo`，非法值用 `replaceState` 回落，再给一个 `role=status` 提示。`sort` / `dir` / `civ` 要等 Steve 确认。
4. 数字 `tabular-nums` + `nowrap`；<960 时样本局数挪到行展开里；360 下不能有横向溢出。
5. 在 `Icon.tsx` 补注册 `ExternalLink`、`ArrowUpDown`、`ChevronUp`、`Inbox`。
6. 颜色只用设计令牌，暗色走 `data-theme="dark"`。
7. 不改 `tests/**/v0*-acceptance*`。
