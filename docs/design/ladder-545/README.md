# #545 天梯空分段 · 视觉/交互稿（Jony）

依据：Hongcun 在 [#545](https://github.com/linhongcun/aoe2-analyzer/issues/545) 锁定的 MVP（2026-10-31，路径 2）。延续 [#33 天梯数据](../ladder-33/)。本稿不定优先级，不补分段快照，不改新手友好度。

| 文件 | 内容 |
| --- | --- |
| `ladder-545.md` | 短交互规格：只露有数据的分段、单档时的只读 pill、无效深链、入口文案、视觉 AC |
| `ladder.css` | 线框共用样式（方向 C 令牌） |
| `wire-single-1280.html` | 1280 · 当前快照只有「全部」：无 radiogroup，上下文行末只读 pill |
| `wire-fallback-1280.html` | 1280 · `?elo=lt850` 回落后的同一页，复用现有 toast |
| `shot-single-1280.png` | 只读「全部」截图 |
| `shot-fallback-1280.png` | 空数据深链回落截图 |

## 怎么看

用浏览器打开同目录的 `wire-*.html`（需要 `ladder.css`），或直接看 PNG。图标是占位方块，方块上的字是 Lucide 图标名。

表内三行和样本局数取自当前快照 `src/data/ladder-arabia-p162286.json` 的「全部」，只为看版式，不是完整表。友好度三行都是「待补」（编辑表 `entries` 为空）。线框不另编胜率。

## 这一刀的界面决定

有数据的分段只剩一个时，收起整行 chip，不保留单选 radiogroup。上下文行末加一枚不可点的 pill：「天梯分段 / 全部 / 当前快照」。快照以后写入别的非空分段时，pill 消失，radiogroup 按数据自动回来。
