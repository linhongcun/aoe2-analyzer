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

## 截图（界面改动必填）

<!-- 360 / 375 / 390 / 1280 四个宽度；确认无横向滚动、无页面报错 -->

## 检查清单

- [ ] PR 标题符合 Conventional Commits（`类型(#issue): 描述`）
- [ ] 已 rebase 到目标分支最新提交，且在本版冻结范围内
- [ ] 游戏数字来自数据文件，没有手改生成的 `src/data/*.json`
- [ ] 没有改 `tests/**/v0*-acceptance*` 的期望值
- [ ] 涉及界面：已附四宽度截图，等 Steve「设计通过 @ SHA」
- [ ] 图标用 Lucide，颜色用设计令牌
- [ ] 需要时已更新 CHANGELOG.md
