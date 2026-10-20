# 战役入门目录（#240）

入口 `/campaigns`；手工策展数据为 `src/content/campaigns.json`，独立于自动生成的科技树与 `.dat` 数据。核对日期为2026-10-20。本页帮助查找和排序，不规定唯一游玩路线。

## 有限收录与数据口径

固定10项：威廉·华莱士教程；圣女贞德、萨拉丁、成吉思汗、巴巴罗萨；匈奴王阿提拉、熙德、蒙提祖马；黑斯廷斯与阿金库尔两场历史战役。普通单人AoE2以外的Chronicles、Return of Rome、合作变体，以及孙子兵法、其他战役与社区模组暂未收录。无结果不意味着游戏中不存在该内容。

| 条目                          | 中英文名称字符串ID | 首发内容包 / 年 | 游戏覆盖年代 |
| ----------------------------- | ------------------ | --------------- | ------------ |
| 威廉·华莱士 / William Wallace | 35146              | 国王时代 / 1999 | 1296–1298    |
| 圣女贞德 / Joan of Arc        | 34935              | 国王时代 / 1999 | 1428–1453    |
| 萨拉丁 / Saladin              | 34965              | 国王时代 / 1999 | 1163–1191    |
| 成吉思汗 / Genghis Khan       | 34995              | 国王时代 / 1999 | 1186–1241    |
| 巴巴罗萨 / Barbarossa         | 35025              | 国王时代 / 1999 | 1152–1191    |
| 匈奴王阿提拉 / Attila the Hun | 35245              | 征服者 / 2000   | 434–453      |
| 熙德 / El Cid                 | 35275              | 征服者 / 2000   | 1057–1102    |
| 蒙提祖马 / Montezuma          | 35305              | 征服者 / 2000   | 1515–1521    |
| 黑斯廷斯战役 / Hastings       | 35321              | 征服者 / 2000   | 1066         |
| 阿金库尔战役 / Agincourt      | 35323              | 征服者 / 2000   | 1415         |

每个字段的出处、定位、核对状态在JSON的`fieldEvidence`中。每项来源可在卡片中折叠展开，包含来源性质、核对日、可得的发布/更新日和版本。JSON源清单是完整数据记录，不能只因某个字段已核对便把整项称为当前客户端实测。

