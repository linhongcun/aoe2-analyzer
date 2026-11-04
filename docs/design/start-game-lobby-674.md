# 开一局：大厅补选与刷新恢复（#674）

版本 v0.77.10；实施基线 main `9c91948129af5342f775bb262899a0f3d63919ce`。本项沿已批准的独立设计预审实施；最终代码、测试与四宽截图另由非实现者复核。

## 玩家行为

- 大厅入口保留未填模式、地图的真实跳过标记，不填默认人数或地图。玩家明确补齐组队人数与地图后，自动进入路位；单挑始终没有路位。
- 后续导语统一说明可按当前选择继续或回头改条件。大厅的所有步骤及摘要都写明「没有连上游戏大厅」，不再把已补齐的条件称为已跳过。
- 修改条件保留已选文明，同值重选、后退与跳过沿用现有规则。自动路位后显式跳过，在大厅文明步仍可「补路位」：条件为组队且人数非空、路位为空，复用现有 openLane。
- 本项仅用首页专用 local 存档满足刷新验收，不读写本局 URL；自足分享由 #669 单独处理。不扩展机制覆盖、推荐卡、真实大厅或跨工具上下文。

## 存档格式与校验

独立键 `aoe2-start-game-v1`，JSON envelope 为 `{version:1,state}`，原始 UTF-8 不超过4096字节。envelope、state七字段、choice五字段均精确白名单且必填；skipped只允许五种StepId的可选boolean，prefilled只允许mode/map的可选boolean，保留false。

使用真实文明ID与完整异步地图目录ID，未知ID拒绝整份。组队须有teamSize及teamArmed；teamSize/非空lane须属于组队。单挑须无人数、路位且未armed；空mode允许armed中间态。laneOpen可跨模式、清图或skip保留。choice与显式skipped=true冲突；prefilled=true须有对应选择且未跳过。

current必须在实际decisionSteps或为摘要null。只检查严格早于current的实际choice步骤mode/map/lane/civ是否已选或跳过；摘要检查全部实际choice步骤。opponent没有choice，正常完成不要求标成跳过。当前步可以保留skipped=true，后退可以保留未来选择，不能因此拒绝合法状态或凭空添加prefilled。

## 恢复、错误与写入

- 无存档直接空局；合法且无地图可立即恢复。有地图时先显示恢复中，目录验证完成前不操作流程、不写空档。
- 地图加载失败与未知地图ID分开：加载失败保留原记录，提供重试、放弃恢复；未知ID等非法记录显示安全空态与固定提示，玩家动作前不写回或删除原记录，不回显原始输入。
- 明确放弃或再开一局取消旧异步代次，并持久化完整空局；迟到结果、卸载、StrictMode不得覆盖新状态。
- storage属性getter、getItem、setItem均捕获异常；被浏览器拒绝存储时仍可操作。SSR不访问window。写入在提交后的effect，functional updater无副作用。
- 预加载与地图消费者均捕获拒绝，地图步有可见失败/重试，不把完整目录同步引入首页主包。

## 验证与原用例迁移

旧版真实红例：大厅补人数/图后停在文明；大厅选文明后刷新回模式。新增严格拒绝矩阵与遵循UI前置条件的事件roundtrip，覆盖摘要opponent、armed空模式、跨单挑laneOpen、skip/back、false与缺省。实际hook验证storage异常、pending零写入、加载失败保留、未知ID、重试/放弃/卸载取消。

360/375/390/1280均检查大厅先选文明，再补4v4/阿拉伯自动路位；lane/civ/摘要真实reload后选择、进度、导语与大厅语义一致。附四宽lane与reload后civ截图；保留明暗主题、无横向滚动和无console error/pageerror。

#592/#632普通领域用例由旧split时刻迁移到自动lane再选路位，保留文明、理由与推荐断言。#670先自动lane再显式skip，完整保留缺条件无卡、范围提示、可自主选文明、补选后真实卡以及2v2/竞技场补完仍无卡。机制失败用例保留trees失败、匈奴保留、重试成功、继续完成。隔离fixture只清专用键，不清全部localStorage或主题；受保护验收不改。
