# 发行版本

本项目已获 hongcun 的[持续发布授权](../CONTRIBUTING.md#维护者的持续发布授权2026-10-24)：已授权更新完成适用审查和必要验证后直接部署并完成正式 Release，无需逐次确认。独立复核、实现范围、Hold、数据来源和受保护产品验收规则继续有效。

#431 的一次适用验证原则继续有效。当前 CI 与验证规则见 [TESTING 第 6 节](TESTING.md#ci-659-validation)。

## 准备、合并与网站部署

1. 普通网站实现更新从最新 `main` 建实现分支，一个 issue、一个 PR 直接对 `main`；**不再在功能 PR 中手工递增 `package.json`、`package-lock.json` 或修改 `CHANGELOG.md` 顶部**，而是在 `release-notes/<issue>.json`（或 `release-notes/<issue>-<slug>.json`）提交零冲突变更片段（JSON 字段：`issue` 必填正整数且与文件名前缀一致、`summary` 必填单行中文说明且含 `#<issue>`、`bump` 可选默认 `patch`，可选 `patch`/`minor`/`major`；由 `npm run lint:release-notes` 与 PR 防重检查把关）。纯文档 PR 与无需网站发布的纯仓库工程 PR 不提交片段，不会触发版本号递增与网站 Release。仅确需多项冻结集成时才建立 `release/vX.Y.Z`。
2. 完成实现者之外的独立复核，以及按 TESTING 选择的一次适用验证。
3. 合入 `main`。PR 的 CI / Deploy `check` 必须成功；它每次实跑，不复用其他 run 的结果。
4. `main` push 进入 `CI / Deploy` 的 `prepare` 阶段（`scripts/release-workflow.mjs --prepare`）：
   - **有待发布片段（`release-notes/*.json`）时**：由 `scripts/release-notes.mjs --apply` 统一按 `issue` 升序合并片段、按 `major > minor > patch` 递增唯一三段版本号、以 `Asia/Shanghai` 日期调用 `scripts/changelog.mjs` 的 `insertVersionSection` 写入 `CHANGELOG.md`（位于 `[Unreleased]` 正文之后、已有版本之前）并同步更新 `package.json` 与 `package-lock.json`、删除已消费片段；提交 `chore(release): vX.Y.Z` 推送至 `main`（使用内置 `GITHUB_TOKEN`，不触发递归 `on: push`），再通过 `actions: write` 派发 `workflow_dispatch`（`deploy=true`、`expected_sha=<BUMP_SHA>`）触发精确部署提交的 `CI / Deploy`（原 `push` 运行的 `check`/`deploy` 在 job 级跳过，不写假绿）。若未来对 `main` 启用 branch protection，须放行 `github-actions[bot]` 或改为 release PR/GitHub App 令牌。
   - **无待发布片段时**（纯文档 PR、无网站发布的纯仓库工程 PR、或无片段的手工版本热修）：不递增版本号，直接进入本次运行的 `check` → `deploy`。
5. `check` 在最终部署提交（`BUMP_SHA` 或无片段 `main` 尖端）上重新执行同一套 `static`、构建与 7 条窄冒烟（含 `ciBuild659` 核对页脚版本与 7 位构建 SHA 等于本次提交），成功后 `deploy` 用官方 `actions/deploy-pages` 发布同一份 `dist`，并上传 `site` 产物。冒烟失败则不部署。全部单测、`data` 与整站浏览器在 CI full（每日/手动）运行，不作为这次部署的门禁。

普通 UI 更新不重生成未变数据，不默认执行无关计算与整站扫描。核心计算、依赖、共享基础设施和未知范围仍完整验证一次；涉及数据、生成脚本、来源等变化时才做相应数据管线。不要为凑项数或固定周期推迟已就绪的授权更新。

## 自动接续正式 Release

`.github/workflows/release.yml` 在同仓库 `main` 的成功 `CI / Deploy`（`push` 或由 `prepare` / 人工触发的 `deploy=true` `workflow_dispatch`）完成后自动接续；手动恢复时在 Actions 里填入该次成功部署 run 的 ID。它先在可信 `main` 上运行 `scripts/release-workflow.mjs --resolve-run` 核对该 run 确为同仓库 `main` 成功完成的 `CI / Deploy` 且 `check` 与 `deploy` 两个 job 均为 `success`（仅做版本汇总、被新提交取代或只读 `deploy=false` 等跳过 `deploy` 的 run 在自动触发时优雅跳过，手动传入无效 run ID 时明确报错），随后精确检出其 `head_sha`（`fetch-depth: 0` + `git fetch origin main --tags`）并从 `git show "${DEPLOYED_SHA}:package.json"` 读取版本。

若 `vX.Y.Z` 已是正式 Release 则幂等跳过；若已有同名 tag 却不指向该提交则失败，不覆盖 tag。否则下载该 run 的 `site` 产物（即部署的那份 `dist`），压成 `aoe2-analyzer-site-vX.Y.Z.zip` 并生成 `SHA256SUMS.txt`，以该提交为 target 创建 tag 与 Release，说明指向该提交的 CHANGELOG；已存在 draft 时补齐附件并转正式。若 `prepare` 推送后派发 `CI / Deploy` 遇瞬时故障，执行 `gh workflow run ci.yml --ref main -f deploy=true -f expected_sha=<BUMP_SHA>` 即可幂等恢复部署与发版且不会二次递增版本。

不从 tag 二次构建 ZIP，也不在 Release 里重跑浏览器验证：产物就是 CI 已验证并部署的字节。缺少产物应明确失败，不能用重新构建另一份网站掩盖来源问题。

## 核验、恢复与环境

`scripts/release.mjs` 保留 `npm run release -- vX.Y.Z`、`--dry-run`、`--site-url` 和 `--footer-timeout`。默认页脚等待600秒，须在 main 检查和部署成功后调用，不靠延长等待代替就绪判断。Release runner 只允许推版本 tag，不代替执行者首次将代码合入 main。

任何真实失败都停止相应发布步骤。修复原因后以同一版本恢复，已完成且一致的步骤幂等跳过。不提高超时、增加重试或放宽断言掩盖问题，不用临时本地站点替代真实线上页脚核对。需要留本地日志时使用 `set -o pipefail`，保留真实退出码。

本机 gh 或网站访问不可用时，检查实际错误和环境配置；GitHub 连接器可读取仓库与 CI，正式 runner 使用自身 token 执行线上核验。不替换注入凭据、不绕网络策略，不把访问受限等同于网站故障。确无执行途径时汇报具体未完成步骤。

发布完成后核对实际页脚版本/构建、本次功能、指向来源 SHA 的 tag、正式 Release、ZIP 和摘要附件，再由执行者以 completed 关闭已完成范围的 issue，无需另等产品走查或具名人员决定，依据 [2026-11-03持续关闭授权](../CONTRIBUTING.md#已部署-issue-的持续关闭授权2026-11-03)。保留 `已部署` 标签及交付证据供追溯；未交付、范围未完成或受阻塞事项保持开放。下载 ZIP 后应解压到静态 HTTP 服务目录，例如运行 `python3 -m http.server 8080`，网站不支持直接双击 HTML 文件运行。

## 后台完整回归

完整单测、数据检查和整站浏览器由 `.github/workflows/full.yml` 每日及手动执行，详见 [TESTING 第 6 节](TESTING.md#ci-659-validation)；它不部署、不触发 Release。真实失败按 Issue 认领修复，不写成已通过。
