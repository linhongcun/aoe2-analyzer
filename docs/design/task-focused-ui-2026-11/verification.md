# 本轮验证与独立复核记录

记录日期：2026-11-09。范围仅移动列表、开一局信息层级、文明/单位详情；不含科技树重写、数据和计算变更。

## 证据身份

原始基线为 `483e513608a6a60150b54f4a70afaa0875b28a79`，线上 v0.77.64。截图与初次独立复核是在该基线上的本轮未提交工作树完成；截图页脚因此沿用HEAD构建号，不能仅凭相同页脚断言实现相同。

原本地源码补丁的 SHA256 为 `2725cb8a54aec9dabd60ab2529d3008051ab8914ccb7024bd1187c39f2254e9b`。该指纹标识首次交付时的源补丁；本目录的证据整理、PR元数据和后续提交身份以对应PR记录为准，不冒充当时已存在提交SHA。

所有图片是原浏览器PNG字节，本目录未重绘、裁剪或重新压缩。前后测量由同一采集脚本获取，原始JSON随报告保存。

## 实际执行与结果

| 检查                                                                              | 结果                                               | 原始证据                                                                                  |
| --------------------------------------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `npm run build`                                                                   | 通过：tsc、Vite、958静态页面、OG和sitemap生成      | [正式构建](evidence/build-final2.log)                                                     |
| ESLint、注册表、数据族、颜色、CSS、strict分层                                     | 通过；ESLint排除work中间文件，有25条既有长文件警告 | [静态日志](evidence/lint-final.log)                                                       |
| `python3 docs/design/contrast.py`                                                 | 通过                                               | [对比度](evidence/contrast.log)                                                           |
| 5个相关Vitest文件                                                                 | 146/146通过                                        | [单测](evidence/unit-tests.log)                                                           |
| 7个原相关浏览器文件                                                               | 167个不同用例；最终164通过，3个基线重试失败        | [首次范围](evidence/related-tests.log)、下列精确复测                                      |
| `unitFilters196.spec.ts`                                                          | 修复嵌套Escape后10/10通过                          | [单位筛选复测](evidence/unit-filter-final.log)                                            |
| `civDlcFilters.spec.ts`                                                           | 最终布局10/10通过                                  | [DLC复测](evidence/civ-dlc-final.log)                                                     |
| `startGame632.spec.ts` 的360px reset/back单例                                     | 单独复测通过；首次失败为构建并行时HTTP reload失败  | [终版单例](evidence/back-final.log)                                                       |
| `taskFocusedUi.spec.ts`、`civRequirements206.spec.ts`、`catalogLayout187.spec.ts` | 36/36通过                                          | [新增/补充UI检查](evidence/final-ui.log)                                                  |
| 已知3条资源重试单例                                                               | 原始基线与优化版均失败，不改断言                   | [基线复现](evidence/baseline-failures.log)、[终版复现](evidence/known-failures-final.log) |

相关单测命令：

```sh
npx vitest run tests/unit/unitFilters196.test.ts tests/unit/unitFilters192.test.ts tests/unit/startGame632.test.ts tests/unit/startGame592.test.ts tests/unit/civRequirements206.test.ts
```

浏览器检查使用仓库安装的 Playwright、系统 Chromium，生产构建托管在4173。原始基线另外在干净worktree构建并托管4176，用相同浏览器和测试复现失败。这里的窄本地Playwright配置只指定测试目录、BASE_URL、系统浏览器路径、900px高度与worker数量，没有修改测试断言、重试次数或超时门槛。

核心原套件：`civDlcFilters`、`unitFilters196`、`insights584`、`civ603`、`startGame592`、`startGame632`、`mechanism652`。受保护v0验收未修改。

## 保留的失败与局限

以下3条资源失败重试测试在原始基线和优化版本均失败，故不能把本地套件写成全绿：

1. `mechanism652.spec.ts`：数据加载失败时保留选择并可继续，不刷新整页。
2. `mechanism652.spec.ts`：本局摘要真实数据失败重试、非法配置保留地址和存档。
3. `startGame592.spec.ts`：恢复地图加载失败保留原档且可重试。

本轮未修改这些资源加载逻辑，也未删除、放宽或跳过断言。科技树仅作范围外审计，发现选择框`#trm`缺少可访问名称；这项遗留不能混入“本轮改动页面Axe通过”的结论。

首轮新增的嵌套Escape回归已修复并复测：文明选择器消费Escape后，外层筛选遵守`defaultPrevented`，只关闭当前对话框并回到文明按钮。另一个首轮HTTP reload失败发生于构建并行时的dist替换窗口，原版和终版独立单例均通过；没有以提高超时或重跑替代定位。

## 独立复核

复核由实现者之外的独立代理完成，没有伪造具名人员签字。

- 实施前核对冻结规格、旧测试迁移和不改数据/流程范围。
- 对比首页中文JSX及字符串AST，原有计算前提、限制与来源没有删除；候选顺序、理由内容、领域逻辑、数据和状态协议未变。
- 目视检查390px场景/文明与1280px单位，并核对核心指标与空态44px。
- 独立复现嵌套Escape问题；修复后再次验证只关闭文明选择器，第二次Escape才关闭外层筛选。
- 独立连续12次快速1280→390切换均正确回焦筛选按钮；601/1280搜索与条件同行、DLC下一行且无横溢。
- 最终结论：本轮实现与冻结规格相符，无未解决的本轮阻塞；上述基线资源重试和科技树语义问题仍明确保留。

这份记录对应提交前本地实现。提交后的SHA、远端CI与是否发布，应由PR记录补充；这里没有把本地成功等同于GitHub CI、合并或生产发布。
