# 软件开发经验与维护交接

给改代码、跑数据与推进上线的人。本文聚焦代码架构、数据口径、测试发布和按主题归档的踩坑清单。角色范围与 Issue 生命周期以 [CONTRIBUTING.md](../CONTRIBUTING.md#issue-lifecycle) 为准，体验设计原则见 [experience-design.md](experience-design.md)，目录分层详表见 [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md)；冲突时流程以 CONTRIBUTING 为准，游戏数字以仓库数据与脚本为准。

## 1. 站点架构、登记与分层边界

- **技术栈与部署**：Vite 6 + React 18 + TypeScript（`strict`、`noUncheckedIndexedAccess`）+ react-router 6 `HashRouter`（路由 `#/…`，`vite.config.ts` `base: './'`）+ lucide-react；仅推送至 `main` 才触发 GitHub Pages 部署（<https://linhongcun.github.io/aoe2-analyzer/>）。
- **页面唯一登记表**：[pageRegistry.ts](../src/shared/nav/pageRegistry.ts) 的 `PAGES` 驱动路由、导航、首页分组与静态标题；新增页面同步在 [pageRegistry.tsx](../src/app/pageRegistry.tsx) 的 `LOADERS` 补懒加载，不手写平行路由名单。
- **分层边界**（`npm run lint:layers -- --strict`，默认 CI `static` 强制执行）：`features/X` 不引用 `features/Y`；`shared/` 不引用 `features/` 与 `app/`；`domain/` 不引用 React、`features/`、`app/`、`shared/ui`。核心 JSON 仅由 `LOADERS` 登记的 7 个文件直引（`src/data/index.ts`、`src/data/raw/{civs,units,techs,buildings,eco}.ts`、`src/domain/datEffects.ts`）；`src/data/raw/*` 仅 `src/data/**` 可用（`raw-direct`，#1029）。
- **数据读取入口**：同步读目录用 `src/data/core.ts` 的 `CORE`（主包模块改用 `loadCore()`/`useCore()` 防膨胀），文明用 `src/data` `civs`，经济用 `src/data/eco.ts`；专题数据走 `garrisonHosts.ts`、`ladder.ts`、`mapCatalog.ts`、`relicIncome.ts`（`ui-data-json`，#1031 禁界面三层直引 `data/game/**/*.json`），原动态加载入口保持动态 `import()` 与失败重试。
- **开发原则**：计算放 `src/domain/` 并配 `tests/unit/` 单测，状态尽量进 URL；按 [AGENTS「开发执行」](../AGENTS.md#dev-exec-2026-11-10) 不为已放弃旧行为加兼容层。进入 `阶段:软件开发` 即获既定范围内开发授权，开实现 PR 前须在原 Issue「软件开发」节写 TRD。

## 2. 游戏数据版本与生成命令

固定来源钉在 [data_sources.json](../data/sources/data_sources.json)（当前 DE Update 188329，`.dat` 源自 `SiegeEngineers/auto-mods@e293dc1`，目录源自 `SiegeEngineers/aoe2techtree@e56728e`）。生成的 `data/game/*.json` 与 `public/img/*` 只由脚本产出、禁止手改；`.dat` 与 `scripts/.cache/` 绝不提交。页脚同时显示应用号与 `vite.config.ts` 嵌入的 7 位构建 SHA。

| 任务               | 命令                                          | 说明                                                |
| ------------------ | --------------------------------------------- | --------------------------------------------------- |
| 同步目录、图标拼音 | `npm run data`                                | `build_data.py` + `pinyin_build.mjs`                |
| 校验拼音索引       | `npm run pinyin:check`                        | 改名称/别名/加成文案后必跑                          |
| 校验 `.dat` 固定源 | `npm run dat:check`                           | 核对 sha256 与补丁标记                              |
| 重建效果/经济表    | `npm run effects` / `npm run eco`             | 对应 `effects_build.py` / `eco_build.py`            |
| 基础数值对账       | `npm run stats:check`                         | `stats_crosscheck.py`                               |
| 上游补丁检查/更新  | `npm run data:status` / `npm run data:update` | 完整流程见 [DATA-UPDATE.md](../docs/DATA-UPDATE.md) |

页面单位总数经 `src/domain/family.ts` `unitCount` 家族折叠，与 `units.json` 原始长度不同；写文档或断言时动态现算，不硬编码旧数字。主观评分改 `data/sources/civ_ratings.json`，社区来源仅收 2020 年后且未核对标「未核实」。

## 3. 训练价、研究费、适用与不完整结果

- **训练单价**：唯一实现为 `src/domain/unitCost.ts` `unitCost`（先 `discountedCost`，再逐条应用科技费用效果；含未解码 `res` 或未知操作的单条效果记入 `undecoded`，其余无条件条目照常套用）。
- **费用科技适用**：运行时由 `src/domain/duelTrainingCost.ts` `applicableTrainingTechs` 判定（不写死名单）；`supported && partial` 仅允许手动或显式 URL 勾选并在界面标示估算边界，全站自动预设一律跳过。
- **训练总价**：`#/production?mode=train-total`（`trainTotal.ts`、`TRAIN_TOTAL_QTY_MAX = 1000`，默认 `age=4`）；不含研究/升级/建造/住房费。右栏文案以 [trainTotalCopy.ts](../src/features/production/trainTotalCopy.ts) 为准：空方案不显资源卡，零有效行写「当前没有已计入的训练行」，部分行计入标题改为「已计入行小计」+「部分训练费用」，未完整计入另标「估算，未完整计入」。
- **口径区分**：训练总价的「部分训练费用」≠ `bonusUsage.ts` 加成三档（「已计入 / 部分计入 / 仅文本」）；科技模拟器累计研究费由 `simulator.ts` `totalCost` 计算（`SimPanel.tsx`）；持续生产（建筑数）、训练总价（训练数）、跨文明对照（`trainCompareCodec.ts`）严禁混用参数。

## 4. 路由、URL 原串、状态与历史

- **模式分流**：[productionMode.ts](../src/domain/productionMode.ts) 坏编码直报错误，`mode=train-total` 进训练总价，`mode=army-cost` / `army-supply` 进阵容费用/补给，含对照保留键（`v`/`unit`/`n`/`civs`）走对照，其余走持续生产。
- **原串留存**：训练总价保留非法 `ageRaw` 与字符串 `qty` 供回填报错，未知键提示忽略不回写；对照坏链进 `ProductionCompareError` 保留原文；`useSimState` 经 `decideSimCanonical` 对照 `window.location.hash` 防过期 `replace` 覆盖新导航。
- **历史与状态**：跨模式跳转用 `Link` push（`productionTransfer.ts` 携带已解析文明、时代、合法形态与科技，不互换训练数与建筑数）；表单编辑用 `navigate(..., { replace: true })` 且保留 `location.state` 转换说明；刷新/分享完全由 URL 解码，`sticky.ts` 仅进程内有效；主题 `aoe2-theme` 与复盘/开一局存 `localStorage`，不进 URL。

## 5. 界面复用、深色、`.num`/`.nw` 与小屏

- 优先复用 `SimPanel`、`ToolPageHeader`、`ToolGrid`、`ToolShell`、`CalcDock`；图标只用 `Icon.tsx` `ICONS`（禁 emoji/Unicode），游戏美术走 `public/img/`，颜色只用 `tokens.css` 令牌（深色 `:root[data-theme='dark']` 经 `documentElement.dataset.theme` 生效）。
- **数字不换行**：`base.css` `body` 已设 `tabular-nums`、`.nw` 为 `white-space: nowrap`（无全局 `.num` 规则）；数值与「数字+单位」用 `.num.nw` 包裹，360 宽不折行。Chromium 断言用 `getClientRects()` 检查宽度 > 0 矩形的唯一 `top` 值（含图标 `.res` 因基线天然差 `1–3px`，用阈值如 `max - min > 6`）。
- 可点区域 ≥ 44×44、字号 ≥ 12px 为界面实现要求，不等于每 PR 四宽截图门禁；Playwright 默认视口 `1280×900`，按本次风险加测窄屏与深色。

## 6. 按风险选测试与 CI 实际范围

每份改动只跑必要冒烟与 diff 直接相关测试，报告分开写实际执行、CI 范围与未验证项（详见 [docs/TESTING.md](../docs/TESTING.md)）。

```bash
npm ci
npm run lint             # 注册表、数据族、费用/可用性、文档边界、颜色与 CSS（非 static 全文）
npx tsc -p . --noEmit
npm test                 # vitest run（仅收集 tests/unit/**/*.test.ts）
npm run build            # page_metadata、tsc、vite build、static_pages
npm run build && npx playwright test tests/e2e/<本次相关>.spec.ts --reporter=line
```

Playwright 未设 `BASE_URL` 时自起 `vite preview --port 4173` 读取 `dist/`，须先 `npm run build`。

**默认 CI（`.github/workflows/ci.yml`）**：纯 Markdown PR 仅跑标题与文档边界检查；其余 PR 与 `main` push 跑 `static`（`node scripts/ci-commands.mjs static`：含 `lint`、`tsc`、`content:check --strict`、`check-source-presentation`、`content:validators --check`、`lint:layers --strict`）→ `build` → `smoke`（`GATE_NARROW_SMOKE` 7 条窄冒烟含 `ciBuild659`）；仅 `main` push 成功后用同份 `dist` `deploy` Pages 并上传 `site` 产物。全量单测、`data`、对比度与整站 E2E 归 `.github/workflows/full.yml`（每日/手动，不部署）。`ci-browser-weights.json` 与 `lint:browser-weights` 已移除（[#1523](https://github.com/linhongcun/aoe2-analyzer/issues/1523)）。被跳过的作业不等于通过。

## 7. 从改动到上线

1. 基于最新 `origin/main` 建独立 worktree 分支；核对原 Issue 处于 `阶段:软件开发`、无重复 open PR 与硬阻塞，在「软件开发」节补 TRD（`feature`/`data` 先完成独立技术评审，`bug`/`docs`/`chore` 并入 PR 复核）。
2. 改数据脚本后本地重生成并提交产物（默认 CI 不跑 `data` 阶段）；跑直接相关单测/E2E 与必要冒烟。
3. 由实现者之外的独立代理复核最终 HEAD（记 SHA、范围、结论与遗留）；纯文档/纯样式不动逻辑测试可走 CI 绿轻量规则。
4. PR 标题符合 [check-pr-title.mjs](../scripts/check-pr-title.mjs) Conventional Commits；默认 `squash` 合并（双提交策略 PR 中 Commit 2 钉 Commit 1 `DOC_SHA` 时必须常规 `merge` 保留祖先链，如 [#1369](https://github.com/linhongcun/aoe2-analyzer/issues/1369)/[#1398](https://github.com/linhongcun/aoe2-analyzer/issues/1398)）。网站实现 PR 写 `Relates #N`，合入即完成的纯仓库文档可 `Fixes #N`（经验回写 PR 只写 `Relates #N`）。
5. 核对 `main` 上 squash/merge 后的实际 SHA：`check` 与 `deploy` 全绿、Pages 完成、线上页脚 7 位构建与该 SHA 一致且改动可见、正式非 draft Release 与 tag/产物通过（见 [RELEASING.md](../docs/RELEASING.md)），再转 `阶段:已上线` + `已部署`（纯仓库交付不标 `已部署`）、写复盘并关闭原 Issue。

## 8. 已经核对过的失败和后续上线

本节按主题归档；上线复盘后按 [CONTRIBUTING「经验回写」](../CONTRIBUTING.md#experience-writeback) 合并或修订条目（单条 3–5 行，无新经验不写）。

### 数据管线与 `.dat` 语义

- **`.dat` 字段语义、槽位回退与死科技过滤**：先核原始枚举与组合条件（`chargeType 4/5` 护盾、`1+event 0` 冲锋、`6/7` 需 `MaxTotalProjectiles>1 && TotalProjectiles<=1`、`blast=0 & blastDamage=-5` 非溅射），扩 `units.json` 同步 `data-units.json`（`additionalProperties: false`）与 `unitFormDetail.ts` 防副形态透传（[#1296](https://github.com/linhongcun/aoe2-analyzer/issues/1296)/[PR #1321](https://github.com/linhongcun/aoe2-analyzer/pull/1321)、[#1293](https://github.com/linhongcun/aoe2-analyzer/issues/1293)/[PR #1318](https://github.com/linhongcun/aoe2-analyzer/pull/1318)）；槽位未命中回退 `.dat` `TrainTime` 而非 `aoe2techtree` 并用异值单测锁死（[#1403](https://github.com/linhongcun/aoe2-analyzer/issues/1403)/[PR #1428](https://github.com/linhongcun/aoe2-analyzer/pull/1428)）；判死科技先剔 `-1` 占位、`BuildTech` 建筑触发与 `Type 8/18 B=12 D∈{1,3}` 效果激活，防误删 `t:957` 破坏 `bonusUsage317`（[#1408](https://github.com/linhongcun/aoe2-analyzer/issues/1408)/[PR #1426](https://github.com/linhongcun/aoe2-analyzer/pull/1426)）。
- **`.dat` `Type=102` 禁用三层分治与反事实归因**：禁用区分 `civ.disabled`（合并 `TechTreeID+TeamBonusID`）、条件禁用节点（`civConditionalDisablers` 显式跳过全局开局/模式节点如弑君 `t:117`）与区域禁用（`globalRegionalDisabled + civ.enabled`），须在 `researchResolver` 阶段拦截防前置被推导为 `inferred-done`（[#1402](https://github.com/linhongcun/aoe2-analyzer/issues/1402)/[PR #1420](https://github.com/linhongcun/aoe2-analyzer/pull/1420)）；1 对 1 反事实归因先规范映射等价运算符（`C=1/-1`）、按单资源 `anyResourceLower` 与精确 `(Type,A,B,C,D)` 索引防异资源掩盖与跨来源串扰（[#1429](https://github.com/linhongcun/aoe2-analyzer/issues/1429)/[PR #1437](https://github.com/linhongcun/aoe2-analyzer/pull/1437)）。
- **Fail-closed 校验、缓存版本、大整数与覆盖清单**：校正配置用 `key not in corrections` 严判 `{}`/`null` 非零退出不写盘（[#1445](https://github.com/linhongcun/aoe2-analyzer/issues/1445)/[PR #1484](https://github.com/linhongcun/aoe2-analyzer/pull/1484)）；并行扩 `.dat` 字段升级 `dat_source.parse()` 缓存键并测超界/显式零/缺行未知（[PR #1255](https://github.com/linhongcun/aoe2-analyzer/pull/1255)）；拼音生成后用 Python 整数校验超大整数防 JS `Number` 丢精度（[PR #1250](https://github.com/linhongcun/aoe2-analyzer/pull/1250)）；新增生成链同步登记 schema、数据族与 `data_update_coverage.json`，生成与运行时共用 `direct`/`related`/`identity-pending` 约束并对真实 CLI 跑负例（[#1064](https://github.com/linhongcun/aoe2-analyzer/issues/1064)/[#1082](https://github.com/linhongcun/aoe2-analyzer/issues/1082)/[#1083](https://github.com/linhongcun/aoe2-analyzer/issues/1083)）；改动 `effects.json` 哪怕仅更新链接也须跑 `ageRoutes652`/`mechanism652` 审核指纹单测（[#1403](https://github.com/linhongcun/aoe2-analyzer/issues/1403)）。
- **译文副本、替代形态、合并条目与阵容文案**：修加成译文同步全仓搜手写副本并重建拼音与静态元数据（[PR #1271](https://github.com/linhongcun/aoe2-analyzer/pull/1271)）；替代形态从目录保留记录与静态 `/unit/<id>/` 两头验证（[PR #1251](https://github.com/linhongcun/aoe2-analyzer/pull/1251)）；合并名称条目区分各模式操作（如 `408` 间谍/叛徒 [PR #1254](https://github.com/linhongcun/aoe2-analyzer/pull/1254)）；改 `civ-formations.json` 须经真实 `<FormationText>` 核 360 宽 `.num.nw` 分词（兼类词按偏移锚定上下文）与 `#1285` 去重不变量、跑 `prettier --write` 保未改文明零漂移，Commit 2 钉 Commit 1 `DOC_SHA` 必须常规 `merge`（[#1299](https://github.com/linhongcun/aoe2-analyzer/issues/1299)/[#1398](https://github.com/linhongcun/aoe2-analyzer/issues/1398)）。

### 领域模型与跨工具共享

- **部分解码费用科技、文明独科隔离与成对预算**：`applyCostEffect` 在 `exact[key]===undefined` 遇 `mul`/非正 `add` 跳过防写幽灵 `0`，自动预设仅选 `supported && !partial`、跨单位合并保守保留 `partial`（[#1297](https://github.com/linhongcun/aoe2-analyzer/issues/1297)/[PR #1320](https://github.com/linhongcun/aoe2-analyzer/pull/1320)）；文明专属采集科技独立导出 `civEcoTechs`，`gatherModel` 默认关 `includeCivEcoTechs` 并在 `armySupply`/`teamPlan`/`trainCompare` 排除防污染 `#486` 与他国（[#1410](https://github.com/linhongcun/aoe2-analyzer/issues/1410)/[PR #1465](https://github.com/linhongcun/aoe2-analyzer/pull/1465)）；成对训练（`trainCount>1`）按 `resolveSideBudgetCount(..., unitTrainCount(u))` 复算，满血零损直比原始 `fight.hpLeft`（[#1398](https://github.com/linhongcun/aoe2-analyzer/issues/1398)/[PR #1411](https://github.com/linhongcun/aoe2-analyzer/pull/1411)）。
- **战斗纵深、事件绝对时间与显示精度分离**：带 `minr>0` 群战纵深用与存活数解耦的固定逐排容量，去掉 `maxRanksByRange` 硬截断与 float32 `1e-9` 截排，以稳定存活编号保存冷却并在离开射程时清瞄准（[#1296](https://github.com/linhongcun/aoe2-analyzer/issues/1296)/[PR #1321](https://github.com/linhongcun/aoe2-analyzer/pull/1321)、[PR #1275](https://github.com/linhongcun/aoe2-analyzer/pull/1275)）；事件驱动模型由原始间隔×序号算绝对时间防逐次舍入拆散同刻出手（[#1054](https://github.com/linhongcun/aoe2-analyzer/issues/1054)/[PR #1104](https://github.com/linhongcun/aoe2-analyzer/pull/1104)）；推导用原始值、显示舍入偏离写「≈」、舍入归零的正差值写「小于 0.01」（[PR #1273](https://github.com/linhongcun/aoe2-analyzer/pull/1273)）。
- **跨工具带入、效果级归属与共享证据门控**：复用先分清数值选择 vs 显式解锁（[#1009](https://github.com/linhongcun/aoe2-analyzer/issues/1009)/[PR #1096](https://github.com/linhongcun/aoe2-analyzer/pull/1096)）及训练时代 vs 外部进入时代（[#1051](https://github.com/linhongcun/aoe2-analyzer/issues/1051)/[PR #1099](https://github.com/linhongcun/aoe2-analyzer/pull/1099)），跨工具带入须与目标页手填结果逐行对账（[#1194](https://github.com/linhongcun/aoe2-analyzer/issues/1194)/[PR #1212](https://github.com/linhongcun/aoe2-analyzer/pull/1212)）；多源合并视图中跨槽底部证据门控早于单槽 `hidden` 早退、失效子块禁渲原 `when`（[#1436](https://github.com/linhongcun/aoe2-analyzer/issues/1436)/[PR #1476](https://github.com/linhongcun/aoe2-analyzer/pull/1476)）；实体投影按效果级范围分组、来源按钮仅指已渲染唯一锚点、自由文本绑实体可用性加 `fallback`（[#1083](https://github.com/linhongcun/aoe2-analyzer/issues/1083)/[#1084](https://github.com/linhongcun/aoe2-analyzer/issues/1084)/[#1139](https://github.com/linhongcun/aoe2-analyzer/issues/1139)）；解除隐藏筛选按完整交集最小移除（[#1085](https://github.com/linhongcun/aoe2-analyzer/issues/1085)/[PR #1124](https://github.com/linhongcun/aoe2-analyzer/pull/1124)）。
- **跨页复用按需数据勿静默拆双懒加载分包**：静态导入懒加载专题领域模块（如 `src/domain/relicIncome.ts`）会让 Vite 拆出双分包阻断 `#412` 懒加载 E2E；改直接读类型化原始入口（`RELIC_INCOME_RAW`）或派生轻量索引（如 `garrison_techs.json` `numericEffectTechs`）并在构建后核对单分包。[#1448](https://github.com/linhongcun/aoe2-analyzer/issues/1448) / [PR #1495](https://github.com/linhongcun/aoe2-analyzer/pull/1495)

### 路由、URL、状态与历史恢复

- **协议分隔符草稿与跨工作区 `?age=` 隔离**：逗号/冒号分隔 URL 表单（`rows`/`units`）含分隔符非法草稿在 URL 侧空值占位，组件侧绑定 `{ key: location.key, search }` 且仅同条目 `REPLACE` 保留，删行/刷新/`POP`/`PUSH` 清空并入 `stateKey`（[#1455](https://github.com/linhongcun/aoe2-analyzer/issues/1455)/[PR #1511](https://github.com/linhongcun/aoe2-analyzer/pull/1511)）；共用 `?age=` 时在严格校验工作区用局部态隔离切换，可裁剪区降时代同步清超龄与不适用科技（[#1297](https://github.com/linhongcun/aoe2-analyzer/issues/1297)/[PR #1320](https://github.com/linhongcun/aoe2-analyzer/pull/1320)、[#1403](https://github.com/linhongcun/aoe2-analyzer/issues/1403)）。
- **跨模式回退、返回凭证校验与生命周期**：混编退单兵种走统一校验防泄漏超龄科技或卡死不可用单位（[#1279](https://github.com/linhongcun/aoe2-analyzer/issues/1279)/[PR #1312](https://github.com/linhongcun/aoe2-analyzer/pull/1312)）；跨页返回先解码拒重复/嵌套/控制字符再按目标视图与实体真实事件集合校验（[#1084](https://github.com/linhongcun/aoe2-analyzer/issues/1084)/[#1085](https://github.com/linhongcun/aoe2-analyzer/issues/1085)）；恢复完成即消费一次性焦点、显式收起清 history 记录（勿仅用组件 ref），多来源 owner 按精确 entry 有效性定序并缓存防旧 snapshot 夺权（[#1119](https://github.com/linhongcun/aoe2-analyzer/issues/1119)/[#1137](https://github.com/linhongcun/aoe2-analyzer/issues/1137)）。
- **重挂载粒度、瞬时反馈归属、请求乱序与锚点复位**：仅给需重置子区设 React `key` 防误收起相邻已展开区（[#1120](https://github.com/linhongcun/aoe2-analyzer/issues/1120)/[PR #1131](https://github.com/linhongcun/aoe2-analyzer/pull/1131)），混编同侧多行用 `rowKey` 而非 `'a'|'b'`（[#1296](https://github.com/linhongcun/aoe2-analyzer/issues/1296)）；瞬时反馈区分 `status`/`alert` 并校验 URL 与请求序号（[#1054](https://github.com/linhongcun/aoe2-analyzer/issues/1054)/[PR #1105](https://github.com/linhongcun/aoe2-analyzer/pull/1105)）；测共享加载器乱序须发两个独立请求且断言旧失败不清缓存（[#1149](https://github.com/linhongcun/aoe2-analyzer/issues/1149)/[PR #1166](https://github.com/linhongcun/aoe2-analyzer/pull/1166)）；同页锚点去重按 `key:hash` 复位，跨实体跳转由实体切换逻辑统一滚动并断言标题入视口（[#1436](https://github.com/linhongcun/aoe2-analyzer/issues/1436)、[PR #1257](https://github.com/linhongcun/aoe2-analyzer/pull/1257)）。

### 布局、焦点与无障碍

- **焦点可见、收起回焦、模态与底栏自动露出**：`toBeFocused()` 不等于可见——打开/切文明先复位面板滚动再聚焦，收起等 DOM 提交并量安全区后回焦并验 `elementFromPoint`（[#1118](https://github.com/linhongcun/aoe2-analyzer/issues/1118)/[#1119](https://github.com/linhongcun/aoe2-analyzer/issues/1119)）；模态开启先存背景位置并停采样，分开测同页 `Esc` 与跨访问 Back/Forward（[#1121](https://github.com/linhongcun/aoe2-analyzer/issues/1121)/[PR #1133](https://github.com/linhongcun/aoe2-analyzer/pull/1133)）；窄屏固定底栏露出新报错须在提交前采样可视字段且排除外部 `window.location.hash` 变更（[#1455](https://github.com/linhongcun/aoe2-analyzer/issues/1455)/[PR #1511](https://github.com/linhongcun/aoe2-analyzer/pull/1511)）。
- **粘性栏几何、双向 44px 热区与注释防误报**：粘性章节栏偏移与 active 阈值共用实测栏底几何（注意亚像素容差，ResizeObserver 只更新高亮不重滚 [#1137](https://github.com/linhongcun/aoe2-analyzer/issues/1137)/[PR #1146](https://github.com/linhongcun/aoe2-analyzer/pull/1146)）；44px 触控区须同时用长文本量宽与高（[#1118](https://github.com/linhongcun/aoe2-analyzer/issues/1118)），禁对 44px 行内链接加负垂直外边距压住上行（[#1429](https://github.com/linhongcun/aoe2-analyzer/issues/1429)）；吸顶栏核对 `Tab` DOM 顺序（[#1279](https://github.com/linhongcun/aoe2-analyzer/issues/1279)）；源码注释写 `Issue N` 不写 `#NNNN` 防触发 `check-colors.mjs`（[#1055](https://github.com/linhongcun/aoe2-analyzer/issues/1055)/[PR #1088](https://github.com/linhongcun/aoe2-analyzer/pull/1088)）。

### 测试、构建与发布运维

- **回归防假绿四条铁律**：多阶科技测试按 `pre` 链以前置态作对照隔离自身增量，并分测默认与非默认步距（[#1448](https://github.com/linhongcun/aoe2-analyzer/issues/1448)）；`buildSim` 负向回归断言无 `timeout`、完成早于采样、实采目标资源并配正对照（[#1410](https://github.com/linhongcun/aoe2-analyzer/issues/1410)）；全站回归从独立科技树推导预期、不做整文明跳过并做内存删项突变检查（[#1402](https://github.com/linhongcun/aoe2-analyzer/issues/1402)）；注入静态 JSON 的 E2E 在默认构建预览实跑防生产内联绕过 mock，定向失败归因既存须在未改基线同命令复现（[#1144](https://github.com/linhongcun/aoe2-analyzer/issues/1144)/[#1142](https://github.com/linhongcun/aoe2-analyzer/issues/1142)）。
- **生成器架构与本机/浅克隆环境避坑**：被单测和 `vite-node` 共用的脚本拆为纯库 `*_lib.ts` + 薄 CLI `*_build.ts` 防 `argv[1]`/`Error.stack` 误写盘（[#1429](https://github.com/linhongcun/aoe2-analyzer/issues/1429)）；macOS 冷缓存拉 `.dat` 遇鉴权/TLS 错用 `unset GITHUB_TOKEN` + `SSL_CERT_FILE=/etc/ssl/cert.pem`（[#1293](https://github.com/linhongcun/aoe2-analyzer/issues/1293)/[#1296](https://github.com/linhongcun/aoe2-analyzer/issues/1296)）；浅克隆遇 SSH 22 阻断用单条 `-c url."https://github.com/".insteadOf="git@github.com:" fetch --no-tags origin <branch>`（推送同理，不改 `remote.origin.url`）。
- **构建身份、线上 429 与回滚发版**：本地跑 `ciBuild659` 须在最终 `git commit` 后重建 `dist/` 防父 SHA 漂移（[#1445](https://github.com/linhongcun/aoe2-analyzer/issues/1445)）；线上 Pages 验收单次加载入口后通过 `window.location.hash` 切换复用缓存防 Varnish 429（[#1445](https://github.com/linhongcun/aoe2-analyzer/issues/1445)）；区分聚合失败/外部 502/部署跳过与真实上线（[#974](https://github.com/linhongcun/aoe2-analyzer/issues/974)/[#976](https://github.com/linhongcun/aoe2-analyzer/issues/976)/[#978](https://github.com/linhongcun/aoe2-analyzer/issues/978)）；网站回滚严禁退回已发布旧版本号，须分配新三段补丁号触发 `release.yml`（[#1408](https://github.com/linhongcun/aoe2-analyzer/issues/1408)）。
