# #657 蔷琵线按时代对照：v0.77.19 冻结规格

基线：实际main `8df17119f4472de5b9c5738f1b509c31382701ad`（v0.77.18），数据DE188329。维护者2026-11-04已授权按688→652→657连续实施、发布与完成关闭，688/652已全交付。本规格限定本期行为、来源、状态与验收；独立规格及真实红例预审通过后才实施。

## 1. 产品目标和固定边界

在既有对局助手提供封建、城堡、帝王三张蔷琵线对照卡；只计算当前已知双方、真实可训练的有限候选。玩家能看出时代形态、当前条件下哪项接触对照有利、条件和缺失信息，并进入相同输入的原生单位 PK。Duel 与单位详情提供两条明确标为参考的可分享预置。

不新增页面；不做全部兵种搜索、全局强度榜、完整战斗/经济/操作模拟、天梯、实时大厅、胜率、平衡建议；不重写 combat/simulator 引擎、不手改生成 JSON、不加 CI 白名单或降低任何预算/断言。不改 #652 推荐算法与 #672 URL/空态契约。

## 2. 事实来源、形态与原示例纠正

来源为当前仓库固定 `scripts/data_sources.json`、`units.json`、`techs.json`、`trees.json`、`effects.json`，当前审计版本 DE 188329。数值、显示名称、时代、科技列表和作用来源均从当前数据读取；本稿的观察数值不是运行时代码常量。

固定支持的升级线：

| 时代               | 形态 ID | 当前中文 / English                  |
| ------------------ | ------- | ----------------------------------- |
| 黑暗（仅详情入口） | 2550    | 蔷琵斥候 / Champi Scout             |
| 封建               | 2588    | 蔷琵步兵 / Champi Runner            |
| 城堡               | 2552    | 蔷琵战士 / Champi Warrior           |
| 帝王               | 2554    | 精锐蔷琵战士 / Elite Champi Warrior |

这是印加、马普切、穆伊斯卡、图皮共有的区域线。用真实单位和科技树判断资格，不把“穆伊斯卡独特单位”作为数据分类。简短说明：“本页按当前数据名称展示蔷琵线，对应需求所称的战酋勇士。”

步弓手 4 为封建、弩手 24 为城堡、劲弩手 492 为帝王。原 issue 的“封建战酋 vs 劲弩”纠正为合法同代的 **2588 vs 4**；城堡原对照为 **2552 vs 77 长剑士**。正式 issue 认领记录和规格说明此项数据纠错，不伪造 2552/492 的封建形态，不让 PK 自动升时代后仍贴封建标题。

已核实的数值机制：Muisca `.dat` 1369/1370/1371 使蔷琵全线逐时代累计近甲 +1/+2/+3；草药学 Herbalism 1365 速度 ×1.15；护卫 Squires 215 速度 ×1.1；铁匠铺科技按所选文明真实树、时代和目标施加。UI 科技名称从当前记录读取，不沿用旧译名。`BONUS_SRC.Muisca['2']` 与 `TECH_SRC.Herbalism` 当前均为 dat。旧 manual 表只匹配 Warrior 不等于当前实际引擎漏算 Runner；不得据此另改引擎。

## 3. 三张卡的有限候选与确定规则

每个时代恰核对三条编辑候选；顺序是有限入口的固定展示顺序，**不是从游戏数据得到的全局最优排序**：

| 时代 | 蔷琵 ID | 候选 ID，固定顺序（名称实时读取）    |
| ---- | ------- | ------------------------------------ |
| 封建 | 2588    | 75 武士、448 斥候骑兵、4 步弓手      |
| 城堡 | 2552    | 38 骑士、77 长剑士、24 弩手          |
| 帝王 | 2554    | 567 冠军剑士、5 火枪手、546 轻型骑兵 |

只从这些候选中检查实际另一方文明在该时代能否训练；不搜全库替代、不补一个默认文明。资格检查复用现有 `unitAvailable` 口径，含真实树、目录时代及 `EARLY_UNIT_AGES` 例外。不能将“全线目录列有该文明”当成当前形态已解锁。

