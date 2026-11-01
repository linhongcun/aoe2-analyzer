# #584 单位/文明页 · 鲜为人知洞察槽位 · 视觉/交互稿（Jony · 体验设计）

依据：Steve 在 [#584](https://github.com/linhongcun/aoe2-analyzer/issues/584) 的锁刀（[槽位](https://github.com/linhongcun/aoe2-analyzer/issues/584#issuecomment-6553517291)）与种子⑧修订（[空城 8 箭](https://github.com/linhongcun/aoe2-analyzer/issues/584#issuecomment-6553520390)）。本稿只定槽位。不实现产品界面，不关 #584，也不关 #581、#577。

| 文件 | 内容 |
| --- | --- |
| `insights-584.md` | 短交互规格：放哪、空/有内容、列表、文案门禁、视觉 AC |
| `insights.css` | 线框共用样式（方向 C 令牌） |
| `wire-unit-empty-1280.html` | 1280 · `#/unit/38` 骑士，槽位「暂无」 |
| `wire-unit-filled-1280.html` | 1280 · `#/unit/2705` 扈从部队，种子①+② |
| `wire-civ-empty-1280.html` | 1280 · `#/civ/Franks` 法兰克，槽位「暂无」 |
| `wire-civ-filled-1280.html` | 1280 · `#/civ/Malians` 马里，种子⑧两条 |
| `shot-unit-empty-1280.png` | 单位空槽 |
| `shot-unit-filled-1280.png` | 单位有内容 |
| `shot-civ-empty-1280.png` | 文明空槽 |
| `shot-civ-filled-1280.png` | 文明有内容 |

## 怎么看

用浏览器打开同目录的 `wire-*.html`（需要 `insights.css`），或直接看 PNG。只做 PC 1280。琥珀色 1px 框只为审阅时看见新槽，实现时改回与相邻卡片相同的 `#e5e5ea` 描边。

## 这一刀的界面决定

`#/unit/:id` 和 `#/civ/:name` 各有一块固定、互相独立的「鲜为人知」。单位页放在「造价与生产」正下方；文明页放在官方定位 / 特色兵种下面、文明加成长列表上面。不放进说明或加成正文，不放侧栏，不做成展开后才出现。

空着也留着这块，正文写「暂无」。有内容时是短列表，同页可以有两条或更多；再加一条只多一行，外框不变。线框有内容的例子：单位页是撒克逊人的扈从部队（①+②）；文明页只标马里（⑧修订：空城镇中心也能射 8 箭，满驻上限 18）。撒克逊送石和立陶宛山城堡不画进马里页，短句在规格的文案门禁里。
