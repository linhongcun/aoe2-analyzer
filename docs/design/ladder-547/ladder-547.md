# #547 天梯快照刷新与首屏非当前平衡 · 交互规格（Jony · 体验设计 · 2026-11-01）

> 产品已锁定（Steve，#547，2026-11-01）。本稿只定这一刀的界面和换快照的步骤。不重开范围。与 #566 并行，不依赖那条攻城 PR。

这一刀两件事：用可复现的手工 chore 换一份比 `p162286`（`fetchedAt` 2026-07-12）更近的阿拉伯 1v1「全部」快照；默认「全部」的 PC 首屏，不读黄条也能看到统计截止日或「非当前平衡」。

仍是仓库里的静态 JSON。页面不请求 aoestats。

## 1. 快照怎么换

沿 #536 的做法，不新增抓取脚本，不进 `npm run data`。这一份不是 `civs.json` 那类生成物。

新文件 `src/data/ladder-arabia-p{补丁号}.json`，schema 仍是 `src/content/schema/data-ladder-arabia.json`。`src/features/ladder/Ladder.tsx` 的静态 import 改到这个文件。页面只读这一份。旧的 `ladder-arabia-p162286.json` 可以留在仓库里对照，但不得再被页面或「当前快照」测试读取。

| 步骤 | 规格 |
| --- | --- |
| 取哪一页 | aoestats 阿拉伯 1v1 随机地图的「全部」：`https://aoestats.io/maps/arabia/`。本切片只抄这一档 |
| 原页打不开 | 用同一天的一份 Wayback 存档。地图页和补丁号必须来自同一天，禁止拿旧分段页拼进来。PR 写上存档 URL 和页上的 “Stats last updated” |
| 日期 | `fetchedAt` 用来源页上的统计日期，`YYYY-MM-DD`，必须晚于 `2026-07-12` |
| 补丁 | `patchNote` 里的补丁号（连续 5 位及以上数字，沿用 `snapshotPatchBuild`）必须大于 `162286`。页上没有补丁号就不算换完 |
| 括号 | 只写 `key: "all"` 这一档。不在本切片补 Elo 分段 |
| 数字 | `winRate` / `playRate` 按页面上的百分数原样写入，不除以 100。文明 `games` 之和等于 `2 × brackets[all].games`。英文名对 `civs.json`；对不上的名字照写，并在 PR 里列出 |
| 页面上看不到的 | Wayback 路径留在 PR。来源条、黄条、页脚都不渲染 `wayback`（现有 e2e 已禁止） |

「明显新于」要日期和补丁号同时满足。只改日期、补丁仍是 162286，不算完成。新补丁仍可以小于本站 DE 188329，那时界面走第 3 节的不一致态。

不改 `src/data/ladder-beginner.json`。

## 2. 放在哪

**截止句升进现有来源条的第一行。不新做组件，不写进标题。**

来源条仍是 `.ladder-source`（`data-testid="ladder-source"`），Lucide `database`，位置不变：地图、模式、分段三枚 pill 之下，表之上。第一行包在 `data-testid="ladder-cutoff"`，`display` 单独成行，但仍在这张卡里面。第二行才是 aoestats 外链和「本分段样本 N 局」。

来源条加 `data-cutoff="mismatch"` 或 `data-cutoff="aligned"`。不一致时左边 3px `--color-warn`（`#a15c00`）。卡底仍是 `surface-2`。整卡不要涂成黄底。

黄条仍是 `.ladder-patch`（`data-testid="ladder-patch-note"`），Lucide `triangle-alert`，只在不一致时留在来源条下面。它是次要一句，首屏不读它也已经看到截止信息。

`.ladder-desc` 保持 #545 的句子：「阿拉伯 1v1 胜率、出场率与新手友好度。」截止日不进标题，也不进 `pageRegistry`。

页脚 `.ladder-footer` 一字不改，仍在表下面。日期与来源条读同一个 `fetchedAt`。

分段 pill（`ladder-elo-static`）保持 #545。截止信息不是第四枚筛选。

1280 宽、视口高度 800、站点页头约 52px 时，截止行在表头之上，并且整行落在首屏内。页脚不算首屏。

## 3. 两态文案

