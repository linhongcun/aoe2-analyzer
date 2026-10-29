# 女真 #197 第十四批实施规格

状态：基于当前main `6b9cc7eb3ddef630888145cdedd8be73f7deaf0e`（v0.59.0、DE188329）集成女真，目标v0.60.0，50→51/56、剩余6→5。旧候选A `805396e8bfc7ecb2799038fc9be7df6e3a837a45` 及79项先红、两处新fixture输入修正和当时验证仅属于旧DE185872；不重标为当前188329执行。本次当前源已独立重新核验，当前数据与9项CI策略/historical浏览器基础设施发生实际变化，当前验证以新实际运行记录为准。

## 范围

- 只新增女真在现有8套开局、普通起始、默认团队关闭下的明确支持边界。既有连续、资源不耗尽、固定距离模型不扩展腐烂/动物总量/耗尽、田块/空间、战斗、自动策略。
- Source agent已读固定DE188329的女真Civ52/tree986/team987、11专属、132规范化闭包；完整独立来源核验已完成，0未解决问题；候选报告SHA256 `7b2c941dc7804bb10bf4c9775e9c6e58a3e39edc4b37d830f007dec9294eccfa`。公开文字help120201说明牲畜和猎物肉不腐烂，无采速或携带倍率。
- 993/e993原始完整header为civ52、effect993、requiredCount0、requires[]、researchLocation-1/researchAt[]/researchTime0/cost[]；命令唯一Type1/A292/B0/C-1/D1。不能把res292 set1当作采速、携带、食物赠送或产量倍率。
- 995/e995完整31命令：14条木材费用×.25、17条研究时间×.5。当前8BO研究14/22/199/202/203及时代101/102/103均不相交，不产生当前库存/时代收益。原generic费用/时间逻辑保留，受控合法研究另行证明真实收费与完成窗口。
- 女真没有骑士，tree986 Type102.D166禁用，公开unit38 disabled。骑士方案明确仅通用经济模板；其他7套当前动作/研究可用性由source完整核验。普通起始仍3村民+侦骑、4/5人口、200F200W100G200S，免费村民/额外住房/资源均不新增。

## 运行时来源门控

- eco_build复用raw_tech_context，将993/995各完整原始记录作为jurchenTech附在该文明对应bonus行。仅新增女真字段，不追加全闭包/大tree或全资源对象到eco；unknown-only的这两个tech仍必须输出空effects+完整raw，不得在decode中过滤消失。
- 使用小型jurchenEconomy.ts保存已核来源形状、完整raw/decoded一致性、状态与说明；所有数值来自eco记录，模块不新增收入函数。必须对source/civ/tech/effect/header/前置/地点/时间/费用/命令顺序、数量、完整配对做fail-closed校验，不能凭资源编号或技术编号单独放行。
- 仅当前Jurchens的有效993/no-decay行可以归类irrelevant（模型不计算腐烂）；保留UNHANDLED_RES[292]旧共享文案与其它文明/独立成本口径。未知/多余命令、重复source行、外文明移植标记、伪空行、错误完整组均不得悄悄支持。
- 完整995仍走原有generic techCost/techTime应用；坏raw/decoded整组不应部分应用或声称当前已计入。整组移除是合法底层反事实：省略该组，不出现相应已核说明；缺少必要组时选择器来源不完整，保持不支持，不把合法整组移除叫损坏数据。
- schema只为bonus行增加完整jurchenTech必要结构，沿已有raw tech定义复用（字段相同可用$ref），扩展原data-eco schema并经现有validateDocument/content检查验证；既有6处预编译边界保持并核验一致；不放宽additionalProperties或schema全局规则。

## 可见说明和状态

固定常驻说明：**按资源不耗尽估算，尸体腐烂与耗尽未模拟，不腐烂收益未计入**。这条短句兼顾普通分享单条附注的固定24px一行绘制；不得通过裁切、缩小字号或改固定画布来藏溢出。

