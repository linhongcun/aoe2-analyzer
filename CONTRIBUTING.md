# 贡献约定 / Contributing

AI 编码代理先读 [AGENTS.md](AGENTS.md)（目录、命令、数据规则、测试规则的速查）。无人值守 Codex 的队列、跳过条件和 issue 质量条见 [docs/CODEX-MAINTENANCE.md](docs/CODEX-MAINTENANCE.md)；与本文冲突时以本文为准。

## 角色

hongcun lin 决定产品范围与维护授权；执行代理负责规格、实现与验证，实现者之外的独立代理复核代码、测试和界面。历史文档中的团队代表、署名和既有审阅记录保留，后续交付不依赖该团队的人员签字。

2026-11-10：

- **产品**：站点目前只由维护者自己使用。先写清该页的用户问题和核心任务；新功能先看与现有能力是否重复、能否替代、放在何处，可以合并、替换或删除没有独立价值的功能。旧布局入口、链接协议和旧组件功能都可以有理由取舍，不为保留旧行为加兼容层。决定前对照成熟系统的实际案例或官方资料，写出处和适用边界，并分开已看到的事实和假设。Steve 管核心任务、范围和取舍。验收只看这次的核心功能、相关数据计算和必要的视觉显示。
- **设计**：Jony 负责好用与美观。需要评审视觉方向时直接给界面图，不以文字或线框代替。视觉只查本次相关显示效果，不设固定全尺寸门槛。
- **运营**：以普通使用者反馈信息是否找得到、操作是否顺、结果是否看得懂，并写明具体场景和卡点。这不是上线门禁，也不代替产品、视觉或测试做决定。

## 维护者的持续发布授权（2026-10-24）

hongcun 已明确要求：“以后你每次有更新，就直接部署上去吧。” 对**已获实现授权的更新**，完成适用审查和必要测试后，执行者应继续完成合入 main、GitHub Pages 部署、真实线上核对及正式 Release，不再逐次询问是否发布，也不为凑固定周次或项数等待。合入 release 分支只代表集成完成，不能称作已上线。

2026-10-24 已授权发布 v0.31.0，取代此前“main 发布后续单独处理”的暂缓决定，并允许完成 #412 测试就绪修复、发布衔接和经验记录；#407 首批四项按当时批准的“独立代理复核＋完整 CI”完成交付。后续审阅统一按下方 2026-10-25 的持续审阅授权执行。

持续发布授权不等于自动认领所有开放 issue，也不解除 Hold、待确认或阻塞，不授权删除分支、放宽测试、修改仓库权限或发布外部公告。工作范围和产品决定仍须已获授权。发现真实失败时先定位并修复，不靠跳过用例、提高超时或反复重跑掩盖；确需新增产品决策时再向维护者说明具体卡点。

以下角色、合并和发版规定以本节的明确授权为准。发布顺序和自动接续见 [RELEASING.md](docs/RELEASING.md)，本次证据与教训见 [交付复盘](docs/maintenance/2026-10-24-delivery.md)。

## 维护者的持续审阅授权（2026-10-25）

hongcun 已明确要求后续按本团队流程执行，不再依赖另一团队代表签字，并授权移除现行流程中的具名签字要求。对已获实现授权的工作，默认采用**独立代理复核＋与改动风险匹配的 CI**；此前仅限 #407 首批四项的审阅例外现由此默认流程取代，适用于 #286 及后续已授权事项，无需逐项再确认审阅方式。

复核由实现者之外的独立代理完成，记录实际验证的提交 SHA、复核范围、结论与未解决问题；界面改动同时核对规格、状态。测试不要求四宽截图，见 [TESTING](docs/TESTING.md)。不得伪造其他人员的审阅结论。下文已有的纯文档、纯样式轻量规则，以及 CI 的路径分类继续有效；main 与 release 分支 push 按下方验证投入规则选择范围。

范围授权、Hold #364/#372、待确认或阻塞、数据来源继续有效，不因移除具名签字而放宽。测试门禁改以 2026-11-10 的 [TESTING](docs/TESTING.md) 为准。完成适用复核和检查后，按持续发布授权继续合并、部署、真实线上验证与正式 Release。

