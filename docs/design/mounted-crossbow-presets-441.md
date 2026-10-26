# #441 骑弩与骑射手预置入口：开工前规格

基线：2026-10-26 GitHub `main` 与本地均为 `6e71f655509487da69bb4f5a1d1592de19fa95f4`（v0.38.0），数据 DE185872。#285 合并前仅准备规格/新增失败测试；之后更新基底再实施，预计产品版本 v0.40.0，不照搬 issue 的建议版本。#308 因投石车次弹丸规则缺证据保持未实施。

已读 AGENTS、CONTRIBUTING、docs/CODEX-MAINTENANCE；现行流程为执行者准备、独立代理复核，不沿用历史具名签字。已读取 GitHub #441 正文/空评论，查询无已打开实现 PR。开工时须再查最新 main 和 PR。

## 最小范围

采用 issue 明确允许的补丁页入口方案：**仅在 `#/patches/185872` 版本信息/收录范围说明之后、“按文明看”之前**，增加“骑马弩兵与骑射手预置”主题卡。它直接帮助阅读欧洲骑射替换记录的玩家打开现有 PK，不修改补丁条目、官方原文、筛选规则、计数、单位页或单位 PK 计算与界面。

组件与纯预置/URL辅助均放 `src/features/patches/`。不改 `src/features/duel/`、共享计算、参数解析、费用引擎、生成数据、路由或登记表；不处理 Hold #364/#372。不实现平衡评价或“谁更强”建议，不添加“通用文明”。

入口只对本次185872归档出现。以现有 `DATA_SOURCES` 显示数据版本；若未来当前数据不是185872，不能继续将该入口的结果标成185872，应隐藏本批入口直到另行复核。已有历史补丁、加载/失败/找不到版本及补丁索引不出现此卡。

## 三条固定配置

所有配置为 1v1；双方均明确时代、空可选科技和空团队开关。**无可选科技仍保留模拟器已支持的常驻文明加成。** 重装单位代表已完成形态升级，不将升级研究费用计入对局。

| key                           | 可见配置名                                 | A / B                             | 科技与团队 | canonical query                               |
| ----------------------------- | ------------------------------------------ | --------------------------------- | ---------- | --------------------------------------------- |
| `castle-britons-byzantines`   | 城堡：不列颠骑马弩兵与拜占庭骑射手         | 2700.Britons.3 / 39.Byzantines.3  | 均空       | `a=2700.Britons.3..&b=39.Byzantines.3..&m=1`  |
| `castle-franks-byzantines`    | 城堡：法兰克骑马弩兵与拜占庭骑射手         | 2700.Franks.3 / 39.Byzantines.3   | 均空       | `a=2700.Franks.3..&b=39.Byzantines.3..&m=1`   |
| `imperial-britons-byzantines` | 帝王：不列颠重装骑马弩兵与拜占庭重装骑射手 | 2701.Britons.4 / 474.Byzantines.4 | 均空       | `a=2701.Britons.4..&b=474.Byzantines.4..&m=1` |

数据核查：2700=Mounted Crossbowman/骑马弩兵，age3；2701=Heavy Mounted Crossbowman/重装骑马弩兵，age4、from2700，不能写“精锐”；39=Cavalry Archer/骑射手，age3；474=Heavy Cavalry Archer/重装骑射手，age4、from39。所选各文明均在对应单位 `civs` 中，不能依赖 PK 的不合法文明回退或替换完成打开。

当前无科技模拟中，Britons2700/2701与Byzantines39/474没有战斗属性/训练价差异；Franks2700已有45×1.2=54HP（2701为55×1.2=66）。因此第二组必须明确写“法兰克”，不能把其结果当通用单位。

1496在本站是 Ordonnance Companies/王家敕令骑兵，age3，文字“骑马弩兵花费的黄金-40%”；原始eco规则对2700/2701 Gold×0.6。现Duel的discountedCost只消费常驻文明 `DAT.costDiscounts`，不按选中1496的eco效果改训练价。本批**不选择1496，不显示“已计入王家敕令折扣”**，并在法兰克组短说明“王家敕令骑兵折扣未计入”。不能扩新费用引擎；也不改1496的既有翻译。

