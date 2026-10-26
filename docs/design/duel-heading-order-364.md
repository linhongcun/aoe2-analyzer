# #364 单位 PK 标题层级修复规格

## 授权、基线与边界

维护者本轮请求：“我看目前 GitHub 上还有两个 bug 的 issue，你能否给修下”。本轮 GitHub 实际开放的 bug 恰为 #442 和 #364，且无在途 PR；root 已明确将原先暂缓的 #364 纳入这次定向修复。#372 的 Hold 不变。此前 issue 对具名人员签字的要求由现行 CONTRIBUTING 的独立代理复核流程替代。

准备基线为 main `a0ed295de41bf835b41ea80be4fd8a1c20f99c10`（v0.40.0，DE185872）。本稿与17红+2控制绿首先在该准备基线审核；#442 合入后，实际实施基底已更新到 main `72e9c4df4152641eab1007024bf3335aa0f9421b`（v0.40.1），本轮修复发布版本为0.40.2。后续不能把此 SHA 写成 #442 之后的最新 main。现有金标准、数据、计算、URL、文字及所有功能行为保持一致。

只修单位 PK 子树的标题语义。共享组件增加可选层级参数，默认标签和其他消费者维持原状；样式仅用 `#duel` 限定的标题 class 还原旧外观。不整理百科页已有标题问题、不改变界面布局或数据，不修改既有受保护期望/fixture。

## 当前节点与目标大纲

页面主标题继续是唯一 h1。原 Duel 一级区域 h3 改为 h2，原 h4 子标题改 h3，原 h5 更深一层改 h4。`details/summary` 不是隐式标题层级，不能仅改 A/B 单位卡而保留内部 h4。

| 现文件/角色                                     | 原标签  | 新标签 / 建议稳定 class                     |
| ----------------------------------------------- | ------- | ------------------------------------------- |
| DuelSelection：可用与不可用的 A/B 单位标题      | h3      | h2 / `duel-side-title`                      |
| DuelResults：1v1 与 Group 的胜负                | h3      | h2 / 现有 `duel-win`                        |
| DuelTimeline：时间线、存活数量                  | h4      | h3 / `duel-timeline-title`                  |
| BattleReplay：战斗回放                          | h4      | h3 / `duel-replay-title`                    |
| UpgradeComparison：区域标题                     | h3      | h2 / `upgrade-title`                        |
| UpgradeComparison：两方案与新增/前置/取消科技   | h4      | h3 / `upgrade-subtitle`                     |
| BreakEven：计算后的盈亏平衡区域                 | h3      | h2 / 现有 `be-title`                        |
| DamageBreakdown：A/B 伤害拆解                   | h4      | h3 / `damage-heading`                       |
| DamageBreakdown：攻击/护甲来源                  | h5      | h4 / `damage-source-heading`                |
| AgeComparison：四时代标题                       | h4      | h3 / `age-heading`                          |
| VgNotes：条件出现的相关加成                     | h4      | h3 / `pk-vg-title`                          |
| CostDiscount SourcePop：费用浮层标题/各来源分组 | h4 / h5 | h3 / h4 / `pk-pop-title`、`pk-pop-subtitle` |
| SimPanel：模拟器自身标题                        | h3      | 默认 h3；PK 的 embedded 模式本就不显示它    |
| SimPanel：分组、团队、研究费用、克制/护甲类别   | h4      | 默认 h4；PK 中 h3 / 各 `sim-*-title`        |
| RealCost Basis：采集时间口径浮层                | h4      | 默认 h4；PK 中 h3 / `rc-pop-title`          |

旧 issue 中所有职责集中在 Duel.tsx；现代码已拆为以上文件。`VgNotes.tsx` 的条件 h4 是新增消费者，也必须包含，不能因不在旧清单就遗漏。

## 共享组件 API

`SimPanel.headingLevel?: 2 | 3` 表示面板根层级，默认 3；子标题为 level+1。DuelSelection 传 2，其他调用方不变。`BonusTable`、`ArmorClasses` 各接受子标题层级（建议 `3 | 4`，默认 4），SimPanel 显式传递相应值；UnitDetail 对这两个组件的直接调用不加参数。

`RealCostBlock` 的层级须传至其内部 `Basis`；真正的 h4 位于导出的 `Basis`，后者还被 UnitDetail 的紧凑费用说明直接使用。建议 `headingLevel?: 3 | 4` 默认 4，Duel 传 3，UnitDetail 维持默认。只传语义层级，不引入 React 上下文、运行时数据依赖或新的计算分支。

未传层级时，最好连默认 DOM classes 都保持原样，只在 Duel 显式选择层级时添加新标题 class；父面板默认路径也不要显式向子组件传入会启用新 class 的参数。控制测试以 rule id、实际目标的标题 tag/文字身份与完整标题序列冻结语义，不把 axe 自动生成的 CSS selector 拼法当作产品契约。