仅fast-castle-knights增加：女真没有骑士；骑士方案仅供通用模板经济估算。

- civSimNotes与model.assumptions使用同一常量；shareCard现仅显式接Slavs/Khmer，本批将Jurchens加入同一路径，让分享URL/实际PNG、跟练和打印口径一致，不加新CSS或布局。
- 995当前8套均未研究的说明放估算假设、bonus3用途和文档；不能暗示当前时间线提速。常驻分享只保留腐烂边界+必要骑士警告，控制固定1350高画布。
- Jurchens-0用途明确on=false，未模拟腐烂/耗尽且不增加采集产量，不把irrelevant写成已计入。Jurchens-3按当前BO无交集写明确未触发；不造positive317映射。
- 选择器女真启用，中国等剩余5个继续禁用；女真分享不再回落Generic，Generic及其它不支持文明不继承女真说明。保留空/错误来源负例门控。

## 先红与验证设计

测试只import既有公开API，避免未实现新module导入错误；负例使用source独立canonical原始fixture，不因旧eco缺新字段产生TypeError。

1. 完整生产女真source支持；全部8BO有腐烂边界，只有FC-knights有模板警告；bonus0/bonus3不虚称收益。
2. 公共classify/simSupport对missing/bad/duplicated/foreign993及995、unknown-only和完整头/命令/decoded不一致逐组failclosed；所有错误为语义断言，不能用import/runtime失败代替先红。
3. helper各任务/距离及当前8套完整开局整组移除对照：993完整/whole removed之间无产量、携带、工作率、库存或时钟额外收益。不要声称等于旧UI，基线捕获是旧低层女真；新UI先前实际按Generic。
4. 当前8BO全部数值投影与冻结旧低层女真完全相同，说明/支持是允许差异。其余55 full输出、notes/support、1485helper、所有224真实成本、55原始civEco和14全局段保持（实际计数以root唯一基线为准）。
5. 合法castle Masonry50：显式大学已完成，固定费用175W/150F、50s；完整995后44W/150F、25s，whole995恢复175W/50s。必须在实际扣费后的单独检查点比库存，记录实际研究完成而非只看开始。非TC研究按现有0.1秒时钟包含起始tick，即名义25/50秒对应doneAt=researchAt+24.9/49.9；不改时钟来凑整数。通过共同的30村民检查点锁同一实际时刻，以没有研究动作的控制组核44/175木和150食物付款，不把研究开始库存当付款后库存。本批不扩SiegeEngineers377城堡可用性实现。
6. 真实producer在临时ROOT实际生成993/995完整header，原raw含未知companion/unknown-only仍可见；错civ/地点/effect等必须如实导出，不能消失。其它55行/全局段逐项保持，summary由build_sim_source.py --civ Jurchens --tech993 --tech995 --tech166生成，≤64KiB，--raw-output仅忽略cache。
7. 原#317只运行一次既有生成器，自然追加（若有）与新源码指纹；旧86值逐项保持，原观察算法/比较器不变，不伪造收益键或强造firstChanged。原#32222/#331整组3快照/19文明历史fixture不变。

## UI规格与一次实际浏览器

360/375/390/1280×浅/深，现有tokens、字号≥12、touch≥44、.num/.nw，检查无overflow/console/pageerror。 主附注复用 `.tl-civ-note`，`--fs-xs=12px`，`--color-muted` 浅色 `#636366` / 深色 `#a1a1a6`，正文行高继承 `--lh-body=1.65`；画布附注沿现有24px，分享/跟练/打印复用既有样式，不改CSS或renderer。每宽检查scouts或archers常驻边界、FC-knights额外警告；打开分享卡检查基准文案和civ=Jurchens URL，360浅做axe。仅360双主题实际下载普通/骑士各一张1080×1350PNG，共4张，不在四宽重复固定画布下载。独立审看全部实际下载PNG及四宽代表原图，按现行artifact上传截图不提交PNG。

