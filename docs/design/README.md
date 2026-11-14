# 设计稿索引（持续更新）

## 当前工程与设计入口

- [设计系统](DESIGN-SYSTEM.md)
- [默认 CI #749](ci-749.md)、[机制 #652](mechanism-652/SPEC.md)、[路由 #652](routes-652/SPEC.md)
- [#478 来源证据流程](build-sim-source-478.md)、[机制来源流程](build-mechanisms-478.md)
- [#3 时间线摘要样稿](mockups/issue3-summary-2x2/range-390/)

2026-11-09 定向 UI 优化见 [页面任务优先的 UI 优化](task-focused-ui-2026-11.md)：移动列表筛选、开一局层级、文明/单位详情扫描三项；包含真实跨行业参考、冻结规格、量化对比、验证边界与可复用规则。

## 设计交接

改界面前先读同一 Issue 正文的当前需求与“体验设计”规格、本索引和 [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md)。正文是单项决定、当前规格和交接记录的主来源；每次实际 UX 交付都必须把完成态、可直接查看的设计图嵌入正文，覆盖主要界面和重要状态。复杂/可复用规格可由正文链接到本目录补充，但不能代替正文中的图。链接到短稿目录时，如有 `ERRATA.md`，优先于该目录 SPEC；当前只有 [mockups/issue24-v3/ERRATA.md](mockups/issue24-v3/ERRATA.md)。阶段、认领、授权和交接规则见 [CONTRIBUTING「Issue 生命周期」](../../CONTRIBUTING.md#issue-lifecycle)。

- **挂靠**：UI 当前规格、决定和完成态设计图写在原 Issue 正文“体验设计”节；设计图须直接显示、覆盖本范围主要界面和重要状态。复杂/可复用规格可附加或链接 `docs/design/<topic>/` 补充，不取代正文设计图。不为阶段变化新建设计/实施 Issue 或 per-issue 文档。没有可执行的已授权范围则留在当前阶段补齐，不自创版式、不扩范围。设计通过不等于实现授权；只有纯 docs/data 且无 UI 时才可记录 UX 不适用。
- **硬规则**：方向 C（浅色编辑风）。界面图标只用 Lucide，经 `src/shared/ui/Icon.tsx` 登记，不用 emoji。游戏素材用 `public/img/` 原版图标。颜色只用 `src/shared/styles/tokens.css`。数字和「数字+单位」用 `.num` / `.nw`。中文 UI。PC-first（以 1280 为准），不为窄屏过度打磨。按本次改动影响选择必要视口和界面证据，如实标明覆盖，不固定四宽。
- **角色**：Steve 定范围和「设计通过」。Jony 负责好用与美观；每次实际 UX 交付都提供可查看的完成态界面图，直接嵌入同一 Issue 正文，不以文字、规格、线框或本地 ZIP 代替，并由产品对照范围确认图及重要状态。只有纯 docs/data 且无 UI 时可由产品经理记录 UX 不适用及理由，不得用于实际 UX 工作。旧组件功能可以有理由取舍。编码代理实现。视觉 PR 的旧版 15 分钟回复要求不作为现行交接门槛。产品、运营和视觉职责见 [CONTRIBUTING「角色」](../../CONTRIBUTING.md#角色)。
- **短稿**：目录通常有 `*.md`（验收、不要做）和 1280 线框或截图；这些短稿仅作补充，线框不能替代实际 UX 交付所需的完成态设计图。实现 PR 对照 §AC，按本次改动影响选择必要视口和界面证据，如实标明覆盖，不固定四宽。
- **当前**：`insights-584/` 已合 main（[#621](https://github.com/linhongcun/aoe2-analyzer/pull/621)）。[#584](https://github.com/linhongcun/aoe2-analyzer/issues/584) 已实现并关闭（2026-11-02，PR #623，CHANGELOG 0.74.11）。`ladder-571/` 已上线。后续解耦见 [#625](https://github.com/linhongcun/aoe2-analyzer/issues/625)（已关闭，设计稿 [ladder-independent-625.md](ladder-independent-625.md)）。

## 模型实现与来源证据

游戏行为由 `src/domain/`、`src/features/`、生成/内容数据和对应测试维护；#197 的机器可读来源、验证与量化证据继续留在本目录，不因退休叙述规格而改写。固定来源与可复现流程见 [build-sim-source-478.md](build-sim-source-478.md)、[build-mechanisms-478.md](build-mechanisms-478.md) 和 [`scripts/build_sim_source_history.json`](../../scripts/build_sim_source_history.json)；专项行为以 `tests/unit/`、`tests/py/` 为准。

- **交叉**：[MAINTENANCE §6 设计硬规则](../MAINTENANCE.md#6-设计硬规则摘要)、[CONTRIBUTING「设计与代码规范」](../../CONTRIBUTING.md#设计与代码规范)。交接与 issue 质量条见 [#627](https://github.com/linhongcun/aoe2-analyzer/issues/627)（产品侧主文档 PR 收口，本文不关该 issue）。

新增开局文明的来源证据按 [#478 有界摘要与固定来源重建流程](build-sim-source-478.md)执行；现有历史原件及对应验收保持。

v0.26.0 维护者授权范围与独立工程规格见 [学习工具规格](v0.26.0-learning-tools.md)（#259）；此条不表示 Steve/Kent 本人签字。

v0.39.0 数据维护规格见 [JSON 数据校验边界](issue285-json-validation.md)（#285）：全量结构、公开来源、冻结存量告警和五处读取检查；不改变玩家界面或游戏数字。

已下线（issue 839）：v0.40.0 补丁页骑弩对照入口见 [骑马弩兵与骑射手预置](mounted-crossbow-presets-441.md)（#441）：185872 上下文中的三组真实文明、无可选科技对照及可复制链接；规格与失败用例已独立复核，不改变单位 PK 的计算与界面。

v0.40.1 来源展示修复见 [开局与一局入门的公开来源](source-presentation-442.md)（#442）：保留原始证据及完整归属，页面和独立 checker 共用严格公开投影，清空旧迁移告警；规格与实际失败用例已独立复核。

v0.40.2 标题层级修复见 [单位 PK 标题大纲](duel-heading-order-364.md)（#364）：共享组件默认保持，PK 子树语义连续，局部 class 保留原外观；[视觉验证工具](duel-heading-364-visual/README.md)记录全页零像素差的核对方式。

已下线（issue 839）：v0.41.0 两条单位 PK 入口见 [波希米亚预置对战](bohemian-duel-presets-372.md)（#372）：精确真实文明、当前时代科技与静态分享链接；兄弟预置区与本地快捷跳转保留原计算器金标准，[真实先红摘要](duel-preset372-first-red.json)记录准备基线与独立preflight。

索引纳入已签字/已交付的主规格、短稿目录和验收/评审记录；一次性诊断、审计日志、历史 red/golden、个人草稿不逐条索引，留在对应目录。新增主规格或目录时同步本索引。

这里只放已签字或产品定稿的样稿和规格。生成脚本、评审截图、未签字的 v0.5 储备稿（#44 文明详情、#16）以及 #17 都留在归档分支 `design/jony-archive`，不进这里。
SPEC 里提到的 `shot.mjs` / `gen.py` / `capture.mjs` 等脚本也在归档分支上。样稿里的数字都以数据为准，和数据不一致时以数据为准。

- [机制 652 规格](mechanism-652/SPEC.md)（[#652](https://github.com/linhongcun/aoe2-analyzer/issues/652)）：机制说明与验证记录。
- [路由 652 规格](routes-652/SPEC.md)（[#652](https://github.com/linhongcun/aoe2-analyzer/issues/652)）：路由诊断、评审与验证记录。
- [#517 站点串联](site-linking-517/)（[#517](https://github.com/linhongcun/aoe2-analyzer/issues/517)）：对阵优先的信息架构稿，供 Steve 拆切片与 实现阶段 前对齐。
- [#626 跟随推鹿短提示](hotkeys-follow-626.md)：快捷键页首的 188329 社区实测用法、来源、四宽与既有个人表边界。
- [#308 攻城拆建筑](siege-308/)（[#308](https://github.com/linhongcun/aoe2-analyzer/issues/308)）：`#/siege` 视觉交互稿，供实现者与产品设计审阅。
- [#533 攻城情境入口](siege-533/)（[#533](https://github.com/linhongcun/aoe2-analyzer/issues/533)）：单位页「算拆建筑」、冲车检索、未核实反馈。短稿，供实现者在产品设计通过后实现。
- [#33 天梯数据](ladder-33/)（[#33](https://github.com/linhongcun/aoe2-analyzer/issues/33)）：`#/ladder` 阿拉伯 1v1 分段胜率与新手友好度视觉交互稿，供产品设计审阅后交实现者。
- [#545 天梯空分段](ladder-545/)（[#545](https://github.com/linhongcun/aoe2-analyzer/issues/545)）：顶栏只露有数据的 Elo 分段；当前快照改为只读「全部」。短稿，供 Steve 设计通过后由 Linus 实现。
- [#547 天梯快照与首屏截止](ladder-547/)（[#547](https://github.com/linhongcun/aoe2-analyzer/issues/547)）：换一份新于 p162286 的阿拉伯 1v1 静态快照，并把统计截止或「非当前平衡」升到来源条第一行。短稿，供产品设计通过后由 Linus 实现。与 #566 并行。
- [#577 天梯默认切片与三视图](ladder-577/)（[#577](https://github.com/linhongcun/aoe2-analyzer/issues/577)）：Steve P1。`#/ladder` 默认 4v4 随机地图 · Elo 1200–1400 · 近 90 天 · 全图；表和走势先做，分层与分布随后。短稿，供产品设计通过后由 Linus 实现。
- [#571 天梯模式与 Elo](ladder-571/)（[#571](https://github.com/linhongcun/aoe2-analyzer/issues/571)）：沿用现有两份快照。模式和 Elo 切到有数据的切片；没有快照的分段停用。来源条同时保留模式、Elo、地图和截止。
- [#581 报错反馈页内单位上下文](feedback-581/)（[#581](https://github.com/linhongcun/aoe2-analyzer/issues/581)）：Steve 双路 P2，排在 #577 A 之后。`#/siege?unit=422` 的反馈簇旁写「将附带：中型冲车 / 422」；没有可附带的名与 ID 时不显示。短稿，供产品设计通过后由 Kent 轻失败用例、Linus 实现。
- [#584 鲜为人知洞察槽位](insights-584/)（[#584](https://github.com/linhongcun/aoe2-analyzer/issues/584)）：2026-11-01 修订，对齐 #603 四卡。单位页固定槽，空态「暂无」；文明页只在有条目时插在评分卡与文明加成之间，无条目不挂、不写「暂无」。已实现并关闭（2026-11-02，PR #623）。
- [#559 地图边路 / 中路](maps-559/)（[#559](https://github.com/linhongcun/aoe2-analyzer/issues/559)）：地图详情在现有推荐文明下增加开图 4v4 的边路 / 中路编辑推荐；无稿显式待补。短稿，供 Steve 设计通过后实现。
- [#702 SD3 观赛窗口](maps-sd3-watch-702.md)（[#702](https://github.com/linhongcun/aoe2-analyzer/issues/702)）：`#/maps` 合集旁列出半决赛与决赛的上海时间和 UTC。开放时展开；2026-11-09 00:00 UTC 起收起为「本届已结束」。不接直播、不爬比分。
- [#592 开一局引导](start-game-592/)（[#592](https://github.com/linhongcun/aoe2-analyzer/issues/592)）：Steve 软锁。首页主路径 A 是模式 → 地图 →（仅组队才有路位）→ 文明 → 对手，可跳过、可回退，结束于「本局摘要」。B「已在大厅」从文明起。C 首刀不做。工具宫格降为「更多工具」。短稿，供产品设计通过后实现。
- [#602 文明详情菜单分层](civ-nav-602/)（[#602](https://github.com/linhongcun/aoe2-analyzer/issues/602)）：页内 Tab 是本页内容；情境条降为「相关工具」，只放离开本页的五件。职业选手视角只留 Tab。侧栏去掉「快速入口」。短稿即布局依据。
- [#603 文明概览主栏分区](civ-overview-603/)（[#603](https://github.com/linhongcun/aoe2-analyzer/issues/603)）：概览主栏分成开局、评分、加成、优劣。开局是一行路线加次要「查看全部开局」；定位和特色兵种收进评分卡；没有洞察就不占位；优劣用芯片。短稿，供 Steve 设计通过后另刀实现。不改 #602 的菜单。

| Issue     | 内容                                                                                                                                                                                                        | 路径                                                                                                                                                                           | 状态 / 签字                                                   |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| #24 / #25 | PK 等资源计入文明训练费用加成（v3）、盈亏平衡；勘误：柏柏尔骆驼城堡 −15% = 30（v3 图上的 32 作废）、.5 结尾按原价标「未计入」、韩国「折扣未计入」、「已计入」用加成原文 muted 12px、「按X时代价格」放价格旁 | `mockups/issue24-v3/`（SPEC.md、**ERRATA.md 优先**）、`mockups/issue25-v3/`（SPEC.md）                                                                                         | v3 已签字；勘误 2026-10-12（Steve 裁定）                      |
| #44       | 同名单位 / 易混淆（「别和 X 混淆」）/ 相关链接                                                                                                                                                              | `mockups/issue44-dup-names/`（SPEC.md）                                                                                                                                        | Steve 已签字（2026-10-11，a50f739 版；SPEC 出处补充 e6c5381） |
| #19       | 分享卡：主要卡点规则（卡在木头）、卡人口变体、「链接已复制」toast（Lucide check）、置灰文明不能生成分享卡的提示                                                                                             | `mockups/issue19/share-card/`（SPEC.md）、`mockups/issue19/share-controls/`                                                                                                    | v0.4 定稿（Steve，#58）                                       |
| #42       | 匈奴：置灰兜底（v0.4.0 主状态）、置灰时的分享提示、flag 后的状态（示例数据）                                                                                                                                | `mockups/issue42-huns/`（README.md）                                                                                                                                           | v0.4 定稿；匈奴在 v0.4.0 保持置灰                             |
| #14       | 首页单位数「163 个单位（精锐版并入对应单位计）…」                                                                                                                                                           | `mockups/issue14-count/`（README.md）                                                                                                                                          | 定稿；Steve 改为 163（按 unit id 去重），数字从数据计算       |
| #3        | 2×2 摘要（390）、误差行「误差 m:ss–m:ss」（有范围 / 无范围）                                                                                                                                                | [mockups/issue3-summary-2x2/](mockups/issue3-summary-2x2/)、[range-390/](mockups/issue3-summary-2x2/range-390/)；规格见 [issue3-timeline-spec.md](issue3-timeline-spec.md)     | Steve 已定（#56）                                             |
| #10       | 升级路线分叉（通用 / 选文明）                                                                                                                                                                               | `mockups/issue10/`                                                                                                                                                             | 定稿（#59）                                                   |
| #39       | 文明支持 / 置灰样式                                                                                                                                                                                         | `mockups/issue39-civ-support/`                                                                                                                                                 | 定稿                                                          |
| #6        | 设计系统，阶段 2 导航 / 首页卡 / 文明页头，阶段 3 详情页模板，阶段 4 暗色                                                                                                                                   | `DESIGN-SYSTEM.md`、[mockups/issue6-stage2/](mockups/issue6-stage2/)、[issue6-stage3/](mockups/issue6-stage3/)（SPEC.md）、[issue6-stage4/](mockups/issue6-stage4/)（SPEC.md） | 已签字；暗色（阶段 4）尚未上线，暗色对比度待上线后复核        |
| M3        | 发布封面（scouts-18 法兰克 house=0 step=13，线上构建截取）                                                                                                                                                  | `mockups/m3-cover/`（README.md，含复现步骤）                                                                                                                                   | 定稿                                                          |
