# #577 天梯默认切片与三视图 · 视觉/交互稿（Jony · 体验设计）

依据：Steve 在 [#577](https://github.com/linhongcun/aoe2-analyzer/issues/577) 锁定的 P1（2026-11-01）。延续 [#33 天梯数据](../ladder-33/)、[#545 空分段](../ladder-545/)、[#547 来源条截止](../ladder-547/)。本稿不接实时接口，不抄 aoe2scout 的数字和暗色界面。与 [#576](https://github.com/linhongcun/aoe2-analyzer/issues/576)、[#578](https://github.com/linhongcun/aoe2-analyzer/issues/578) 并行：那两条仍是阿拉伯 1v1 快照刷新，不因本稿解除阻塞。

| 文件 | 内容 |
| --- | --- |
| `ladder-577.md` | 短交互规格：默认切片、筛选、三视图、来源条、视觉 AC、非范围 |
| `ladder.css` | 线框共用样式（方向 C 令牌，类名沿用 ladder-547） |
| `wire-table-1280.html` | 1280 · 默认切片 · 表 + 走势（A；分层 / 分布不可点） |
| `wire-tiers-1280.html` | 1280 · 同一筛选 · 分层（B） |
| `wire-metamap-1280.html` | 1280 · 同一筛选 · 分布（B） |
| `shot-table-1280.png` | 表截图 |
| `shot-tiers-1280.png` | 分层截图 |
| `shot-metamap-1280.png` | 分布截图 |

## 怎么看

用浏览器打开同目录的 `wire-*.html`（需要 `ladder.css`），或直接看 PNG。图标是占位方块，方块上的字是 Lucide 图标名。

三张线框的筛选、来源条和五行文明是同一套版式。胜率、出场率、局数、走势、区间和气泡都标了「示意」，不是 aoestats，也不是 aoe2scout。实现不要把这些数字写进快照。

## 这一刀的界面决定

打开 `#/ladder` 就是 4v4 随机地图、Elo 1200–1400、近 90 天、全图，视图是表。没有快照的模式、时段、分段、地图不画成空芯片，也不做 Elo 滑杆。表、分层、分布共用这一组筛选和同一份静态快照；切换视图不把筛选清掉。来源条仍是 #547 的截止行和「非当前平衡」，不另做新鲜度横幅。表和走势先做；分层和分布紧随，A 未做完时那两枚不可点。
