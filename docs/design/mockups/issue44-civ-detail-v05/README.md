# #44 文明详情页 · v0.5 设计储备（待 Steve 定范围，未开发）

底图：线上 `#/civ/Franks`、`#/civ/Khmer`（构建 6b786a6），`shot.mjs` 只改 DOM。数据全部出自 `src/data/civs.json`（bon / op 字段）和 `build-orders/scouts-18.json`（名称）。

| 文件 | 内容 |
|---|---|
| civ-franks-1280.png / civ-franks-390.png | 支持模拟的文明（法兰克） |
| civ-khmer-1280.png / civ-khmer-390.png | 置灰文明（高棉，simSupport=false） |
| civ-franks-390-dark.png | 暗色检查（tokens.css `data-theme=dark` 取值） |

## 1. 完整加成表入口
- 「文明加成：」标题同行右侧放链接「查看全部文明加成 ›」→ `#/bonuses`；14px `--color-link`，点击区 min-height 44px。
- 是否带 `?civ=` 定位到本文明：待 Steve 定（/bonuses 目前不认这个参数）。

## 2. 「仅文本 / 已计入」改写
- 标签改为「**已计入数据**」/「**仅说明**」（颜色沿用现有 good / warn 标签）。
- 标题下加一行图例（12px `--color-muted`，可换行）：「已计入数据：站内属性和开局时间已经按这条算过」「仅说明：只列出文字，站内数值还没算进去」。

## 3. 推荐开局：分隔 + 支持/置灰区分
- `op` 按 `->` 切段，每段一个 `--color-surface-2` 胶囊，中间 `→`（`--color-muted`，aria-hidden）。390 下自动换行。
- 下面一行「开局时间线：{开局名} ›」→ `#/builds?bo=…&civ=…`，名字取开局 JSON 的 name.zh。
  - 支持文明：后面小字「按{文明}计」。
  - 置灰文明：后面小字「加成未计入，按通用计」（与 #42 / #19 置灰文案同源）。
  - 小字 12px `--color-muted`，nowrap。
- **op → 开局 的对应关系 repo 里没有**，样稿里法兰克/高棉都临时对到 scouts-18 并标「对应关系为示例」；上线前需要一张 civ→bo 映射表，对不上的文明不显示这一行。

## 验收
- 390：`scrollWidth == 390`（四张都测过），无横向滚动。
- 只用 token，无 hex。AA：亮色 muted #636366 / surface-2 5.5:1，link 5.57:1；暗色 muted #a1a1a6 在 #000 8.16:1、#1c1c1e 6.61:1、#2c2c2e 5.42:1，link #4da3ff 在 #1c1c1e 6.48:1。