## URL与复制

轻量纯辅助建议 `mountedCrossbowPresets.ts`，导出 `MOUNTED_CROSSBOW_PRESETS`、`mountedCrossbowPresetsFor(patchId,currentBuild)`、`duelPresetPath(preset)`、`duelPresetShareUrl(preset, base)`；每项含key/title/a/b。显示选择函数只在归档和当前数据都为185872时返回三组，否则为空，并有未来数据版本边界测试。运行时只复用 `fmtSide` 与 `SideSpec`，通过新建 URLSearchParams 生成 a、b、m=1。不复用当前patch搜索参数，不携带civ/q/type/kind、PK基准base/fixed/basev、be、na/nb、bud/vil/min或任何旧模式值。

`duelPresetPath` 返回 `/duel?...` 供 React Link 使用，最终浏览器 href 为 `#/duel?...`。复制复用项目稳定的 `sharePageUrl('/duel', query, document.baseURI)`，生成如`https://linhongcun.github.io/aoe2-analyzer/duel/?a=...&b=...&m=1`的完整静态入口URL；静态页现有boot会恢复`#/duel?...`。不得自己从window.location.href拼接hash，也不得调用`new URL('/duel',...)`导致丢失站点子路径，不添加新的PK URL协议/版本字段。`document.baseURI`在静态`/patches/185872/`由生成的`<base href="../../">`指向项目根目录；必须通过实际打开、复制、再开、reload核对，不能只测根hash页。

`duelParams`运行时依赖realCost→eco/buildSim，本批不import其运行时函数到补丁页；除已有轻量fmtSide/SideSpec外，复制复用sharePageUrl/useShareLink。测试可用实际decode/canon/parseSide/resolve核对兼容。不要静态import PK组件、simulator、realCost或核心JSON。补丁页首屏不因入口预加载PK/eco数据。

每项有“打开对照”链接与“复制对照链接”按钮（aria-label带组名）。使用既有 `useShareLink` 处理状态/手动复制，不另造clipboard机制。复制不会改变补丁筛选、当前路由、历史或PK参数；复制出的地址新开后恢复完全相同的单位/文明/时代/无科技/团队空/1v1。按钮成功反馈“对照链接已复制。”，失败保留只读完整地址手动复制；复制旧异步结果不能覆盖新状态，离页回来不显示旧反馈。

## 可验收界面

主题卡标题h3、每组配置名h4，沿补丁页现有h2/h3/h4层级，不改变Duel现有heading树。说明一行“以下对照指定文明，双方无可选科技；保留常驻文明加成。数据 DE185872，结果采用现有PK近似模型。”；再给法兰克未计折扣短说明。没有预先写死胜负、伤害、秒数或价格；数字结论只在现有PK中生成。

- `--color-surface/--color-surface-2/--color-border/--color-text/--color-muted/--color-link`；文字`--fs-h3`18px、正文`--fs-body`15px、备注`--fs-sm`13px，最低12px；间距`--space-2/3/4`8/12/16px，圆角`--radius-md`。
- 360/375/390单列，配置长名可换行；1280三列（每列minmax(0,1fr)），链接/按钮行可wrap。每个可点区域至少44×44px，保持焦点可见、键盘链接/按钮可用；不将整长URL强制nowrap。
- DE185872、1v1、时代数等数字用`.num/.nw`包局部；配置名自然断行。只用既有Lucide copy/check/外链等可用图标，不用符号字形。
- 明暗主题×360/375/390/1280均无页面/控制台错误或横向滚动。新卡的WCAG AA、点击面积、数字不折行检查可量化；布局截图独立复核。