对每个合法候选，用同一 current-age 配置执行 `simTechs → presetUpTo(age) → simulate → fighterFrom → duel`。双方 `team=[]`，科技语义为 `'c'`，模式 `'1'`。调用前实际检查所用 unit record 的 civs/atks/armc/cls 等数组结构、trees 结构、hp/atk/ma/pa/rng/spd/rof/acc 等关键数值；调用后检查模拟结果和次数/时间有限。TS Unit 必填不能替代运行时检查。缺字段、非有限数、形态不符、时代不合法时，该项为不可算，不以 0 补齐，不输出 PK URL。

主对照确定为固定候选顺序中第一个在此接触模型中战胜蔷琵的合法可算项；没有优胜项时，取固定顺序中第一个合法可算项，且明确显示未占优；没有合法可算项时，保留时代卡并给出缺候选/数据未核对状态。不能强制制造“主克制”结论。

标题用“近身应对参考”；只有实际优胜项显示“本组接触对照有优势”。draw 显示“接触对照：同时击杀”，loss 显示“接触对照：未占优”。后一两种不能套上“软克/硬克/必胜”。主项之外两项放在“查看本时代其余对照”的本卡 details，保留各自真实可用、不可用和计算状态。

每张卡可见内容固定为：时代标题、真实蔷琵形态和文明身份、主对照单位与文明、双方预计击杀攻击次数/用时、实际结果、一句条件、打开本时代 PK 的 44px 链接。当前数据的护甲/移速差异从同一次模拟结果读取；远程项明确“未模拟射程先手与风筝”，速度落后的近战项明确“接触优势不代表能追上”。所有卡共同可见“只核对三条常见路线；同数量不等于同资源投入”。

合法但不具优势的对照仍能打开 PK。不可用/不可算项没有活跃 PK 链接，显示具体原因。整张卡没有合法候选时显示：“本卡三条候选中暂无本文明可用的已核对路线，不代表没有其他应对。”不借用 Franks 对照冒充当前双方。

## 4. Matchup 身份、状态与 URL（固定，不留视角待决）

已知双方为原我方 `me` 与原对方 `opp`。

1. 对方可训练蔷琵线：以对方蔷琵为威胁，候选来自我方文明；模块标题“应对对手的蔷琵线”。
2. 只有我方可训练蔷琵线：以我方蔷琵对照对方有限候选；模块标题“我方蔷琵线：查看对手接触对照”。文案用“对手候选”，不将对手优势写成给我方的推荐。
3. 双方都有蔷琵线：规则1优先，不再添加第二套卡。
4. 双方均不含蔷琵线：模块不渲染，原有助手内容保持原行为。

**所有 Matchup 动态 PK 永远 A=原我方、B=原对方。** 当前 `duelCivs()` 从 a/b 推导 me/opp，额外 me/opp 参数不会修正倒置。对方为蔷琵时，`a=我方候选`、`b=对方蔷琵`；只有我方为蔷琵时，`a=我方蔷琵`、`b=对方候选`。内部计算可以采用统一顺序，生成 URL 和结果标签必须映回实际双方。回助手后文明身份一致。Matchup 不展示固定 Franks 参考对象。

