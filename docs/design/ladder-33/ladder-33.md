# #33 天梯数据 `#/ladder` · 视觉交互稿（MVP）

Jony · 体验设计。依据 Steve 在 #33 的「产品设计要点（MVP）」（comment 6535487119）出稿。方向 C 浅色编辑风，暗色走现有 `data-theme="dark"` 令牌。本文**不做产品优先级决定**；标「待 Steve」的地方由 Steve 定。

> 线框里的胜率、出场率、样本局数**全部是示意数字**（确定性 hash 生成），不是 aoestats 数据，不能拿来引用。实现只读仓库内快照 JSON。

## 1. 路由与登记

- 路由沿用 `#/ladder`，用页面组件替换 `Planned`。不开新路由。
- `pageRegistry.ts` 沿用现有 `ladder` 条目，建议这样改：

| 字段 | 现值 | 建议 |
| --- | --- | --- |
| `lane` | `future` | `secondary`（和 `events` / `players` 同级） |
| `group` | `reference` | 不变 |
| `status` | `planned` | 删除 |
| `component` | `Planned` | `Ladder`（加入 `LAZY_COMPONENTS`） |
| `desc` | 团战排位胜率、出场率 | **阿拉伯 1v1 分段胜率、出场率与新手友好度**（原文案写的是「团战」，与 MVP 口径不符） |
| `label` / `en` / `icon` | 天梯数据 / Ladder Stats / `trophy` | 不变 |

- 面包屑：`资料 / 天梯数据`。H1：Lucide `trophy` + 「天梯数据」+ muted 「Ladder Stats」。

## 2. 快照契约（设计侧需要的字段）

文件名按 Steve：`src/data/ladder-arabia-*.json`。字段名由 Codex 定，下面只列页面要读的东西：

```jsonc
{
  "source": "aoestats.io",            // 来源条、页脚
  "sourceUrl": "https://aoestats.io/", // 外链
  "map": "Arabia", "mode": "1v1 RM",  // 固定文案，与快照核对
  "fetchedAt": "YYYY-MM-DD",          // 必填，来源条 + 页脚
  "patchNote": "…",                   // 可选；有值且与站内数据版本不同 → 显示补丁提示条
  "brackets": [
    { "key": "all", "label": "全部", "games": 0,
      "civs": [ { "en": "Franks", "winRate": 0.0, "playRate": 0.0, "games": 0 } ] }
  ]
}
```

- 分段 `key` 和档名跟着快照走（aoestats 现有 `<850`、`850–1000`、`1000–1200`、`1200+`、`1900+`、全部）。MVP 至少要有「全部」、一个中低分段、一个高分段。
- 新手友好度**不放进快照**。它是站内编辑口径，建议单独放一张静态表（如 `src/data/ladder-beginner.json`：`{en, tier, reason, bonusIdx[]}`），这样刷新胜率的 chore 碰不到编辑内容。
- 文明用英文名映射站内 id。快照里有、站内找不到的文明：照常显示数字，名字不加链接。

## 3. 信息架构

```
站点页头（52px sticky）
返回 · 面包屑「资料 / 天梯数据」 · 报错/反馈
H1 天梯数据 Ladder Stats + 一行说明
─ 顶栏 ───────────────────────────────
  [地图 阿拉伯 Arabia 固定] [1v1 随机地图（RM）]     ← 只读标签，不可点
  天梯分段（Elo）：全部 | <850 | 850–1000 | 1000–1200 | 1200+ | 1900+   ← 单选 chip
  来源条：aoestats.io（外部）· 统计更新 {fetchedAt} · 补丁 {patchNote} · 本分段样本 N 局
  （补丁不一致时）提示条
─ 主体（≥960：表 + 右侧 sticky 侧栏 300px；<960：单列）──
  表头：文明 | 胜率 | 出场率 | 样本局数（≥960） | 新手友好度 | 展开
  行展开：友好度理由 + 加成链接 + 「全部文明加成」+「{文明}文明详情」
  侧栏：怎么读这张表 / 新手友好度四档图例 / 复制分享链接
─ 来源脚注：数据来源 + 更新日期 + 「本站保存静态快照，不实时抓取、不自建统计；胜率不是平衡建议」
站点页脚
```

Steve 写的是「行展开**或**侧栏」。本稿两者都用，但分工不同：**理由和链接放行展开**，跟着那一行走，手机上也一样；侧栏只放图例和分享，不放某个文明的内容。这样宽屏和窄屏的操作模型一致。

## 4. 组件

