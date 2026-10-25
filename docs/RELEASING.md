# 发行版本

本项目已获 hongcun 的[持续发布授权](../CONTRIBUTING.md#维护者的持续发布授权2026-10-24)：已授权更新完成适用审查和必要测试后直接发布，无需每次再确认。实现范围、Hold 和审阅要求仍按各自约定执行。

当前审阅按[持续审阅授权](../CONTRIBUTING.md#维护者的持续审阅授权2026-10-25)执行：独立代理复核实际提交并记录证据，完整 CI 通过后继续发布，不再要求另一团队代表签字。历史审阅记录保留；适用测试、受保护验收期望及范围授权继续有效。

## 准备、合并与网站部署

1. 从最新 main 建立 `release/vX.Y.Z` 分支，将 `package.json` 和锁文件中的版本号一起更新，把 Unreleased 里尚未发布的条目移入新版本小节。新小节用 `scripts/changelog.mjs` 的 `insertVersionSection` 插在 `## [Unreleased]` 之后、已有版本之前，不要插到文首的版本号规则之前。
2. 为最终发行内容准备 PR，完成独立复核并核对**最终 release 头部**的实际 `test` 检查成功。PR 的另一提交曾通过、源码树相同、空的 commit statuses、只列 PR 的 Actions 查询，都不能代替该检查。
3. 完成适用验收后，以 **merge commit** 将 release 合入 main，保留发行提交和 CI 记录。由已获授权的正常 git / GitHub 连接器执行，不依赖 Actions 内的 `GITHUB_TOKEN` 首次推 main 后触发另一条工作流。
4. 等 main 的 **CI / Deploy** 实际完成：完整测试成功，Pages deploy job 成功。release 分支只有测试，不会更新网站。

不要为凑固定周次或项数推迟已就绪的授权交付。新需求不插入冻结范围；确实阻断本次发布的修复须有诊断、失败用例和独立复核，不能靠放宽测试过关。

## 自动接续正式 Release

`.github/workflows/release.yml` 保留从 **main** 手动调度、输入三段版本号的入口，并在同仓库 main 的 push 型 **CI / Deploy** 成功后自动接续。准备阶段先核对事件来源及已部署的提交，从该提交的 `package.json` 读取自动版本，确认对应 release 分支已被它包含。

准备阶段只读；正式发布步骤才具有写 Release 的权限。自动入口对已正式发布的同版本幂等跳过，文档等更新的网站部署仍由 main CI 完成；有新功能或修复要发布时应按版本规则更新版本。未完成的 draft 可恢复，已有 tag 指向不符仍由脚本拒绝。

工作流复用 `scripts/release.mjs`，核对 release 头部 CI、真实网站渲染后的版本号和构建号，再创建 annotated tag 和 draft Release。工作流继续执行列明的线上专项，从确认过的 tag 构建网站 ZIP 及 SHA256SUMS.txt，上传后正式发布。**生成 draft 不代表正式 Release 已完成。**

脚本默认页脚等待 600 秒，发布 job 的时限也不适合等待约四十分钟的 main 全量测试，因此须在部署成功后运行。自动接续及手动恢复都应遵守这一顺序。手动调度必须选 main，填写例如 `v0.31.0`；工作流核对包版本与发行分支。发版任务的检查记录位于 main，脚本仅忽略它自身名为 release 的检查，test 和 deploy 仍把门禁。

任何步骤失败都停止发布。修复原因后，可以用同一个版本号重跑；发版脚本会核对已有标签的指向，并跳过已完成的步骤。不要用临时本地站点代替线上页脚核对。

## 检查范围与环境

PR 的全部改动落入 `.github/**`、`docs/**`（不含会进入构建的 `docs/PATCH-NOTES/**`）、`scripts/release.mjs`、`scripts/check-pr-title.mjs` 和 `tests/unit/release*.test.ts` 时，CI 才跳过 Playwright；仍安装 Chromium 供发版单测使用。main / release 分支 push 和 CI 手动运行均执行完整 Playwright。Release 是另一条工作流，只跑其中列出的**线上专项**，不是完整套件。

`compare403.spec.ts` 自行托管本地构建并读取 dist，不能直接加进发布前尚未 build 的线上专项列表。文明对比的线上检查应直接打开真实参数链接，点击复制并重开实际生成的静态地址，核对新组合与部署前缀，由正式 runner 保留结果。

本机 `gh` 凭据或网站访问不可用时，先检查实际错误和环境配置；GitHub 连接器可用于仓库操作与读取 CI，正式 runner 使用自身 `github.token` 执行发布及线上核对。不替换注入凭据，不绕网络策略，不把无法访问等同于网站故障。若确无可用执行途径，汇报具体未完成步骤，不声称已上线。

发布完成后核对部署版本/构建、tag 指向、正式 Release、ZIP 和校验附件，再关闭已发布的范围及实现 issue；仍未交付的事项保持开放。

下载 ZIP 后，解压到静态 HTTP 服务器目录即可运行，例如在解压目录执行 `python3 -m http.server 8080`，再访问 `http://localhost:8080/`。网站需要 HTTP 服务，不支持直接双击 HTML 文件运行。