## 样式守恒

保留 base.css、editorial.css、layout.css、upgrade-comparison.css 的全部现有全局规则，新增 `src/features/duel/duel-headings.css`，仅用 `#duel` 前缀加稳定 class。这样未改标签的共享消费者继续沿用旧样式，Duel 新标签不再依赖旧 tag selector。

逐角色固定旧 computed 的字号、字重、margin、行高、字距、颜色及分隔线；使用当前令牌或保持原相对单位。不能只改字号。

- 单位卡原 18px、margin0；不可用卡保留 muted。
- `duel-win` 原字号由既有 class 与窄屏媒体规则控制（桌面28px、窄屏22px），旧 h3 的上下 margin 为 1em；新 h2 须保留 1em，不能留 UA 的 .83em。
- 升级区域字体为14px，其根标题原 h3 取1.17em（16.38px）和1em上下 margin；不能改成 h2 的1.5em。方案/投资标题原14px，margin0 0 8px。
- SimPanel 分组原15px、margin6px 0、`color-text`、底边框 `color-tag`；bonus/armor 原margin6px 0 2px；研究费用摘要原13px、weight500、muted、margin0 0 8px。
- 回放/时间线/瓦兰吉说明原15px、margin0 0 8px。伤害与时代标题原15px、上下margin1.33em。
- 原 DamageBreakdown h5 为 .83em（12.45px）、上下margin1.67em、line-height1.65、letter-spacing normal。全局 h4 会带来1.35及-.02em，因此需显式还原。
- 费用浮层标题原13px、margin0 0 8px；子来源原12px、weight600、muted、margin8px 0 4px，line-height1.65与normal字距同样须保留。

上述精确值已在 a0ed295 的实际生产 DOM 中核对；不同宽度/主题继续以相同环境的前后像素比较为准，不靠复制桌面像素值覆盖响应式。颜色只使用设计令牌，所有内容、触控、焦点与数字 nowrap 维持原行为。

## 验收与先失败用例

新增 `tests/e2e/duelHeading364.spec.ts` 在准备基线实际运行后，17 项因现有 heading-order 失败，2 项共享消费者控制通过。没有产品修改或环境失败：页面正常加载，axe 目标包括 `#duel-a > .duel-head > div > h3`。

新用例覆盖四模式和单/双不可用的默认及全 details 展开、已保存基准的升级比较、条件瓦兰吉说明、已计入/未支持/无费用研究项的来源浮层、采集时间口径浮层。

单位 `/unit/38/Franks/4/?tab=sim` 与建筑 `/building/82?tab=sim&civ=Britons&age=4` 原面板都是 h3 根+8个h4，当前页面本来各有一条 heading-order（target `h3`）。控制组按原标签序列与原 axe targets 比较，不把这两页错误要求清零，也不借本项扩展整理其他页面。UnitDetail 直接使用的 BonusTable/ArmorClasses/Basis 默认行为另做实际 DOM/像素守恒。

`listHeadH1296.spec.ts` 原有 h1/列表页外观和其它路由断言不变，按本 issue 明确验收要求扩展 Duel 默认/展开的 heading-order 检查；原先说明“Duel不在#296范围”的注释可更新为本项已接续。新检查只增加约束，不放宽其它规则。

既有 6 个测试文件共11处 h3 定位依赖需迁到稳定 class：refactor288:18、pkUnavail124:35/37、smoke:37/119/345/351、overflow64:44、breakEven25:60/65、age106:30。其文字、数值、颜色、溢出、胜负等断言值原封不动，由独立代理逐行复核。v0280/v0290金标准取 allInnerTexts/hash，不记录标签；任何golden JSON、HTML快照或数值fixture均不重录。

## 四宽明暗与零像素差

使用相同 Chromium、deviceScaleFactor1、字体、viewport高度与服务器产物，对360/375/390/1280分别测 light/dark。等待 `document.fonts.ready` 与页面/展开内容稳定，禁用截图动画和光标，回到统一滚动位置。

完整比较矩阵覆盖四模式、单/双不可用、默认/全详情展开；额外包含升级基准、瓦兰吉分支、费用/采集口径浮层、共享 Unit/Building 面板与 UnitDetail Basis。所有对应图片必须尺寸相同且 RGBA 不同像素数为0。不能提高容差、只比较局部标题或遮罩真实UI。

唯一归一化是 `[data-t="footer-app-version"]` 与 `[data-t="footer-build"]` 两个合法发布元数据的文字，前后改成同一常量；不隐藏页脚、整个区域或其它内容。版本号随独立bugfix发布本就变化，不能把它误算成标题修复的视觉差异。

