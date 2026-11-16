# 历史补丁的人工核对输入

`data/sources/history_inputs/` 保存按官方主版本平衡栏目核实的结构化输入。运行 `python3 scripts/history_build.py` 生成 `data/game/patches/*.json`，并把收录情况排成 [`docs/reports/HISTORY-DATA.md`](reports/HISTORY-DATA.md)；不要直接改生成文件。

增加或纠正历史记录时：

1. 实际打开官方公告，区分公告日、正式发行日、PUP、正式定稿和同页追加热修；只引入已核实的版本与规则分支。`releaseDate` 保留官方发行日历日期，`announcedAt` 保留公告当地日期；`sourcePublishedAt` 保存官方 `article:published_time` 的完整带时区时间戳，`publishedAt` 必须为其换算的北京时间日期，不将来源发布时间冒充发行时刻。
2. 按官方顶层 bullet 编号保存原文与映射。普通、精锐、不同属性可以拆行；同一父项目的嵌套内容须完整保留。没有正式变化的项目写入 coverage 表并给出排除理由。
3. 每条中文摘要引用 `sourceBullet`、同一官方 URL、核对状态与证据类型；没有明确旧值时不补造前值。直接单位/科技用当前目录的稳定身份；已删除、被替换或复用 ID 的内容建独立历史档案。
4. 使用原文中的历史数值。当前目录只校验名称与身份，不能以当前 DE 数值替代历史旧值或新值。仅有来源说明而未持有历史 `.dat` 时，如实保留证据限制。
5. 在 `history_build.py` 登记已核对的项目数、原文清单摘要与日期。更新清单摘要须重新核实原文，不能为通过校验删除未映射项目。
6. 运行生成、`--check` 和相关 Python 测试，并交独立代理复核实际提交和来源。

本文不授权自动抓取其他站点或把全局变更按当前科技树推给所有文明。关联仅表示已核实的一部分，详情页须持续显示收录边界。

## 文明更新历史

`data/sources/civ_history/catalog.json` 逐项对应当前文明目录与指定 Seicing 页面。
`sections/*.json` 保存逐页审阅的有界日志原文、实际采集时间、HTML/章节指纹和每条处理去向；不提交整页 HTML 或联网爬取工具。
页面存在但无日志、未找到页面、取得/导入待核分别登记；读取失败不能写成没有页面或没有日志。
社区原文导入不等于事实核验。原文中的未知版本、替换字符及对象歧义保留原貌，待核条目写明原因。

`events.json` 和 `identities.json` 是显式事件/主张/效果及身份映射。
事件、主张、效果、来源条目 ID 一经分配就保留，离线生成器不从数组位置、中文名或可变原文重建身份。
前 DE 版本标签按原文与分组登记；`orderKey` 只用于比较已知版本顺序，不代表发行日期。未知日期仍为 `null`。
同一原文可映射多个版本事件，一个事件可以保留多个来源及多个主张。跨页合并必须写入精确源键与人工核对理由；共同版本/文明只生成待核对应，不自动合并。
更名、普通/精锐与退役 ID 独立处理；未解析身份只保留来源名称，不提供猜测的当前链接。

来源页面更新时新增 revision 快照，保留旧文件、旧条目 ID 与旧主张。
用 `supersedesRevisionId` 和 `supersedesEntryIds` 显式登记新旧对应，再复核事件引用及目录中的快照指纹。
不能通过替换原文、减少 `observedEntryCount` 或删除旧 revision 让校验通过。

`legacy-map.json` 对每个旧 `patchId:entryId` 给出迁移目标或原档案保留理由。
生成器读取只读旧档案，完整保留原记录、档案元数据、官方证据字段、历史投影和 `archivedTargets`；不手抄旧历史另起一套值。
无明确文明关系的旧记录仍由版本档案查询，不从今天科技树补文明范围。

运行 `python3 scripts/civ_history_build.py` 生成载荷与审计，再运行 `--check` 验证复现。
输入与审计逐文件使用 `content-civ-updates.json` 的独立 `$defs` 校验；运行时 standalone 边界为 `civ-updates`，不替代旧背景摘要 schema。
这条链不随 `data_update.py` 改写社区快照，也不实现单位、建筑、科技的独立历史库。
