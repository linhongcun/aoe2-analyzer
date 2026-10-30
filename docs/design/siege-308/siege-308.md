# #308 `#/siege` 交互规格（Jony · 2026-10-30）

> 产品口径以 Steve 设计要点为准；测试契约以 Kent #529 为准。本稿只定视觉与交互。

## 1. 路由与深链

`#/siege?unit=<单位 id>&n=<数量>&bldg=<建筑 id>&civ=<攻方文明英文名>&armor=<护甲科技标记>`

| 参数 | 缺省 | 说明 |
| --- | --- | --- |
| `unit` | `1258`（攻城锤） | 攻城单位单选 |
| `n` | `4` | 正整数，步进最小 1；上限由 PR 写死 |
| `bldg` | `82`（城堡） | 目标建筑单选 |
| `civ` | 省略 = 不限文明（无加成） | 可选 |
| `armor` | 省略 = 无守方护甲科技 | 标记写法由 PR 写死（建议逗号分隔 tech id） |

- 缺省即 Kent 默认态：`#/siege` → 4×攻城锤 vs 城堡 = 9 击 / 40 游戏秒。
- 任何输入变化 → `history.replaceState` 更新 hash（不堆历史），结果即时重算；无「计算」按钮。
- 「驻满村民」不进 URL（不影响结果）。
- 「复制分享链接」复制当前完整 URL；成功后按钮文案 2 秒内变「已复制」（`aria-live="polite"`）。

## 2. 布局

- **< 960px 单列**：页头 → 攻方卡（攻城单位 / 数量 / 攻方文明）→ 目标卡（目标建筑 / 守方护甲科技 / 驻军）→ 主结果 → 对照表 → 模型口径。
- **≥ 960px 两栏**：左 400px 输入；右侧主结果 + 对照表 + 模型口径，`position: sticky`。
- 页头：返回首页（`arrow-left`）+ 面包屑「工具 / 攻城拆建筑」；H1「攻城拆建筑」（`hammer`）。
- 数量：步进（`minus` / 输入框 / `plus`）+ 常用 chips 1 / 4 / 6（`aria-pressed`）。
- 主结果卡：accent 浅底；三格 击数 / 游戏秒 / 现实秒，游戏秒用 accent 色作为主读数；卡底「现实秒 = 游戏秒 ÷ 1.7（标准速度）」+ 数据版本标签（`data_sources.json`）。
- 对照表：同一攻城组合 × 城镇中心 / 城堡 / 瞭望箭塔 / 石墙 / 城门；当前目标行 accent 浅底 + 左侧 3px accent 条；点一行 = 设为目标建筑。数据不齐的行整行「暂不计算 · 数据待补」。
- 模型口径块（灰底，`info`）：「模型口径：理想射击间隔，首轮 t=0；不含走位、展开、前摇、飞行、修理、反击。」常显，不折叠。

## 3. 状态

| 状态 | 表现 |
| --- | --- |
| 默认 | 无参数进入 = 4×攻城锤 vs 城堡，直接显示结果（9 / 40 / 23.5） |
| 已算出 | 主结果三格 + 对照表；见 `wire-siege-390.html` / `wire-siege-1280.html` |
| 投石车未核实（280/550/588） | 选择器照常可选；结果卡换成虚线灰框「规则未核实，暂不计算」+ 说明；**不渲染** `siege-result/hits/game-seconds/real-seconds`，对照表整块隐藏；页内无任何「N 游戏秒」。muted 色，不用红色（未知 ≠ 错误）。见 `wire-siege-mangonel.html` |
| 驻满村民已勾 | 结果数字不变；开关下方「驻满村民：未计入（暂无可核实数据，用时按未驻军计）」。只在可驻军目标（城镇中心、城堡、箭塔等）出现 |
| 空/无效参数 | 非法 `unit`/`bldg` 回落缺省值并改写 URL；不出空白页、不出「找不到该页」 |

## 4. 可访问性

- 每个控件有可见 `<label>`：「攻城单位」「数量」「攻方文明」「目标建筑」（Kent 用 `getByLabel` 精确匹配，文案不可改）。
- 护甲科技、驻军用原生 checkbox（或 `role="switch"`），可访问名「砌石」「建筑学」「驻满村民」。
- 主结果容器 `aria-live="polite"`，标题读作「N 台{单位} 拆 {建筑}」。
- 对照表：`<table aria-label="同组合对照：…">` + `<caption>`，列头 `scope="col"`：建筑 / 击数 / 游戏秒 / 现实秒；当前行 `aria-current="true"`；行内可点击元素用 `<button>`，不是整行 onclick。
- 焦点：沿用站点 focus ring（accent 2px outline，offset 2px）；Tab 顺序 = 视觉顺序；步进按钮 `aria-label`「减少一台」「增加一台」。
- 触控目标 ≥ 44×44（chips、步进、开关、表格行、分享按钮）；对比度 WCAG AA（muted #636366 on #fff = 5.9:1）。
- 数字一律 `.num`（tabular-nums + nowrap），短语组用 `.nw`。

## 5. Lucide 图标

`arrow-left`（返回）、`hammer`（页标题/单位）、`building-2`（城镇中心、墙、门）、`castle`（城堡）、`tower-control`（箭塔）、`link`（分享）、`circle-alert`（未核实/未计入；旧名 alert-circle）、`chevron-down`（下拉）、`minus` / `plus`（步进）、`info`（模型口径）、`database`（数据版本）。

现有 `src/shared/ui/Icon.tsx` 尚无 `Hammer`、`Building2`、`TowerControl`、`Link`、`Minus`、`CircleAlert`，实现需登记。无 emoji。

## 6. 导航入口

`src/shared/nav/pageRegistry.ts` 新增 `key: 'siege'`、`path: '/siege'`、`lane: 'tool'`、`icon: 'hammer'`、`label: '攻城拆建筑'`、`en: 'Siege'`，`desc`「几台攻城单位拆一座建筑要多久」，按 #388 约定归工具分组（与 builds/compare/matchup 同属 tool lane）。Kent #529 要求工具导航与首页都有入口。

## 7. 视觉 AC（Jony 验收）

- [ ] 360 / 375 / 390 / 1280 × light / dark 无横向滚动
- [ ] 击数 / 游戏秒 / 现实秒及表内数字 `.num` 单行不折
- [ ] 主结果三格等宽；游戏秒 accent 色；数据版本标签可见
- [ ] 对照表当前目标行高亮，与「目标建筑」选择同步
- [ ] 投石车三型：灰色虚线提示「规则未核实，暂不计算」，无任何用时数字、无对照表
- [ ] 驻满村民勾选后数字不变且出现「未计入」
- [ ] 模型口径文案原样常显
- [ ] 只用 Lucide + 设计令牌；触控 ≥ 44px；axe wcag2a/2aa 0 违规
- [ ] ≥ 960 两栏，右栏 sticky；< 960 单列顺序同 §2

## 数据门禁补充

手推炮缺「石质防御」数据时与投石车同原则：不给完整用时数字（Steve / Kent #529）。
