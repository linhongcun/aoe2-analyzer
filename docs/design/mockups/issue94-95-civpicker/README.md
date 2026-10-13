# #94 + #95 定稿 · CivPicker 高亮对比度与手机弹层高度（v0.7.0，#120）

截图 `civpicker-{360,375,390,1280}.png`，移动端按 2x 截。四档下 scrollWidth 都等于视口宽度。

## #94 状态与改法（`src/shared/styles/base.css` `.cp-*`）
- H0：现状对照。`.cp-opt.act` 用 `--c-tag` #f2f2f7 底，对白底只有 1.12:1，不达标。
- H1：键盘或悬停高亮 `.cp-opt.act`。背景 `--color-accent` #a65a14，文字和英文小字都是 #fff。`.cp-opt:hover` 和 `.act` 用同一套样式。
- H2：已选中 `.cp-opt.sel`。文字 `--color-accent` 600，英文小字也用 accent，行尾放 Lucide `check` 16px。不加底色，和高亮区分开（原来的 `--c-gold-hi` 现在等于正文黑，看不出选中）。
- H3：既选中又高亮 `.act.sel`。琥珀底，白字，白色 check。
- H4：搜索框聚焦 `.cp-q:focus-visible`。边框 #a65a14，外加 `0 0 0 2px #a65a1433` 外圈。
- 触发器 `.cp-trigger:hover / [aria-expanded=true]` 的边框改为 `--color-accent`。

| 测量（计算样式，360/375/390/1280 相同） | 现状 | 定稿 |
|---|---|---|
| 高亮底 / 容器 #fff | 1.12:1 | 5.13:1 |
| 高亮底 / 相邻非高亮行 #fff | 1.12:1 | 5.13:1 |
| 高亮行文字 | #1d1d1f / #f2f2f7 15.08:1 | #fff / #a65a14 5.13:1 |
| 高亮行英文小字 | #636366 / #f2f2f7 5.37:1 | #fff / #a65a14 5.13:1 |
| 选中项文字 / #fff | 16.83:1（和普通项无区分） | #a65a14 5.13:1 + check |
| 聚焦边框 / 输入底 #ececf0 | — | 4.35:1（非文字，≥ 3:1） |

e2e 按 #94 的写法：按 ↓ 高亮第一项后，取 `.cp-opt.act` 的 computed background 和 `.cp-list` 的背景比，要求 ≥ 3:1，预期是 5.13。

## #95 手机弹层高度（`@media (max-width: 899px)`）
```css
.cp-panel{height:min(75dvh, calc(100dvh - 48px)); max-height:none;   /* 固定高度，不随结果变 */
  padding-bottom:env(safe-area-inset-bottom)}
.cp-list{flex:1 1 auto; min-height:0; overflow-y:auto; overscroll-behavior:contain}
.cp-empty{height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center}
```
- 不支持 `dvh` 的浏览器回退到 `75vh`：先写一行 `height:75vh`，再写上面那一行覆盖。
- 顶部至少留 48px 遮罩，方便点空白处关闭。拖动条 40×4px，颜色 #c7c7cc，只做装饰。
- 状态：
  - M1：打开时显示全部结果，列表在面板内部滚动。
  - M2：过滤后剩 1 条，高度不变。
  - M3：无匹配，空态居中在固定高度内。
- 空态文案：Lucide `search-x` 24px 图标 +「没有匹配「{q}」的文明」，下一行「可以试试英文名或拼音」。13px，muted 色。
- 验收对照：
  - 高度在过滤前后不变：M1 到 M3 的面板高度相同。
  - 输入框位置：`.cp-q` 的 top 变化 ≤ 1px。
  - 空态不溢出，也没有横向滚动。
- 桌面（D1）：保持下拉面板 `max-height:440px`，只改高亮、选中、聚焦三种样式。

## 待确认
1. 手机键盘弹出后，可视高度会变小。稿里用 `dvh`，面板会跟着键盘缩一次。这一次是键盘造成的，不是过滤结果造成的，Kent 的 e2e 应该在键盘状态不变的前提下测。
2. 「可以试试英文名或拼音」这句的前提是搜索支持拼音，需要 Linus 确认现在是否支持；不支持就删掉这一句。
