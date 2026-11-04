# 开一局的手工对手、队友与真实部分对阵（#672）

基线 actual main `f180c208c0a14dbf254ca9959c8e561cdf4829bf` / tree `fa773f9656267e67f8acabf38132405f1b2cfa40`；版本 v0.77.16。#676 已交付关闭，独立 v5 设计/接口再核通过。只接手工选择与现有工具，不接游戏客户端、不做禁用位、不改推荐、胜率、Team Fit 算法、数据或 CI 策略。

## 本局状态与操作

唯一 StartChoice 增加运行时必有 `opponent: string|null`、`mates: string[]`，默认 null/[]；0–3 个已知文明，保留顺序和重复，允许与己方相同。队友仅组队且人数已选时适用，不按2v2/3v3擅自截断三名上限。

对手步使用现有 CivPicker，可选择、改选、清空，选择后仍留当前步；完成不必填。对手步和摘要明确显示实际己方文明芯片。摘要的对手已选显示真实名称，空且未跳过为“未选择”，主动跳过为“已跳过”；对局助手两处入口都带真实双方，包括单方和全空。

文明步组队时显示“队友已选文明（可选）”，用真实 picker 加入1、2、3名、逐项修改/移除；没有持久空槽、不自动选文明。手工大厅沿现有模式/地图/路位补全，继续明确没有连上游戏大厅。队友不参与当前机制排序，搭配在文明搭配页查看；#666 有来源参考与诚实缺条件保持。

| 操作                          | 对手                                | 队友                             |
| ----------------------------- | ----------------------------------- | -------------------------------- |
| reset / 再开一局 / enterLobby | null                                | []                               |
| 选/清对手                     | 实际值/null；清 skipped.opponent    | 保留，留对手步                   |
| 跳过对手                      | null；skipped.opponent=true，进摘要 | 保留                             |
| 普通完成                      | 保留，空不自动标skip                | 保留                             |
| 改地图/路位/己方文明          | 保留                                | 仍组队则保留                     |
| 明确1v1 / 跳过模式            | 保留                                | 清空，同时清原路位；回组队不复活 |
| 改组队人数                    | 保留                                | 保留至多三名，不按人数截断       |
| back / edit / jump            | 保留                                | 保留                             |
| 增/改/删队友                  | 保留                                | 精确更新，不推进、不重排         |

沿原下游skip与#667输入清理规则；对手非空不得与 skipped.opponent=true 并存。

## 唯一 v1 协议与完整返回

保持 local key、envelope version1、sgv1与恰两键sgv/sg；只在中立 `domain/startGameCodec` 扩展唯一校验/重建点。旧v1分别缺 opponent→null、缺 mates→[]，允许独立缺省；旧必需键仍必需，未知字段仍拒绝。出现的新字段必须严格合法：对手null/已知EN；队友数组0–3、每项已知非空EN，错类型/未知/四项/空项均invalid；非组队非空mates invalid，不静默修复。

对手仍是可选步骤，普通空对手摘要合法。4096-byte payload、12352-byte query、单次解码、版本/重复参数/坏UTF8、地图异步验证与pending/failed/invalid零写、URL优先及epoch/attempt竞态全部保持。新状态规范编码含两个新字段；旧客户端读取新字段不在兼容承诺内。

#667 两套独立配置和flags完整保留；#676三处查看仍从最新完整state生成同一来源。查看另一文明→切tabs/history→刷新/新context→显式回文明步仍保留己方、对手、队友、两配置和原flags；查看不选择。安全root-return只交同一codec，不留第二份旧白名单。

## 显式部分对阵

新增 opt-in `pair=explicit`，只有此协议可表达未知侧；原无marker的#520默认/逐方sticky/无效回填和旧writer/path保持。

| 地址                                  | 实际选择              |
| ------------------------------------- | --------------------- |
| pair=explicit&me=Mongols&opp=Japanese | 蒙古/日本，完整可分析 |
| pair=explicit&me=Mongols              | 蒙古/null，补选对手   |
| pair=explicit&opp=Japanese            | null/日本，补选我方   |
| pair=explicit                         | null/null，补选双方   |

