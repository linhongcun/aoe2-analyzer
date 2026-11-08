# 发行版本

本项目已获 hongcun 的[持续发布授权](../CONTRIBUTING.md#维护者的持续发布授权2026-10-24)：已授权更新完成适用审查和必要验证后直接部署并完成正式 Release，无需逐次确认。独立复核、实现范围、Hold、数据来源和受保护产品验收规则继续有效。

#431 的一次适用验证原则继续有效；2026-11-03 维护者授权 #659 分阶段门禁，取代旧 PR 完整浏览器上限和全局壳层 targeted 例外。当前规则见 [CONTRIBUTING「验证投入」](../CONTRIBUTING.md#按改动风险控制验证投入2026-10-25) 与 [#659 冻结规格](design/ci-659.md)：按风险验证、只复用可信 v2 原始阶段证明、main 构建真实 SHA，Release 直接打包已部署产物。历史审阅与发版记录保留。

## 准备、合并与网站部署

1. 普通更新从最新 main 建实现分支，一个 issue、一个 PR 直接对 main；只有确需多项冻结集成时才建立 `release/vX.Y.Z`。版本号为三段，`package.json` 与锁文件一并更新。CHANGELOG 用 `scripts/changelog.mjs` 的 `insertVersionSection` 插在 Unreleased 正文之后、已有版本之前。
2. 完成实现者之外的独立复核，以及按变更计划选择的一次验证。高风险 PR 与 main 一样执行完整单测和四 runner 浏览器；窄范围保留受影响功能正负路径、四宽与主题。阶段 v2 证明记录实际被测提交/tree、策略/工具链、精确检查/文件/case 集合和原始 run/attempt/数字 job/artifact；PR 通常测试 merge ref，不能仅用 PR head SHA。
3. 合入 main。仅复用 GitHub 核实的同仓库成功原始执行证明，并匹配 tree、策略、工具链、精确集合与 artifact 归属/摘要；v1、坏证明或任意复用链无效，执行所缺必要阶段。build 与 static-main 不可复用。release 分支经过同样判断。
4. main 重新构建其真实 `__BUILD__`。默认只跑 static、构建身份烟测和 Chromium 单分片窄冒烟（首页、`#civs`、`#/civ/Franks`、`#unit/569`、Ctrl+K 搜索、法兰克圣骑士满科技 192 HP）。`test` 成功后才把同一 dist 上传为 `deployed-site` 并部署。冒烟或聚合失败则不部署。24 路由、多分片、单测和 data 只在手动 full，不作为这次部署的门禁。等待该 main run 的实际 `test` 与 `deploy` 都成功。

普通 UI 更新不重生成未变数据，不默认执行无关计算与整站扫描。核心计算、依赖、共享基础设施和未知范围仍完整验证一次；涉及数据、生成脚本、来源等变化时才做相应数据管线。不要为凑项数或固定周期推迟已就绪的授权更新。

## 自动接续正式 Release

`.github/workflows/release.yml` 在同仓库 main 的成功 push 型 CI/Deploy 后自动接续，并保留从 main 显式指定三段版本号的手动恢复入口。准备阶段核对事件来源、实际成功的 test/deploy 和当前部署 SHA，从该提交读取 package 版本。普通更新无需 release 分支；使用多项集成分支时继续核对版本与集成关系。

正式步骤下载该准确 main run 的 `deployed-site`，读取 dist 中的 `build-evidence.json`，并下载外部 v2 gate 证明，核对不可变 gate 引用、manifest/文件摘要、版本、commit/tree 与真实成功 test/deploy 来源。构建目录中不补写验证收据。随后核对真实站点页脚和本次功能，确认 annotated tag 指向实际部署提交，直接将这份准确字节的已部署 dist 压成网站 ZIP 并生成 SHA256SUMS.txt，上传后正式发布。

不再默认执行 594 项线上回归，不再从 tag 二次构建 ZIP。缺少或不匹配的部署产物应明确失败，不能用重新构建另一份网站掩盖来源问题。完整单测、数据检查和整站浏览器仍保留在风险触发的一次验证、nightly 和手动完整检查中。

自动入口对已正式发布的同版本幂等跳过，未完成的 draft 可恢复；已有 tag 指向不符时拒绝发布，不覆盖 tag。**生成 draft 不代表正式 Release 已完成。**

## 核验、恢复与环境

`scripts/release.mjs` 保留 `npm run release -- vX.Y.Z`、`--dry-run`、`--site-url` 和 `--footer-timeout`。默认页脚等待600秒仍受剩余预算限制，须在 main 检查和部署成功后调用，不靠延长等待代替就绪判断。Release runner 只允许推版本 tag，不代替执行者首次将代码合入 main。

CI/Deploy 与 Release 各自从 GitHub `run.created_at` 起共享30分钟验证预算，包含初始排队、子阶段/部署队列、同 run 重跑、命令和网络等待；Release 不能从下载或验证步骤重新计时。到期、取消、缺片或坏证明均拒绝成功与发布，诊断最多另用90秒且不能继续验证。平台终止与进程清理可能延迟，不承诺物理30:00瞬间停止。Release 的独立预算不隐藏前序 PR/main 等待，整链另外报告。

当前 `test` job 可以明确记录并核实复用的验证证据，但不能把旧 run 写成当前提交重新执行过全套。发布准备仍核对当前 main run 实际成功的 test/deploy、准确 SHA 与产物归属；页面部署、draft 和正式发布分别报告。

任何真实失败都停止相应发布步骤。修复原因后以同一版本恢复，已完成且一致的步骤幂等跳过。不提高超时、增加重试或放宽断言掩盖问题，不用临时本地站点替代真实线上页脚核对。需要留本地日志时使用 `set -o pipefail`，保留真实退出码。

本机 gh 或网站访问不可用时，检查实际错误和环境配置；GitHub 连接器可读取仓库与 CI，正式 runner 使用自身 token 执行线上核验。不替换注入凭据、不绕网络策略，不把访问受限等同于网站故障。确无执行途径时汇报具体未完成步骤。

发布完成后核对实际页脚版本/构建、本次功能、annotated tag、正式 Release、ZIP 和摘要附件，再由执行者以 completed 关闭已完成范围的 issue，无需另等产品走查或具名人员决定，依据 [2026-11-03持续关闭授权](../CONTRIBUTING.md#已部署-issue-的持续关闭授权2026-11-03)。保留 `已部署` 标签及交付证据供追溯；未交付、范围未完成或受阻塞事项保持开放。下载 ZIP 后应解压到静态 HTTP 服务目录，例如运行 `python3 -m http.server 8080`，网站不支持直接双击 HTML 文件运行。

## 后台完整回归

CI/Deploy 已关闭每日 schedule。手动调度的 full 默认开启，强制 full/data，禁用验证证据复用，不部署、不触发 Release。失败保留在真实 Actions 记录中并按故障定位；普通更新不等待这次手动回归。默认门禁见 [ci-749](design/ci-749.md)。

日常单次运行以10分钟为实测目标。独立完成事件时序报告使用 GitHub workflow-completed 数据统计 wall、排队、全部 runner 分钟与最慢浏览器片；交付时另列 PR→main→deploy→Release 整链，不能用局部 job 时间或目标代替实际耗时。
