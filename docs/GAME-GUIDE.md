# 一局与观赛入门卡

路由 /game-guide，页面 testid game-guide-page。六卡稳定ID：goal、roles、resources、ages、counters、watching；手工内容在 src/content/game-guide.json，来源审计见 docs/design/v0.26.0-audit256.md。

默认是常规 AoE2 DE 随机地图、通用黑暗时代示例和征服胜利设置。页面始终显示适用范围；游牧、帝国战争、文明特殊开局、战役、其他或未知胜利设置保持用户选择并显示未覆盖，暂停六卡具体正文。不提供起始人数、固定升级时点、胜率或完整教程目录。

六卡包含短解释、本站整理例子、自查问题及答案、适用边界、细节链接和逐卡来源。自查不评分，不宣称用户已经学会。细节链接复用术语、操作、战役、DLC、生产、开局和PK等既有功能。

## 分享契约

空入口使用默认。非空查询必须完整提供 v=1、card、context、victory，各键唯一。context是standard/nomad/empire-wars/special-civ/campaign；victory是conquest/other/unknown。非法结构、编码、版本、枚举、未知或重复键暂停恢复并保留原链接，必须明确重置。最大查询长度1024字符。分享输出不带外层追踪参数，使用同项目静态 /game-guide/ 入口及完整查询；适合静态页转回HashRouter。

页面只展示当前卡，导航可在六卡之间切换。单卡与范围选择进入URL，刷新和分享恢复；复制失败显示完整手动链接。来源和答案使用可展开区块，键盘可访问。无存储、无外部提交、无自动视频/游戏读取。