| 入口/异步状态                            | 固定行为                                                                                                              |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 双方已知、符合规则1/2                    | 数据就绪后展示三张卡，标题、数值、链接同一次输入                                                                      |
| `pair=explicit` 仅我方已知               | 保留 #672 请补选对手空态；无时代分析、无默认对手                                                                      |
| `pair=explicit` 仅对方已知               | 保留 #672 请补选我方空态；无时代分析、无默认我方                                                                      |
| explicit 双空、重复/非法已知参数         | 原现有双空/invalid提示；无 stale 卡和假数值                                                                           |
| 无 marker 的 legacy/sticky/default       | 沿现有解析得到真实双方；不新增 marker，不改变默认和sticky写入规则                                                     |
| core 或 trees 请求pending                | Matchup 保留现有页面 Loading，未知期间不输出时代结果                                                                  |
| 资料请求失败                             | Matchup 保留原完整失败 alert，旁置“已选文明保留。”及44px“重试资料”按钮；Duel 使用失败并保留文明的 alert；不输出旧结果 |
| 点击重试                                 | 重新请求失败的原生资料，使用当前 URL 双方；不重置 civ、query、sticky、表单                                            |
| 请求期间换文明、历史前进后退             | 结果只由渲染时当前解析双方产生，不闭包捕获旧pair                                                                      |
| unmount 后 resolve/reject                | active/generation守卫忽略回调；无未处理rejection、无复活结果                                                          |
| 已审版本以外/形态升级链不符/关键字段缺失 | 显示“当前资料尚未核对，暂不生成蔷琵时代对照。”；原其他助手内容不被伪造或清空                                          |

当前已审资料版本为 DE 188329。未来 patch 不静默沿用这组特定形态与解释，须重新核验后更新已审版本资格；显示版本始终读取当前 `DATA_SOURCES?.patch?.build`，缺少 patch/build 的空对象安全停新模块，不得因读属性异常破坏旧页面。有效输入在同一已审版本内变动会重新模拟，不写死伤害、护甲、攻击次数、胜者或科技ID集合。

## 5. 原生参考预置和单位详情入口

Duel 新增一块“蔷琵线参考对照”，固定可见说明：“参考：穆伊斯卡对法兰克，不代表你当前的对手；当前时代满科技、无团队加成、接触 1v1。”它不自动改变当前计算器；只在用户打开参考链接时切换。

恰提供两条 native 预置：

- 封建：`/duel?a=2588.Muisca.2.c.&b=4.Franks.2.c.&m=1`
- 城堡：`/duel?a=2552.Muisca.3.c.&b=77.Franks.3.c.&m=1`

标题、图标与名称从已加载当前记录生成，生成前核对两方真实树/时代/文明；不通过 fallback 或自动升时代造合法结果。保留原 `a/b/m` 解析、固定 reference ID 和 `fmtSide` 编码；不扩展旧 PK codec。两项各有“打开参考对照”“复制链接”；复制采用现有 `sharePageUrl('/duel', query, document.baseURI)`、`useShareLink`，成功状态与 clipboard 拒绝后的完整可选文本 fallback 沿现规范；项目子路径与 fresh context 可复现。

四个蔷琵形态 2550/2588/2552/2554 单位详情新增“蔷琵线参考对照”入口，提供上述两个链接，旁边同样明确“参考：穆伊斯卡与法兰克，不代指当前对手”。不凭单位页 civ 参数伪造敌方。详情带有效civ、无civ均可查看显著参考；路径给出真实但不能训练当前形态的文明时，新增参考入口不把该组合声称为有效当前对局。非蔷琵单位无此模块。

两条参考打开后直接沿原计算器显示真实次数/用时/结果；包括城堡长剑对照 draw。不修改 Bohemian 372 两条授权预置和旧数据版本门槛。原 AgeComparison、单位不可用提示、Duel 上下文返回照常。

## 6. 计算和能力说明

共同可见条件：“双方当前时代已建模科技全选，无团队加成；同数量接触 1v1。远程按命中率取期望伤害，首次攻击在 t=0。”

共同限制：“未计入射程先手、追击与风筝、地形、抬手、阵型和包围、聚落治疗、招降、未建模特殊能力；不比较经济与到场时间，不是胜率或实战保证。”

模型可以在属性中计入草药学/护卫的速度，但不会因此模拟追击。Duel 实际双方含蔷琵形态时，旧说明“独特科技（仅文本）”改准确为“未建模的独特/特殊效果未计入”；已建模数值科技按真实选择计入。共享参考模块也明确此口径。其余非蔷琵对局的既有整段文字属于当前 URL 金标准，保持原样；本期不借新模块重录或筛除旧金标准。仅改本期必要说明，不改计算。

