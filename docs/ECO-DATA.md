# 经济/开局数据导出与对账

由 `scripts/eco_build.py` 从 SiegeEngineers/auto-mods@0c38027 dat/empires2_x2_p1.dat（DE Update 185872 (2026-09-22)）生成 `src/data/eco.json`。

## 村民（.dat 原始值）

| 任务 | 任务单位 | work_rate（/秒） | 携带量 |
| --- | --- | --- | --- |
| build | 118 | 1.0 | 10 |
| sheep | 592 | 0.33 | 10 |
| hunt | 122 | 0.41 | 35 |
| berries | 120 | 0.31 | 10 |
| farm | 259 | 0.53 | 10 |
| fish | 56 | 0.43 | 10 |
| wood | 123 | 0.39 | 10 |
| gold | 579 | 0.38 | 10 |
| stone | 124 | 0.36 | 10 |

村民：训练 25s，{'Food': 50}，移速 0.8，基础携带 10。渔船：work_rate 0.24，携带 15。

猎物/家畜食物：boar（unit 48）340.0，deer（unit 65）140.0，sheep（unit 594）100.0。

> work_rate 是纯采集速率；实际每分钟收入还取决于往返距离、放下资源时间等，模拟时需另建模型。

## 与 aoe2techtree 对账（训练/建造/研究时间、费用）

共比较 单位 248 / 建筑 38 / 科技 199；差异 0 项：

| 类型 | ID | 名称 | 字段 | aoe2techtree | .dat |
| --- | --- | --- | --- | --- | --- |
| — | | | | | |
