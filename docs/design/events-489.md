# 赛事公告资料页（issue 489）

## 冻结范围与来源

新增一个 `/events` 人工维护页面，标题「赛事公告」，仅收录稳定 ID `the-garrison-2026` 的 The Garrison 2026 公告卡。日期为主办方公布的日历范围 `2026-11-25` 至 `2026-11-29`，游戏为帝国时代 II：决定版，赛制为 `1v1` 赛事和 The League `3v3` 决赛。日期字段使用 `startDate` / `endDate`，不表示时间戳。核对日期 `2026-10-29`；明确提示「人工维护；以主办方最新公告为准」。

来源已于本轮预备工作核对，无需扩大采集：

| ID  | 用途与直接链接                                                                               | 支持的事实                                         |
| --- | -------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| E1  | [官方赛事公告](https://www.ageofempires.com/events/the-garrison-2026/)                       | 名称、日历范围、决定版、1v1 与 The League 3v3 决赛 |
| E2  | [主办方公告](https://beingesports.com/en/aoe2/news/thegarrison2026)                          | 名称、日历范围和赛制                               |
| E3  | [主办方公布名单](https://beingesports.com/en/aoe2/news/everyone-attending-the-garrison-2026) | 各选手的公布角色及队伍                             |

E1 的更新时间不能当作发布时间；E3 的 Oct 20, 2026 只有日期，没有核实完整时间戳及时区。全部 `sourcePublishedAt` / `publishedAt` 均为 `null`，界面显示「发布日期未核实」。来源链接称为公告与名单，不称为已核实的实际赛程。地点在来源中冲突，省略地点、奖金、精确小时、时区、实时或结束状态推断、预测。

「部分已公布参赛选手」仅链接现有已验证选手资料：Hera、Liereyy 各有 1v1 角色及 Team Vitality 的 The League 3v3 决赛角色；TheViper 仅有 Onimaru Capybaras 的 The League 3v3 决赛角色。每个角色分别存格式、队伍和 E3 证据定位，不把全局赛制强加给选手，不宣称完整名单或保证实际上场。不复制传记；资料页继续连接具体比赛文明，Hera 资料继续连接原专业视角视频。

## 数据与页面边界

唯一手工目录为 `src/content/events.json`，具有严格 schema、自动生成独立 validator、Node/浏览器共享语义检查和捕获异常的实际数据读取边界。检查真实日历日期、日期顺序、唯一事件/来源/参赛者/角色、已验证 profile 引用、来源引用、HTTPS、发布时间戳与北京时间日期的真实对应及 null 配对。不静默保留无效目录中的子集。

有效空目录显示「暂无已核对赛事」及人工维护说明；结构、来源、角色或选手引用失败时显示 `role="status"` 的「赛事资料暂不可用」，不输出卡片或坏链接。选手目录不可用时同样不可用。路由加载复用现有 Suspense 状态。未知 `/events/:id` 继续全局未找到页。

`pageRegistry` 唯一登记静态 `/events`，`secondary` / `reference`，导航、首页、搜索、元信息、静态 HTML、OG 和 sitemap 由原机制派生；不新增详情路由、筛选、订阅、实时服务、后端或嵌入。运行原拼音生成脚本。CI 现有 FULL/DATA=TRUE 不变。

## 可验收布局

使用现有页面宽度、卡片、边框和文字令牌：`--color-surface`、`--color-bg`、`--color-border`、`--color-text`、`--color-muted`、`--color-accent`，正文 `--fs-body`（15px），辅助文字至少 `--fs-xs`（12px）。页首 H1「赛事公告」与简短维护说明；卡片 H2 为赛事名，日期与赛制在标题后，参赛选手用列表，来源用可展开 details。选手链接和来源链接、summary 至少 44×44px；可见键盘焦点沿用全站。日期和数字组合使用 `.num` / `.nw`，长标题与 URL 允许断行。

在 360 / 375 / 390 / 1280，light / dark 八种组合检查实际加载卡片、展开全部来源以及空/不可用状态：无文档横向滚动，无 console error / pageerror，语义标题、链接和焦点正确，axe WCAG A/AA 通过；保留实际截图。

## 失败用例及保护

先在已发布 v0.65.0 `81abc3fe7072a29b19849859e2b7ea5dda181738` 运行仅使用既有 PAGES / HOME_GROUPS / PAGE_META API 的登记与元信息断言；真实旧构建直接打开 `/events` 后，缺少「赛事公告」H1 的断言应失败。不得以缺模块或收集失败充当红灯。独立代理复核规格和真实红灯后方可实现。

实现后覆盖种子事实、逐人角色、严格 reader、有效空与无效状态、导航/刷新/前后退、三条 profile 及文明/专业视角链、公告链接、搜索拼音、meta/static/OG/sitemap。全部原有数值、阈值、timeout/retry/skip 和历史断言不变。

日期保护保留所有旧时间戳、叶子与 13 项 mask；本次没有新增可核实的公开时间戳。表格保护仅追加独立 events companion 的 `360 /events` 和 `1280 /events` 两键，从实际 H1、卡片和展开来源就绪后采集；四个历史/188329/players/events owner 同时分区并拒绝缺失、额外、重叠或无归属。三个旧 fixture 字节 SHA 保持不变。

交付前完成完整 lint（含颜色/CSS）、类型、分层、严格内容、validator 可复现、拼音、metadata/build、相关单测与浏览器、全部冷加载预算以及四 owner 检查。版本 v0.66.0；独立最终复核使用实际提交和新构建/页脚/截图证据。远端 full/data 由 root 运行一次，root 独占所有 push/PR/merge/deploy/Release 操作。