## 已部署 issue 的持续关闭授权（2026-11-03）

hongcun 明确要求：“以后已经部署的 issue，就可以关闭了”。完成 issue 范围、适用审查和测试、真实部署、线上核对与正式 Release 核验后，执行者可直接以 completed 关闭对应 issue，无需再次询问，也不再等待具名人员或额外产品走查决定。此规则同时适用于已完成交付但仍开放的 issue，取代此前“功能 issue 保持 OPEN 供产品走查”的要求。

涉及网站交付的实现 PR 继续使用 `Relates #N`，避免 `Fixes` 在合入时提前关闭尚未部署的事项；交付核验通过后再主动关闭。合入即完成范围、无需等待网站交付的工程或文档事项仍可使用 `Fixes #N`。`已部署` 标签保留为交付记录，不能把仅已合并、待部署、范围未完成或数据阻塞的事项当作已交付关闭。后续发现的问题按实际范围另行跟进，不因本次关闭授权放宽原有质量门禁。

## #364 标题层级定向修复授权（2026-10-26）

hongcun 本轮明确请求：“我看目前 GitHub 上还有两个 bug 的 issue，你能否给修下”。当时开放的 bug 仅 #442 和 #364；本轮据此将此前暂缓的 #364 单位 PK 标题层级修复纳入范围，见 [issue 授权与范围记录](https://github.com/linhongcun/aoe2-analyzer/issues/364#issuecomment-6409014199)。这是本轮两项 bug 的定向授权，#372 继续 Hold。

#364 仅调整 PK 子树的标题语义，共享面板默认 DOM 保持不变，使用 PK 局部 class 维持原外观。旧测试可迁移依赖 h3 的定位方式，但文字、数值、颜色、位置等期望与金标准 fixture 保留。实施、独立复核、适用验证与持续发布仍按本文件现行流程执行。上方历史审阅授权中的 Hold 记录保留，本节是 #364 的后续具体授权。

## #372 两条预置定向解除暂停（2026-10-26）