只要出现pair键就不退回legacy。marker恰一次且值explicit，me/opp各至多一次，缺键才为空；空值/未知EN/重复侧键/坏或重复marker整体invalid、双方null，保留坏地址到用户操作并提示无效。相同文明合法。新nullable writer clone query，只管理pair/me/opp，删除空侧键，保留rush等独立参数；Home所有入口统一新协议，包括双方完整。

picker补选/换选/清空保持marker；legacy首次清空可切explicit并保留另一真实方，旧完整换选继续legacy。sticky仅legacy或显式有效完整双方同步；显式partial/empty/invalid两方都不写。刷新、同SPA、新context、前后导航不读sticky补缺。

Matchup所有hooks保持稳定。双方不齐时只显示标题、两个picker、准确缺方提示和已知文明资料入口；不调用matchup/filterCounterUnits/rushDrill/counterExtra，不挂载RushDefense，不渲染vs标题/分析结果/当前对局文案/依赖双方的Builds/PK链接。不能先计算后CSS隐藏。双方补齐恢复原完整分析与加载/失败路径；清空任一方立即退出分析，rush保留。legacy invalid仍按原真实回填显示，不受显式invalid guard误伤。

## 文明搭配的真实预填

文明步与组队摘要入口只调用 `'/team-fit?'+encodeTeamFit({candidate:choice.civ??'',mates:choice.mates})`。URL恰v/mates/candidate三键，不添加from/returnTo/地图/路位/对手等额外键。实际目的页button的data-value必须与来源精确一致；空候选保留队友、提示先选候选、无结果、复制禁用，不补法兰克。原严格decoder、算法、重复/顺序和onward links保持。

## 验证与四宽状态

在公开v0.77.15先记录真实失败：手选对手缺失、手工队友入口缺失、显式两向部分态仍回填/计算、含新字段不能严格恢复。失败不能只是新import不存在或错误选择器；保留真实版本/SHA/前提证据。

unit覆盖事件清理表、独立旧字段迁移与严格负表、真实local/URL/安全返回完整状态；保留原pending/failed/invalid/竞态断言。Matchup在真实loaded数据与>0完整态正控制下，证明partial/invalid所有计算函数零调用且RushDefense实例为零；同URL异步资料到达/失败不造默认。原520/558兼容不减。

Home新测试声明持续放已登记routes652/mechanism652，近600行的592/632只原位迁移/增强fixture；不另建未注册Home case文件，不改CI策略。旧671对手披露迁移为实际手选/未知语义，但保留完成/skip/真实目的页/Maps与Ladder限制；676完整等值断言加新字段，不放宽为部分匹配。

360/375/390/1280取实际状态图：组队三队友、已选对手摘要、1v1空/跳过摘要、Matchup两个相反单方空态；至少20张，390深色其余浅色。真实UI覆盖0/1/2/3、重复/改选/移除/上限、空己方TeamFit、双方完整/全空/双向单方/invalid、刷新/分享冲突local/历史与676返回。PC主验收，窄屏自然换行/抽屉；无横溢/consoleerror/pageerror、触点≥44×44、字≥12px、WCAG AA，沿现有语义tokens与Lucide。

最终精确SHA/tree、实际build/test/20图由实现者之外代理独立终审；full适用CI、main/nativePages、公开专项/身份/manifest、正式tag/source/两次bytes/全部文件hash/completedobserver全部实际PASS后标已部署关闭。

新增 Home 对手/队友 picker 与显式 Matchup picker 在桌面也使用局部最小44px高度；不修改共享 picker。按实际1280几何核对，不借窄屏默认尺寸冒充桌面通过。
首页新增文明选择器按需加载共享模块，避免把搜索索引同步带入首页入口包。加载中不改已填信息；失败显示可重试提示，重试成功接收最新选择；离开步骤后忽略旧加载回调。保留既有入口静态依赖断言。
