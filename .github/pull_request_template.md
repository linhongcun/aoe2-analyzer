## 目标分支

<!-- 当前版本分支 release/vX.Y.Z；线上数据热修写 main -->

## 关联 issue

Fixes #

## 改动内容

-

## 本地测试结果

<!-- 贴出通过条数，例如：vitest 1244 过；e2e 574 过 0 失败 -->

- [ ] `npm run lint`
- [ ] `npx tsc -p . --noEmit`
- [ ] `npx vitest run`
- [ ] `npm run build` + `npx playwright test`

## 独立复核

<!-- 默认由实现者之外的独立代理复核；只改文档或纯样式且不动逻辑和测试时可按 CONTRIBUTING 采用轻量规则。CI 按现有工作流实际范围执行。pull_request 不跑完整 Playwright；main / release 的 full 计划、nightly 与 CI_FULL 仍跑完整浏览器。 -->

- 实际验证的提交 SHA：
- 复核者（须与实现者不同）：
- 复核范围与结果：
- 未解决问题：
- CI 运行链接与实际范围（含按路径跳过的步骤）：

## 截图（界面改动必填）

<!-- 360 / 375 / 390 / 1280 四个宽度；确认无横向滚动、无页面报错 -->

## 检查清单

- [ ] PR 标题符合 Conventional Commits（`类型(#issue): 描述`）
- [ ] 已 rebase 到目标分支最新提交，且在本版冻结范围内
- [ ] 游戏数字来自数据文件，没有手改生成的 `src/data/*.json`
- [ ] 未擅改 `tests/**/v0*-acceptance*` 及其他受保护验收期望；如有冲突，附维护者明确决定和独立复核证据
- [ ] 涉及界面：已附四宽度截图；独立复核已核对规格、布局和状态，或已注明适用的纯样式轻量规则
- [ ] 图标用 Lucide，颜色用设计令牌
- [ ] 需要时已更新 CHANGELOG.md
- [ ] 未伪造他人结论、删除分支、修改权限或放宽测试；涉及解除 Hold 或待确认产品决定时，已附维护者明确授权