- **名称**来自已读取的[英文固定语言镜像](https://github.com/wj654cj86/aoe2DeLanguageReader/blob/12d8d5280e0b0a85f8dfdc558b4ad79279f8b73c/resources/en/strings/key-value/key-value-strings-utf8.txt)与[简体中文固定语言镜像](https://github.com/wj654cj86/aoe2DeLanguageReader/blob/12d8d5280e0b0a85f8dfdc558b4ad79279f8b73c/resources/zh/strings/key-value/key-value-strings-utf8.txt)，固定Git提交`12d8d5280e0b0a85f8dfdc558b4ad79279f8b73c`（2022-12-31）。文件SHA256保留在数据里；镜像未声明客户端build。`蒙提祖马`是已核对主名；“蒙特祖玛”等仅为本站搜索别名。历史战役名称中末尾年份移到独立年代字段。
- **年代**唯一使用开发方[Campaigns Timeline](https://www.forgottenempires.net/age-of-empires-ii-definitive-edition/campaigns/campaigns-timeline)。其中贞德起点是1428；不替换成其他网站的1429。此数据是游戏剧情覆盖区间，不是生卒年，也不声称剧情严格等于史实；网页未标客户端build。
- **类型、原始系列归属与剧情地点**来自开发方[Campaigns](https://www.forgottenempires.net/age-of-empires-ii-definitive-edition/campaigns)。地区是本站按剧情地点归纳的洲级多标签，不是游戏菜单分类；萨拉丁跨非洲/亚洲，成吉思汗和巴巴罗萨跨亚洲/欧洲。历史战役不因菜单位置被归入非洲。
- **文明**：华莱士与凯尔特关联有[官方PC教程](https://www.ageofempires.com/learn-to-play/getting-started-aoe2/)支持；其余来自2021-01-27发布、2024-05-12更新且实际打开核对的[Raigavin客户端悬停抄录](https://steamcommunity.com/sharedfiles/filedetails/?id=2375610295)。只取文明关联，不取其年代或难度；来源性质在每张卡片直接说明。熙德为西班牙与萨拉森。没有声称这些社区抄录已在DE185872客户端实测。
- **首发年**沿用已发布的[固定发行目录](https://github.com/linhongcun/aoe2-analyzer/blob/c8c2171501dcf1a46eab32ce48c8d3308d6c9ae3/src/domain/dlc.ts)，仅为年精度；[Microsoft1999新闻](https://news.microsoft.com/source/1999/10/18/microsoft-age-of-empires-ii-the-age-of-kings-catapults-onto-store-shelves/)另支持国王时代1999已上市。精确首发日未核实，保留`null`，不补1月1日。
- **官方剑级**目前全部`null`，显示“未提供”。官方[Update34055](https://www.ageofempires.com/news/aoe2de-update-34055/)只说明1/2/3剑的通用意义，不证明本批各项剑数。剑级与玩家选择的标准/中等/困难是不同维度，不能把未知值当0或最容易。若日后补充非空剑数，必须带逐条来源。

历史`originalContentPackId`使用`age-of-kings`和`the-conquerors`；当前购买导航的`contentPackId`为`base`，仅联接`/content-guide?pack=base`。本模块不复制当前权益、动态价格或账号拥有状态，不改旧`domain/dlc.ts`。

## 查询与排序契约

名称搜索使用中文名、英文名与明确本站别名；进行NFKC、大小写、空格和常用名称标点归一，输入不当正则表达式。文明、年份不默认为名称别名。地区、类型、首发内容包与名称取交集；无结果保留条件。

原始发售按首发年升序，游戏覆盖历史按已核对起点升序；两者的未知年份都排末尾。相同起点或同首发年按ASCII稳定ID排序，结束年不参与排序，输入顺序不改变并列结果。区间重叠照实保留，不拆成虚构单一路线。

## 严格恢复与分享

空首次访问提供默认值。非空URL使用完整版本化字段：

```text
#/campaigns?v=1&q=&region=all&type=all&releasePack=all&sort=release
```

`q`最多100个UTF-16代码单元；不含控制字符或孤立代理项。原始query最大4096个代码单元。地区枚举`all/europe/asia/africa/americas`；类型`all/tutorial/campaign/historical-battle`；首发包`all/age-of-kings/the-conquerors`；排序`release/history`。

重复键（含编码后的同键）、未知键、缺字段、错版本、无等号字段、坏百分号/UTF-8编码、超长query属于结构损坏：暂停结果，保留完整原链接，明确重置后恢复。能安全解析但语义非法的枚举或过长名称保留在控件中，允许逐字段修正；未修正前不显示结果、不允许分享。没有截断后声称恢复成功。

`encodeCampaignFilters`输出规范完整字段。`campaignShareUrl`把完整条件放入HashRouter片段，清除无关外层query，规范化当前`/campaigns/`静态路径并保留项目部署base。复制失败时显示可手动选择的完整链接，异步复制反馈只属于发起复制时的条件。

主要导出接口为`CAMPAIGNS`、`CAMPAIGN_CATALOG`、`defaultCampaignFilters`、`campaignFilterErrors`、`decodeCampaignFilters`、`encodeCampaignFilters`、`filterCampaigns`、`campaignHistoricalRange`、`campaignSwordLabel`、`campaignShareUrl`、`campaignCatalogErrors`。公共全局搜索若需带名称直达，应调用编码器生成完整条件。

## 验证边界

专项单测位于`tests/unit/campaigns240.test.ts`，覆盖有限清单、来源引用、未知剑级、全部中英文搜索、组合交集、跨洲、两种稳定排序、缺失年代、严格损坏恢复、语义修正与部署子路径分享。浏览器专项由整合执行者安装到`tests/e2e/campaigns240.spec.ts`，统一验证四宽双主题、无结果、来源折叠、键盘、AA与44px、复制成功/失败、刷新与前进后退。软件验证不代替固定游戏客户端实测或人工验收签字。
