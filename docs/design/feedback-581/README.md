# #581 报错/反馈页内可见单位上下文 · 视觉/交互稿（Jony · 体验设计）

依据：Steve 在 [#581](https://github.com/linhongcun/aoe2-analyzer/issues/581) 锁定的站内可见性（2026-11-01）。延续已合的 [#555](https://github.com/linhongcun/aoe2-analyzer/issues/555)：GitHub 预填已经写上「名 / ID」，本刀只让玩家在跳转前、不必登录就能在站内读到同一串。本稿不定优先级。Steve 双路里这是 P2，排在 [#577](https://github.com/linhongcun/aoe2-analyzer/issues/577) A 之后，与天梯无冲突。

| 文件 | 内容 |
| --- | --- |
| `feedback-581.md` | 短交互规格：旁注放哪、两态文案、无障碍、视觉 AC、非范围 |
| `feedback.css` | 线框共用样式（方向 C 令牌） |
| `wire-siege-with-unit-1280.html` | 1280 · `#/siege?unit=422`，旁注在「报错/反馈」簇旁 |
| `wire-siege-no-unit-1280.html` | 1280 · 地址还没有 `unit`，只有链接，无旁注 |
| `shot-siege-with-unit-1280.png` | 有单位截图 |
| `shot-siege-no-unit-1280.png` | 无单位截图 |

## 怎么看

用浏览器打开同目录的 `wire-*.html`（需要 `feedback.css`），或直接看 PNG。图标是占位方块，方块上的字是 Lucide 图标名。只做 PC 1280。

线框不画击数、游戏秒、现实秒。单位中文名与 ID 来自 `src/data/units.json`：422 是中型冲车。

## 这一刀的界面决定

旁注，不留 tooltip / 展开摘要。有单位时，在现有反馈簇旁边写一行 muted：`将附带：中型冲车 / 422`。没有可附带的「名 / ID」时，这行不出现，也不写「未选单位」。GitHub 预填 URL 不动。