| 状态                                 | 预期                                                                  |
| ------------------------------------ | --------------------------------------------------------------------- |
| 版本详情加载/失败/未知/索引/其他归档 | 沿用旧页面行为，不显示本卡，不增加伪状态                              |
| 185872正常与任意筛选                 | 卡保持固定三组，原条目、筛选和计数不改变；不把入口当补丁事实条目      |
| 打开任一配置                         | 当前PK正常结果出现，双方身份/时代/无科技与文案一致；刷新/复制重开保持 |
| 复制成功                             | 可读status说明成功，补丁页面状态不变                                  |
| 自动复制不可用                       | status说明失败，完整只读URL可选中复制，不丢失内容                     |
| 离开页面或改变有效入口状态           | 旧反馈/旧异步结果不串到其他页面或配置                                 |

## 保护和验证计划

`v0280-duel-url.spec.ts`、`v0290-322-golden.spec.ts`通过capturePage对整个#duel逐字比基线，本批不改Duel，全部期望和fixtures保持原样。不得为新入口重录这些受保护断言，也不通过人为挪动Duel子树规避；本方案采用玩家阅读补丁时直接使用的真实上下文入口。

新增unit锁三条参数、合法文明/时代、重装ID、无科技/无团队、canonical往返、无patch/旧PK参数泄漏、子路径完整复制和实际resolve不回退。新增E2E锁入口出现范围、准确href、拷贝后恢复、失败fallback及四宽明暗，不改受保护用例。

CI使用现有patches profile（patches16/patchTree417/patchSearch16及页面回归）；新增测试文件由现行ci-scope自动纳入。无需改CI policy，不触发未变数据生成，也不扩共享计算验证范围。实现后一次必要lint/tsc/layers/build、相关单测与补丁页面/新入口交互及四宽明暗；首屏网络检查确保无新PK/eco加载。

## 持久来源定位

- `scripts/data_sources.json`：DE185872与固定aoe2techtree/.dat来源commit及SHA256；游戏数值不来自社区讨论。
- `src/data/units.json`：id39/474/2700/2701的正式名称、时代、from_、civs、HP/攻击/护甲/间隔/accuracy/造价；由现有生成脚本产生，不手改。
- `src/data/techs.json`：id1496的名称、时代、文明、研究费用与说明；`src/data/effects.json`中techs1496的eco规则及civs.Franks常驻HP效果。
- `src/domain/simulator.ts`的simTechs/simulate、`src/features/duel/logic/duelSide.ts`的resolve：合法科技筛选、常驻文明效果、当前PK实际训练价调用；`src/domain/costDiscount.ts`的discountedCost不按选中1496应用科技费用。
- `src/domain/duelState.ts`的fmtSide/parseSide与`src/domain/duelParams.ts`的decode/canon：现有参数协议；`src/domain/sharePage.ts`的sharePageUrl、`scripts/static_pages.mjs`的base/boot：稳定公开地址与静态入口恢复。
- `tests/unit/v080-124.test.ts`：既有区域替代/文明可用性断言；`tests/e2e/v0280-duel-url.spec.ts`、`v0290-322-golden.spec.ts`：保持原期望的PK文本/URL保护。

准备阶段另做83个原生文明/单位组合只读模型审计；原始抽取保留在临时工作证据，不提交原始缓存或大份facts/jsonl。失败用例在独立worktree只加本设计与tests后先运行，root独立复核并等#285合并后才实施。

## 先失败证据（未实施）

worktree `/workspace/aoe2-issue441`、分支`feature/issue-441`，从main `6e71f655509487da69bb4f5a1d1592de19fa95f4`创建，只新增设计稿与两份测试；没有产品模块、数据或共享计算改动。

- `npx vitest run tests/unit/mountedCrossbowPresets441.test.ts`：exit1；预置模块尚不存在而导入失败，属于模块合同的预期红灯，尚未运行参数断言。
- `BASE_URL=http://127.0.0.1:4411/ npx playwright test tests/e2e/mountedCrossbowPresets441.spec.ts --grep '185872补丁有三条' --workers=1 --reporter=line`：1 failed；正常加载DE Update185872标题后，新主题region不存在，`toBeVisible`在2秒失败。不是安装、路由加载或浏览器错误。

此阶段未运行整套新用例或声称实现已通过；实际实施后才对约定功能、静态复制入口和四宽明暗执行绿灯验证。
