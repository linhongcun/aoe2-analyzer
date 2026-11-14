# 补丁数据更新流程

单一入口是本地脚本。只改 `scripts/data_sources.json` 的 pin，不要手改生成 JSON。覆盖清单是 `scripts/data_update_coverage.json`，检查命令是 `python3 scripts/data_update_coverage.py`。检查只读源码，不跑生成器，不下载 `.dat`，不更新 pin。

## 独立数据生产器

建造模型数据由 `scripts/construction_build.py` 生成，`python3 scripts/construction_build.py --check` 校验固定来源与 `src/data/construction.json` 可复现；圣物收益由 `scripts/relic_income_build.py` 生成，`python3 scripts/relic_income_build.py --check` 校验 `src/data/relic_income.json`。两者读取 `scripts/data_sources.json` 的固定 DE `.dat` 来源，不运行游戏客户端；源数据元信息中的引擎验证状态仍以 `engineVerifiedInPinnedBuild` 为准。

```bash
python3 scripts/data_update.py          # 与 npm run data:update 相同
npm run data:update                     # 有更新才生成；开始前先过覆盖清单
npm run data:status                     # 与 python3 scripts/data_update.py --check 相同；有更新时退出码 10
npm run data:update -- --force          # 无更新也重跑全部生成
python3 scripts/data_update_coverage.py # 只查清单，不生成
GITHUB_TOKEN=... npm run data:update    # 可选，提高 GitHub API 限额
```

`package.json` 里 `data:update` 是 `python3 scripts/data_update.py`，`data:status` 是 `python3 scripts/data_update.py --check`。本单不新增 npm script，也不改 `.github/workflows`。默认 PR CI 不跑这份清单，也不恢复 full data。默认 CI 上的只读防漂移是 #865。

## 固定版本：`scripts/data_sources.json`

唯一记录上游版本的文件：

| 字段                                 | 含义                                                                                                                     |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `patch.build/date/name/detectedFrom` | 当前数据对应的游戏补丁及识别依据                                                                                         |
| `sources.dat`                        | SiegeEngineers/auto-mods 的 `dat/empires2_x2_p1.dat`：`commit`、`sha256`、`markers`（文明/科技/效果数量、最新 3 个文明） |
| `sources.aoe2techtree`               | SiegeEngineers/aoe2techtree `data/` 的固定提交（`npm run data` 按此提交下载，不再跟随 master）                           |
| `sources.halfon`                     | SiegeEngineers/halfon：仅用于从提交信息（`Implement DE Update N`）识别补丁号                                             |
| `assetSources.mapPreviews`           | 地图预览素材的独立 pin。不随游戏 pin 的编排更新                                                                          |

构建时 `vite.config.ts` 读入该文件，站点页头/页脚显示「数据版本：DE 188329（2026-10-28）」，并在 `#/about-data` 列出来源、提交、sha256 和补丁说明链接。

不要手改这些生成文件：`src/data/civs.json`、`src/data/units.json`、`src/data/techs.json`、`src/data/buildings.json`、`src/data/trees.json`、`src/data/effects.json`、`src/data/eco.json`、`src/data/search-py.json`。

## 当前事实：编排会跑什么

`scripts/data_update.py` 在覆盖清单通过之后才查询上游。生成器非零退出会立刻停止后续步骤。当前事实是 pin 在生成前写回 `scripts/data_sources.json`，失败时不会自动回滚已经写完的那一部分 JSON。脚本不提交。

dat 或 aoe2techtree 有变更，或者传入 `--force` 时，先跑：

1. `scripts/build_data.py`
2. `scripts/pinyin_build.mjs`

只要进入更新，就继续跑：

3. `scripts/dat_source.py --check`
4. `scripts/effects_build.py`
5. `scripts/eco_build.py`
6. `scripts/market_build.py`
7. `scripts/garrison_build.py`
8. `scripts/garrison_general_build.py`
9. `scripts/trade_income_build.py`
10. `scripts/construction_build.py`
11. `scripts/team_bonuses_build.py`
12. `scripts/garrison_healing_build.py`
13. `scripts/relic_income_build.py`
14. `scripts/generate_resource_build.py`
15. `scripts/charge_attack_build.py`
16. `scripts/build_orders_check.ts`
17. `scripts/effects_audit.ts`
18. `scripts/stats_crosscheck.py`