基线产物来自实施时的最新 main/已部署ZIP，记录它的commit/tree/主线run及manifest。候选记录真实编译marker、实际源代码tree/构建记录及全部对比结果；不把前置 a0ed295 冒充未来main。若 #442 完全未改Duel及其运行时/样式闭包，可用range-diff、实际资产与像素证据说明复用关系；否则按新的基线捕获。

数值对比解码PNG像素即可，不修改截图。临时原图与对比报告作为审阅/CI产物，不把PNG提交仓库。四宽明暗的最终全页截图交独立代理核对，溢出、console/pageerror和可点区域保持现有约束。

## 合并与交付

先由实现者之外的代理复核本稿、实际失败日志与定位迁移范围，再实施。待 #442 合入后更新到它的 main 基底，使用独立 worktree/端口，不stash不删除分支。记录仅 #364 的本轮定向授权并更新其 Hold 文档状态，#372 保持 Hold。

按实际改动风险选择必要验证；已独立核对Duel与两项共享展示组件的实际消费者，因此新增精确的 `duel` CI profile及 SimPanel/RealCost 两文件的 duel/units/buildings 联合覆盖。其他共享基础设施、核心算式、全局样式与未知模块继续完整回归；Duel局部CSS还需通过所有selector均为 `#duel` 后代、无全局at-rule的严格范围证据，不能仅凭文件目录缩窄。相关旧金标准与受影响页面检查必须保持原期望。若可靠映射无法建立，接受一次适用完整回归，main/release按同tree与策略复用。上线短烟测需核对默认与展开的Duel heading-order，正式发布与ZIP/tag交由交付记录核实。

## 实施验证与基线复用关系

新增标题检查已从17红+2共享控制绿转为全绿，并补8项四宽明暗的展开截图、无溢出与浏览器错误检查；`listHeadH1296` 的旧断言保持并新增Duel检查。CI中的默认 test-results 截图可由既有artifact上传步骤保存，完整184对像素矩阵不加入每阶段CI。

真实v0.40.1基线是正式Release ZIP（SHA256 `46ee964d42653890dd1c5225c9b0af4f9b899511838ab191d7a74bb17208faa4`，来源main72e9c4d、main CI run40280930528），实际页脚为v0.40.1/72e9c4d。该发布包的7个过渡样本与a0ed295预备基线的对应图全部0像素差。固定git refs的静态闭包审计还确认150个组件闭包模块、181个目标路由入口模块及字体、样式、public、数据和构建输入一致；明确排除了37个其他lazy路由，不声称整个app或Vite产物字节相同。完整闭包JSON SHA256为 `f057c12611ae3b6011213d9dd417cf432e20f34d5d518e28fcf0b383eefe273c`。

root独立从两git tree复算上述blob与8项目录身份，并审核真实401过渡样本后，准许复用原184张预备基线。旧图仍明确标注来自a0ed295/v0.40.0，不能称为401新采184张。最终候选须由实际已提交HEAD生产构建采完整184张后严格比较；原始PNG、capture.json及精确像素报告保存在本地验证工件，交独立复核，不提交PNG。

`scripts/deployment-smoke.mjs` 的 `duel` 分支对实际发布构建检查默认及全详情展开的heading-order、不可用卡、时间口径浮层，以及Unit/Building共享默认标题完整序列与原有语义违规身份、Unit的默认Basis h4。main构建复用和Release发布检查消费相同CI plan，因此保留本次实际变化的duel覆盖，同时继续核对真实版本和构建页脚。

完整候选现已实际完成：source `2cc9b2b04a2826c960c70b732fd21c035b02b3ae`、tree `f56dea117a9eb55b7a4396b74023206398f2a7eb` 的已提交生产构建采集184张，和准用的原184张基线逐对比较，全部RGBA差异像素为0。route、canonicalHash、PNG重算摘要、同浏览器/脚本和固定两项归一化检查均通过。精确报告见 [candidate-2cc9b2b-report.json](duel-heading-364-visual/candidate-2cc9b2b-report.json)，采集身份与真实401过渡关系见 [implementation-summary.json](duel-heading-364-visual/implementation-summary.json)。后续范围守护补强仅改CI脚本、测试及验证文档，须保持产品blob与该候选一致，并用最终提交构建短烟测核对真实页脚，不能把184图的编译SHA改写成后来提交。

实施阶段受影响验证实际通过：41个单元测试文件的767项、32个E2E文件的512项（含8张默认artifact目录的四宽明暗图）、TypeScript、lint（仅8项既有warning）、strict分层和格式检查，#442公开来源校验9份输入0错误。独立复核随后发现消费者动态模板import与Vite的pcss/postcss后缀两个CI范围守护边界，补强后相关scope/releasePlan/#442scope共38项通过；原产品、既有fixture和验收期望不变。
