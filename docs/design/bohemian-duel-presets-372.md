# #372 波希米亚单位 PK 两条预置规格

## 授权与边界

维护者针对“胡斯派战车对轻型投石车、精锐胡斯派战车对中型投石车”的具体提议明确回复：“嗯，解除暂停，实施吧”。这是本轮 #372 的解除暂停和实现授权，见 [6411790420](https://github.com/linhongcun/aoe2-analyzer/issues/372#issuecomment-6411790420)。此前候选正文、Hold和其它审阅历史保留，不解释成未指定issue的批量授权。

实施基线 main d38793edec80e295fed4073a71cfc5c8513d6b39，现有版本0.40.2，数据DE185872；本功能发布版本0.41.0。只改Duel局部预置helper/卡片、对应测试、精确CI profile名单和短烟测及必要授权/版本文档。不改生成数据、领域计算、共享组件、URL解析、依赖或全局CSS；不新增第三条、Generic文明、建筑工具或其它页面入口。

## 两条固定配置

| key                     | 标题                                 | A                   | B               | 模式 |
| ----------------------- | ------------------------------------ | ------------------- | --------------- | ---- |
| castle-hussite-mangonel | 城堡时代：胡斯派战车对轻型投石车     | 1704.Bohemians.3.c. | 280.Franks.3.c. | 1    |
| imperial-hussite-onager | 帝王时代：精锐胡斯派战车对中型投石车 | 1706.Bohemians.4.c. | 550.Franks.4.c. | 1    |

双方均当前时代满科技、无团队加成。法兰克是明确选择的真实文明，不是“通用”替代名。550按固定数据称中型投石车，不能误写成重型588。

已有只读探针在上述固定基线实际核对单位文明成员、时代、parseSide/resolve/decode/canon/sharePageUrl：1704科技[784]、280[]、1706[784,377]、550[47,377]，全部无回落、无不可用状态。原始证据位于 /tmp/issue372-scope-audit/probe.log；来源为当前生成数据与其固定来源，不是游戏引擎实战验收。

“当前时代满科技”沿用当前模型已编码且文明/时代可用的数值科技，不承诺所有游戏机制。预置区附近明确提示沿用现有PK近似模型、结果不等同实战；不描述为竞技场平衡推荐、多弹或范围伤害验证。

## UI和语义

保留原计算器section #duel的全部文字、计算和标题结构，在其后新增同一路由、同一main内的兄弟section #duel-presets，aria-label和h2为“波希米亚预置对战”。其内恰好两张article卡，每张h3为上表标题。不能把卡片插入#duel或移动原ListHead，以免改变受保护全文金标准。

说明行显示“波希米亚对法兰克，双方当前时代满科技、无团队加成，1v1。数据 DE 185872。”数字/数字+单位用现有 .num.nw。另有简短模型限制提示，参照上方已有完整近似模型说明。卡片不硬编码战斗结论数字，也不扩展模型。

复用全局既有 .two、.posbox、.bar、.note、.ulink、.share-link-manual、.num.nw。宽屏两列，既有窄屏规则单列；卡片自然高度、文本可折行，动作可换行，不设固定宽度。颜色沿设计令牌，note13px，正文15px，h2/h3沿既有标题规则。按钮由现有全局规则保证44px；打开Link本地inline-flex/center/gap变量/min-height44px，文本宽度超过44px。不增加样式表或修改现有CSS范围守护。

在原#duel之前增加同一185872数据门禁下的本地按钮“查看波希米亚预置”，复用 .bar 和既有44px button样式。普通点击或键盘激活只scroll并focus到末尾兄弟section #duel-presets（tabIndex=-1），不产生新URL/路由/配置，便于手机发现两卡；两个方向均按实际header.topbar底边加8px空隙定位目标标题，避免吸顶栏遮挡，并实测标题top不小于顶栏bottom。回计算器时临时聚焦section，blur后清理新增tabindex；保持原#duel全文和标题不变。此可用性细化已由root与独立reviewer确认属于本轮两预置范围。新增用例先在当前无快捷按钮产物实际失败，再实现并检查同页URL不变与键盘focus/视口。

每卡一个标准React Router Link“打开对照”和一个带具体卡标题aria-label的“复制链接”按钮，Lucide图标只复用现有swords/copy/check。普通鼠标点击/键盘激活打开后将原#duel滚入视口，使结果与单位选择立即可见；Ctrl/Meta/Shift/Alt及非主键保留Link原生语义，不替当前页面滚动。