判断沿用 `isPatchMismatch(snapshot.patchNote, SITE_BUILD)`。站点 build 来自 `DATA_SOURCES.patch.build`（现为 188329）。解析不出补丁号时视为对齐态：仍显示截止日，不显示「非当前平衡」，不显示黄条。

来源条第一行用「统计截止」，避免读成正在更新。页脚继续用原词「统计更新」。

| 态 | 来源条第一行 | 黄条 |
| --- | --- | --- |
| 不一致 | **非当前平衡** · 统计截止 {fetchedAt} · 补丁 {patch} 与本站 DE {site} 不同 | 胜率可能未反映最新平衡改动。 |
| 对齐 | 统计截止 {fetchedAt} · 补丁 {patch} · 静态快照 | 不渲染 |

「非当前平衡」字重 600，颜色 `--color-warn`。日期、补丁号、DE 号用 `.num`，并与前后的字一起放进 `.nw`。「静态快照」用 muted，语气与地图 pill 的「固定」相同。

Accent `#a65a14` 只留在胜率条和 H1 的 `trophy` 上，不拿来涂这句。

对齐态禁止这些词：实时、最新排名、当前平衡、自动更新、今日更新。允许的否定是完整的「非当前平衡」，只出现在不一致态。两态都不写「最新平衡」到来源条；这四个字只留在黄条那一句里。

外链仍是 `snapshot.sourceUrl`，带 `external-link` 和「（外部）」，`target=_blank`、`rel=noopener`。

缺 `fetchedAt` 的错误态不改。

线框 `wire-aligned-1280.html` 上的 `2026-10-01`、`188329` 和「示意」只用来看对齐后的语气。实现不抄这组数字，页面上不出现「示意」。两张线框的表都是现快照胜率前三名，不是新统计。

## 4. 窄屏

PC 优先。来源条本来就会换行，截止行跟着换，日期不拆开。不横滑。不为本切片做 360 精修。

## 5. 不做

- 运行时请求、live API、自动日更、定时脚本
- 多 Elo 分段、空芯片、改 #545 的只读 pill
- 改 `ladder-beginner.json`（#546 已合）
- 新 React 组件、标题旁第二条提示、把黄条原段再复制一份到标题下
- 窄屏打磨
- 把胜率写成平衡建议，或在页脚删掉「胜率不是平衡建议」

## 6. 视觉 AC（Kent / Linus）

- [ ] 新快照文件名带补丁号；`fetchedAt` 晚于 `2026-07-12`；`patchNote` 的补丁号大于 `162286`；只有 `all` 一档；文明局数之和等于 2 倍样本局数
- [ ] `Ladder.tsx` 静态 import 指向新文件。页面代码没有 `fetch`。界面文字不含 `wayback`
- [ ] `ladder-beginner.json` 无改动。#545 的只读 pill 仍在；默认 `#/ladder` 没有 radiogroup，没有 toast
- [ ] 默认「全部」、1280×800：`ladder-cutoff` 在表之上且落在首屏内。不读 `ladder-patch-note` 也能看到截止日
- [ ] 不一致：`data-cutoff="mismatch"`。截止行含「非当前平衡」、`fetchedAt`、补丁号、「与本站 DE」、站点 build。「非当前平衡」为 warn 色。来源条有 warn 左边线，底不是黄底
- [ ] 不一致：黄条可见文字为「胜率可能未反映最新平衡改动。」不含日期，不含补丁号
- [ ] 对齐（补丁号等于站点 build，或解析不出补丁号）：`data-cutoff="aligned"`。截止行含 `fetchedAt` 和「静态快照」。无 `ladder-patch-note`。截止行不含「非当前平衡」「实时」
- [ ] `.ladder-desc` 仍是「阿拉伯 1v1 胜率、出场率与新手友好度。」
- [ ] 页脚仍含「统计更新」、`fetchedAt`、「不实时抓取」、「胜率不是平衡建议」
- [ ] 1280 无横向滚动。截止日不折行。不要求 360 精修
- [ ] 只用已有 Lucide（`database`、`triangle-alert`、`info`、`external-link`，以及页上原有的 `trophy` / `map` / `swords`）。无 emoji，无新图标
- [ ] 不编胜率。锚在 `p162286` / `2026-07-12` 的测试改到新快照的真实数字，不放宽成大约。不改 `tests/**/v0*-acceptance*`

线框：`wire-mismatch-1280.html`、`wire-aligned-1280.html`。
