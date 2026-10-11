# 开局库（M1，issue #1）

## 数据

- 类型与校验器：`src/domain/buildOrder.ts`（`BuildOrder` / `Step` / `Action`，`checkShape` 结构校验，`checkSemantics` 语义校验）。
- 数据文件：`src/data/build-orders/<id>.json`，一个文件一个开局；加载器 `src/data/buildOrders.ts`。
- 校验：`npm run bo:check`（CI 必跑）与 `tests/unit/buildOrders.test.ts`。

### 结构要点

| 字段              | 说明                                                                                                           |
| ----------------- | -------------------------------------------------------------------------------------------------------------- |
| `steps[].vils`    | 此步骤时的村民总数（含开局 3 个），单调不减                                                                    |
| `steps[].phase`   | `feudal-click` / `feudal` / `castle-click` / `castle` …：点击升级 / 到达                                       |
| `steps[].actions` | `gather`（新村民或 `from` 调动）、`build`、`train`、`research`、`upgrade`（单位升级，如武士）、`ageUp`、`lure` |
| `steps[].split`   | 来源给出的分配检查点（食/木/金/石/建造），校验器按动作累计比对                                                 |
| `sources[]`       | `title`、`url`、`author`、`section`、`ref`（固定版本）、`accessed`                                             |
| `license`         | 转写与许可说明                                                                                                 |
| `review`          | `draft` → Steve 审核后改为 `reviewed`（填 `by`、`date`）                                                       |

`gather.from: "hunt"` 表示「城镇中心下的肉类」，依次从 hunt/sheep/boar/deer 调人。

### 校验规则

结构字段；所有单位/建筑/科技 id 存在于 `units/buildings/techs.json`（时代升级用 `ageUp`，单位升级须有升级信息）；文明名存在；
每步累计分配人数 = 村民数；调动不超过现有人数；检查点一致；时代顺序（先点击后到达、不跳代）；动作所需时代 ≤ 当前时代；目标时代点击时村民数 = `target.vils`；开局（`vils = 3` 的步骤）必须包含盖房子。每个开局另有 Vitest 快照（`tests/unit/__snapshots__/buildOrders.test.ts.snap`），改动数据需 `npx vitest run -u` 并在 PR 中说明。

注意：城镇中心研究升时代期间不能造村民，「27+2」之类写法中的 +2 是到达新时代后再造的村民。

## 来源与许可

当前 6 个开局的步骤数字转写自 [aoe2-guide](https://github.com/themkdemiiir/aoe2-guide)（MIT，提交 `f09ed56`，网站 aoe2guide.com），
该项目在 `docs/superpowers/notes/build-order-sources.md` 中把每个开局对应到 Hera 攻略指南（2025-12）的章节。
中文步骤说明为本项目原创表述，未复制原文。新增开局须注明出处，不得自行编造。

## 经济/时间数据

`npm run eco`（`scripts/eco_build.py`）从固定 `.dat` 导出 `src/data/eco.json`：单位训练时间/费用、建筑建造时间/费用、科技研究时间/费用、
村民各任务 work_rate/携带量/移速、通用经济科技与各文明经济效果；与 aoe2techtree 的对账结果见 [ECO-DATA.md](ECO-DATA.md)。