成功复制采用现有useShareLink的polite/status反馈。失败时保留完整只读可选textarea，label为“完整对照链接”，不截断URL；只读框用现有 .share-link-manual，完整URL在框内滚动，不撑宽页面。URL状态变化时沿用hook清理旧反馈，不改共享hook。

只有传入的当前数据build恰为185872才返回/显示两条预置；其它build为空列表，整个预置区不显示。标签从真实DATA_SOURCES.patch.build读取，不能在新数据上沿用旧版本标记。

## 局部helper及链接合同

新增 src/features/duel/logic/bohemianPresets.ts，导出精确两条元数据和bohemianPresetsFor(currentBuild)、bohemianPresetPath(preset)、bohemianPresetShareUrl(preset, projectBase)。SideSpec经现有fmtSide序列化，必须从全新的URLSearchParams({a,b,m:'1'})产生query，不读取或合并当前位置；返回查询键严格只有a/b/m。双方techs为c、team为空，时代显式。

打开目标严格为 /duel?a=1704.Bohemians.3.c.&b=280.Franks.3.c.&m=1 或第二条对应配置。不能调用现有Duel.set()或复制sp，避免遗留m=n/r/t、na/nb/bud/vil/min/be/base/fixed/basev/旧团队或无关query。

复制复用sharePageUrl('/duel', freshQuery, document.baseURI)生成当前项目子路径下duel/静态入口，hash为空。复制不导航、不改变当前URL/模式/旧比较；从静态入口重开及刷新必须恢复同一规范hash和双方文明、单位、时代与c预设。无需更改共享路由解析器。

## 验收与测试

准备阶段先在未修改产品的d38793e生产构建运行新E2E的真实失败子集。两条直接现有query控制必须绿，证明页面/数据/模型可用；新增卡、脏状态打开、复制等因当前缺少预置入口而红。记录实际失败原因、命令和计数，不把探针当产品测试，也不把未运行的矩阵写成通过。

新增tests/unit/duelPreset372.test.ts在局部helper落地时锁住：恰好两条元数据与中文；明确185872门禁/其它build空；严格a/b/m新query、c/team[]/时代；实际parse/resolve无回落、精确当前模型科技集合；canon幂等和两种项目base的静态share子路径。该合同已经由固定基线probe核对可实现，不需要改算式或数据。

新增tests/e2e/duelPreset372.spec.ts覆盖：

- 精确两卡/标题/说明/版本/实际href，原#duel和新节的兄弟关系。
- 每卡从旧N vs M、资源预算、采集时间及已保存升级/团队配置打开，规范query只a/b/m，实际单位/文明/时代/c预设正确，打开后计算器标题进入视口；刷新恢复。
- 每卡真实clipboard复制，当前URL完全不变；检查当前project base下静态入口，重开及刷新恢复同一配置。
- clipboard失败时完整可选只读链接与反馈，切换旧模式后反馈清理。
- 360/375/390/1280 × light/dark：无横向滚动、console/pageerror，所有动作≥44×44、数值nowrap，section与main标题顺序无跳级，WCAG AA；在默认test-results保存全页/卡片截图。
- 两条精确原生query控制保持现有模型与规范URL，在准备基线亦通过。

只将新372 unit/E2E精确文件名加入既有PROFILES.duel，保留原URL/golden、#364语义及共享默认控制和全部原期望，不录制/改写goldenfixture。按现有duel影响范围做一次适用验证，不再执行#364的184视觉矩阵或未变数据再生成。

在现有feature==='duel'短烟测中增加两条exact href→打开及一次真实clipboard→静态入口恢复/刷新，同时保留原#364默认/展开/不可用/浮层/共享默认检查。main和Release消费实际plan与真实footer，root接续实际线上/Release核对。

## 交付顺序

规格与真实first-red先交bug_scope_audit独立preflight，再由root确认允许改产品。实施者不代写独立结论。适用本地检查和四宽明暗通过、最终实际HEAD构建短烟测完成后，确认无已有PR，再push单issue PR；独立finalreview可与远端CI并行，root合并前两者均须通过。PR，Fixes #372，标题按feat(#372):格式，提交身份沿既有非noreply邮箱。不自行合并；root负责GitHub授权状态、CI/merge、实际部署/正式Release。
