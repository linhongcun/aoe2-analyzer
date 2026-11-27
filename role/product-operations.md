# 产品运营交接

给接手本站体验巡检与玩家反馈核实的人。职责以 [CONTRIBUTING「角色」](../CONTRIBUTING.md#角色) 与 [Issue 生命周期](../CONTRIBUTING.md#issue-lifecycle) 为准：运营面向平台本身，回答信息能否找到、操作是否顺畅、结果能否看懂，并沉淀可复核 BRD；深度文明策略与 [game-strategy.md](game-strategy.md) 主维护归属独立于流水线之外的[游戏分析师](game-analyst.md)。

站点主要由维护者使用，PC（约 1280）主路径走通、窄屏能读能点；运营观察用来提改进，不是上线门禁。玩法入口见 [`src/features/gameGuide/`](../src/features/gameGuide/)、[`src/features/mixedArmy/`](../src/features/mixedArmy/) 与 [内容购买目录来源](../docs/DATA-UPDATE.md#content-catalog)。

## 谁处理什么

运营在 `阶段:产品运营` 受理玩家与游戏分析师提交的平台反馈，在同一 Issue 正文记录可复核场景、实际卡点、观察/复现证据、未核实项、业务目标与怎样判断做成，交 `阶段:产品经理`。范围与优先级由产品定，运营不代裁范围、不定级、不另开阶段 Issue、不做每 PR 全站验收。

## 从实际问题走一遍

先锁定真实一局问题，再沿玩家路径在站内查和算。比较前先分清四组口径：

- 目录基础值 vs 选定文明/时代/科技后的有效值；
- 单名单位训练价 vs 科技一次研发费 vs 转型总投入；
- 固定数量训练总价 vs 持续生产每分钟消耗；
- 单兵 PK 近似模型 vs 混编交战。

下结论前核实单位在该文明与时代可训练，并记录页脚三行（站点版本 `vX.Y.Z`、数据版本、构建 SHA；三者各记各的，正式结论不混 PUP）。站内不足再查当次可打开的官方资料，查不到标待核，不凭记忆补数。

## 两个改进入口

### 波斯步弓手：目录价看不出省金

卡曼达兰让波斯弓兵免金改耗木，旧 PK 仍只显目录价 25 木 45 金。产品核实后在 PK 引入有效训练价与计入/未计入说明（[#943](https://github.com/linhongcun/aoe2-analyzer/issues/943)，DE 188329 满科技弩兵 50 木 0 金；研究费另计）。要点：补齐目录价与有效训练价断层，不为单一文明写特例。

### 印度斯坦：混编要的是训练总价

同文明同时代多兵种固定编队需要每行数量、有效单价与资源合计（不含研究费），而持续生产算每分钟消耗。随后在 `#/production?mode=train-total` 落地训练总价（[#978](https://github.com/linhongcun/aoe2-analyzer/issues/978)）：20 翼骑兵 + 20 火枪手 + 2 手推炮（2500 食 450 木 1450 金）换 20 帝王骆驼兵（2000 食 450 木 2650 金）差额为多 1200 金、少 500 食（仅比训练资源，换版本重算）。

## 反馈怎么写

先查重再按模板提单：[功能建议](../.github/ISSUE_TEMPLATE/feature_request.md)、[数据错误](../.github/ISSUE_TEMPLATE/data_error.md)（附来源）、[问题报告](../.github/ISSUE_TEMPLATE/bug_report.md)（写复现、截图与页脚三行，不替测试宣判）。每份 BRD 写清：实际目标与场景、页脚三行与完整 URL、操作与页面所见、卡点影响、期望口径（总价/每分钟、含不含研究费）、出处/截图、已知边界、业务目标/预期收益与怎样判断做成。

## 用好工具再提需求

先按 [讨论前先用的站内工具](game-strategy.md#讨论前先用的站内工具) 把问题在站内走通，再分清「自己没找到入口（补文档）」与「工具断层/缺口（提需求，如 [#1051](https://github.com/linhongcun/aoe2-analyzer/issues/1051)–[#1055](https://github.com/linhongcun/aoe2-analyzer/issues/1055)）」。

### 方式与默认选择

| 方式                    | 适合场景                         | 边界与注意事项                                       |
| ----------------------- | -------------------------------- | ---------------------------------------------------- |
| 手动浏览线上站点        | 初次找入口、看布局视觉、少量查询 | 重复对照较慢，易漏记输入                             |
| Playwright / 现有浏览器 | 批量切换参数、提取结果、留截图   | DOM 读取 ≠ 视觉检查，先核实最终 URL 与加载状态       |
| 分享链接                | 交接可复现配置                   | 站点可能规范化或忽略参数，打开后须复核实际选择与页脚 |
| 仓库源码与固定数据      | 解释页面机制与未覆盖边界         | 与线上构建未必一致，不得把自算结果冒充站点页面输出   |

默认先手动走通线上工具；需重复对照再借自动化读取 DOM 并配截图；源码/数据查证与线上观察分开写。记录结论时附日期、页脚三行、完整 URL、模式输入、实显结果与未验证项（单次脚本耗时≠任务总耗时；不把模型输出写成实战必然结果）。

### 怎样核实反馈里的判断

本节随工作继续积累；完成阶段交接后按 [CONTRIBUTING「经验回写」](../CONTRIBUTING.md#experience-writeback) 合并或修订条目（单条 3–5 行，无新经验不写）。

- **分清查询方向并双向核对**：载具载量（[#1220](https://github.com/linhongcun/aoe2-analyzer/issues/1220)）≠ 单位可进建筑，不误判重复；两个入口应一致时固定文明从两头查（如 [#1230](https://github.com/linhongcun/aoe2-analyzer/issues/1230) 不列颠 vs 亚美尼亚僧侣训练地点），把成立条件与矛盾一并交评审。
- **区分字段缺失、值域与客户端实测**：按 ID 对照同版目录与固定上游，分清未收录、缺字段与显式假值并取真假双例核含义（[#1225](https://github.com/linhongcun/aoe2-analyzer/issues/1225) 重复研究为 256 倍模式规则）；把站点读数、源显示字段与客户端实测分开写，缺证据标待核（[#1231](https://github.com/linhongcun/aoe2-analyzer/issues/1231) 铁浮屠 `2.15s` vs `1.8s`）。
- **核对可见位置、前置字段与组件挂载**：报错存在不等于窄屏视口内可见，记录字段、输入与失焦所见并找同宽正对照，未用读屏不报播报结论（[#1164](https://github.com/linhongcun/aoe2-analyzer/issues/1164)）；受理扩展需求前先核 JSON 实际键名、多变体 ID（城堡/营垒、打包/展开）与组件挂载点，拆清「已具备/部分/未导出」（[#1296](https://github.com/linhongcun/aoe2-analyzer/issues/1296)、[#1294](https://github.com/linhongcun/aoe2-analyzer/issues/1294)）。
- **单点数据缺陷顺手全量同源扫描**：遇单条缺漏即对全量文明/科技/单位做只读扫描，把精确分母与完整命中写入 BRD，防漏修或盲扩范围（[#1293](https://github.com/linhongcun/aoe2-analyzer/issues/1293) 全 56 国仅战狼号 `461` 与弹射器 `59` 命中为 0；[#1297](https://github.com/linhongcun/aoe2-analyzer/issues/1297) 全 196 科技仅布图马普 `1380` 同时含费用与 `res`）。
- **线上取证核规范化 URL、就绪态与容器实测尺寸**：核对跳转后最终 URL（如 `#/duel` 非法 `m=2` 回落 `1v1` [#1296](https://github.com/linhongcun/aoe2-analyzer/issues/1296)/[#1298](https://github.com/linhongcun/aoe2-analyzer/issues/1298)）、SPA 切换目标页就绪（[#1313](https://github.com/linhongcun/aoe2-analyzer/issues/1313)）与页脚三行；版式/氛围单实量 1280 与 390 关键容器像素宽高支撑后续红线（[#1314](https://github.com/linhongcun/aoe2-analyzer/issues/1314)）。
- **文档与视觉资产先分「活动引用 vs 历史留痕」并核静态门禁**：按最新 `origin/main` 核准行号，分清须改引用与不可改冻结证据/SHA，顺手查 `check-layers`、`check-colors`、`check-docs-boundary` 及素材共图反例写入 BRD（[#1290](https://github.com/linhongcun/aoe2-analyzer/issues/1290)、[#1304](https://github.com/linhongcun/aoe2-analyzer/issues/1304)、[#1313](https://github.com/linhongcun/aoe2-analyzer/issues/1313)、[#1314](https://github.com/linhongcun/aoe2-analyzer/issues/1314)）。
- **交接固定附「并行重叠单」与「待产品经理拍板清单」**：交接前扫描开放 Issue/PR 标出同文件或同路由重叠（如 [#1302](https://github.com/linhongcun/aoe2-analyzer/issues/1302)/[#1290](https://github.com/linhongcun/aoe2-analyzer/issues/1290)/[#1304](https://github.com/linhongcun/aoe2-analyzer/issues/1304)、[#1294](https://github.com/linhongcun/aoe2-analyzer/issues/1294)–[#1296](https://github.com/linhongcun/aoe2-analyzer/issues/1296)）；维护者高优意向原样转述不越权贴 `P0/P1`，未决裁决整理成编号清单交给产品拍板。

## 单据状态与策略归属

所有阶段产物、设计图与交接均留在同一 Issue 正文单向流转，以 [CONTRIBUTING「Issue 生命周期」](../CONTRIBUTING.md#issue-lifecycle) 为唯一现行规范（不另建实施单；进入软件开发即获既定范围开发授权；运营仅处理 `阶段:产品运营`）。文明阵容案例、三段格式与玩法分析方法统一归属[游戏分析师](game-analyst.md)维护在 [game-strategy.md](game-strategy.md)，本指南不重复维护。
