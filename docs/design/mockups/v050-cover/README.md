# v0.5.0 上线公告封面

截自线上站点 https://linhongcun.github.io/aoe2-analyzer/ ，页脚为「v0.5.0 · 数据版本：DE 185872（2026-09-22） · 构建 44c2898」（main @ 44c2898）。截图时间 2026-10-12 10:41（UTC+8）。截图里的数字没有改过。

- 盈亏平衡卡：`#/duel?a=359.Byzantines.4.f.&b=569.Franks.4.f.&m=n&na=10&nb=10&be=1`
  - 线上显示：**16** 个长戟兵才能打赢 10 个游侠（拜占庭 长戟兵·满科技 vs 法兰克 游侠·满科技，集火模型）；15 → A 负（含平局），16 → A 胜 剩 5、18 秒；17 → A 胜 剩 8、15 秒
- 折扣卡（截取局部）：`#/duel?a=359.Byzantines.4.f.&b=569.Franks.4.f.&m=r&bud=3000`，`[data-t=pk-cost-a]`
  - 拜占庭长戟兵：食物 ~~35~~ 26，木材 ~~25~~ 19，单价合计 ~~60~~ 45，派出数量 ~~50~~ 66，实际投入 2970 / 3000，「已计入：拜占庭 −25%」

| 文件 | 尺寸 | 来源 | 缩放 | 保留文字最小实际字号 |
|---|---|---|---|---|
| v050-cover-landscape-1200x630.png | 1200×630 | raw-landscape-breakeven.png + raw-landscape-discount.png（视口 390，DPR 2） | 1.3× | 盈亏卡 16.9px / 折扣卡 15.6px（要求 ≥14） |
| v050-cover-portrait-1080x1350.png | 1080×1350 | raw-portrait-breakeven.png + raw-portrait-discount.png（视口 560，DPR 2） | 1.67× | 盈亏卡 21.7px / 折扣卡 20px（要求 ≥20） |

两张图都是对整张卡片元素截图，图片按原始比例放进卡框，四边都没有裁切。
- 盈亏平衡卡只保留标题行、大号 16 和 15/16/17 结果表。截图前注入 `.be-sub,.be-sum,.be-how,.be-act{display:none}`，隐藏小字副标题（「16 个及以上都能赢」）、文明说明行、「怎么算的」说明框和按钮，放大后这些字号达不到要求。保留的数字和文字都没改。
- 折扣卡完整截取，包括「实际投入 2970 / 3000」和「已计入：拜占庭 −25%」那一行。

设计系统 C：Inter / Noto Sans CJK，底 #f5f5f7、白卡，次要文字 #636366，版本号和图标 #a65a14，图标只用 Lucide `scale`，没有 emoji 和二维码。

复现：`node capture.mjs`（需要 playwright），会截原图、写 `els.json`（线上文字和数字），并用 HTML 排版输出两张 PNG（排版源码见 `*.html`）。