| 组件 | 规格 |
| --- | --- |
| 上下文标签 | `surface-2` 底、pill 圆角、12px。地图标签带 muted「固定」二字。不可点，没有 hover。 |
| 分段切换 | `role="radiogroup"` 下放 `role="radio"` 按钮，44px 高，pill。选中态：accent 描边 + accent 10% 底 + 600 字重。<960 时横向滚动、不换行，选中项 `scrollIntoView({inline:'nearest'})`。方向键在组内移动。 |
| 来源条 | `surface-2` 卡，Lucide `database`。来源名是外链，带 `external-link` 和「（外部）」，`target=_blank rel=noopener`。`fetchedAt` 缺失时整页走错误态，不显示没有日期的数字。 |
| 补丁提示 | 有 `patchNote` 且与站内数据版本不同时显示。Lucide `triangle-alert`，warn 色 10% 底。文案：「统计补丁 {patchNote} 与本站数据版本 {DE x} 不同，胜率可能未反映最新平衡改动。」 |
| 主表 | 卡片里放 `<table>`，表头 12px muted。行高 ≥ 44px，分隔线用 `line`。数字列右对齐，`tabular-nums`，`white-space:nowrap`。 |
| 文明格 | 24px 原始文明图标（`CivIcon`，`public/img/civs/{lower}.webp`）+ 中文名（链到 `#/civ/{En}`）+ muted 英文名（<960 隐藏）。 |
| 胜率格 | 一位小数 + `%`。≥960 时左边加一条 60px 的发散条，以 50% 为中线，accent 色只表示偏离方向，**不用红绿**。条是 `aria-hidden` 的装饰。 |
| 样本局数 | 千分位。低于阈值时显示 muted 小标签「样本少」，数字仍然显示。<960 时不占列，挪到行展开的第一行。 |
| 友好度标签 | 四档 pill：**易上手**（good）、**中等**（中性 surface）、**进阶**（warn）、**待补**（虚线边、muted）。每档都有文字，不靠颜色区分。 |
| 展开按钮 | 44×44，Lucide `chevron-down` 和 `chevron-up` 切换，`aria-expanded`、`aria-controls`。点这一行（文明链接以外的区域）也能展开。同一时间只展开一行。 |
| 行展开 | accent 左边线 3px + accent 5% 底。第一句是加粗的档名，然后是 1–2 句理由。下面是链接按钮：每条引用的加成 → `#/civ/{En}/bonus/{idx}`；「全部文明加成」→ `#/bonuses`；「{文明}文明详情」→ `#/civ/{En}`。最后一行 muted：「编辑口径：理由只引用站内加成原文，不由胜率推导。」 |
| 待补行 | 标签「待补」。展开后写「这个文明的新手友好度理由还没写，不影响上面的胜率数据。」，仍然给文明详情和 `#/bonuses` 链接。 |
| 侧栏 | ≥960 时 `position:sticky; top:68px`。三张卡：怎么读这张表（胜率 / 出场率 / 样本）、新手友好度图例、复制分享链接（Lucide `link`，复制当前深链，toast 用 Lucide `check`）。<960 时只保留分享卡，放在表下方。 |
| 来源脚注 | 表卡外面，12px muted，Lucide `info`：「数据来源：aoestats.io（阿拉伯 · RM 1v1）· 统计更新 {fetchedAt}。本站保存静态快照，不实时抓取、不自建统计；胜率不是平衡建议。新手友好度为本站编辑口径，不是官方推荐。」 |

## 5. 排序

- 可排序列：文明（按拼音 / 英文名）、胜率、出场率、样本局数（≥960）、新手友好度（易上手 → 进阶，待补排在最后）。
- 默认按胜率降序。表头是 `<button>`，`<th aria-sort>`。未排序的列显示 `arrow-up-down`（muted），当前列显示 `arrow-down` 或 `arrow-up`（accent）。第一次点数字列按降序，再点切换方向。
- 切换分段时保留当前的排序和展开行。如果展开的文明在新分段里没有数据，就收起。

## 6. 状态

| 状态 | 触发 | 表现 |
| --- | --- | --- |
| 加载 | lazy 组件或快照还在加载 | 顶栏照常显示。表区放 8 行骨架（`prefers-reduced-motion` 下不做动画），右上角 muted「读取快照…」。不显示任何数字。 |
| 空 | 当前分段在快照里没有文明，或 `civs=[]` | Lucide `inbox` 加「这个分段暂无数据」，说明：「当前快照里没有「{分段}」分段的阿拉伯 1v1 统计。不推算，不补数。」按钮「看「全部」分段」（Lucide `rotate-ccw`）。 |
| 错误 | 快照读取或解析失败，或缺 `fetchedAt` | Lucide `circle-alert` 加「天梯快照没有读到」：「页面不会显示任何胜率或出场率，以免给出不准确的数字。」按钮「重试」，再给一个 aoestats.io 外链。 |
| 非法分段 | `elo` 不在快照里 | 回落默认分段，用 `history.replaceState` 改写 URL，`role="status"` 提示「未识别的分段「{原值}」，已显示「全部」。」，5 秒后淡出。 |
| 补丁不一致 | 见第 4 节 | 提示条。不挡表格。 |

## 7. 深链

