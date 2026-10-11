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
