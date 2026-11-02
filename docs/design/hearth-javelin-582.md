# #582 扈从部队基础标枪说明

## 授权与继承范围

维护者本轮已明确授权按序处理剩余 issue，授权记录见 [#625 评论](https://github.com/linhongcun/aoe2-analyzer/issues/625#issuecomment-6568916109)。本项在 #584 合入后的 main `6457725809a238463ad405f8f4a617a3b6152633` 上准备；旧交接的未排期状态不替代本轮具体授权。一个 issue、一个实现者、一个 PR；独立代理先审规格和真实失败用例，再改产品。

#584 已按 [#621 产品设计通过](https://github.com/linhongcun/aoe2-analyzer/pull/621#issuecomment-6559579549) 落实：普通/精锐扈从各两条洞察，造价无粮、80 木 + 35 金、近战前自带标枪及火矛兵对照均可见。撒克逊特色兵种链接与文明基础箭加成分开。洞察不复制到文明槽；孟加拉两条、两个战车单位空槽、法兰克无槽等路由合同继续有效。

本项只补 #582 尚缺的显式研究门槛说明，不重新实现槽位，也不把 #585 的单位训练费用提示称作已完成。

## 玩家可见变化

路由仅 `#/unit/2705`、`#/unit/2706` 的默认「概览」。现有 `hearth-javelin` 第一条改为：

> 近战前自带投掷标枪，无需先研远程科技；造价无粮（80 木 + 35 金）。

第二条保持：`无粮步兵（对照火矛兵）。`。两版共用同一配置，仍为两条，在「造价与生产」下方、「基础属性」上方，不依赖展开。此句指获得该单位后已有标枪，不表示无需时代、训练或精锐升级，也不表示远程科技不能强化标枪。

沿用 `InsightSlot` 与 `editorial-details.css`：标题 18px、正文 15px、正文/边框/底色使用现有令牌；不改组件或 CSS。`80 木 + 35 金` 继续使用现有 `.nw` / `.num`，四宽 360 / 375 / 390 / 1280、明暗主题均可读、数字不换行、无横向溢出、无 console error / pageerror。非概览标签沿用原行为，回到概览仍显示同两条。

## 固定来源与可审证据

当前数据为 DE 188329。`scripts/data_sources.json` 固定 `.dat` 为 `SiegeEngineers/auto-mods@e293dc106b0f3b0ceac2db98409fbcc5c921190b` 的 `dat/empires2_x2_p1.dat`；SHA-256 为 `d0aefd92428e2215d6f4d9b1d544901e6f171e19183f9e0b88218de5153a337f`。本地原文件实测哈希与该值相同。文本目录来源为 `aoe2techtree@e56728e76b7d08301fba7b18d5f16bc8554c109a`；生成的两单位说明均已有「在近战之前，先投掷一发标枪」。

直接读取固定原文件中、尚未应用研究效果的 `Saxons.units[id].creatable`：

| 字段 | 2705 | 2706 |
| --- | --- | --- |
| `max_charge` | 1 | 1 |
| `recharge_rate` | >0 | >0 |
| `charge_type` / `charge_event` | 6 / 6 | 6 / 6 |
| `charge_target` | 127 | 127 |
| `charge_projectile_unit` | 2702 | 2707 |
| 对应投射物 | Projectile Hearth Troop | Projectile Elite Hearth Troop |

已提交的 `src/data/garrison_general.json` 两单位也可读到相同 `maxCharge=1`、`chargeType=6`、`chargeEvent=6`、`chargeProjectile=2702/2707` 和非零 `rechargeRate`，其 `meta` 指向相同固定提交与哈希，且 `engineVerifiedInPinnedBuild=false`。本项是静态固定数据核对，不声称完成游戏客户端运行时实测。

箭羽 199 / 锥子箭 200 / 护腕 201 对应 effect 192 / 193 / 194。三者对 2705、2706 各有 `Type=4, B=-1, C=61或1或23, D=1` 增量命令；对 2702、2707 各有 `Type=4, B=-1, C=9, D=769` 攻击增量命令。它们强化既有属性，没有向单位赋予基础标枪投射物。769 是原始编码值，不解释为 769 点攻击。

开放普通单位科技 1461：`RequiredTechs=[102,-1,-1,-1,-1,-1]`、数量 1；精锐升级 1462：`RequiredTechs=[103,1461,-1,-1,-1,-1]`、数量 2。站内玩家名称 102 为城堡时代、103 为帝王时代；两者没有 199/200/201 前置。基础投射物配置、研究增量和开放前置共同支持新增短句；不能仅凭 `rng=0`、造价或描述推断研究门槛。

本地只读复核使用 `scripts/.cache/venv/bin/python -B` 的 `genieutils.datfile.DatFile.parse()` 读取现有 `empires2_x2_p1.e293dc1.dat`，先核 SHA-256，再只打印上述两单位 charge 字段、三个研究效果及两个开放前置。本次未调用数据生成流程；完整本地命令和有界输出留在交付证据，原始 `.dat` 与缓存不提交。

## 可测验收与先红

- 两个单位在概览固定槽内均明确可见「无需先研远程科技」，第一条仍含自带标枪及原造价，第二条保持火矛兵对照。
- 保留两条数量、槽位位置、无驻扎因果、无序位、相同普通/精锐文案及数字不换行。原造价和射程主数字仍以生成数据为准，本次不变。
- 基于上述 post-#584 main，新增 #582 断言放在既有 `tests/unit/insights584.test.ts` 和 `tests/e2e/insights584.spec.ts`；不新增测试 basename。旧 #584 正控制及精确锁句在准备阶段保持；实现阶段仅迁移第一条旧锁句，保留其余断言。
- 准备阶段先确认 `git diff 6457725 -- src package.json package-lock.json` 为空，再构建真实 main SHA。在实际构建上运行两单位浏览器新断言与既有普通/精锐正控制；新增研究门槛断言应红，正控制应绿。单测运行同一既有文件，新增两例应仅因短句缺失失败。
- 实现后跑现有消费者 profile、lint、严格分层、类型/生产构建；四宽明暗截图保留最终实际构建 SHA，必要槽位 axe 检查无违规。不重生成未变数据，不重复整站计算回归。

准备阶段实际记录：应用源码与 main `6457725809a238463ad405f8f4a617a3b6152633`（tree `3cbe655e046e9506215b674f7260f3746e62e4ff`）零差分，生产构建成功、静态页面 957 个，实际页脚 `v0.74.11 / 6457725`。以下命令在该真实构建上执行：

```bash
npx vitest run tests/unit/insights584.test.ts
BASE_URL=http://127.0.0.1:4582/ npx playwright test tests/e2e/insights584.spec.ts --grep '#582|#/unit/2705 扈从部队|#/unit/2706 精锐扈从部队' --reporter=line
```

单测 13 项：新增两项缺句失败，原 11 项通过。浏览器 4 项：新增普通/精锐两项均在期望「无需先研远程科技」处失败，接收到原句「近战前自带投掷标枪；造价无粮（80 木 + 35 金）。」；原普通/精锐正控制两项通过。失败前的两条数量、原造价 nowrap、第二条、位置和禁项检查均通过。红灯只证明该展示缺口；准备提交不改产品，不单独合并仍红的测试。

## CI 覆盖与非范围

现有 `civs`、`units` 两个 profile 的 unit/e2e 均已选择 `insights584`；`src/domain/insights.ts` 仍是到这两个实际消费者的精确映射。本项不改 CI 策略；通过 `planChanges` + `applyBrowserPolicy` 检查最终差分确实选择这两个文件。未知/core/full/data 与 capped 黑名单守卫继续保留。

不添加第三条或文明重复洞察，不改其他种子、槽位、卡片、评分脚注和布局；不写驻扎因果、箭数或任何序位；不新增无 2020+ 社区出处的「炉卫」别名。不改生成数据、射程、造价、计算、来源 pin 或受保护 `v0*` 验收。不把本次展示澄清解释为游戏内实测或驻扎机制证据。