差异摘要写到 `docs/PATCH-NOTES/<补丁号>.md`。这是本次差异说明，不是补丁档案。

`scripts/build_data.py` 内部还会按顺序调用：`scripts/civs_build.py`、`scripts/units_build.py`、`scripts/techs_build.py`、`scripts/trees_build.py`、`scripts/buildings_build.py`、`scripts/ages_build.py`、`scripts/icons_hires.py`、`scripts/catalog_introductions.mjs`。这些调用都带 `check=True`。

当前事实：锁 SHA 的 issue 正文写编排不跑 introductions。`scripts/data_update.py` 确实没有单独一步。编译器是 `scripts/build_data.py` 的最后一条嵌套命令，所以只有 dat、aoe2techtree 变更或 `--force` 才会编译首发版本查表。人工源仍是 `scripts/catalog_introductions.json`。`npm run introductions:check` 只在手动 full 里出现，不在默认 PR CI。

`scripts/stats_crosscheck.py` 的文件头仍写着对账 185872。这是过期注释。函数体通过 `dat_source` 读取当前 pin。本单不改该脚本，也没有跑它，不能把过期注释当成已经完成对账。

## 故意不跑，以及主人

这些脚本存在，但 `scripts/data_update.py` 不调用它们。主人以各文件里的原文为准；没有另指定一个人。

| 脚本                           | 为什么不跑                                   | 主人                                                                                              |
| ------------------------------ | -------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `scripts/patches_build.py`     | 补丁档案按历史身份锁定                       | 无单独具名负责人。185872 看 `HISTORICAL_SHA256`；188329 看 `scripts/patches_188329.py` 的锁定常量 |
| `scripts/history_build.py`     | 旧公告只校验实体身份，不用今天的数值覆盖历史 | 无单独具名负责人。主人是该文件里的 `PATCHES` 表                                                   |
| `scripts/map_previews.py`      | 地图预览是独立素材                           | 无单独具名负责人。pin 在 `assetSources.mapPreviews`                                               |
| `scripts/map_catalog_build.py` | 地图目录和编辑文案不跟游戏 pin 一起重生成    | 无单独具名负责人。编辑文案在 `scripts/map_catalog_meta.json`                                      |

需要时单独运行：`python3 scripts/patches_build.py`、`python3 scripts/history_build.py`、`python3 scripts/map_previews.py`、`python3 scripts/map_catalog_build.py`。

## 人工可以改什么

| 项           | 文件                                 | 主人                                                                                                                    |
| ------------ | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| 主观评分     | `scripts/civ_ratings.json`           | 维护者。文件写明由维护者主观判断。`basis` 只记口径；`verifiedAt` 不是补丁对齐日，对齐补丁必须留空                       |
| 搜索别名     | `src/data/aliases.ts`                | Reid 整理、Steve 审                                                                                                     |
| 易混淆对照   | `src/data/confusables.ts`            | Reid 维护、Steve 签字                                                                                                   |
| 拼音多音字   | `scripts/pinyin_build.mjs` 的 `FIX`  | Steve。生成器在编排里，人工只改这张表                                                                                   |
| 文本关联     | `scripts/effects_links.json`         | 无单独具名负责人。只改归属，不改数值                                                                                    |
| 图鉴首发     | `scripts/catalog_introductions.json` | 无单独具名负责人。编译器是 `scripts/catalog_introductions.mjs`                                                          |
| 开局步骤     | `src/data/build-orders`              | 各文件自己的 `sources[].author` 与 `review.by`。清单不另指定一个人。主人证据抽自 `src/data/build-orders/scouts-18.json` |
| 地图编辑文案 | `scripts/map_catalog_meta.json`      | 无单独具名负责人。`source` 为 editorial 的句子是人工文案                                                                |
| 译名校正     | `scripts/civ_text_corrections.json`  | 无单独具名负责人。对不上就改这张表或确认上游                                                                            |
| 对账例外     | `scripts/stats_allowlist.json`       | 无单独具名负责人。每条必须有 reason。当前是空数组                                                                       |

`src/domain/effects.manual.ts` 和 `src/domain/buildingEffects.manual.ts` 只是回退。`.dat` 已经有战斗规则时不要改它们。`src/domain/effects.ts` 在 `datCombat` 为真时直接返回，改了也不会进运行时。

