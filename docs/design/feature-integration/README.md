# 功能整合交互设计

本目录包含全站功能整合方案、可点击原型和维护者授权后的[正式系统实施规格](IMPLEMENTATION.md)。原型用于体验交互，产品发布状态以 #531 的实现 PR 和 Release 为准。

- [完整交互方案](SPEC.md)：三条任务闭环、现状断点、功能分工、情境传递、结果解释、实施切片与验收条件。
- [原型入口](index.html)：单位资料、持续生产、经济科技收益三屏。

## 打开原型

在项目根目录运行：

```bash
npm run dev -- --host 0.0.0.0 --port 5173
```

访问 [本地交互原型](http://localhost:5173/docs/design/feature-integration/index.html)。原型需要 Vite 转换 TypeScript，不能直接以文件方式打开 HTML。页面中的“完整方案”打开本目录规格；“现有工具”及文明链接进入当前本地项目，原型页之间的链接保留原型状态。

建议按以下路径体验：

1. 在持续生产页修改文明、单位或建筑数量，展开“对比少一座生产建筑的需求”。
2. 点击“带着方案核对收益”。页面保留来源，先要求明确用于估算的村民人数。
3. 选择“使用原方案的理论供给人数”，或手动填写实际人数；修改理论值后仍标明是假设。
4. 返回原方案，检查建筑数量和其他条件完整恢复；也可复制原型链接到新标签，刷新继续。
5. 切换单位资料页及浅深主题，查看当前分析与原始对局的区别。

## 原型范围

计算直接复用现有 `calculateProduction` 与 `calculateEcoPayoff`，游戏数值不在原型中另写一套。原型演示单条生产需求；完整设置、多条需求和其他计算工具使用现有页面。顶部三个页面入口用于原型评审，不是提案要求新增的全站导航。

来源生产配置与收益输入分别保存；原始对局不会随当前分析文明改变。原型自己的 hash 状态封装不代表正式产品已支持 `ctxReturn`。完整方案中未被原型覆盖的路径仍属于后续实施设计。

## 已完成的核验

基线代码提交：`4b23f8cf1648a50508b438cf76cf8e2b45ffecb8`。2026 年 10 月 30 日完成以下核验：

- 原型 TypeScript、ESLint、Prettier 和两份 CSS 语法检查。
- 360 / 375 / 390 / 1280 四宽、浅深主题、三个页面共 24 种组合：无页面横向溢出、WCAG A/AA 检查违规或小于 44×44 的可见交互目标。
- 实际浏览器验证：人数明确选择、假设来源标识、原方案恢复、浏览器后退、刷新、新标签、复制成功及失败回退、无效输入暂停分享和计算。
- 独立代理复核及浏览器检查：原对局保持、单条需求边界、收益来源一致性校验、农田距离差异、前置与自动免费语义；修正后无剩余阻塞问题。

可单独运行原型的静态检查：

```bash
npx tsc -p docs/design/feature-integration/tsconfig.json --noEmit
npx eslint docs/design/feature-integration --max-warnings 0
npx prettier --check docs/design/feature-integration
node scripts/check-css.mjs docs/design/feature-integration
```

以上为原型阶段的验证记录。正式系统实施与验证另见 [IMPLEMENTATION.md](IMPLEMENTATION.md) 及 #531 的交付记录；原型校验不能代替产品代码的检查与部署证据。
