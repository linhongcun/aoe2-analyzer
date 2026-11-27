# 产品经理交接

给接手产品判断与需求评审的人。本文说明如何看待这个站、怎么裁范围、怎样算验收，以及按主题归档的踩坑清单。它不是路线图，也不是开工授权；Issue 生命周期、角色职责与授权以 [CONTRIBUTING「Issue 生命周期」](../CONTRIBUTING.md#issue-lifecycle) 为准。

- **事实与判断分开**：具体数值、默认值、单位编号和允许列表以当前 `origin/main` 源码及 [data_sources.json](../data/sources/data_sources.json) 为准，写规格前先读对应文件，不凭记忆照抄。
- **版本三列分读**：应用号（`package.json`）、数据版本（`data_sources.json`）与线上页脚「构建」（7 位 SHA）各算各的；只有页脚构建对上提交，才算玩家已可用。

## 1. 这个站解决什么

帝国时代 II 决定版（AoE2 DE）的中文资料站和计算工具（线上：<https://linhongcun.github.io/aoe2-analyzer/>，Hash 路由 `#/…`），服务玩家三件事：

1. **查资料并分清价格口径**：文明、单位、科技、建筑、科技树与加成；目录价是基础值。
2. **为一局做准备**：记录模式、地图与文明并跳到对应工具；对局助手是通用参考，开局流程是声明假设下的时间线。
3. **用有限模型算清具体问题**：持续生产、训练总价、科技模拟、单位 PK、驻军预览、多人施工与驻军回血。

**明确不做的事**：

- 不是官方客户端：不连大厅、不估本局胜率（见 [StartGame.tsx](../src/features/home/components/StartGame.tsx)）、不解析录像（复盘为本机草稿）。
- 不把近似模型写成实战或胜率保证，不接实时官方天梯，不把 1–10 主观评分写成胜率。
- 不编造游戏数值：先追溯固定 `.dat` 与生成链，冲突时记录版本、来源和差异再核实；未支持效果显式说明，缺来源标「未核实」。

页面唯一登记表在 [pageRegistry.ts](../src/shared/nav/pageRegistry.ts)（首页与工具菜单共用分组：新手入门、对局计划、经济计算、资料）；新增或改名可见页面先改登记表，不另建平行名单。

## 2. 按玩家任务看边界

### 三种钱

| 玩家看到的   | 回答的问题                                     | 出现在                                   | 不要理解成                           |
| ------------ | ---------------------------------------------- | ---------------------------------------- | ------------------------------------ |
| 目录基础价   | 数据里的造价，未计文明折扣和科技               | 单位、科技、建筑目录；模拟器选单位列表   | 该文明的折后训练价，或满科技价       |
| 有效训练价   | 已选且本站已支持的费用效果之后，训练一名要多少 | 持续生产、训练总价、单位 PK 的每名训练价 | 已经含研究费，或「转型还要再花多少」 |
| 累计研究费用 | 勾选的这些科技，研究本身要多少、多久           | 单位页的科技模拟器工作区                 | 每名兵的训练价                       |

- 单位详情目录区有条件展示「折后训练价」（见 [unitDetailView.ts](../src/domain/unitDetailView.ts) `discountView`），与工作区研究费用分开；[SimulatorHub.tsx](../src/features/simulator/components/SimulatorHub.tsx) 与 [UnitDetail.tsx](../src/features/units/components/UnitDetail.tsx) 须维持各自口径声明。
- 研究费、升级费、建筑与住房均不摊入训练价（见 [trainTotalCopy.ts](../src/features/production/trainTotalCopy.ts)、[trainingCostView.ts](../src/features/duel/logic/trainingCostView.ts)）。有效训练价叠加在 [unitCost.ts](../src/domain/unitCost.ts)，未完整计入时须标「估算」。
- 目录展示用时代投影（[displayAge.ts](../src/features/units/displayAge.ts)）严禁传入生产、费用、战斗或开局计算。

### 生产页的三种任务

三模式共用 `#/production`（[ProductionModeNav.tsx](../src/features/production/ProductionModeNav.tsx)），默认时代分别看 [production.ts](../src/domain/production.ts) 与 [trainTotal.ts](../src/domain/trainTotal.ts)：

| 模式           | 玩家任务                                       | 数量含义 | 输出边界                                                               |
| -------------- | ---------------------------------------------- | -------- | ---------------------------------------------------------------------- |
| 持续生产       | 已有若干生产建筑，估每分钟开销与村民           | 建筑数   | 每分钟资源与村民；不含研究、补田、住房、建造                           |
| 训练总价       | 同文明同时代买多批兵，算食木金石总计           | 单位个数 | 有效单价 × 数量求和；不含研究费，不自动算两方案差额                    |
| 跨文明训练对照 | 同形态、一座马厩比多文明间隔与单价（固定入口） | 目标个数 | 单间隔、单价、N 个总耗时；无 N 个总费用，规则看 `trainCompareCodec.ts` |

切模式时不得把建筑数与训练数互换；跨文明对照回到固定入口。

### 模拟、PK、对局准备与天梯

- **科技模拟器与 PK**：模拟器列表只挑单位，属性变化与累计研究费在单位详情工作区；单位 PK 忽略走位、地形与部分特殊效果，对局助手不自动带入双方；对局助手坚持通用参考，不加自动优势建议（[#888](https://github.com/linhongcun/aoe2-analyzer/issues/888) 已关闭）。
- **开一局与开局流程**：开一局仅传递手动选择不做自动推荐；开局流程到达时间按通用参数现算，未计入文明保留文明名并按通用计算。
- **主观评分与天梯快照**：文明对比雷达是维护者 1–10 主观整数（[civ_ratings.json](../data/sources/civ_ratings.json)，[Compare.tsx](../src/features/compare/components/Compare.tsx) 常显「评分性质」，[#889](https://github.com/linhongcun/aoe2-analyzer/issues/889) 已关闭）；天梯（[LadderTeam.tsx](../src/features/ladder/LadderTeam.tsx)）为静态快照，其自身补丁号与本站钉扎数据版本分开读，不互相混抄。

### 跨页上下文语义

- 文明页兵种行链到不带文明的 `/unit/:id`（百科语义），同页「用这个文明继续」及科技树格子（[CivTechTree.tsx](../src/features/tree/components/CivTechTree.tsx)）、已筛文明的模拟器（[hubList.ts](../src/features/simulator/hubList.ts)）才带文明；[CivDetail.tsx](../src/features/civs/components/CivDetail.tsx) 未挂载 `CivRegionalUnits`；旧 `#/tree/:civ` 重定向到文明页科技树章节（[routes.tsx](../src/app/routes.tsx)）。

## 3. 需求怎么决定

评审按七步核齐，缺项不拍板：**场景 → 当前路径与断点 → 证据与影响（写明构建/SHA） → 最小范围与非目标 → 候选方案与代价 → 可核对验收标准 → 需求评审记录（评审人/日期/结论/遗留）**，全部写入原 Issue「产品经理」节即 PRD（含用户故事/主路径）。

优先级先保证已有任务找得到、接得上、口径一致。四类不混进同一单：

| 类型     | 判断                                         | 例子                                         |
| -------- | -------------------------------------------- | -------------------------------------------- |
| 缺陷     | 与页面自身声明相反，或走进无出口死路         | 对照允许选出当前条件下零文明可造的形态       |
| 设计债   | 功能存在，但发现路径、标题或上下文与任务脱节 | 历史案例：新增子模式后搜索别名与标签标题滞后 |
| 功能建议 | 现有任务做不到，需要新能力                   | 文明页兵种行是否预填文明（须先裁语义）       |
| 数据待核 | 数字或公式未对上固定数据                     | 经济/开局公式未核实前不写成「已证实算错」    |

已关闭 Issue 不重开；明确 `Hold`、维护者标待其决定的 `待确认` 与真实外部数据/依赖 `阻塞` 不越权解除。

## 4. 设计先行，授权与交接

1. **PRD 先行**：写清问题、范围、非目标、用户故事、验收与依据，不替开发写实现步骤，不替设计定配色字号。
2. **UX 路径二选一**：凡涉及任何布局、交互、视觉状态或新增/改动可见文案，必走 `阶段:体验设计` 并在正文嵌入完成态设计图；**仅**无实际 UI 改动（纯 docs/data，或经逐组件核实零布局/交互/状态/文案改动的纯逻辑修复）由产品经理在「体验设计」节写明不适用理由、已核对消费组件、依据 CONTRIBUTING 2026-11-26 授权及「触及 UI 须留开发协调 UX 补稿」约束后直交 `阶段:软件开发`。
3. **单向交接与自主拍板**：UX 完成后按原范围自查直交 `阶段:软件开发`，不设 PM 设计确认往返；按 2026-11-15 更正进入 `阶段:软件开发` 即获既定范围内开发授权；按 2026-11-26 授权常规产品取舍由 PM 核实事实后自主拍板并留痕推进，不挂 `待确认` 卡进度。
4. **验证与并发**：独立复核与按风险选测见 [TESTING](../docs/TESTING.md) 与 [CONTRIBUTING](../CONTRIBUTING.md#按改动风险控制验证投入2026-10-25)；跨 Issue 并行与串行集成顺序见 [MAINTENANCE](../docs/MAINTENANCE.md#按事项并行合并发布串行)。网站实现 PR 用 `Relates #N`，纯仓库交付可 `Fixes #N` 且不标 `已部署`。

## 5. 怎样验收

- **主路径与异常态**：主路径走通；空、错、部分、失效和不支持态有明确说明，不给假完整结果。
- **跨页与费用口径**：明示携带与丢弃的上下文；目录价、有效训练价、累计研究费分清，研究费不进训练费。
- **视口与数字不换行**：只核本次会坏的桌面/窄屏宽度并写明实测宽度（不设四宽仪式）；数值与「数字+单位」在窄屏不折行（`.num`/`.nw`）。
- **部署身份与范围一致**：现网以页脚构建 SHA 为准；只核本次声明改动的计算与数据，不删断言掩盖算错。

## 6. 已经付过代价的经验

本节按主题归档；完成阶段交接后按 [CONTRIBUTING「经验回写」](../CONTRIBUTING.md#experience-writeback) 合并或修订条目（单条 3–5 行，无新经验不写）。

### 需求定界与自主拍板

- **常规取舍先查先例再自主拍板，正文留痕**：收到运营「待拍板」清单先分三类——代码规则或已关闭先例已有答案的直接引用定案（如 `presetUpTo`、[#1296](https://github.com/linhongcun/aoe2-analyzer/issues/1296) 未建模可勾选、[#271](https://github.com/linhongcun/aoe2-analyzer/issues/271) `unitOptionLabel`），设计细节交 UX，真正产品取舍按 2026-11-26 授权核清最新源码、`.dat` 与连带消费端后直拍。严守 [AGENTS「开发执行」](../AGENTS.md#dev-exec-2026-11-10) 不为保旧加兼容层，在「决定与依据」写明定案、放弃方案、事实依据与已知边界，不碰 Hold/阻塞/偏离主题红线。反例：早期误推保旧方案、未核方案事实句（风琴炮/掷弹兵）或把 21 题全抛维护者。[#1054](https://github.com/linhongcun/aoe2-analyzer/issues/1054) · [#1263](https://github.com/linhongcun/aoe2-analyzer/issues/1263) · [#1322](https://github.com/linhongcun/aoe2-analyzer/issues/1322) · [#1364](https://github.com/linhongcun/aoe2-analyzer/issues/1364)–[#1369](https://github.com/linhongcun/aoe2-analyzer/issues/1369)
- **覆盖范围按数据规则写，先分清「死路」与「缺口」**：范围写「凡数据满足某条件都算」并要求全目录遍历单测，排除也写规则而非手写 ID 名单（篇幅问题交 UX 不靠砍范围）；归类缺陷或功能建议前先查对象在其他入口能否计算。反例：[#1325](https://github.com/linhongcun/aoe2-analyzer/issues/1325) 手工表错 1 漏 2、[#1339](https://github.com/linhongcun/aoe2-analyzer/issues/1339) 漏 76 步兵、[#1340](https://github.com/linhongcun/aoe2-analyzer/issues/1340) 马普切聚落仅缺额外地点而非不可生产。
- **判断上线看页脚构建，资料片/实拍/提示不越界外推**：应用号改过不能证明或否认部署，上线结论只对页脚构建 SHA（[#978](https://github.com/linhongcun/aoe2-analyzer/issues/978) / [PR #979](https://github.com/linhongcun/aoe2-analyzer/pull/979)）；购买目录收录不等于支持该玩法（[#1222](https://github.com/linhongcun/aoe2-analyzer/issues/1222) 编年史）；无版本号实拍仅采可辨色系不取官方色号、不外推他类（[#1216](https://github.com/linhongcun/aoe2-analyzer/issues/1216)）；文明提示按实际决策步骤归并，不按文明名整组搬迁（[#1200](https://github.com/linhongcun/aoe2-analyzer/issues/1200)）。

### 数据来源、`.dat` 语义与消费端全量核查

- **机制清单以 `.dat` 效果链路为准，遇 `res: 33` 三方交叉锁定**：绝不凭游戏说明或记忆写作用名单，直接核查固定 `.dat`、`data/game/*.json` 与派生脚本（如 `projectile_scope.py`），并在验收中锁定正反例；遇 `res: 33`（`EffectFunction`）须交叉核对固定 `techs.json` 说明与 `trees.json` 本国目标，同时保留 `res: 33` 维持估算边界。反例：[#1403](https://github.com/linhongcun/aoe2-analyzer/issues/1403) 箭毒仅作用于步弓 5 单位与 5 座有攻建筑（不含 `6/7/185/598`）；[#1407](https://github.com/linhongcun/aoe2-analyzer/issues/1407) 城楼 `atk===0` 但 `atks.length===5`；[#1408](https://github.com/linhongcun/aoe2-analyzer/issues/1408) 爆破筏基础生命为 `40`；[#1464](https://github.com/linhongcun/aoe2-analyzer/issues/1464) 仅看 `Type 15` 漏算布图马普对科那 `2566/2568` 的 `-15%` 折价。
- **改共享数据前双向核查字段级消费端（防漏改也防空验收）**：裁定源数据错译是否不可见前，按字段名全仓检索组件、对比页、拼音索引与元数据（[#1264](https://github.com/linhongcun/aoe2-analyzer/issues/1264) `civ.it` 仍在 [Compare.tsx](../src/features/compare/components/Compare.tsx) 渲染）；写纯数据页面验收前，核实目标组件确实读该字段而非只读同文件其他键，并核查条目从「仅文本」变可计算后对预设与 [mixedTrainingTransfer.ts](../src/features/duel/logic/mixedTrainingTransfer.ts) 的连锁影响（[#1293](https://github.com/linhongcun/aoe2-analyzer/issues/1293) / [PR #1318](https://github.com/linhongcun/aoe2-analyzer/pull/1318) `TechDetail` 不读 `eco`）。
- **区分「原始派生非空」与「站内已解码」，先找不该显示的反例**：判定「是否已编码」锚定站内真实解码类目，排除不透明 `res: 33` 与未消费杂项（[#1448](https://github.com/linhongcun/aoe2-analyzer/issues/1448)、[#1446](https://github.com/linhongcun/aoe2-analyzer/issues/1446)）；向玩家展开单文明类别目标前先按文明可用性过滤；新字段验收必配正反例，区分零值、显式 `false` 与未知，能进目录不等于能进计算（[#1220](https://github.com/linhongcun/aoe2-analyzer/issues/1220) 骆驼容量、[#1225](https://github.com/linhongcun/aoe2-analyzer/issues/1225) 重复研究）。
- **扩 `.dat` 导出白名单或改 `effects.ts`/`BONUS_SRC` 前核三类反向回归**：扩导出前全量扫描是否与既有规则叠加越界（[#1474](https://github.com/linhongcun/aoe2-analyzer/issues/1474) `947` 叠 `322` 得 `minr=-1`）、是否污染无 `civs` 过滤展示页（`techDetailView.ts`）、是否给通用科技带上新 `eco` 属性误拦 `mixedTrainingTransfer` 或刷屏未建模胶囊（[#1482](https://github.com/linhongcun/aoe2-analyzer/issues/1482)）；改 `effects.ts`/`BONUS_SRC` 时守住 `CivDetail` 弹层冷加载隔离（禁静态引入 `CORE`）、同步核验 `SCENARIO_CIVS` 七国 `positionScenarioReview.json` 签名，并对 `sim:null` 实跑 `simulateBuild`/`calculateConstruction` 反事实而非静态推断（[#1497](https://github.com/linhongcun/aoe2-analyzer/issues/1497)）。

### 工具口径、跨页衔接与共享计算引擎

- **跨模式统一展示或声称同源前，逐一核查底层函数调用点**：表面复用组件背后可能挂不同引擎（[#1294](https://github.com/linhongcun/aoe2-analyzer/issues/1294) 1v1 与群战、[#1297](https://github.com/linhongcun/aoe2-analyzer/issues/1297) 详情折后价与 `unitCost`、[#1324](https://github.com/linhongcun/aoe2-analyzer/issues/1324) 驻军预览不经 `simulate`），未核到调用点不写成「修一处全生效」；跨工具接入加/乘混合科技须锁定与 `simulator.ts`（`TECH_EFFECTS` 键序）一致的叠加顺序，并用非交换算例（萨拉森 `331 + 47 + 454`）与 `ceil` 逐例验算（[#1469](https://github.com/linhongcun/aoe2-analyzer/issues/1469)）。
- **分清「缺行小计 (`partial`)」「已算估算 (`estimated`)」与阻断 `warnings`**：全行计入但含未解码边界（如 `res: 33`）不得塞进 `partial`（会渲空未计入清单，缺估算态须走 UX [#1463](https://github.com/linhongcun/aoe2-analyzer/issues/1463)）；新增非阻断提示前核查领域 `warnings` 是否绑死 `balance`（如 `ecoPayoff.ts` [#1477](https://github.com/linhongcun/aoe2-analyzer/issues/1477)）；未实测客户端取整的非整数研究费按两位小数去尾数保留并明示边界，向账本新增 `.dat` 指令须逐字段核对翻译（[#1402](https://github.com/linhongcun/aoe2-analyzer/issues/1402)、[#1409](https://github.com/linhongcun/aoe2-analyzer/issues/1409) `res:85`）。
- **改共享采集引擎 (`realCost.ts`) 或常驻开关前核清主包、前置与幂等**：`realCost.ts` 经 `Home` 落入主包链，严禁静态导入 `CORE`/`trees.json`；全站扫描区分三类 `requires`（时代/内部、`ecoTechs` 前置、非 `ecoTechs` 前置）在显式与缺省 `techIds` 两种口径的表现，同步透传 `gatherUnsupportedSources` 并核对 `bonusUsage317` 反事实（[#1473](https://github.com/linhongcun/aoe2-analyzer/issues/1473)）；开关升默认常驻须锁定旧链幂等去重与本方/盟友分界（[#1481](https://github.com/linhongcun/aoe2-analyzer/issues/1481)）。
- **战斗机制正式建模连核运行期成对抵消、对照续显与阵容实算**：边界排查须同扫 `units.json` 与 `effects.json` 运行期规则（如 [#1500](https://github.com/linhongcun/aoe2-analyzer/issues/1500) 日本 `190` 对弓 `+2`/对矛 `-2` 须同乘 `1-r`）；移除未建模提示时同步核查 [UnitCivRankTable.tsx](../src/features/units/components/UnitCivRankTable.tsx) 已计入标签与 [DamageBreakdown.tsx](../src/features/duel/components/DamageBreakdown.tsx) 折算依据，更新受影响 `civFormations*.test.ts`/`bonusUsage317` 实算断言但不越权改固定来源文案。
- **发现路径、跨页带文明与空态死路先裁语义**：发现入口（登记名/`searchAliases`/标签标题）落后于功能单独处理；跨页带文明跳计算器须写清哪些工具传参、按确定性规则落到合法初始实体（附缺兵反例并明示非最优推荐 [#1284](https://github.com/linhongcun/aoe2-analyzer/issues/1284)）；遇到「能选但零文明可用」（如对照城堡选游侠）先修空态与可选范围，不先怀疑计价。

### 表单、无障碍、视觉资产与 UX 适用判定

- **纯逻辑修复走 UX 不适用须逐组件核实并写清三件事**：逐条验收核实零布局、交互、状态与可见文案改动后，在「体验设计」节写明（1）理由与已核对消费组件、（2）依据 CONTRIBUTING 2026-11-26 授权、（3）实现触及 UI 须留在开发阶段串行协调 UX 补稿，再直交 `阶段:软件开发`；涉及哪怕一句新增/修改文案或新 UI 状态仍须走 UX 附图。[#1323](https://github.com/linhongcun/aoe2-analyzer/issues/1323)–[#1326](https://github.com/linhongcun/aoe2-analyzer/issues/1326) · [#1334](https://github.com/linhongcun/aoe2-analyzer/issues/1334) · [#1407](https://github.com/linhongcun/aoe2-analyzer/issues/1407)
- **表单就近报错与深链规范化分界**：汇总错误块保留唯一 `role="alert"`、行内字段提示仅经条件 `aria-describedby`（合法态移除防悬空）、计算阻断态禁用复制链接、同路由多模式一次收口（[#1455](https://github.com/linhongcun/aoe2-analyzer/issues/1455)、[#1460](https://github.com/linhongcun/aoe2-analyzer/issues/1460)）；「深链自动规范化 + 步进器」页面拆分外部非法深链与页内保草稿报错，`<input type="number">` 改 `type="text"` 前全仓查 E2E 是否锁 `spinbutton`，同步约束步进器与快捷芯片清错（[#1472](https://github.com/linhongcun/aoe2-analyzer/issues/1472)）。
- **氛围插画先核素材异构、分层门禁与复合对比度**：PRD 固定写清五项——比例/体积/共图反例（`backgrounds.json` 异构与 2 对共图）与列表页体量取舍、跨模块下沉同步 `check-layers`/`check-docs-boundary`、遮罩走令牌/`mask-image`（`check-colors` 禁非令牌 `rgba()`）并人工核对「图+遮罩+字」复合 AA 及首屏焦区、并行方案互斥、自制图与原版游戏素材版权区分。[#1313](https://github.com/linhongcun/aoe2-analyzer/issues/1313) · [#1314](https://github.com/linhongcun/aoe2-analyzer/issues/1314)

### 目录扩充、内容契约与规范维护

- **共享内容源并行修订拆清格式、纠错、展示与目录总数**：固定来源未因主干重排失效时，纯格式单不动 JSON 保持纯仓库交付，重叠文明点名归属并定集成顺序（[#1264](https://github.com/linhongcun/aoe2-analyzer/issues/1264)–[#1268](https://github.com/linhongcun/aoe2-analyzer/issues/1268)）；多卡重复提示在并行修订期限定在展示组件层去重（[#1285](https://github.com/linhongcun/aoe2-analyzer/issues/1285)）；扩充收录先拿新增样本跑内容与契约 `maxItems` 并查旧测试筛选方式，PRD 分列净增、集成后全站总数与历史批次原名单（[#1439](https://github.com/linhongcun/aoe2-analyzer/issues/1439)）。
- **来源归属、图谱对账与阵容/混编核验**：来源页夹杂他物须按固定 ID 逐条裁归属（[#1084](https://github.com/linhongcun/aoe2-analyzer/issues/1084)）；迁移按稳定 key 对账全图谱，不凭旧 `archive-only` 估算（[#1085](https://github.com/linhongcun/aoe2-analyzer/issues/1085)）；路线宣称「零城堡」先解码核对链接有无城堡独科或征招 `315` 并清无关科技（[#1441](https://github.com/linhongcun/aoe2-analyzer/issues/1441)–[#1444](https://github.com/linhongcun/aoe2-analyzer/issues/1444)）；引用混编战果须记全双方文明/时代/科技/队加及每排兵种、顺序与人数（[#1441](https://github.com/linhongcun/aoe2-analyzer/issues/1441)）。
- **改角色或规范文档做三项反查**：核对新旧角色 PR 权限与 [check-pr-title.mjs](../scripts/check-pr-title.mjs) 闭环及禁止触碰代码/`data/`/核心规范红线；全仓检索文件名与 `#锚点` 外部引用锁定须保留锚点；同步核查 `README.md`、`docs/README.md`、`AGENTS.md`、`role/README.md` 索引口径与同文件集成顺序。[#1302](https://github.com/linhongcun/aoe2-analyzer/issues/1302)

## 7. 接手与长期原则

接手先核对 `origin/main` 与线上页脚三列，快速走一遍第 1 节三类任务与核心工具入口，再进入评审。改动玩家可见能力时顺手核查登记表名与 `searchAliases`、浏览器标题、站内入口及 README 路由描述（不为此无关扩范围）。关于数据入口（页眉「数据版本」与页脚）维持现状，不重开 [#272](https://github.com/linhongcun/aoe2-analyzer/issues/272)。

- 先让已有任务找得到、接得上、口径与声明一致，再谈新功能。
- 三种钱、三种生产任务、天梯快照与主观评分绝不混用。
- 链接是否带文明/时代/科技由该链接的任务决定；能选但无结果先修路径与空态，再怀疑公式。
- 未支持效果明说，不编造数值，不把研究费悄悄摊进训练费。
- 上线只看页脚构建 SHA；验收写明实测视口与未验证项；已关闭事项无新问题不重开。
