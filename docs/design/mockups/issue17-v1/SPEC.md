# #17 专题页 v1 · 丹麦 vs 罗马：到封建的食物差

设计系统 C；muted #636366；琥珀 #B25000 只用于结论关键数字和「升级中」条；图标仅 Lucide；正文对比度 AA。手机 390 优先，电脑 1280。

## 数字来源（全部 buildSim 实跑，无手写）
- 代码：main @ `8510871`，`src/domain/buildSim.ts` `simulateBuild`（MODEL_VERSION m2-0.1）
- 命令：`npx vite-node scripts/topic17.ts fast-castle-boom`（脚本见本目录 topic17.ts，原始输出 buildsim-fast-castle-boom.json）
- 参数：bo=`fast-castle-boom`；civ=Danes / Romans；walkTiles=2/4/7（中=4 为当前）；nearTiles=2；autoHouses=true；team=false；idleThreshold=2
- 取值：ageUps[feudal].clickAt/reachAt/errSec；食物/村民/人口取 action=ageup 那一步（doneAt = reachAt）的 stock/vils/pop；TC 闲置 = reachAt 之前 idle_tc 异常时长合计

| 走路 | 文明 | 点升级 | 到封建 | 误差带 | 食物 | 村民 | 人口 | TC闲置 |
|---|---|---|---|---|---|---|---|---|
| 4 | 丹麦 | 543.6 (9:04) | 673.6 (11:14) | −35.3/+68.8 | 563 | 23 | 24/25 | 42.7 |
| 4 | 罗马 | 533.1 (8:53) | 663.1 (11:03) | −32.6/+68.4 | 620 | 23 | 24/25 | 32.7 |
| 2 | 丹麦 / 罗马 | | 638.3 / 630.5 | | 559 / 616 | | | |
| 7 | 丹麦 / 罗马 | | 742.4 / 731.5 | | 757 / 800 | | | |

结论（中 4 格）：罗马早 10.5 s（显示「约 11 秒」），食物多 57。主语按 Steve 规格取占优方，不写负号。

## 待接入
- `var`（激进/保守）：buildSim 目前 variant 恒为 null，无此参数 → 参数区显示「待接入」灰虚线 chip。
- 分享图 og 1200×630：沿用 #19 横版模板，数字填上表结论。

## 结构
结论卡（标题 + 一句话 + 估算说明 + 参数 tag）→ 差额卡（时间差/食物差，白话主语）→ 升封建时间线（黑暗时代灰 / 升级中琥珀 / 误差带框）→ 两列对比卡（每列右上「按 {文明} 计」12px muted）→ 走路距离对照表 → 计算假设（可改，改了两侧重算；「在开局时间线中打开 · 丹麦/罗马」各带 `#/builds?bo=…&civ=…&dist=…&house=…`）→ 方法说明（折叠，链关于数据）→ 来源行。
手机：底部固定栏 90px（与 issue39-mobile 一致：主按钮「复制链接」黑底 + 次按钮「分享图」）；首屏不滚动可见结论、差额、时间线。电脑：右栏 sticky（差额 / 假设 / 复制链接 / 生成分享图）。
分享 description 用「走路距离中」。界面不出现「禁止写死」。
