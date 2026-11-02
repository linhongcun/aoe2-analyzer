# #652 本地验收记录

实现冻结 SHA：`01a7e0b67f7d513b646ce3b120c5a85ad4cbb933`。
基线 main：`254c4b5`；工作分支：`feat/652-mechanism-scenarios`。
最终文档提交仅记录验收，不改变已验证的代码。未 push、PR、合并、部署或关闭 issue。

## 运行结果

| 检查 | 实际结果 |
| --- | --- |
| `npm run lint` | exit 0；12条既有文件长度警告 |
| `npx tsc -p . --noEmit` | exit 0 |
| `npm run lint:layers -- --strict` | 0违规 |
| 内容严格检查 | 52输入，0警告，0错误 |
| `PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright npm run build` | exit 0；958静态页；构建01a7e0b |
| `npm test -- --maxWorkers=1` | 288文件：287通过、1超时；5803通过、1失败、2跳过、1todo |
| `npx vitest run tests/unit/sicilians197.test.ts --maxWorkers=1` | 清理遗留worker后原配置复跑：96/96通过，7秒；原失败用例1779ms |
| Playwright mechanism652 + startGame592 + smoke，单worker | **89/89通过** |

全量唯一失败为未改动的 sicilians197.test.ts:329，5323ms超过既有5000ms阈值。当时有之前中止运行遗留的worker争用CPU；清理确定属于本任务的进程后，以原阈值复跑整套96用例通过。没有提高超时或修改断言。以上不能改写成“一次完整单测全绿”。新增mechanism652的18项单测在完整运行中通过。

## 覆盖和证据

- main上的两条先行红例证实修改/跳过地图会清空文明；实现后通过。
- 新单测覆盖真实单位、科技和文明效果扰动传播，未知结构/缺失字段门禁，无关字段对照、预算上限、零预算、包含截止和完整首周期、无兵不推荐，以及前置条件变更保留文明。
- 新13项浏览器用例覆盖360/375/390/1280四宽、真实明暗两主题（断言html主题）、展开详情、axe、边/中路参数、未知范围、现成/新产、资格提示和网络失败撤销拦截后局部恢复。
- 既有首页与完整smoke一起通过。只精确迁移两条已授权行为改变对应的非受保护592断言；不修改历史受保护验收。
- 独立审查者review652审查规格、实现及8张实际边路截图，结论见REVIEW.md。截图滚动后的全页采集有固定导航伪影，不据此声称中路截图已目视。
- 没有执行全部其它浏览器用例、Python数据生成测试或远程CI；本次不修改生成游戏数据。没有将既有模块测试称为推荐有效性证据。

本次实际日志位于任务工作区：`/workspace/652-final-{lint,types,unit,browser}.log`、`/workspace/652-build-01a7e0b.log`、`/workspace/652-sicilians-rerun.log`、`/workspace/652-final-checks.json`；截图`/workspace/652-evidence/`。交付研究/实现证据包保存这些文件，不将大日志和截图纳入产品源码。

## 复算

```sh
npx vite-node scripts/position-scenes.ts
npx vite-node scripts/review-position-scenes.ts
npx vitest run tests/unit/mechanism652.test.ts
PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright npx playwright test tests/e2e/mechanism652.spec.ts tests/e2e/startGame592.spec.ts tests/e2e/smoke.spec.ts --workers=1 --reporter=line
```

结构审核脚本只输出待审指纹，不自动批准。默认参数是透明场景偏好；非支配分组仅解释两个限定指标。#652的全文明、跨时代整局推荐未完成，不能由这次测试推导其有效性。

## 发布前产物路径修正

截图保存改用Playwright testInfo.outputPath，匹配CI的test-results/**/*.png归档；不改产品或断言。独立review652复核两行diff通过。原配置复跑mechanism652.spec.ts：13/13通过（29.5秒），实际产物位于test-results。用户后续授权推送、合并及部署；上文“未发布”是本地验收时点状态，正式发布状态以PR和准确main CI记录为准。

## 发布续检（2026-11-02）

新实例已确认日志与正式站域名策略生效。原 CI 41436136899 的失败为图标脚本 GitHub API 403 rate limit exceeded；读取远端日志后重跑，随后由修正 CHANGELOG 的 8354156 取代。CI 41439613031 的完整单测 288 文件、5804 用例通过（2 skipped、1 todo），全部数据再生成与构建通过；浏览器 127 通过、4 失败，均为 startGame632 空大厅四宽禁止出现未选示例的原断言。

修正未选模式/地图时的场景提示及摘要文字，不改变计算或状态，不改测试断言。发布补查本地构建、单文件 ESLint、diff check 通过；mechanism652 + startGame632 + startGame592 原测试共24项通过（29.5秒），日志 /tmp/652-empty-lobby-e2e.log。独立 release_review 复核两处文案及回归范围无代码阻断。最终提交仍需新的 CI 终态与真实 main 部署，不把上一轮完整成功项冒称当前提交重新跑过。
