# 发行版本

本项目已获 hongcun 的[持续发布授权](../CONTRIBUTING.md#维护者的持续发布授权2026-10-24)：已授权更新完成适用审查和必要验证后直接部署并完成正式 Release，无需逐次确认。独立复核、实现范围、Hold、数据来源和受保护产品验收规则继续有效。

#431 的现行简化规则见 [CONTRIBUTING「验证投入」](../CONTRIBUTING.md#按改动风险控制验证投入2026-10-25)：同一份代码按影响验证一次，release/main 复用可信成功证据，main 构建真实 SHA，上线后做短核验，Release 直接打包已部署产物。历史版本的审阅与发版记录保留，不能把其逐阶段全量要求继续套在普通更新上。

## 准备、合并与网站部署

1. 普通更新从最新 main 建实现分支，一个 issue、一个 PR 直接对 main；只有确需多项冻结集成时才建立 `release/vX.Y.Z`。版本号为三段，`package.json` 与锁文件一并更新。CHANGELOG 用 `scripts/changelog.mjs` 的 `insertVersionSection` 插在 Unreleased 正文之后、已有版本之前。
2. 完成实现者之外的独立复核，以及按变更计划选择的一次验证。`ci-validation-evidence` 记录实际被测提交/代码树、策略指纹、验证范围和来源 run；PR 的被测代码通常是 merge ref，不能仅将 PR head SHA 当成被测提交。
3. 合入 main。CI 只有在同仓库真实成功 run、来源、代码树、策略和必要范围均匹配时复用验证；缺少证据就执行当前必要范围。release 分支经过同样判断，不因阶段名称变化重复整站回归。
4. main 重新构建其真实 `__BUILD__`，做少量构建烟测，上传 `deployed-site` 并部署完全相同的 dist 到 Pages。等待该 main run 的实际 `test` 和 `deploy` 都成功；代码验证复用不等于跳过真实构建和部署。

普通 UI 更新不重生成未变数据，不默认执行无关计算与整站扫描。核心计算、依赖、共享基础设施和未知范围仍完整验证一次；涉及数据、生成脚本、来源等变化时才做相应数据管线。不要为凑项数或固定周期推迟已就绪的授权更新。

## 自动接续正式 Release

`.github/workflows/release.yml` 在同仓库 main 的成功 push 型 CI/Deploy 后自动接续，并保留从 main 显式指定三段版本号的手动恢复入口。准备阶段核对事件来源、实际成功的 test/deploy 和当前部署 SHA，从该提交读取 package 版本。普通更新无需 release 分支；使用多项集成分支时继续核对版本与集成关系。

正式步骤下载该准确 main run 的 `deployed-site`，读取 dist 中的 `build-evidence.json`，核对版本、commit/tree 与可信来源。随后核对真实站点页脚和本次功能，确认 annotated tag 指向实际部署提交，直接将这份已部署 dist 压成网站 ZIP 并生成 SHA256SUMS.txt，上传后正式发布。

不再默认执行 594 项线上回归，不再从 tag 二次构建 ZIP。缺少或不匹配的部署产物应明确失败，不能用重新构建另一份网站掩盖来源问题。完整单测、数据检查和整站浏览器仍保留在风险触发的一次验证、nightly 和手动完整检查中。

自动入口对已正式发布的同版本幂等跳过，未完成的 draft 可恢复；已有 tag 指向不符时拒绝发布，不覆盖 tag。**生成 draft 不代表正式 Release 已完成。**

## 核验、恢复与环境

`scripts/release.mjs` 保留 `npm run release -- vX.Y.Z`、`--dry-run`、`--site-url` 和 `--footer-timeout`。默认页脚等待仍为 600 秒，须在 main 检查和部署成功后调用，不靠延长等待代替就绪判断。Release runner 只允许推版本 tag，不代替执行者首次将代码合入 main。

当前 `test` job 可以明确记录并核实复用的验证证据，但不能把旧 run 写成当前提交重新执行过全套。发布准备仍核对当前 main run 实际成功的 test/deploy、准确 SHA 与产物归属；页面部署、draft 和正式发布分别报告。

任何真实失败都停止相应发布步骤。修复原因后以同一版本恢复，已完成且一致的步骤幂等跳过。不提高超时、增加重试或放宽断言掩盖问题，不用临时本地站点替代真实线上页脚核对。需要留本地日志时使用 `set -o pipefail`，保留真实退出码。

本机 gh 或网站访问不可用时，检查实际错误和环境配置；GitHub 连接器可读取仓库与 CI，正式 runner 使用自身 token 执行线上核验。不替换注入凭据、不绕网络策略，不把访问受限等同于网站故障。确无执行途径时汇报具体未完成步骤。

发布完成后核对实际页脚版本/构建、本次功能、annotated tag、正式 Release、ZIP 和摘要附件，再核对 issue 已完成；未交付事项保持开放。下载 ZIP 后应解压到静态 HTTP 服务目录，例如运行 `python3 -m http.server 8080`，网站不支持直接双击 HTML 文件运行。

## 后台完整回归

CI/Deploy 每日北京时间 04:17（cron `17 20 * * *`，UTC）运行完整单测、数据检查和整站浏览器；手动调度的 full 默认开启。该运行强制 full/data，禁用验证证据复用，不部署、不触发 Release。失败保留在真实 Actions 记录中并按故障定位；普通更新不等待无关后台回归重新执行。

普通 UI 发布以 5–10 分钟为目标，交付记录报告实际耗时，不将目标写成未经实测的保证。