数据缺字段显示“未计入/暂不能计算”，不假填0。伤害次数基于命中期望，不叫“保证命中次数”。不复制原社区 OP/削弱/弓线必克/火枪轻骑稳定软克的断言。

## 7. 最小共用实现边界

1. 中立 `src/domain/unitAvailability.ts` 提取现有 Matchup 的 `unitAvailable`、`techAvailable` 原实现，所需 `treeAge` 保持模块私有，保留 EARLY_UNIT_AGES 与现有导出行为。`features/matchup/availability.ts` import并re-export原有两个公开函数，现有 rush 消费者与测试导入位置不变；不额外增加 public treeAge。中立接口只依赖 Unit/Tech/Trees 类型，不 import feature。
2. 新中立 `src/domain/champiCounters.ts` 接受已加载 core/trees 与当前已知双方、数据版本。只有三组候选、三时代、两条 reference，复用现有 simulate/duel/duelState，无核心JSON同步import，无全库搜索。
3. 为严格限定三个消费者的失败重试，提取既有 `useMatchupData` 的 caught 加载与 active/generation 守卫到 `src/shared/utils/useCoreTrees.ts`，但资源返回 **独立 core 和 trees 的 data/pending/error 状态**及重试方法：分别捕获两个请求的 resolve/reject，不能等聚合 Promise.all 全成功才发布 core。成功部分在另一部分失败和重试时保留；重试只恢复缺失/失败部分，所有 Promise 都有 rejection handler。hook 不捕获 pair/route。
   - Matchup 原hook以兼容适配器继续返回既有 both-ready `data`/`error`，再提供 retry；原公开行为不变。
   - Duel 最外层持有一次 resource 并传给原计算器/新参考组件；计算器组件本身始终挂载、保持既有context/URL状态，内部 both-ready 后才挂载需 core/trees 的 Side、模拟/对照子树。重试不改key、不销毁重建计算器；子树的旧 useCore/useTrees 只在两个cache已成功时挂载，不制造第二条未捕获请求。
   - **UnitDetail 继续只以 core gate 基本详情**：core 成功即显示标题、基础属性、造价、说明、已有工具/文明入口和其他原基本内容，不因 trees pending/failure 遮住整个页面。trees 只控制模拟器、相关科技、科技树限定的升级细节及新增参考合法性局部。core 失败显示本页 caught alert/retry；trees 失败在相关区域显示“科技树资料加载失败，基础资料仍可查看。”和局部“重试科技树”。
   - UnitLineItem 去掉自身 useTrees 请求，由 UnitDetail 传已加载 trees；科技树限定的升级路线/分叉和独特文明标签仅在树就绪后渲染，未就绪时该 SideBlock 局部 loading/error，不先生成未经当前文明核对的分叉链接。Simulator→useSimState 在 trees cache 未就绪时不挂载，以局部 loading/error 占位；成功后只读已有cache。相关科技和新参考模块同样局部gate。不能让这些子树的旧无catch hook抢先挂载导致 unhandled rejection；这些局部等待不阻挡基本详情。
   - UnitDetail 重试保留成功 core、当前 DetailPage、tab、单位/文明/科技URL与用户选择，不通过 retry key remount整页；按用户实际导航更换单位的既有行为不变。**不改全站 `src/data/hooks.ts`**，不影响三个消费者之外的route加载契约。