## 失败即停

`scripts/data_update.py` 的 `run` 使用 `subprocess.run(..., check=True)`，外面没有 `try`。覆盖清单失败时退出文案是「数据更新覆盖清单未通过，已停止，未运行生成器」。

`scripts/civs_build.py` 读 `scripts/civ_text_corrections.json`。特色科技原文、名称或括号对不上就 `raise`，不能改成静默跳过或静默覆盖新文本。

## 补丁历史

当前 pin 是 188329。档案目录是 `src/data/patches`。

- `src/data/patches/188329.json` 由 `scripts/patches_188329.py` 锁定到这份 pin 的提交和 sha256。模块断言 pin 必须仍是 188329。
- `src/data/patches/185872.json` 由 `scripts/patches_build.py` 的 `HISTORICAL_SHA256` 封存。
- `src/data/patches/66692.json`、`src/data/patches/81058.json`、`src/data/patches/125283.json` 由 `scripts/history_build.py` 生成。它不收编 185872 或 188329。

不要改写 188329 或更早档案的锁定身份，也不要让 `scripts/data_update.py` 去调用上述生成器。pin 与清单里的 `pinBuildIs` 不一致时，检查只报告这份锁定，不检查新补丁档案是否已经建立。只把 `pinBuildIs` 改成新号，并不能证明新档案存在。新档案要另建，且不得改写 188329 的 `FIXED_COMMITS` / `DAT_SHA256`。

## 新增文明机制或费用加成

当前事实：特殊机制要同时看到这些位置。

- `src/domain/buildSimMechanisms.ts` 的 `CIV_MECHANISMS`
- `scripts/eco_build.py` 的 `*_CONTEXT_TECHS`。新常量必须写进覆盖清单的别名，并且该文明已经在 `CIV_MECHANISMS`
- `src/domain/buildSimCoverage.ts` 的 `classifyCivEffect`
- `src/domain/specialIncome.ts` 的 `SPECIAL_INCOME`
- `src/domain` 里已有的 `*Economy.ts` 必须被 `buildSimMechanisms.ts` import。本单不重写这些实现

已有检查仍在，本单不改它们：`scripts/check-registries.mjs`、`tests/unit/buildSim815.test.ts`、`tests/unit/sources801.test.ts`、`tests/unit/deriveLists821.test.ts`。

费用计入的当前事实是统一策略，已经由 #864 合入 `src/domain/costPolicy.ts`。本清单只登记现行调用，不重写费用实现。

- 生成侧仍须同时经过 `scripts/effects_build.py`（`costDiscounts`，运行时交给 costPolicy）和 `scripts/eco_build.py`
- `discountedCost`（`src/domain/costDiscount.ts`）用 `matchCostGroup` 与 `priceFromRawFactor`。对不上费用句的分组不乘，其它分组仍计入
- `costOf`（`src/domain/buildSim.ts`）用 `civDiscountFactors` 与 `alignAggregatedFactor`，与 PK 共用 costPolicy
- `unitCost`（`src/domain/unitCost.ts`）调用 `discountedCost` 和 `priceFromRawFactor`
- `src/domain/bonusUsage.ts` 用 `bonusDiscountCounted`
- `scripts/check-cost-drift.ts` 是 #865 已合入的只读检查，本单不改它

## 不在本单

- #865：`cost:check` 已在 lint 里。这里不改 workflow，也不把本覆盖清单加进默认门禁。
- #869：四套科技可用性仍各自独立，不收成一个布尔。问题、消费者和手写例外在 `src/domain/techAvailability.ts`，检查是 `npm run availability:check`（已接入 `npm run lint`）。数据更新编排不跑这份检查，也不做全科技×全文明矩阵。
- 不新建服务，不把主观评分、开局 JSON 或已放弃的天梯数据并进 `effects.json`。
- full data 仍是手动的再生 diff，不是每个 PR 的门禁。

## 提交前

覆盖清单通过后，再按当次 diff 做相关测试。不要为了这份清单去下载或更新真实 pin。

```bash
git diff --stat
python3 scripts/data_update_coverage.py
```

检查 diff 后自行提交。本脚本不会提交。

## 版权

`.dat` © Microsoft Corporation：只在本地/CI 缓存目录 `scripts/.cache/`（gitignore）中使用，从不提交、不随站点发布。
