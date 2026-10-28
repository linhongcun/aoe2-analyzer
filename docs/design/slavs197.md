# #197 第十二批：斯拉夫农田供需稳态估算（v0.57.0）

2026-10-28。维护者已要求继续处理下一批文明并持续发布，本批选择斯拉夫，[范围记录](https://github.com/linhongcun/aoe2-analyzer/issues/197#issuecomment-6465909121)。实现基于main `7d748918e4708934a10b34631488b38a7ffd40b3`、tree `560d74b342f315e516fd4e1ede8b839711078a19`（v0.56.0），目标v0.57.0。仅将斯拉夫迁入默认团队关闭的当前支持集合，48→49/56、未支持8→7；父issue保持开放，Refs #197。

## 来源和当前范围

固定DE185872、auto-mods `0c38027504532826c9922e4db77e2c1d33554291`，DAT SHA256 `4aa2f0a719e88e5f1502517eddb27c669aeb40c2fe9d8c4f3eec7751c01e7baa`。[管线固定源](../../scripts/data_sources.json)、[原始DAT上游](https://github.com/SiegeEngineers/auto-mods/blob/0c38027504532826c9922e4db77e2c1d33554291/dat/empires2_x2_p1.dat)、[独立来源报告](slavs197-source.json)与[公开语义核对](slavs197-public-sources.json)可追溯本批数字，不提交DAT或下载缓存。

已核Civ23、tree effect7、team effect9、9专属科技、完整178科技闭包及当前/专属所需380原始对象。tree7是效果号，不是科技7。214/259农民workRate原始倍率约1.230000019，50/1187农田供应workRate原始倍率约1.149999976；前者消费、后者供应，不是同一对象上两个可相乘的采集奖励。完整34条树命令保留在来源元数据。独立raw原件4.6MB及163→178闭包补件保留审计指纹，未伪称额外Caravan对象也已捕获。

农民基础按现有eco规范化为workRate .53、carry10、speed .8；独立农田供应基础由现有cache WorkRate round4为.4。farm50/1187的type80、class49、capacity15也保留核验。Make Action21生产resource16，Gather Action5由214/259消费并转食物，resource190为1；这些完整任务字段由固定raw核证，未扩大dat_source缓存协议或假称动态检查未导出的WorkRange/任务字段。

[固定公开Make实现](https://github.com/librematch/genie/blob/74331ec61ff1a2462f219d5a0bda6e4523537aff/crates/engine/genie-core/src/gathering/make.rs)与[Gather实现](https://github.com/librematch/genie/blob/74331ec61ff1a2462f219d5a0bda6e4523537aff/crates/engine/genie-core/src/gathering/gather/work.rs)仅作独立供给语义旁证，其自述版本为158041，并非当前DE185872客户端实测。Make启动可清池的反例说明不能把DAT Food15直接当作新田初始15食物。本批不发放初池、村民或人口，正常起始仍3村+侦骑、人口4/5和200食物/200木头/100黄金/200石头。

当前8套共228动作、11块田分5个建造步骤，但只有fast-castle-boom和fast-castle-knights各显式分配4名farm工，其余6套没有farm任务。沿用既有任务分配即计收入的抽象，不引入已完成田块与农民绑定。当前全部训练/升级/研究合法，包括骑士38与222→75，不添加骑士通用模板警告。

## 供需公式与兼容边界

先按已有携带/往返公式求消费者均速：

`Qc = C / (C / Wc + 2 × d / V)`

其中Wc从实际农民基础与通过来源核验的decoded farmer倍率计算，C/V包括已经实际完成的标准科技修正。独立供应`Qs = farmBaseWorkRate × decodedSupplierMultiplier`，有效斯拉夫农田率为`min(Qc, Qs)`。标准数据对应`.4 × 1.15 = .46`；完整raw guard仍保留原始float，不混用raw乘积约.4599999973作规范化期望。

供给可在农民行走时独立补充，因此先算消费者往返均速，再取供应上限；不先cap工作率再扣一次行走，也不把1.23×1.15都乘到农民。runOnce与gatherRate共享同一个有效率helper；gatherRate的workRate仍表示消费者纯工作率，rate才是含走路且受供应限制的收入，extraIncome为空。来源context按run/scope计算，不在0.1秒tick比对34条raw。

默认near2时旧Generic约.4189723、斯拉夫消费者约.4916475，稳态估算为.46，相对旧Generic约+9.79%，并非恒+15%。near1时旧Generic约.4679912，甚至高于新估算.46；这是保留旧通用公式造成的工具口径差异，不代表游戏内斯拉夫加成是减益。其它55文明的既有公式保持，未顺手给Generic或罗马增加供应cap。

独立physical来源与可移除bonus分开：整个farm bonus行省略后仍用斯拉夫同一供需模型，取消两侧倍率，变为`min(基础消费者往返均速,.4)`，不切回旧Generic。坏的现存bonus整组拒绝，但有效physical能力保留；physical本身坏则不声称新模型。UI不支持时整页Generic回退与低层独立能力分开。

213独轮手推车的carry/speed按原实际研究完成入口生效，不提前或重复应用。马轭、重犁、轮作的总储量不变成收入倍率；既有重犁+1carry保留。不扩展全局研究时代/队列、田内路径、四角停点、食物池初始化/瞬态、离散交仓、耗尽或续种；本模型不声称当前客户端等价。

独立真实成本工具保持原公开来源×1.15、原速率和“农田采集+15%”标签。两工具口径不同，不为统一数字修改realCost。

## 完整来源与团队边界

新增封闭可选`slavicFarm`，仅导civ23与50/1187各unit/type/class/workRate/capacity；这些实际导出字段全部受运行时固定源核验。原farm树行追加`slavicTree`完整34raw，无正tech；原510/511分别追加`slavicTech`完整raw，721另存source=team/effects=[]的完整规范行。生产器强保留wrongciv/site/effect-1/unknown-only和空decoded规范行，交运行时拒绝，不能把坏来源丢掉后伪装成合法整行移除。原11全局和其它55 civEco由真实生产器测试逐字比较。

农田bonus必须恰一完整行，source/name/age/无requires等header、男女农民命令、两个farm变体、decoded三项、原始34命令均匹配才应用两侧倍率。缺项、重复、未知伴随、漂移或坏header整组拒绝；free-techs也核完整两项身份。510/511整行移除保留独立farm，未知非团队行不借通用attr执行。Slavic raw标记复制到其它文明时，即使effects为空，支持判定与direct helper也拒绝；用字段存在识别标记。

721/e758的12条Type10确为团队军事建筑+5人口，不因team effect9为空或decode不认识就消失。本批不实现团队人口：默认team=false不参与；team=true调用的assumptions明确“团队军事建筑提供人口未模拟”，不全局放行Type10、不假加人口。

## 页面和分享

只有实际farm分配的两套FC在notes、model.assumptions及share basis统一显示：

> 农田按供给上限连续估算，近距离可能低于原通用估算，不代表游戏内加成减益

详细假设另说明：

> 斯拉夫农田先按携带与往返计算采集均速，再与独立供给上限取较小值；食物池启动、田块完成与人数绑定、耗尽和续种未模拟。

其它6套civSimNotes=[]，即使含建田动作也不宣称有farm收入，不插新农田收益说明。分享沿既有boId，不扩大team URL/API。Slavs0工具行明确连续估算已计入；Slavs1纵火/软甲是当前不研究的战斗科技，明确未计入时间库存，保留#332原历史15条与13文明snapshot。

推荐列表斯拉夫enabled且无ban，不改BO推荐名单。四宽360/375/390/1280双主题、估算、分享/实际PNG、跟练、打印和Generic fallback列入相关浏览器范围。新增数字使用现有nowrap规则，不改全局CSS。PNG仅存/tmp及现有CI截图artifact，遵守AGENTS不提交图片。现有deployment-smoke builds段增加FCboom、scouts、bonus0短探针验证公开UI，未改workflow、权限或基础设施。

## 本次已执行与保护

[真实先红](slavs197-first-red.json)基于原M：89TS=25通过/64语义断言失败，10py=1通过/9语义断言失败，0导入/环境/运行时错误。480原输入、527保护文件及5个新文件SHA前后保持。随后同99在v057 WIP首次全部通过，未冒称未来提交已重跑；[追加边界红绿与原99绿记录](slavs197-green-boundary.json)保留真实分段结果：2项新断言先红，首次修复1过/1仍失败，仅恢复剩余header1项；合计91TS+10py为101个不同新用例，不称一次101全绿。新测试后续仅格式化，规范化AST证明断言/输入语义相同，精确原红稿留存。

必要type、lint、prettier、strict layers、46份strict内容和8套BO检查通过；真实eco_build对账0，现有6个compiled边界生成一致。相关旧5文件首次164通过/1失败/1既有TODO；失败为新启用Slavs1缺工具结论，生产说明补齐后仅该标题通过。旧#332十五项与13文明snapshot在首轮实际执行并通过，没有改录。

独立原main基线仅一次采集（UTC09:56:30.691→09:57:10.836），448完整/1512helpers/224cost/56notes/56support，48/8，保护527/源480/11旧globals/原317旧84，SHA256 `016f3eabf65ff1300b1e0312e8c3c6c93edb915fb91efbab43860486d8a66230`。CURRENT8文件25精确span按独立oracle迁移；#331 TEAM22及3历史snapshot不含Slavs，整组保护。#322 scouts-Slavs旧数值与其它20个e2e对象、6048个unit keys保持，在A实际原DOM观察及独立精确分类后仅迁移4处当前支持文字；其余126行、全部数字、其它20对象和raw前后缀精确保持。原22项金标准随后一次22/22通过，0跳过/不稳定，不使用record或过滤。

原#317只追加真实slavicEconomy源码指纹，without/runBo/firstChanged/SIM_CHECKED/UPDATE算法与旧84值保护。farm bonus为treeOnly，无正tech，不能捏造tech7或改筛选强造农田键；整行bonus取消已由独立库存测试核对。原生成case唯一实际执行为1通过/12过滤跳过，实际84→85，仅新增`Slavs-2:null`，原84逐值不变；它是当前8套不训练对应单位的攻城费用项，没有模拟on=true声明，不机械新增UNTRIGGERED。正常whole-file随后实际12通过/1个UPDATE关闭跳过，没有再次生成。fixture实际inputs为`dc2925fb2a981569546c984b7d2fe0b23ce59941c9b9e84177da91def4bb21a7`。

本地不可变运行时A为`c61bfc82cefd1bf920e377c7c67136386ba56a7e`、tree`8fc5044af6fc84965e6433176cb4c28f0bcdfa6a`、v0.57.0；[实际验证快照](slavs197-validation.json)记录其唯一构建、一次9项浏览器验收和57路由既有部署烟测，源输入与1695份dist前后稳定。四宽双主题9/9首轮通过，0跳过/不稳定；[独立图审](slavs197-ui-review.json)亲看40原图中的22张（含4张真实下载PNG），其余18张仅清单/哈希核验，不冒称全部亲看，图片不提交。

量化与最终文档边界：[8份斯拉夫及其它55量化](slavs197-runtime-quantified.json)分别实际捕获，6套无farm的完整/数值结果无差异；两FC分别8/10条数值路径变化，涉及Food和early误差带，真实封建/城堡clickAt与reachAt均未改变，不承诺提速。比较基线是当时直接调用Slavs低层API的保存结果，不自动等于旧UI的Generic回退，更不证明游戏内收益。其它55的440完整/数值、1485辅助、斯拉夫24非farm辅助、全部224独立真实成本，以及55附注/支持和11旧全局/55raw均无差异；斯拉夫3个farm helper按距离1/4/7分别核验，当前支持49/7。

后续文档与4处当前UI期望提交只补证据，不冒称在未来head重建或重跑本地A。实际A的481输入、policy与dist身份保持；完整CI、正式main部署和Release仅在后续PR/run中按真实结果记录，本快照不预报成功。

## 不在范围

其它7未支持文明、Generic或realCost农田改模、初池15赠送/田块数量绑定/瞬态池/耗尽续种、策略/推荐名单变更、军事作战或团队人口实现、全局研究时代队列、dat_source缓存协议、依赖/CI workflow/全局CSS、未经授权旧golden数值重录。