4. 当前 `src/data/index.ts` 已在 loadCore/loadTrees catch 中清空 `corePromise/treesPromise`，因此不会永久读取同一 rejected JS Promise；这不是原生 import 缓存可重试的浏览器证明。实现时必须测真冷 chunk abort→解除拦截→重试，不能仅 mock resolved load 或改计数显示成功。加载器本身不另加cache-busting query、不改代理/网络策略。若真实目标 Chromium 的 native import 失败缓存使此方案不能恢复，就不能按本稿签通过，必须回到既授权范围内修订加载/恢复方案并重新独立审查；不得用 JS Promise reset 或反复点按钮冒充真实恢复。
5. 新 Matchup/Duel/UnitDetail局部展示组件，仅调用中立函数；单位详情不 import Duel/Matchup feature。现有模块按需拆分保持 <600 行。
6. 新样式限定 `.champi-ages`、`.champi-presets`、`.champi-unit-entry` root；不改全局tokens/基础CSS或共享CivPicker。活跃时代模块内复用的civilization picker若触点不足44px，以本页局部opt-in class补足，不扩散到全站。

单位基础资料在局部树失败时仍须通过原完整无障碍范围检查。实际取证发现共享 StatTiles 的注释与评分轨道在定义列表分组中使用额外 div/span，须最小改为合法 dd 描述，保留原 class、视觉 display/间距、数值与评分；不缩小 axe 范围或排除失败节点，相关单位/科技/文明消费者纳入回归。

## 8. 可读状态与四宽冻结

- PC1280：三时代卡同一网格三列，标题/双方身份/主项/预计次数时间/条件/PK入口不依赖展开才能读；卡内“其余对照”才折叠。当前数值与其对应单位保持同卡，不做宽表。
- 360/375/390：网格单列；卡宽100%且min-width:0，长文明/单位名可自然折行，数值与单位 `.num/.nw` 不拆行；无横向滚动、无裁切，链接/按钮至少44×44，字号至少12px、WCAG AA。
- loading可读status、失败alert及重试、缺字段、缺候选、draw、loss、reference身份、clipboard fallback均有对应状态；不让空白容器/假0承担状态。
- 亮暗主题使用既有token；正式axe沿项目 `withTags(['wcag2a','wcag2aa'])` profile，不临时排除失败实例，不声称额外all-rules全通过。
- 四宽最终原图覆盖Matchup对手视角、我方视角/双方含线、缺候选/partial、Duel两参考与计算结果、单位页参考入口、加载失败重试。固定原图commit/hash与final SHA/tree/build身份，独立代理亲看变更原图；不把旧图重标新captured。

## 9. 真实观察与不可硬编码结论

以下是对当前固定DE188329数据的独立只读观察，用于核对示例合法性与解释口径。实现与测试仍从同一引擎和当前记录重算，不将表内数值写入运行时代码。

当前穆伊斯卡蔷琵 vs 法兰克、同代满科技无team的接触结果：

| 时代                | 蔷琵→候选次数/秒 | 候选→蔷琵次数/秒 | 结果             |
| ------------------- | ---------------- | ---------------- | ---------------- |
| 封建2588 vs 步弓4   | 6 / 10           | 25 / 48          | 蔷琵胜           |
| 封建2588 vs 武士75  | 9 / 16           | 8 / 14           | 武士胜           |
| 城堡2552 vs 长剑77  | 8 / 14           | 8 / 14           | 同时击杀         |
| 城堡2552 vs 骑士38  | 18 / 34          | 7 / 10.8         | 骑士胜           |
| 帝王2554 vs 冠军567 | 8 / 14           | 6 / 10           | 冠军胜，剩余25HP |
| 帝王2554 vs 火枪5   | 4 / 6            | 5 / 13.8         | 蔷琵胜           |
| 帝王2554 vs 轻骑546 | 8 / 14           | 13 / 24          | 蔷琵胜           |

因此三时代有限候选当前都有可证实的参考优势项，但任何实际选择的文明都须重算和重新检查可用性；没有优势项即显示诚实缺项。绝不把上表抄为运行时代码或把模型结果改成原社区预想。

## 10. 真红、持续注册测试与交付门禁

先在已部署v0.77.18基线记录新模块/参考入口缺失的真实红，将本规格和真实红证据交实现者以外代理预审，通过后实施；新export尚不存在或编译失败不充当产品红例。

