# 开局时间线模拟（M2，issue #2）

`src/domain/buildSim.ts` → `simulateBuild(bo, civ, eco, upgrades, params)`：纯函数、确定性（无随机数，固定 0.1 秒步长）。
游戏数值全部来自 `src/data/eco.json`（DE 185872 `.dat` 导出），单位升级时间/费用来自 `units.json` 的 `up`。

试跑：`npx vite-node scripts/sim_try.ts <文明> [1]`（加 `1` 打印每步）。

## 参数（#2 Linus 定）

| 参数            | 默认  | 说明                                                                      |
| --------------- | ----- | ------------------------------------------------------------------------- |
| `walkTiles`     | 4     | 木/金/石到投放点格数，1–10（越界截断），预设 近 2 / 中 4 / 远 7（`WALK`） |
| `nearTiles`     | 2     | 羊、野猪/鹿、浆果、农田固定按近距离                                       |
| `idleThreshold` | 2     | 城镇中心闲置 **严格大于** 2 秒计为卡点（1.9、2.0 不算，2.1 算）           |
| `team`          | false | 是否计入团队加成                                                          |
| `autoHouses`    | true  | 人口余量 ≤ 2 时自动补房                                                   |

误差带：同一输入再用 近（2 格）、远（7 格）各跑一次，`errSec = { early: t − t近, late: t远 − t }`，前后不对称。

## 输出字段与 #3 草案第 4 节的对齐

与草案一致：`buildId`、`civ`、`variant`、`params`（含 `carryModel`）、`ageUps[{age, clickAt, reachAt, errSec}]`、`steps[{index, action, entity, startAt, doneAt, errSec, stock, pop{used,cap}, villagers{food,wood,gold,stone,build,idle}, anomalies}]`、`model{version, assumptions}`；
`Anomaly{type, resource?, shortfall?, waitSec?, from, to, reasonZh}`，`type` 为 `idle_tc` / `pop_block` / `resource_short`（另有 `timeout`：超过 60 分钟仍未完成）。

差异（请 Jony 确认）：

1. `errSec` 为 `{ early, late }` 两个秒数（Linus 定的不对称误差带），不是单个 ±n。
2. `entity` 只给 `{kind, id}`，`nameZh` 由界面用现有数据查（避免重复存中文名）。
3. 走路距离预设按 Linus 定的 2/4/7、范围 1–10（草案写的是 4/7/10、2–14）。
4. 新增：`steps[].vils`、顶层 `anomalies`（按优先级 idle_tc > timeout > pop_block > resource_short 汇总）与 `tcIdleTotal`。
5. `stock`/`pop`/`villagers` 是**步骤开始时**的快照；`startAt` = 步骤开始（村民数达到、前一步动作已付费、所需时代已到），`doneAt` = 该步全部动作完成。

## 模型假设

见 `ASSUMPTIONS`（同时随结果输出到 `model.assumptions`，供界面「估算」浮层使用）。要点：连续收入模型；资源不耗尽；不计微操；
「hunt」按牧羊速率；建造 n 人用时 = 建造时间 × 3 ÷ (n+2)；升级前置建筑视为满足；自动补房；起始村民数（中国 6、玛雅 4）为手工规则。

## 文明加成（#42）

`buildSim.ts` 的 `classifyCivEffect` 把每条文明效果分成四类：已处理 / 不影响开局（附原因）/ 影响开局但未实现 / 未分类。`bo:check` 遇到未分类就失败。有「影响开局但未实现」的文明，`simSupport(civId)`（`src/domain/simSupport.ts`）返回 false，界面把它置灰。

