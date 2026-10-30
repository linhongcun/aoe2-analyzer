# #197 最后两文明：已批准的验收迁移

2026-10-30，维护者在聊天中选中以下具体问题并回复“代码合并吧”：

> 是否允许按 PR 中的具体提案，迁移这两文明对应的旧验收期望、保留历史原件，然后继续合并？

这次明确授权只涵盖[原具体提案](final-civs197-acceptance-migration.md)中的322唯一Roman BO页面及civ42 C/289旧未支持合同；一般发布授权继续沿仓库现行规则执行，不扩展到其它验收或issue。

## 已实施迁移

- 新增`tests/e2e/fixtures/v0700-romans197-current.json`：仅一个`bo:archers-19-romans`，内容逐值取自已审preview.current，带版本0.70.0和固定DAT188329身份。322仍以原21场景清单逐一执行，只该case选择新fixture，URL/捕获器/文字及数值精确比较保留；其它20场景原fixture与比较未变。
- 新增`tests/unit/fixtures/final-civs197-v0700.json`：逐值取自已审preview中两文明各六模板的current投影，共12条。C段保留19文明历史fixture结构检查，新增56文明全部支持、空未支持集合、空原因列表，并真实运行全部12场景逐步比较库存、完成时间、时代；没有空循环或运行时重生成expected。
- 289只对原始/当前civ42文件中唯一顶层`C 白名单`段应用这次限定迁移。原56条断言的防空转计数保持，C以外47条原断言逐条继续保护；formatTime全部原断言和循环、civ42 A/B/D原循环保持。非默认计时模式仅去除原civ42的22条失效C测试名，其余16条及formatTime318条原名继续保留，不触发一次无关全量计时。
- 产品逻辑、生成数据和样式相对已审实现提交`a75de71`没有变化；原86项专测、206项相关单测、440份跨文明完整结果及四宽双主题/PNG/UI复核结果复用，没有重复生成来源或重跑整套矩阵。

## 本次实际验证

- `npx vitest run tests/unit/civ42v070.test.ts tests/unit/v0300-289.test.ts`：26通过、1条原非默认全量计时跳过，7.29秒。包括A/B/D所有原测试、47条原源码断言保护、12条新当前场景精确数值、56文明状态，以及Generic/Huns/Incas原数值哈希保护。
- `BASE_URL=http://localhost:4198/ npx playwright test tests/e2e/v0290-322-golden.spec.ts --grep '金标准清单|bo:archers-19-romans' --workers=1`：2通过，2.3秒。复用此前同一产品构建；其它20个场景前轮已通过且fixture/比较未改。
- 本次三份受影响测试ESLint、`git diff --check`通过。没有再次构建未变产品，也没有把前轮已取消的CI记为成功。

## 历史原件

以下文件实际与`a75de71`逐字节一致，未重新记录：

| 文件                                              | SHA256                                                             |
| ------------------------------------------------- | ------------------------------------------------------------------ |
| `tests/e2e/fixtures/v0290-322-golden.json`        | `eb1141aea3c89ea4f5ce0baf909457c4f94db742b3dd7d0308cfe435f99e8aca` |
| `tests/unit/fixtures/whitelist-v070.json`         | `1302c93864f59c0d46ef2103d374bef4abd92367aa7854484ff55e9d947a7260` |
| `tests/unit/__fixtures__/v0300-289-baseline.json` | `45aebc3cb2cebe182b02eeb8db13306ee164175792da710453f7903d14f48c40` |

最终提交的独立迁移复核、合并和CI状态在PR #510记录；远端检查或部署仅按实际结果汇报，不用本地结果伪称远端CI已通过。
