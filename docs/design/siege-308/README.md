# #308 攻城拆建筑 `#/siege` · 视觉/交互稿（Jony）

依据：Steve 设计要点 [#308 comment](https://github.com/linhongcun/aoe2-analyzer/issues/308#issuecomment-6525638920)、Kent 失败验收 [#529](https://github.com/linhongcun/aoe2-analyzer/pull/529)（`siege308.spec.ts`）。不排 P 级，不做新的产品决定。

| 文件 | 内容 |
| --- | --- |
| `siege-308.md` | 交互规格：URL 参数、四种状态、a11y、Lucide 图标、导航登记、视觉 AC |
| `wire-siege-390.html` | 390 单列 · 攻城锤×1 vs 城镇中心（已算出，演示「驻满村民」已勾 → 未计入） |
| `wire-siege-1280.html` | 1280 两栏 · 同内容（未勾驻军） |
| `wire-siege-mangonel.html` | 390 · 轻型投石车 vs 城堡：「规则未核实，暂不计算」，无任何用时数字 |
| `siege.css` | 线框共用样式（设计令牌） |
| `shot-390.png` / `shot-1280.png` / `shot-mangonel.png` | 无头 Chrome 截图（390/mangonel 为 2×） |
| `gen.py` / `shot.py` | 线框生成与截图脚本（`python3 gen.py && python3 shot.py`） |

## 怎么看

直接用浏览器打开 `wire-*.html`（同目录需有 `siege.css`），或看 PNG。线框里的图标是占位方块，方块内文字即 Lucide 图标名。

## 主题说明

Steve 要点写的是「深色主题与现有工具页一致」。站点现行设计系统是 **方向 C 浅色编辑风**（hongcun 10/11 拍板），线框按浅色出，与 `docs/design/site-linking-517` 一致。实现只用设计令牌，暗色由现有 `data-theme="dark"` 令牌自动适配（Kent #529 对 light/dark 都跑），线框不单独出暗色稿。

## 数字口径

线框中的数字只用 Kent 金数（#529）：1×攻城锤 vs 城镇中心 16 击 / 75 游戏秒；vs 城堡 34 / 165；vs 瞭望箭塔 6 / 25；默认态 4×攻城锤 vs 城堡 9 / 40。现实秒 = 游戏秒 ÷ 1.7，保留 1 位小数（75 → 44.1）。石墙/城门行是「暂不计算 · 数据待补」占位，不是数字。