hongcun 针对“胡斯派战车对轻型投石车、精锐胡斯派战车对中型投石车”的具体方案明确回复：“嗯，解除暂停，实施吧”，见 [6411790420](https://github.com/linhongcun/aoe2-analyzer/issues/372#issuecomment-6411790420)。本轮据此解除 #372 暂停，精确实施现有单位 PK 的两条波希米亚对法兰克、当前时代满科技、无团队加成1v1预置及打开/复制入口，数据DE185872；此前Hold正文和上方 #364 的历史授权记录保留，本节是其后的具体解除。

新增预置区是原 #duel 的兄弟语义区，页首本地快捷按钮仅scroll/focus到该区，复用现有样式；原计算器全文、受保护金标准与验收期望保留。不新增第三预置、Generic文明、其它页面、建筑工具或数据/计算/URL解析/依赖变更。完整状态和验证规格见 [#372规格](docs/design/bohemian-duel-presets-372.md)，独立复核及持续发布沿现行流程执行；本次解除不自动授权其它开放issue。

## 按改动风险控制验证投入（2026-10-25）

hongcun 已明确要求测试辅助交付，不让小改动等待长时间回归，并在 #431 授权实施「每份代码只做一次相关验证、release/main 复用结果、部署后短核验、全量转后台」。2026-11-10：每 PR 只做必要冒烟和与本次改动直接相关的测试；纯布局不重跑无关计算或数据；全站全尺寸主题矩阵不是门禁；计算或数据只做针对性正确性检查。报告区分实际执行、CI 范围和未验证项。有意替换的旧布局、入口、链接和重复功能，不再用历史验收期望卡住。独立复核与数据来源职责不变。默认 CI 仍是下方 #749，手动 full 不是普通 PR 的合并条件。#659 只供手动 full 追溯，见 [ci-659](docs/design/ci-659.md)。

- **默认 CI（#749，2026-11-08）**只跑 static、真实 SHA 构建（页脚身份）和 Chromium 单分片窄冒烟。普通 PR 不再按风险自动扩成四片、24 路由、单测或 data。手动 `workflow_dispatch` 且 `full=true` 才跑这些；该次不部署。细则见 [ci-749](docs/design/ci-749.md)。
- `planChanges` 仍记录 `civ-ui` / `targeted` / `full` 分类，供手动 full 和本地检查。`formatTime`、`dupNames`、`glossary`、`linker`、`sharePage`、`simRoute` 在完整闭包另经审计前，手动 full 仍按广覆盖跑。只有手动 full，或本地需要时，才执行数据管线。
- 默认 `browser-1` 只有一片，不可复用，消费同一次不可变构建。手动 full 才按历史时长加权 LPT 分到四个 runner。最终 `test` 核对本次计划内的阶段、精确 case 与构建身份；失败、取消、超时、缺片或错误证明均阻断部署。#338 的 hash/表格检查留在 full，不回默认门禁。
- 只接受经 GitHub 核实的 v2 原始阶段证明；v1 全部无效。PR merge ref 到 main 的复用要求同仓库、相同 tree/策略/工具链、精确检查/文件/case 集合，以及真实成功来源 run/attempt/数字 job/artifact 匹配，不能只凭 PR head SHA、祖先关系或任意复用链。缺少有效证明时执行所缺必要阶段，并如实区分本次执行与原始执行来源。
- build 不复用。main 仍重建实际提交的 `__BUILD__`，默认对新构建执行窄冒烟和页脚身份检查，再将同一快照用于 Pages 和 `deployed-site`。static-main 只在手动 full，且该次不部署。Release 下载准确成功 main run 的产物，核对外部 v2 gate、窄冒烟记录、manifest、版本/SHA/tree/tag 和本次功能，直接打包相同字节与 SHA256，不二次构建。
- 每次 CI/Deploy 或 Release run 从 GitHub `run.created_at` 起共享30分钟预算，包含初始/阶段/部署排队、重跑、命令、网络等待和聚合；不能逐阶段重置。Release 有自己的 run 起点。诊断最多另用90秒，不能继续验证或签发成功证明；平台清理延迟不构成物理30:00停止承诺。完成后的独立时序报告使用 GitHub workflow-completed 数据，列出 wall、排队、全部 runner 分钟与最慢片；PR→main→deploy→Release 整链另外汇总。
- 日更 schedule 已关闭。手动完整运行保留全量单测、数据检查和整站浏览器回归，禁用证据复用，强制 `full` 和 `data`，不部署、不触发 Release。真实失败仍须定位，不提高超时、增加重试或放宽断言掩盖问题。
- 本地先做一次必要验证。没有新修改、真实失败或未解决问题时不扩大或重复测试；需要定位失败时收窄到具体问题。报告实际执行、复用、跳过或中止范围。日常单次运行以10分钟为实测目标；不能将目标、局部计时或超预算的结果写成完成承诺。

## 版本工作流

普通已授权更新默认一个 issue、一个 PR 直接进入 main，完成适用复核与一次验证后部署；只有确实需要多项冻结集成时才建立 release 分支。3–5 项、约一周只是多项版本的规划参考，不作为简单更新的等待条件。冻结版本中途新增的产品需求记进下一版；阻断发布的必要修复须说明原因并保留证据。版本号一律写三段（`vX.Y.Z`）。

### 1. 定版（执行者准备，开工前完成独立复核）

- **范围**：执行者根据维护者授权在实现 issue 里写明范围；多项集成时另用版本 issue 组织并冻结。未获授权的产品决定交维护者确认。
- **验收标准**：说明这次功能怎样算正常即可。不要求宽度或全状态矩阵，也不因写不成矩阵而停工。
- **设计稿**：改界面（CSS、组件或文案）需设计稿或可验收规格，覆盖全部状态（空、加载、置灰、上限、未计入等）和 360/375/390/1280 四档宽度，颜色、字号标成设计令牌和数值；提交到 `docs/design/` 并链接在 issue 上，经独立复核后才能开工。开工后发现的设计问题记进下一版，版本中途不扩展已冻结范围。
- **失败用例**：不要求每个 issue 先交失败用例。计算或数据改动按 [TESTING](docs/TESTING.md) 做针对性正确性检查。
- **合并顺序**：执行者按改动文件安排顺序并独立复核，改同一文件的串行做。每个 issue 只由一个执行者负责。
- **版本与分支**：普通更新在实现 PR 中同时更新 `package.json`、锁文件和 CHANGELOG，PR 直接以最新 main 为目标。仅多项冻结集成时建 `release/vX.Y.Z`，相关 PR 以该分支为目标并更新到其最新提交。
- **热修**：线上数据错误仍可独立提到 main，按三段补丁版本发布；若另有活动集成分支，随后同步回去。

### 2. 开发和验收

- **PR 门禁**：只改文档或只改样式（不动逻辑和测试）的 PR，适用 CI 绿即可采用轻量规则。其他 PR 需独立代理复核和适用范围的一次验证通过；涉及界面的同时完成独立界面复核。执行者不得复核自己的实现。跨提交复用必须由 CI 核对实际代码树、策略、范围与真实成功来源，并明确记录复用关系，不能仅凭另一个 SHA 的绿灯冒作当前证据。
- **复核记录**：在 PR 或交付记录中附独立复核所验证的提交 SHA、范围、结论与未解决问题。规格核对仍按设计职责；测试不要求四宽截图，报告按 [TESTING](docs/TESTING.md) 区分实际执行、CI 范围和未验证项。阻塞问题先修复并补相应验证，不以指定人员签字作为额外条件。
- **能量化的交给 CI**：对比度、溢出和主题不写成每 PR 的 e2e 门禁。设计只看机器量不出的层级、对齐、与稿是否一致。
- **rebase 不重复验收**：用 `git range-diff` 证明 PR 自身改动不变，可以沿用相应独立复核。当前 CI 仍按实际代码树和范围核对成功证据；覆盖不足时只补当前必要验证，不无条件复用旧 run，也不机械重录相同界面。
- **工作目录**：每个 PR 用单独的 `git worktree` 和本地端口；不在共享目录切分支，不用 `git stash` 搬改动。
- **谁来合并**：由已获授权的执行者在门禁满足后，按定版顺序合并；本项目的持续发布授权见上文。
- **结果汇报**：在当前聊天或交付记录中附 PR、复核、测试与部署结果；外部消息或公告仍需明确授权。
- **定时任务**：只执行已授权的工作。没有合并/发布授权时只能开 PR、跑测试、汇报结果；有明确授权时仍须满足独立复核和适用 CI 门禁。不得伪造他人审阅结论，不删除分支或修改仓库权限；只在失败、实际完成或需要决策时汇报。开 PR 或处理 issue 前先查已有 PR 及集成结果，避免重复领取已实现但待发布的事项。

### 3. 发版

- **默认流程**：实现 PR 完成独立复核和适用验证 → 合入 main → main 核实可复用证据或执行当前必要验证，构建真实 SHA 并做短烟测 → `test` 与 Pages `deploy` 实际成功 → Release 核对线上版本/构建与本次功能、创建 annotated tag、打包同一已部署产物并正式发布 → 核对 issue 已完成。多项 release 分支集成仍可使用同一流程，但不因经过该分支额外重跑相同验证。
- **成功含义**：当前 run 的真实 `test` 检查可以依据经核验的成功证据完成，日志和产物须写明原执行范围、来源及复用关系。空 statuses、只有 PR 绿灯或代码祖先关系不能代表已部署成功；main 的真实 `test`、`deploy` 和实际线上结果仍须确认。
- **发版脚本**：`npm run release -- vX.Y.Z`（`scripts/release.mjs`）保留 `--dry-run`、`--site-url`、`--footer-timeout`，无需为普通更新创建 release 分支。若使用 release 分支，则继续检查其集成关系；普通更新以已部署 main 为发布源。已有 tag 指向不符时退出，不覆盖 tag。
- **产物复用**：main 上传的 `deployed-site` 与 Pages 使用相同 dist，内含 `build-evidence.json`。Release 只下载经实际成功 `test`/`deploy` 核实的同仓库准确 main run 产物，核对版本、commit/tree 及 tag 后生成 ZIP 和 SHA256SUMS；缺少或不符时明确失败，不回退为再构建一份未经部署的 ZIP，也不回退为整站线上回归。
- **重跑与失败**：每一步看远端仓库、部署和产物的真实状态；修复原因后可以同版本恢复，已完成且一致的步骤幂等跳过。页面部署、draft Release 和正式发布是不同状态。不要用本地站点代替真实线上核对，也不要用管道吞掉失败退出码。
- **公告**：更新说明写在 CHANGELOG。需要外部公告时仍由 hongcun 明确决定；从实际部署或 tag 提交核对数字，经独立复核后留在发版记录中，外部渠道由 hongcun 本人发布。

部署只由 main 的 push 接续；nightly/手动完整检查不部署、不发 Release。main CI/Deploy 实际成功后自动接续正式 Release，手动调度用于恢复。按持续发布授权继续到真实线上核对、正式 Release、tag 和附件验证，不停在 PR 或 draft。详见 [RELEASING.md](docs/RELEASING.md)。

### 4. 沟通

- 群里只说阻塞和需要拍板的事，不发重复进度。
- 定时任务只在 CI 变红或线上出问题时出声。

## 提交信息与 PR 标题

遵循 [Conventional Commits](https://www.conventionalcommits.org/zh-hans/v1.0.0/)：`类型(范围): 描述`，范围写对应 issue 号。PR 标题会被 CI 检查（`scripts/check-pr-title.mjs`），squash 合并时 PR 标题即提交信息。

| 类型    | 用途                   | 示例                               |
| ------- | ---------------------- | ---------------------------------- |
| `feat`  | 新功能                 | `feat(#19): 开局分享卡`            |
| `fix`   | 修复 bug、数据错误     | `fix(#13): 科技涉及单位只显示一处` |
| `docs`  | 文档                   | `docs(#44): 别名表说明`            |
| `chore` | 杂项、仓库维护         | `chore: 添加 CONTRIBUTING`         |
| `data`  | 静态数据快照，不改界面 | `data(#577): 4v4 天梯快照`         |
| `test`  | 只改测试               | `test(#57): 主要卡点 e2e 用例`     |
| `ci`    | CI 配置                | `ci: release/** 分支也跑测试`      |

另外允许 `refactor`、`style`、`perf`、`build`、`revert`、`hotfix`。不兼容变化在类型后加 `!`，例如 `feat(#70)!: 分享链接改用新格式`。

### AI 代理署名

本地 commit 与 PR 正文末尾的 `Co-authored-by` 记录这次实际写下代码、提交说明或 PR 正文的 coding agent。coding agent 是产品或执行工具。Claude Code、Codex、DeepSeek Harness 各用各的一行。只写实际参与的产品；多方都实际参与时每个产品各写一行。底层模型名不是参与者。

- 没有参与的 agent 不写。
- 认不出执行工具时不添加代理 trailer。空缺不得填成 DeepSeek Harness，也不得填成任何其他已知身份。
- 下面每一条单独使用。整段不是提交模板。
- author/committer 仍用仓库身份。squash 合并后 GitHub 的 author 是合并者。不修改用户的 git author 配置。不用他人或其他账号的 noreply 邮箱冒充归属。
- Git 对 trailer 键名大小写不敏感。各行保持来源中的大小写。

**Claude Code**（这次的执行工具是 Claude Code）

`Co-Authored-By: Claude Code <noreply@anthropic.com>`

邮箱来自 Claude Code 官方 [attribution.commit](https://code.claude.com/docs/en/settings-reference)。官方默认 trailer 使用 `noreply@anthropic.com`，名称默认写成当时的模型；模型不能识别为 Claude 模型时，官方名称写 `Claude Code`。本仓库按产品归属，名称使用 Claude Code。本仓库提交 `799aff8330cd4be08b65c92affe373f7575fafa3` 的 GitHub `Commit.authors` 把这一姓名和邮箱解析为用户 `claude`。

**Codex**（这次的执行工具是 Codex）

`Co-authored-by: Codex <noreply@openai.com>`

OpenAI Codex 在启用 git attribution 时使用这一行，见源码 [`codex-rs/ext/git-attribution/src/world_state.rs`](https://github.com/openai/codex/blob/main/codex-rs/ext/git-attribution/src/world_state.rs) 的 `ENABLED_INSTRUCTIONS`。公开提交 [`95e92df15ff27d4651afd1c9497d8f2c673651be`](https://github.com/Migz93/pacearr/commit/95e92df15ff27d4651afd1c9497d8f2c673651be) 将该邮箱解析为 GitHub 用户 `codex`。本仓库 `7844d93fe646b91b0eeec9c6ff867e6c25929c62` 写过 `Codex <codex@openai.com>`，同样解析为用户 `codex`。那是同一产品已经出现过的邮箱。新提交写上面的官方行；两行不要同时出现。

**DeepSeek Harness**（这次的执行工具是 DeepSeek Harness）

`Co-authored-by: DeepSeek Harness <noreply@deepseek.com>`

这是本仓库 [#778](https://github.com/linhongcun/aoe2-analyzer/issues/778) 定下的项目约定，用来表示执行工具 DeepSeek Harness。已查阅的 DeepSeek Harness 官方文档，以及 `deepseek-ai/deepseek-harness` 里搜到的提交样本，都没有给出这个固定姓名和邮箱。提交 `e6c5d04af629a082540d1187da80117f71019ee6` 与 `799aff8330cd4be08b65c92affe373f7575fafa3` 上，该邮箱的 GitHub 用户仍为空，页面只显示文字署名。以后若有可归属的官方账号或 GitHub App，再同时改本节与 `AGENTS.md`。

**Cursor**（这次的执行工具是 Cursor）

`Co-authored-by: Cursor Agent <cursoragent@cursor.com>`

本仓库提交 `7b0d0e1e14f6e6b5a76749d2e29dcef4235736b8` 将该邮箱解析为 GitHub 用户 `cursoragent`。git author 已经是这个身份时，不必再写同一行。Cursor 帮助页说明产品会另加 Made with Cursor trailer（<https://cursor.com/help/integrations/git>）。那是 Cursor 自己的标记，不代替上面三行，也不表示那三个产品参与过。

## 数据来源

- 只引用自己实际打开核对过的来源，写明链接或文件版本。
- 没能核对的数据在界面和文档中标「未核实」。
- 社区来源（攻略、别名、俗称）只收 2020 年以后的；官方名称和游戏数据文件（.dat）不受此限。
- 游戏数据以固定版本的 .dat 为准，CI 会校验可复现性。

## 设计与代码规范

- **图标**：自定义界面图标禁止使用 emoji 或 Unicode 符号字形（⚔ ← → ★ ✓ ✕ ▲▼ 🔍 等）。统一使用 [Lucide](https://lucide.dev)（ISC License），通过 `lucide-react` 本地打包（不使用 CDN，站点需在中国可访问）。在 `src/shared/ui/Icon.tsx` 的 `ICONS` 表登记后以 `<Icon name="..." />` 使用；颜色用 `currentColor`，尺寸由 CSS（`.ic`）控制。ESLint 规则 `no-restricted-syntax` 会拦截代码中的 emoji/箭头符号。
- 游戏美术图标（文明/单位/科技/建筑/DLC/属性）保持使用 `public/img/` 下的素材。
- 样式：颜色只用 `src/shared/styles/tokens.css` 中的设计令牌（CSS 变量），保持深色中世纪主题（`npm run lint:colors` 检查），规范见 `docs/DESIGN-SYSTEM.md`。
- 按本次改动影响检查必要视口（无横向滚动、无页面报错）和浅色与深色，对比度满足 WCAG AA。不固定四宽。
- 领域逻辑（`src/domain`）必须是纯函数、无 React 依赖，并配 Vitest 单测。
- 数据：`npm run data` 重新生成 `src/data/*.json` 与 `public/img/*`，不要手改生成的 JSON；主观评分改 `scripts/civ_ratings.json`。

## 本地检查

先运行一次必要的静态检查与构建，再按变更选择相关单测和页面回归，具体命令见 [TESTING.md](docs/TESTING.md)。完整单测、Python 与整站 Playwright 只在当前风险范围确实需要时执行，不把下面之外的全套命令作为每次更新的默认流程。

```bash
npm ci
npm run lint
npx tsc -p . --noEmit
npm run lint:layers -- --strict
npm run build
```
