# #6 阶段3 详情页统一模板 v2（Steve 四点已落实）

1. 空区块整块隐藏：没有数据的区块连标题一起不渲染，不出现空态、不显示「无」。单个字段缺失（如爆炸单位 DPS）仍按 #27 显示「—」+ muted 说明。
2. 页头右侧只放「复制链接」（与工具页一致）。造价、生产/建造/研究时间移到正文第一个区块「造价与生产 / 造价与建造 / 研究」；文明页「开局建议」移到正文首个区块。
3. 琥珀色关键数每页最多 2 个：单位=生命值、攻击；文明=骑兵 10、经济 8（其余评分条改中性灰 #aeaeb2）；建筑=生命值、护甲；科技=两项效果。
4. 新增 390 样稿：兵营（buildings.json id 12）、织布机（techs.json id 22）。数据来自 main@8510871 的 src/data/*.json，可训练单位为节选。
Design System C · Lucide · muted #636366 · AA。

## 补充（#33，Steve 已定：只做外链）
文明详情页「相关」区末尾加一条：
- 文字「天梯胜率（aoe2insights）」；右侧类型标签「外部」+ Lucide `external-link` 14px，颜色 `--color-muted`（#636366）。
- 链接 `https://www.aoe2insights.com/civilization/{civ英文名小写}/`（例：`/civilization/franks/`、`/civilization/byzantines/`，已打开核过返回 200），`target="_blank" rel="noopener noreferrer"`。
- **不写更新日期**，不嵌入、不缓存对方数据，不显示站内胜率或分段。
- 点击区域沿用相关区行高（≥44px）；电脑和手机同一结构。
