# #652 第二阶段验证记录

## 后续发布验证（2026-11-03）

用户已明确授权继续检查、合并部署和仓库正式Release流程。分支已合并 main `7dbf3587e0e4e9a4cfd8bf87af49585dc38a571f`，保留CI优化，准备v0.75.0。home profile新增ageRoutes652/routes652，纯首页修改也会选择路线验收；原固定列表断言只扩展、不放宽。Node20专项67项通过。最终PR计划为full unit、data=false、6份capped浏览器（含routes652）；main仍full浏览器。

以下失败与仅本地授权属于此前历史记录，不抹除；本轮正式CI、线上和Release结果以实际终态及PR/issue交付记录补充，运行中不视为通过。

后续已完成干净main对照、资源采样和CI主版本Node20限定验证，见 [DIAGNOSIS.md](./DIAGNOSIS.md)。原四例在Node20下均通过；基线复现同类超时，未发现新路线直接参与，但旧矩阵稳定性仍未达到全量发布门禁。以下保留首轮真实记录。

本轮基于 main e2637089ecbaafc30d08327a080df923064bb8f4（v0.74.15），独立分支 feat/652-feudal-castle-routes。只做本地提交，不推送、开 PR、合并、部署或关闭父 issue。下列为新功能实际执行记录，不复用上一阶段发布测试。

## 范围与复算

边路五样本：不列颠、埃塞俄比亚、玛雅、越南、法兰克参考；中路四样本：柏柏尔、法兰克、匈奴、不列颠参考。默认封建2000工秒、城堡另加3000工秒、计划保留6兵、新增上限6兵；保留数裁剪到已购入数，损失不退款、余额不结转。`npx vite-node scripts/route-scenes.ts` 可复算全体样本（模型/审核版本和来源随结果输出）。

不列颠默认封建可负担6步弓，城堡保留6升级为弩手且新产6；城堡新增支出375食物+470黄金+150木材，其中固定升级包375食物+200黄金只收一次。中路侦骑保留、骑士另行生产；畜牧同时影响合法保留侦骑。本轮不模拟经济/真实升城时间、不推导胜率、不做跨时代总榜。

## 红例与修复证据

在基线main构建后，新增浏览器测试先确认旧scene-Britons可用，再因缺少“封建到城堡：路线衔接”入口失败。日志 `/tmp/652-routes-red.log`，独立审查已核对；并非模块导入失败。

新单测发现侦骑generic提速与畜牧顺序问题，保留原断言，在新路线局部修复，不改变全局simulate。第一次严格攻击表验证误拒绝数据中的村民-3加成，改为检查结构与有限数值。资源项缺失、训练timeAt缺建筑等均阻断，不静默当免费或回退。相关日志 `/tmp/652-routes-unit-{first,second,third}.log`。

## 检查

- 新23项领域单测+旧场景18项：41通过，`/tmp/652-routes-unit-third.log`。
- 分层strict：0违规；内容strict：52输入、0告警/错误。
- 完整ESLint发现新增两处Unicode箭头，已改中文“到”；定向ESLint确认无错误。颜色检查误识别源注释中的issue号为颜色，已改为Issue 652；颜色/CSS检查通过。原有12条文件长度告警未修改。
- 构建首次未传已安装浏览器缓存路径，静态页生成失败；TypeScript/Vite阶段成功。最终带 `PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright` 完整构建成功，958静态页、OG与sitemap生成完成（`/tmp/652-routes-build-complete.log`）。

- 相关浏览器103项全部通过（新路线10、旧mechanism652、startGame592/632及smoke）。最后仅中文箭头文案与注释修复后，重建并复跑新路线10项全部通过。没有修改既有验收测试。
- 最终新路线四宽360/375/390/1280、dark/light实际主题断言、无横向滚动、无console/pageerror、360两主题axe均通过。零预算/零新增、存量裁剪/升级与侦骑畜牧、新产骑士独立均有浏览器或领域验证。模式/地图未知、导航和保留文明沿用原相关用例回归。
- 最终代码提交 `1a61d2cf8bda1529d4a11bf0b99b3aaea25fdb3d`。之后仅补验证/独立审查文档；尚未执行远端CI、线上验证或发布。

## 视觉与产物

最终截图与原始日志保存在 `/workspace/652-route-evidence/`（不提交PNG）。`screenshots/routes652-路线-{width}-{theme}-两阶段账本与布局/` 内分别包含 `controls-{width}-{theme}.png`、`route-{width}-{theme}.png`；另有中路骑士接力卡片。卡片截屏临时隐藏sticky顶栏以免遮挡标题，不改变应用代码/交互断言。原始临时路径 `/tmp/652-routes-final-browser/`。领域全样本复算输出 `652-route-snapshot-final.json`。

## 全量运行与后续复核

`npx vitest run --maxWorkers=1` 首轮完成：289文件中281通过、8失败；5805测试通过、22失败、2跳过、1todo；另有1次Vitest worker `onTaskUpdate` RPC超时。耗时1197.70秒，日志 `/tmp/652-routes-full-unit.log`。此轮**未通过**。

随后确认没有遗留活跃测试worker，以正确浏览器缓存路径、相同单worker及原断言/超时，仅复核8个失败文件：

```bash
PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright npx vitest run tests/unit/release108.test.ts tests/unit/releaseDiagnostics641.test.ts tests/unit/releaseSmoke.test.ts tests/unit/malians197.test.ts tests/unit/poles197.test.ts tests/unit/garrisonTechBudget282.test.ts tests/unit/formatTime.consistency-1.test.ts tests/unit/formatTime.consistency-3.test.ts --maxWorkers=1
```

结果：5文件通过、3文件失败；351测试通过、4失败，无RPC错误，269.24秒。release108/releaseDiagnostics641/releaseSmoke浏览器路径问题解除，poles197与garrisonTechBudget282通过。余下均为原5秒超时：

| 文件/用例                                                              | 实际耗时 |
| ---------------------------------------------------------------------- | -------- |
| formatTime.consistency-1：hybrid-fish-18 × Wei                         | 6717ms   |
| formatTime.consistency-3：hybrid-fish-18 × Cumans                      | 5660ms   |
| formatTime.consistency-3：hybrid-fish-18 × Franks                      | 5645ms   |
| malians197：当前八开局不建大学，原团队研究加成不改变结果或额外计入采金 | 5487ms   |

日志 `/tmp/652-routes-unit-recheck.log`。矩阵首轮失败组合与复核失败组合不同；不能用反复重跑直到绿替代稳定验证。相关buildSim、builds、数据、旧测试和依赖清单相对基线未改，新路线不在这些旧矩阵的导入链中；暂未发现本次直接引起失败，但不能据此证明没有回归或把全量记为通过。

**交付状态：本阶段实现、专项测试、构建和独立代码/视觉审查已完成；全量验收未通过，稳定性是待发布阻断。** 没有改旧断言/超时，没有扩大修复旧模拟器；推送/PR/CI/发布均未执行。待后续发布前解决或明确处置该阻断，再按仓库流程执行远端验证。

独立视觉与代码审查已完成，详见REVIEW。截图取证补充提交 `9b5c14b35c77063128ac65b8dbd4f33dc6c68aa7` 仅隐藏桌面表单截图中的sticky顶栏；1280双主题2项补跑通过（12.2秒），不改变应用或测试断言。