持续归属冻结为以下 **current-build** 文件：Matchup 新浏览器断言进入 `tests/e2e/matchupSim424.spec.ts`；Duel 参考/URL新断言进入 `tests/e2e/v0280-duel-url.spec.ts` 的独立657 describe；单位详情入口/局部树失败断言进入 `tests/e2e/upgradeLine10.spec.ts`。已静态核对这三个文件顶部均无 historicalSuiteURL/test.use 历史基址，且当前对应 profile 持续登记。计算/缓存/可用性新增单测进入 `tests/unit/simulator.test.ts` 的独立657 describe；该49行入口已同时登记于 Matchup/Duel/Units/Simulator profile。文件接近600行时抽测试helper，持续登记的入口不撤销。

`tests/e2e/duelPreset372.spec.ts` 顶部使用 `historicalSuiteURL`，其被测对象是固定 DE185872历史产物；**整个旧372浏览器suite、unit suite及fixture完整保留，不向其中混入657当前数据断言，不把历史结果称为新功能通过。** `scripts/historical-ui.mjs` 的两条历史suite名单、旧golden和全部旧assertions不动。当前 `v0280-duel-url.spec.ts` 的原golden/期望同样保留，只追加独立current657测试；不夹带CI策略更改。

`v0280-duel-url.spec.ts` 原 beforeEach/afterEach 错误捕获原样保留。新增故障注入用独立 fresh browser context/page，逐条记录故意abort的准确URL和transport诊断、独立断言无意外console/pageerror；不修改原钩子去全局忽略网络错误，不稀释原golden用例的零错误要求。

至少覆盖：

1. 真实形态/时代纠错、无自动升代/文明fallback、真实树禁用、EARLY例外保持；当代科技sel恰为presetUpTo，无高时代/别家UT/team。
2. cards结果与独立调用simulate/fighterFrom/duel一致；有效攻击/护甲/速度/rof变化传播；文本变化不改变结果；未知build/缺字段明确停算。
3. Franks/Muisca 三时代有限候选、长剑draw、火枪轻骑loss、Imperial Champion优势均按真结果；Muisca vs Muisca帝王候选不可用不填Franks。
4. 敌方视角、仅我方视角、双方含线优先敌方、无Champi隐藏；URL永远A=me/B=opp，PK回助手不反转。
5. #672 explicit三种partial/双空/invalid无注入；legacy/sticky/default照旧；picker与browserhistory更新无stale。
6. 两reference复制/拒绝fallback、项目base、fresh context、真实直接计算；UnitDetail四形态入口和非Champi隐藏，参考不冒当前对手。
7. 冷context分别abort实际core组成chunk和trees chunk：Matchup/Duel必须caught失败，无假结果；解除拦截点击重试实际恢复，当前query保留；拒绝pending期间先换pair或导航离开，旧回调不复活。UnitDetail树请求被拒绝时必须仍可见真实基本标题/属性/造价，模拟器、相关科技与新参考区仅局部错误，不能有子树第二次未捕获请求；解除拦截局部重试恢复真实tree能力，tab/单位/文明/科技query不重置。core失败则整页caught retry。必须验证原生chunk而非注入load假成功。故障注入产生的准确请求失败诊断原样记录，不将它冒称全日志零错误；正常/恢复阶段无意外console/pageerror，整个注入过程无unhandled rejection。
8. 四宽/明暗、44px、数字不折行、正式axe、原旧PK/AgeComparison/372/424/672回归。

本次新中立计算/共用加载边界走现行 **full CI**；不重生未变数据，不篡改policy范围来省跑。实际最终候选 freeze 后独立实现review记录SHA/tree/范围/未解决问题与原图，完整适用CI成功才expected-head合并。main重新构建真实SHA、烟测、严格聚合与nativePages；真实公开版本/manifest和专项功能通过后，正式Release/tag/ZIP/SUMS/全部manifest文件hash/两次部署字节核验/completedobserver均按既有playbook独立通过。失败/取消原始run与预算保留，不借旧绿、不重置run.created预算。全实际交付后标已部署并close657，不以merge即闭网站功能issue。
