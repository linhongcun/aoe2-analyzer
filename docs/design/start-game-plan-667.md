# 开一局推荐卡与本局打法（#667）

基线 actual main `281aee337e52edc92c4d5161f8bca4d21331f1c1`；版本 v0.77.13。独立设计预审 v4 与开局消费子审已通过。本项不改机制公式、排序、数据、来源 pins 或机制覆盖。

## 卡片和摘要

机制仍仅支持明确阿拉伯／4v4／路位。主卡默认显示文明中英文名、城堡时代与当前考察兵种（弩手24或骑士38，名称读真实数据）、一句真实文明理由、选择按钮及默认关闭“为什么”。对照样本明确标注；blocked/unavailable/budget 优先显示真实原因，不将无兵标成优先。

工秒、可负担数量、到达／先手窗口、属性、科技和输入摘要全部置于每卡“为什么”内。已有“查看计算输入”和范围来源仍可查；两阶段账本已有独立折叠，保留。理由不解析中文加成中的数字、不生成新评分。不列颠射程、玛雅费用、埃塞射速、越南生命；柏柏尔费用、匈奴生产、法兰克生命均限真实事实。先手机会只按 opportunities>0 且有兵判断，费用／生命不等于先手或完整战力。保留#677到场不计耐久、#678零机会与人数分开、#679正确科技名。

摘要保留文明芯片与#671工具限制。有效条件显示“本局场景”的兵种时代、独立输入概览和所选文明同一真实计算行；输入可直接辨认，详细数值可折叠。非null Route另显示“两阶段参考”的独立输入及真实结果，不与Scene额度／军队相加。未覆盖／不可用文明保留真实原因；未选文明不造默认结果；范围外不显示旧结果。数据和开局目录按需加载，加载中有状态，失败有局部重试且仍可修改／重开；只保存可复用目录和context，每次按当前state派生，不让迟到请求回写旧结果。

## 输入协议与归属

StartState新增各自nullable的sceneConfig／routeConfig；null是当前路位默认值，只有实际调参才存完整对象，展开details不算调整。两份控件受本局state控制，互不改预算／距离／期限／畜牧，不保存结果或数据对象。轻量类型／默认／校验模块不能同步拉入重模型。

| Scene字段 | 精确允许值                         |
| --------- | ---------------------------------- |
| age       | 3                                  |
| budget    | 0、2000、12000                     |
| distance  | flank:2、12；pocket:10、30、60     |
| reaction  | flank:0、0.5、1.25；pocket固定0.5  |
| room      | flank:0、4、12；pocket固定0        |
| deadline  | pocket:60、120、1200；flank固定120 |
| mode      | pocket:new／ready；flank固定new    |
| husbandry | pocket:boolean；flank固定true      |

| Route字段                  | 精确允许值                          |
| -------------------------- | ----------------------------------- |
| feudalBudget／castleBudget | 各自0、600、2000、3000、6000、12000 |
| survivors／newLimit        | 各自0、6、12                        |
| distance                   | 0、10、30、60                       |
| deadline                   | 0、60、120、1200                    |
| husbandry                  | pocket:boolean；flank固定true       |

数字必须有限JSON number并精确命中集合；配置对象字段齐全、严格白名单，不转换字符串、不截断。不扩大原领域引擎宽边界。

| 事件                                                                                              | 两份输入                   |
| ------------------------------------------------------------------------------------------------- | -------------------------- |
| 返回／jump／edit／openLane、同值mode/teamSize/map/lane、文明变化／skip civ、完成／skip opponent   | 保留                       |
| 真实mode/teamSize/map/lane变化、armTeam从1v1改为null、pickCiv可选lane确实变化、skip mode/map/lane | 都置null，文明按原规则保留 |
| reset／enterLobby／放弃失败候选                                                                   | 都置null，沿原文明语义     |

沿用local key、envelope version1及URL sgv1。旧state原7字段仍必需；新两字段各自可缺失或null，逐项重建null，新编码总写完整字段。合法旧choice/current/skipped/prefilled保留；未知state键仍非法。非null配置仅在确切team／4v4／arabia／lane有效，否则拒绝而非静默修正。local／URL共享校验，4096-byte限制、percent／单次解码、URL优先、invalid/pending/failed零写及address/epoch／迟到promise双guard保持。

## 真实开局

将现有selectOpeningBuilds原样抽至中立领域模块，文明页继续原完整候选、显式成员优先、稳定顺序／去重、仅无成员才首阶段通用示意；不复制近似算法。摘要按明确路线选真实候选：flank匹配archers；pocket优先scouts，缺失时仅允许真实fast-castle-knights。其它条件保留#671文明上下文且说明未指定打法；无匹配诚实空态，给“查看全部开局”，不声称筛选。

| 样本                              | 本局流程与基础点击目标                                                  |
| --------------------------------- | ----------------------------------------------------------------------- |
| Britons／Mayans／Ethiopians flank | archers-19，19村民点击升级封建                                          |
| Huns／Franks pocket               | scouts-18，18村民点击升级封建                                           |
| Berbers pocket                    | fast-castle-knights，25村民点击升级城堡；安全直城后转型，不适合盲目裸奔 |
| Vietnamese flank                  | archers-19，明确通用示意                                                |
| Incas、Mayans pocket              | 无匹配，不伪造bo                                                        |

目标村民数取真实order.target.vils，表示点击升级，不是到达时代或总人口；不展示手写旧time。链接带实际bo+civ，加载目录保持lazy。验收真实timeline流程、文明控件与sum-civ计算说明，来源适用／通用示意与模拟支持分开。

## 验证与交付

公开v0.77.12真实先红：卡片计算p默认可见（预期隐藏）、调参后摘要缺本局输入、Britons边路链接未选具体archers-19时间线。绿色覆盖四宽默认折叠与展开同一数值、Scene／Route不同输入互不覆盖、控件返回／reload／独立context完整URL／冲突local、同值保留及全部清空入口、旧v1缺字段兼容、严格非法配置零写／原异步竞态。8图为四宽主卡折叠与已调两账摘要；360／375／390／1280无横溢或页面错误，原明暗／axe／触控／数字不换行保持。

普通机制／路线／592断言只迁移到正确展开层，不删数值、科技、来源、失败恢复或670/674/669/671目的；新增用例放持续home登记文件并守600行限制。selector原#480全56文明／显式优先／顺序空态及真实目标回归保持。中立模块可能触发完整CI，接受实际分类，不改策略求窄。独立最终源码／8图审、exactPR CI、actualmain／Pages、线上真实功能／身份、正式Release／tag／twobytes／全部文件hash及observer全部核验后关闭，才开始#666。