| 参数 | 状态 | 规则 |
| --- | --- | --- |
| `elo` | **Steve 已定** | 取快照里的分段 key。非法值或缺省时回落默认分段。本稿默认分段建议用 `all`，**待 Steve 确认**。 |
| `sort` / `dir` | 候选，**待 Steve** | `sort=win|play|games|name|tier`，`dir=asc|desc`。非法值静默回落默认值。 |
| `civ` | 候选，**待 Steve** | 打开时展开该文明的行并滚动到视图里。非法值忽略。 |

- 分享链接只带非默认的参数：默认状态就是 `#/ladder`。
- 切换分段用 `replaceState`，不要每点一次就多一条历史记录。

## 8. 宽度、主题与可访问性

- 四宽：360 / 375 / 390 / 1280，断点在 960。360 下没有横向溢出，数字不换行（截图脚本检查过 `.num` 只有一个 client rect，`scrollWidth <= innerWidth`）。
- <960：表的列是 文明 | 胜率 | 出场率 | 友好度 | 展开，样本局数挪到行展开里。文明英文名和胜率条都隐藏。
- 颜色只用设计令牌：text `#1d1d1f`、muted `#636366`、accent `#a65a14`、link `#0066cc`、good `#1f7a35`、warn `#a15c00`。暗色走 `data-theme="dark"`（`#f5f5f7 / #a1a1a6 / #f0a454 / #4da3ff / #4cd964 / #ffb340`）。友好度 pill 的文字对底色在两个主题下都按 AA ≥ 4.5:1 取色。
- 字体 Inter。可点区域 ≥ 44px。不用 emoji。文明图标用原始素材。
- 外链都有可见的「（外部）」或 `external-link` 图标，读屏文字里也有。
- 表格加 `<caption class="sr-only">阿拉伯 1v1 {分段} 各文明胜率</caption>`。

## 9. Lucide 图标

用到的：`trophy`、`map`、`swords`、`database`、`external-link`、`triangle-alert`、`circle-alert`、`info`、`arrow-up-down`、`arrow-down`、`arrow-up`、`chevron-down`、`chevron-up`、`link`、`check`、`inbox`、`rotate-ccw`、`scroll`（加成链接）、`arrow-left`、`message-square-warning`。

`Icon.tsx` 里**还没注册、需要补的**：`ExternalLink`、`ArrowUpDown`、`ChevronUp`、`Inbox`；如果加成链接不用已有的 `ScrollText`，还要补 `Scroll`。

## 10. 建议的 data-testid（给 Kent）

`ladder-page`、`ladder-context`、`ladder-bracket`（每个 chip 带 `data-elo`）、`ladder-source`、`ladder-patch-note`、`ladder-table`、`ladder-row-{En}`、`ladder-sort-{key}`、`ladder-tier-{En}`、`ladder-expand-{En}`、`ladder-reason-{En}`、`ladder-loading`、`ladder-empty`、`ladder-error`、`ladder-fallback-toast`、`ladder-share`、`ladder-footer`。线框只挂了其中几个，实现以本表为准。

## 11. 对 Steve MVP 要点的逐条核对

- [x] 路由用现有 `#/ladder` 替换 Planned，不开新路由。
- [x] pageRegistry 沿用 ladder 条目，留在 `reference` 组，不另开组（`lane` 建议见第 1 节）。
- [x] 来源是 aoestats.io 阿拉伯 1v1 RM 静态快照。页面显示 `source`、`fetchedAt` 和可选的 `patchNote`。不爬站、不建后端、不冒充官方。
- [x] 分段跟 aoestats Elo 对齐，页上可以切换，「全部」加中低分段加高分段都在。
- [x] 字段：文明（可映射站内）、胜率、出场率、样本局数（有就显示）。
- [x] 页脚固定显示「数据来源 + 更新日期」。
- [x] 新手友好度是编辑口径：一档标签加 1–2 句理由，能点到 `#/bonuses` 和文明详情，没有「官方推荐」字样。
- [x] 缺理由时标「待补」，不挡胜率表。
- [x] IA：顶栏（地图固定、分段、来源条）、主表（可排序）、行展开放理由和链接。
- [x] 深链 `#/ladder?elo=`，非法值回落默认分段。
- [x] 不做：其他地图、团战、实时 API、平衡建议、胜率预测。`v0*-acceptance*` 没改。
- [x] 四宽截图都在 `shots/`。

## 12. 留给 Steve 的问题（设计不替你定）

1. 默认分段：本稿用「全部」。要不要改成某个中段？
2. 「样本少」阈值：线框用的是 500 局，示意而已。
3. 友好度三档的定义文案（侧栏图例），以及首批要写理由的文明范围。
4. `sort` / `dir` / `civ` 要不要进深链契约（第 7 节）。
5. aoestats 数据的复用授权、快照与站内数据版本不一致时是否照常上线（Reid 在 #33 提过：aoestats 统计停在 patch 162286、2026-08-17）。设计只负责把这件事显示清楚。