另单用例覆盖其余7套note差异、选择器/直接URL/回退、跟练与打印保留同口径、bonus0明确未计与bonus3当前未涉及。既有builds短烟测增补本批必要页面，工作流/权限/依赖不改。

## 完成条件

新code/test/source/独立UI审查无未解，适用一次full/data（核心coverage与producer变更）、main按可信同树策略继承但真实构建/短烟测/Pages，再正常自动Release实际线上功能与ZIP/SUMS同物理文件独立核验。一个PR Refs#197，父OPEN与feature/候选/待确认不动，交付后51/56、剩5，不开始第十五批。

## 固定公开来源

- [DE188329 DAT pin](https://github.com/SiegeEngineers/auto-mods/blob/e293dc106b0f3b0ceac2db98409fbcc5c921190b/dat/empires2_x2_p1.dat)：原文件SHA256 `d0aefd92428e2215d6f4d9b1d544901e6f171e19183f9e0b88218de5153a337f`，Civ52/tree986/team987，11专属、132引用闭包。
- [固定科技树](https://github.com/SiegeEngineers/aoe2techtree/blob/e56728e76b7d08301fba7b18d5f16bc8554c109a/data/data.json)和[中英文原文](https://github.com/SiegeEngineers/aoe2techtree/blob/e56728e76b7d08301fba7b18d5f16bc8554c109a/data/locales/zh/strings.json)：help120201肉不腐烂、攻城/防御费用与研究速度；女真unit38不可用。
- [固定UGC资源指南](https://github.com/Divy1211/AoE2DE_UGC_Guide/blob/d9d63e28c1a1ac7dcc87214f778ac385b48f45a1/docs/general/resources/resources.md)佐证292含义；仅作术语佐证，不能冒称188329客户端实测。33必要对象经济字段及601资源核验在忽略审计中，不复制到仓库。

## 当前数据集成与历史证据边界

主线#486已同步DE188329并正式占用v0.59.0，本批保留其所有数据、188329更新日志、九项CI策略及历史浏览器机制，女真改用v0.60.0。当前188329实际DAT对993/995/166、完整tree986/team987、11专属和132闭包及33必要对象、601资源的核验与旧样本逐字段相同；当前e567固定公开data/en/zh也已重新全文核，仍七套动作合法、骑士38禁用。canonical fixture字节相同由当前解析证明，不能仅换旧来源标签。当前source-summary必须以当前loader真实重新生成，不用历史--pin-from。

原79先红与旧A实证保持在原提交/证据文件中；当前来源与关键缺口的静态parity支持移植原用例，当前79修正后单测、producer及必要数据/基础设施检查会重新实际验证。#317从当前main的86项原件出发，当前源稳定后再按原算法生成一次；不得复制旧A的inputs或强造新增结果。当前#322/#331仍按最新main当前站点验收，只有#372/#441按#486既定机制访问固定v0.58.1/185872历史站，本批不改其受试站点。

## 当前必要教学来源审计迁移

当前188329实际72项TS与7项Python均通过；必要7文件相关检查初次225通过、1个来源投影SHA失败、1既有TODO。该失败只由新993/995两条完整raw来源字段引起，删除这两字段后完整eco对象按同一JSON.stringify契约精确恢复当前main，所有教材事实、其它55文明、14全局段和6552路线限定均未改。独立逐字段审查后，仅教学manual audit.eco记录当前来源投影SHA，并在[来源元数据审计](jurchens197-teaching-metadata.json)保留原e62/currentaf5、两精确路径与来源SHA和逆恢复证明；原#486证据/测试/比较器/其它audit/content指纹/patch/日期全保留，不加宽过滤。只原失败标题恢复通过，未重复7文件整组。新的当前#317及不可变候选构建、浏览器、完整对照和CI以随后实际记录为准。
