# 开一局目录容量与查看返回（#676）

基线 actual main `7528797a47205d69aa3ca00f479645151282a2ea`；版本 v0.77.15。独立设计 v5 已按 #666 最终树重新核对。本项不改推荐算法、地图编辑稿、两套机制配置、数据或 CI 策略。

## 查看文明与完整来源

完整目录、搜索结果、地图编辑卡及机制卡的“查看”均使用同一轻量 helper：从当前 React props 的完整 StartState 生成现有 Home URL，仅把返回位置设为 civ，再经 URLSearchParams 作为文明详情的单个 returnTo 参数。保留 choice、sceneConfig、routeConfig、skipped/prefilled（含 false）、teamArmed、lobby、laneOpen；不读旧 location、lastCiv 或 local 推导来源。

查看 Link 与选择 button 继续是独立相邻控件。查看不调用选择、跳过、重置或更新本局；返回原已选蒙古仍为蒙古，原未选文明仍为空，不因文明详情写 lastCiv 而替换。目录展开/搜索/滚动仅属局部 UI，不新增本局协议字段。

文明详情只有合法来源时，在现有 tabsTop 插槽显示普通 div/Link“回开一局”，明确回文明步并保留原选择。所有五个页内 tabs 均可见，不依赖浏览器后退；普通裸文明 URL 无该条。保留五 tabs、两个 nav、相关工具与 `.dtabs + .civ-related-tools` 邻接，不把返回插入五工具列表或新增 tab/nav。

详情 tabs/history 继续 clone 原参数，只改各自 tab/hist*；清除筛选只删 hist*。刷新、复制到独立 context、前进/后退后来源仍有效，显式返回完整恢复；不扩为其它工具/文明的全站返回链。

## 唯一校验与安全目标

把现有纯 encode/decodeStartGame、encode/decodeStartSearch、长度常量和 StartRestore 原样提取到中立 domain 模块；Home persistence 保留 local/browser I/O 并兼容 re-export。Home/CivDetail 共享唯一严格 validator，不 feature-to-feature、不复制四字段近似协议、不静态引入地图目录或重模型。

safe-return 只返回规范内部 Home 地址或 null：

- 外层 returnTo 恰一次且非空；重复同值亦无效。检查坏 percent/UTF-8 只影响来源条，不阻止资料页。
- 只接受字面 `/?` 起始的根 Home 目标；拒绝 scheme、绝对同源 URL、协议相对、相对/其它 path、路径编码/规范化变体、反斜线、控制字符、前后空白及嵌套 hash，不用 URL 自动修复。
- 内层交唯一 decodeStartSearch，保持原4096-byte envelope、12352-byte query、版本/恰两键/单次解码/严格字段及两配置规则；要求 current=civ。无效/absent 隐藏来源条，不执行 raw href。
- valid 由唯一 encoder 重建目标。needs-maps 可保留规范安全 Home 候选，最终成员校验仍由 Home 原异步入口完成；不冒称已核地图，不同步导入目录、不改未知图为阿拉伯。pending/failed/invalid 零写与 URL 优先/epoch/竞态保持。
- 外层嵌套编码自然变长，不对整个详情 query 套用更小 Home payload 上限，也不放宽原内层限制。

## 目录真实入口与容量

地图与文明 catalogue 在 PC1280 保持两列、至少六完整行；只增大实际名单容量，可去掉 catalogue 子项重复顶部 margin。保留字体/卡片内容/选择与查看，不缩字或裁长名，不改机制卡 margin。

#666 编辑参考路径 shown>0、!searchOnly、空搜索时新增“浏览其余文明”显式 disclosure。初始收起，点后展示排除上方两家后的真实剩余目录，不重复选择按钮，不自动选择；展开后“收起其余文明”，aria-expanded 与实际一致。搜索时按原逻辑过滤其余文明并隐藏 disclosure；清空搜索恢复局部展开状态。shown=0 的完整目录与机制 searchOnly 原行为保持，不按新建 Set 引用重置展开。

几何测量等字体/列表稳定后 scrollTop=0，以容器 rect.top+clientTop 到 top+clientHeight 为内部边界，容差最多1px。地图用完整 start-map button，文明用完整 start-civrow（包含选择与查看）及两个子控件：

1. 当前目录自身至少12完整项，前12每项及文明子控件都完整，至少六行两列；第12项 bottom 不被截。上方两参考卡不计数，隐藏DOM不计数。
2. 保存 clientHeight/scrollHeight/scrollTop、内部上下边界、前12项 top/bottom/height、列/行 gap 和完整数量。只验 DOM 数量、toBeVisible 或 CSS 高度不成立。
3. 真实点击“浏览其余文明”后测编辑路径；无稿/空大厅既有完整目录也可进入。列表可滚至末项并选择/查看，键盘焦点可见。搜索少于12项自然收缩，不撑空白。

## 验证与交付

先在公开 v0.77.14/7528797 记录实际 red：有原文明查看另一家后详情缺显式返回；编辑路径缺浏览入口；地图与空大厅文明目录的同口径实际几何不足12。

绿色覆盖原选/未选、编辑/搜索/机制三来源、独立双配置、手工大厅/1v1/跳过、tabs/history/刷新/复制新 context+冲突local、前进后退，以及全部坏来源/needs-maps。来源只能回文明步，不能改变原选择或填默认地图。原严格 schema、local/URL与异步恢复、#666/#667行为不减言。

360/375/390/1280 各取地图目录、展开文明目录、带返回条的详情图，共12图；覆盖明暗、无横溢/console error/pageerror、触点44×44、字体≥12px与WCAG AA。PC容量按真实DOM数值验收，窄屏不新增专项流程。保留 civNav602 五tabs/两nav/工具邻接/axe，文明背景与history复制恢复回归。

实际最终源码/构建与测试、独立12图终审、exact full CI、main/native Pages、公开站专项及身份、正式 Release/tag/public bytes/全部文件hash和 completed observer 全部通过后标已部署关闭。