- **高棉 654「Instant Farmers」**：.dat（185872，effect 690）里只有 `res 33 set 50` 和农民（214/259）workRate ×0.95 三条命令，**.dat 本身没有定义 res 33=50 的含义**。我们按玩法说明把它解释为「农民无需回仓」，实现为耕作没有走路时间。按 #43 的范围规则，这个解释没有被现有开局证明，高棉先置灰，代码保留。来源：<https://ageofempires.fandom.com/wiki/Civilization_bonus#Khmer>、<https://ageofempires.fandom.com/wiki/Farm_(Age_of_Empires_II)>（update 34699）。
- **资源储量倍率**（玛雅 47/79/189/190/219/296、鞑靼 216、哥特 268）：模型里资源点不会耗尽，但这些倍率和同一文明的采集 workRate 成对出现（玛雅 ×0.87 配 ×1.15，鞑靼 ×0.637 配 ×1.57，哥特 ×0.813 配 ×1.23）。模型只算了减速那一半，所以它们会改变到封建的时间，列为未实现，这几个文明置灰。
- 西西里农田储量（69）、女真尸体不腐烂（292）：按 #43 的范围规则（不加新机制，有不确定就先置灰）列为未实现，这两个文明置灰。
- **葡萄牙采果兼产木材（453 / res267）**：按固定数据百分数 `v / 100`（eco 为33.333302）在采果的有效食物采集率之外增加木材库存。共用原有采果携带量与往返时间，只作用于浆果，不增加伐木走路或套用伐木科技。沿用连续收入近似，不表示客户端逐笔到账、取整或行走触发已经实测。单位黄金费用−20%通过已有类别折扣计入；默认不计团队研发速度。来源闭包、测试与真实成本独立边界见 [#197规格](design/portuguese197.md)。
- 马普切采果存放 +25%（215）：未实现，马普切置灰。
- **波斯城镇中心工作速度（409）**：eco.json（`eco_build.py` 从 .dat 导出）里 TC 单位 109/71/141/142 的 workRate 为 ×1.05/1.10/1.15/1.20，与 `docs/EFFECTS-AUDIT.md` 波斯条目「+5/10/15/20%」一致。模型里村民训练和升时代研究都按**当前时代**的城镇中心计：升封建时 TC 仍是 109（×1.05），升城堡时已是 71（×1.10），升帝王时是 141（×1.15）。hongcun 游戏内实测确认对升时代研究有效，数值取自 .dat。在 TC 上研究的其他科技（如织布机）也按同一倍率计，这一点未单独核实。
- **按 tech 整条判定**：同一个 tech 里只要有一条效果是未实现或未分类，buildSim 就不应用这个 tech 的任何效果，文明置灰。这样能避免成对效果只生效一半，比如储量 ×k 和 workRate ×1/k 只生效了减速那一半。

### 水图与骑士分支（issue 41）

`hybrid-fish-18` 采用 AoE Buddy 对 Survivalist 开局的整理（2026-10-18 已打开核对）：18 村民、3 渔船，来源的 19-pop 包含侦察却未包含渔船；本站用明确数量命名，最终总人口为 22。分配是 11 食物、7 木，升时代期间改成 13 木、4 金、1 食物；前置村民的行走与之后的军舰生产没有加入。前置盖房为本站补充，详情标注。

渔船完成训练才开始收入，已在入队时预留人口。固定 .dat 的 unit 13 workRate 乘 class 5 / action 5 的深海鱼任务 Value（`eco_build.py` 导出 `deepFishMultiplier`），再按自身携带量、移速、往返距离计算连续收入；距离共用走路参数。不模拟鱼耗尽、受袭损失或渔网。单位及类别采集/携带/移速修正均参与计算，村民经济倍率不套用到渔船。

`fast-castle-knights` 复用 `fast-castle-boom` 到城堡点击为止的全部步骤；城堡后转 4 个采金村民、建兵营和双马厩、先生产 2 骑士。参考 Dragonstar 开局的双马厩转型思路，整个分支标为本站改编，没有照搬来源的 25+4 升城时刻。每座同类型建筑有独立训练槽位，付费和人口约束仍在入队前检查。

来源：https://aoebuddy.com/build-orders/18-fishing-ship-build 、 https://aoebuddy.com/build-orders/25-knight-rush-beginner 。中文说明为原创；不是原文全文转载，未声称获得原文许可。数据的 review 记录 Codex 完成的来源与数据核对，不冒充人工 ACCEPT 或产品设计签字。
