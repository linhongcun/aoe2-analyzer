# #286 分享与复制反馈迁移

## 范围

将 24 处页面复制逻辑迁移到 `shared/ui/useShareLink`。保留各页现有序列化、参数含义、长度约束、成功和失败文案、按钮位置与手动复制控件。剪贴板直接访问保留在共享 hook、百科页 `CopyPageLink` 和分享图组件三处；后两者已有独立反馈和回退路径。

不更改游戏计算、数据、路由登记、PK 标题层级或既有验收测试。不统一 URL 格式，不设置新的全站链接长度上限。

## 反馈契约

- 成功：显示该页现有成功提示，清除旧手动链接。
- 失败或不支持剪贴板：显示该页失败提示，保留未经截断的完整内容供手动复制。
- 生成失败或超过调用方明确提供的长度上限：停止复制，清除旧反馈，显示对应输入错误，不生成截断链接。
- 编辑、重置、前进后退：失效旧复制请求，清除旧手动链接；返回原地址也不恢复旧反馈。
- 多次点击：仅最后一次请求可以更新反馈。卸载后不更新状态。
- 其他页面操作：可播报该操作的原有提示；导航后的提示明确绑定目标配置。
- 状态提示统一使用 `role="status"`、`aria-live="polite"`、`aria-atomic="true"`。按钮和手动输入框的现有名称保持。

## 页面清单

GameClock、TeamPlan、Scouting、ContentGuide、CastleDefense、MixedArmy、TeamBonuses、Market；RelicIncome、TradeIncome、EcoPayoff、GarrisonHealing、Construction、Production、Campaigns、GameGuide；BuildTimelineView、GarrisonPreview、GeneralGarrisonPreview、CivRequirements、Glossary、UpgradeComparison、BreakEven、MatchReview。

Glossary、BreakEven、BuildTimelineView 原先缺少可操作的失败回退，新增仅失败时出现的完整内容输入框，沿用现有字体、颜色、间距与表单样式。其余页面保留已有视觉结构。MatchReview 复制的是玩家选择的摘要，失败仍聚焦并全选原摘要框，不将其改成 URL。

## 验证

共享 hook 使用真实 React renderer 验证成功、失败、无剪贴板、超长、生成异常、异步生成、编辑与历史导航、重置、竞争请求和卸载。新增浏览器用例在 360 / 375 / 390 / 1280 保留失败状态截图，检查无溢出、无页面错误，并验证旧异步返回不能覆盖新状态。既有 e2e 不修改，继续验证每页链接格式和恢复结果。

此文件记录实施契约，不代表 Kent 或 Steve 的本人审阅签字。
