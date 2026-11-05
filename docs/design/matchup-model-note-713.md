# #713 推荐反制的模型边界说明

基线main d51c3ff489767850299727f068bfa640abc7ba7a；目标v0.77.30。仅改Matchup资料说明与既有Link，不改模型、数据、推荐/可用性/评分、URL状态、样式或保护验收。

## 窄规格

在`#/matchup`的“推荐反制”标题段后、所有`e.ty`句及推荐列表/空推荐前，新增可见`.note.matchup-counter-note`：

> 以下反制建议为通用示意，非模型结论。当前 PK 采用近似计算，忽略射程、走位/风筝、地形高低差、冲锋攻击和溅射；击杀时间不能证明能否贴脸或绕后。

同段放“查看 PK 模型能力与限制”，沿现有`Link to="/duel"`和`community-tool-entry`，不用ulink或裸锚点。点击后等待现有`.duel-note`完整能力限制；不修改Duel文案/公式或捕获。

新增说明只约束推荐区，保持上方真实Champi接触比较及`#mres`首段相对弱项原位。链接在列表外，原generic单位链接→文明模拟链接Tab顺序不变。新段沿原成功结果容器，部分/无效对阵、加载、资料错误均不生成陈旧结果。

## 证据与验证边界

先记录实际线上基线Franks对Britons的推荐区缺统一免责声明/模型链接（独立记录manifest/footer身份与截图），不是把已有早期应对通用说明算作本区说明。当前Duel明确忽略射程、走位/风筝、地形、冲锋与溅射，本项不新增游戏参数或胜率。

本项为可逆低影响纯文案/链接，按更高优先开发者/root要求不新增镜像测试、不改原期望或CIpolicy。沿现有matchup194、matchupSim424和availability回归；适用静态/类型及真实SHA生产构建。实际四宽360/375/390/1280×明暗检查新段可见且清楚、无溢出/页面或console错误，唯一新段WCAG A/AA axe零违规，链接实际≥44×44、原生href与真实点击落地能力说明。截图fullPage前blur/scroll0，含实际版本/SHA；先本人首图自检再push。实际diff按既有targeted matchup/data=false门禁，不人为造full或放宽规则。

独立代理先审范围/基线观察，后审最终源码、真实SHA和四宽图；集成协调者负责适用CI、main/线上/正式Release闭环后关闭issue。
