# #758 越南游牧定位与揭示边界

核对日 2026-11-07。只在越南文明详情的概览里加一张短卡，说明这条定位加成在游牧上的用途，以及它揭示到哪里为止。不写开局脚本，不改穆伊斯卡、埃塞俄比亚、瓦兰吉人的竞技场黄金卡，也不挂到首页开一局、加成列表或工具页。

## 本站数据

`src/data/civs.json` 里越南的第一条文明加成：

- 中文：游戏开始时就能显示敌方城镇中心位置
- 英文：`Enemy Town Centers are revealed at the start of the game`

团队加成是另一条：

- 中文：在帝王时代可升级为帝王掷矛手
- 英文：`Imperial Skirmisher upgrade available in Imperial Age`

短卡把这两行并排读出来。揭示位置属于文明加成，帝王掷矛手才是团队加成。

## 来源与取用边界

| 来源                                                                                                      | 2026-11-07 怎么看到                                                                                                                                            | 取用                                                                                                                       |
| --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 本站 `civs.json`                                                                                          | 直接读当前 main                                                                                                                                                | 文明加成原文和团队加成原文                                                                                                 |
| [Fextralife 越南](https://ageofempires2.wiki.fextralife.com/Vietnamese)                                   | 整页打开。页首写最后编辑 2026-09-11                                                                                                                            | 文明加成英文与本站一致。该页团队栏写成 Imperial Skirmisher (disable): unavailable，和本站、Fandom 都不一致，短卡不采用这句 |
| [Fandom 越南](https://ageofempires.fandom.com/wiki/Vietnamese)                                            | 直接打开返回 403。检索可读页写明文明加成是 Reveal enemy initial Town Centers location at the start of the game，团队加成是 Imperial Skirmisher upgrade         | 用 “initial Town Centers” 把揭示对象收成敌方初始城镇中心位置。团队加成仍以本站原文为准，不另写靶场条件                     |
| [Fandom 越南策略](https://ageofempires.fandom.com/wiki/Vietnamese/Strategy)                               | 直接打开返回 403。检索可读段落写了 each enemy Town Center，也写了 Nomad 上 initial enemy Town Centers 在对手完工后显示                                         | 更宽的「每座」不采用，标为待确认。完工时点只作为社区说法                                                                   |
| [Liquipedia 游牧](https://liquipedia.net/ageofempires/Nomad)                                              | 直接打开返回 403。检索可读句为 Vietnamese are great for spotting enemy first Town Centers as soon as they finish building them. 同页把游牧写成开局没有城镇中心 | 首座完工后才显示，以及游牧开局没有城镇中心，都标成社区依据                                                                 |
| [官方 Update 73855](https://www.ageofempires.com/news/age-of-empires-ii-definitive-edition-update-73855/) | 整页打开。Civilization Balance / General 写 The Shared LoS setting is now on by default on for all matchmaking modes including lobby games.                    | 共享视野默认开启是通用设置，不是越南专属细则                                                                               |

官方公告没有写越南城镇中心的触发时点，也没有写后续城镇中心、地基或实时视野。本站没有做当前版本实测，短卡不写实测通过。

## 短卡怎么说

- 价值：在游牧等地图定位对手、规划进攻和团队协同。
- 对象：敌方初始城镇中心的位置。不写初始单位，也不写成敌军持续视野。
- 团队：队友能否利用这个位置，取决于本局开了共享探索或共享视野。不写先造市场才能共享。
- 时点：本站原文是游戏开始时。社区资料另称游牧要等首座城镇中心完工。两句都摆出来，完工时点保持当前版本待确认、未实测。
- 冲突：策略页还有「每座敌方城镇中心」的说法。短卡只采用初始位置，更宽范围待确认。不由此推出新建、重建、地基或持续实时视野。

## 不在这张卡里

固定开局人数和时间、首页开一局、其他文明、市场买卖，以及任何未在上表出现的触发条件。
