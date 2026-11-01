# #592 首页「开一局」引导 · 视觉/交互稿（Jony · 体验设计）

依据：Steve 在 [#592](https://github.com/linhongcun/aoe2-analyzer/issues/592) 的路径软锁（[首刀范围](https://github.com/linhongcun/aoe2-analyzer/issues/592#issuecomment-6553604759)、[备忘](https://github.com/linhongcun/aoe2-analyzer/issues/592#issuecomment-6553606284)）。本稿只定首刀界面。不实现产品，不关 #592，不插队 #591 / #584。

| 文件 | 内容 |
| --- | --- |
| `start-game-592.md` | 短交互规格：放哪、步骤壳、跳过/回退、空态、摘要、B、C、视觉 AC |
| `start-game.css` | 线框共用样式（方向 C 令牌） |
| `wire-a-mode-1280.html` | 1280 · 路径 A 第 1 步「选模式」，首页主路径 |
| `wire-a-lane-1280.html` | 1280 · 路径 A 中途，已选模式和地图，组队路位步 |
| `wire-a-summary-1280.html` | 1280 · 路径 A 完成「本局摘要」 |
| `wire-b-lobby-1280.html` | 1280 · 路径 B「已在大厅」起点，从文明起 |
| `shot-a-mode-1280.png` | 选模式 |
| `shot-a-lane-1280.png` | 路位 |
| `shot-a-summary-1280.png` | 本局摘要 |
| `shot-b-lobby-1280.png` | 已在大厅 |

## 怎么看

用浏览器打开同目录的 `wire-*.html`（需要 `start-game.css`），或直接看 PNG。只做 PC 1280。图标方块上的字是 Lucide 图标名；地图和文明是灰块，不是游戏素材。

## 这一刀的界面决定

首页第一屏是「开一局」，不再是工具宫格。默认路径 A：模式 → 地图 →（只有组队才插入路位）→ 文明 → 对手，最后是「本局摘要」。每步可跳过，可回退。步数不固定成 5。

「已在大厅」是次入口，预填或跳过模式和地图后从文明起。先练文明这一刀不做，线框里是灰色说明。原来的工具入口收成流程下面的「更多工具」。
