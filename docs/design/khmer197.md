# 第十三批高棉：免回仓与独立农田供给（v0.58.0 实现规格）

2026-10-28，基于main4373aee3a619fc1435f1cecea4aaa766c3f0f34d/v0.57.0；本批范围 https://github.com/linhongcun/aoe2-analyzer/issues/197#issuecomment-6469372915 。本文件记录实际候选A `359e124c3a8135d7ddf97ca6d3d5da76647cc443` / tree `88593b1135da4260dff2140077d5973126cb402e` 的本地实现和验证；后续仅文档提交不改称重新运行。CI、Pages和正式Release以实际PR/run记录为准。目标仅高棉Khmer默认team=false从未支持迁入当前支持集合49→50/56；其它55输出、224独立真实成本与原#322全部数值及文字保护。

## 已核来源与模型

固定DE185872、auto-mods0c38027504532826c9922e4db77e2c1d33554291，DAT SHA2564aa2f0a719e88e5f1502517eddb27c669aeb40c2fe9d8c4f3eec7751c01e7baa。独立raw原件SHA27936ca1511614ebc7610ac56d545b567df8dbc70db4e91bc1152b1f22db6028（不提交），Civ28/tree646/team647、9专属、178当前闭包、369原始对象；[固定来源报告](khmer197-source.json)与[公开语义核对](khmer197-public-sources.json)保留完整candidate ce5eca09f73babc405c1bef17208fd887812a8456c2091a40191f5c7f4f63196及6份固定public全文指纹和链接，不提交DAT/cache。当前8BO共228动作，farm分配只在2套FC各4人，其余6没有farm任务。

654/e690完整命令是res33set50 + 男女农民214/259 workRate×.949999988079071；decoded倍率.95。没有农田供应倍率。res33是selector，raw本身不定义完整客户端即时入库实现，不能把旧引擎attribute96直接当成DE185872 res33定义。完整canonical654才同时启用免回仓与.95；一半、重复、未知伴随、坏header/metadata/foreign一律不应用该组。

Khmer-only有效farm率：消费者先按现有携带和往返求均速 `Qc=C/(C/Wc+2*d/V)`，有效率 `min(Qc,Qs)`。完整654令回仓距离d=0且Wc=实际base×实际decoded.95；独立农田供应Qs读规范化physical workRate=.4。标准Wc=.5035，结果=.4。没有完整654时恢复普通距离与基础工作率，独立physical供给仍=.4，不切回legacyGeneric。供应在消费者行走期间独立发生，因此先算carry/walk再cap，不先cap纯工作率再扣走路。

near2 legacyGeneric约.4189723可能高于Khmer.4；本页是有供给上限的连续估算，不能声称更快或固定净收益，也不代表游戏内高棉加成是减益。远7去654消费者低于.4，可单独观察noWalk的作用。额外base.workRate=.3探针揭示消费者支：完整654=.285，无carry/speed伪倍率；公共gatherRate与真实100/200秒库存必须一致。正常.53下carry/speed/213升级可能被.4供应瓶颈掩盖，但费用、研究时间和其它任务仍照原真实规则。

沿用既有按任务分配计入连续收入，不新增田块完成/数量与农民绑定、食物池初始奖励/瞬态、田内走点、四角停顿、离散即时入库、耗尽或续种；无回仓往返不等于无田内走点。固定DAT Food15不作为起始15食物。所有数字仅数据与声明数学模型，不称当前客户端等价。其它55与独立realCost的旧算法/标签/数值保留。

## 638免前置与完整来源

638“Khmer requirement”是Civ28无effect、无prereq、地点-1/time0/cost[]的自动科技。其本身通过完整raw header核验；独立于可移除654。完整638才认可ageReq现有Khmer自动叶子。整移除638取消该分支，坏存在638拒支持及该能力，不能继续裸用civ字符串绕过；普通两建筑/城堡等其它OR分支保持。

来源还核638被引用的216农田、659/660/661三时代及666/667/668建筑shadow节点。只针对本批已核Khmer请求验证合法前置；不得扩展其它55全局建筑科技队列或策略。正例需公开API证明三时代不建前置可升级、封建靶场/马厩不要求先兵营、农田不要求先磨坊；研究与训练仍需要本身真实地点/费用/工期，不能将免前置解释为免费建筑/提前时代。原8BO所有显式build动作保持、付费/完成实体照旧，不自动删磨坊/营地/军营或重排策略。

657房屋驻扎不等于住房，672只战象移速，team647只蝎式弩射程；当前8不涉及驻扎/战象/蝎式弩。保留相关完整raw canonical空decoded行，未知命令不可decode空后消失。已实现封闭可选schema：独立可选khmerFarm含civId与50/1187的unit/type/class/workRate/capacity；canonical638/654/657/672追加完整khmerTech；tree646完整24raw及team647完整6raw有独立身份；独立khmerPrerequisites导7个638引用与25/147/148共10节点完整cache头及命令，runtime只当前50/87/101/84与时代gate（149攻城武器厂等只留固定来源证据不扩实现）；metadata合同审计SHA7fc658e25d0a9841e1bfb267be99c0d927a0393c49cb903120ba838110e152b4，固定raw常量分khmerSource与khmerPrerequisiteSource，计算放khmerEconomy。不扩大dat_source全局缓存协议，不声称动态核验未导出的Make/Gather任务字段。坏physical则不声称新供应模型；有效physical在其它bonus拒绝时仍保留。foreign标记按字段存在检查，包括effects=[]及null标记，支持判定与direct helper均拒绝；未知非team行不得借通用attr回落生效。context每run/scope一次，不每tick比较raw。

## 页面验收

8套跨页notes/assumptions/share均说明：“当前开局免建筑前置已计入，显式建筑照常付费建造”。两套FC另说明：“农田按免回仓与供给上限连续估算，结果可能低于原通用估算，不代表游戏内加成减益”。详细假设说明取消的是回仓往返，田内走点、池瞬态、耗尽和续种未模拟。其它6不出现farm收益/附注，但仍保留合法638说明。页面当前8正常3村+侦骑、200F200W100G200S、人口4/5，无额外村民/住房/免费农田资源。

Khmer idx0免前置sim=true、idx1农田sim=true；idx0仍src=text，不伪造bonusTechs638、effects映射或#317筛选。当前无Khmer推荐chip，不改BO推荐名单。picker高棉enabled/no-ban，未支持Chinese仍Generic fallback。原#331TEAM22及3snapshot整组保护。CURRENT支持文案仅按独立oracle精准迁移；#317旧85值与without/runBo/firstChanged/SIM_CHECKED/UPDATE算法保持，只追加三份真实Khmer源码指纹。原generator唯一执行实际85→86，仅新增Khmer-1:null。默认near2完整654与整移除654均受同一.4供应上限限制，原firstChanged只观察doneAt/stock、不观察远端误差带；原观察投影没有变化，另由远7与低consumer真实库存窗口核对机制。

四宽360/375/390/1280双主题、设置/文明picker、FC2估算/详细假设、分享预览和真实1080×1350PNG、跟练、打印、nofarm模板与Genericfallback由root/UI一次适用build/browser核验。数字沿现有num/nw，44px点击/12px最小字体/现有token，不改全局CSS。截图只/tmp和已有CIartifact，不提交PNG。

既有scripts/deployment-smoke.mjs的builds分支增加短Khmer探针：FC2支持+farm附注/sharebasis/URL、6nofarm至少scouts无farm附注且有638说明、picker启用与Chinese禁用、bonus0/1用途状态。只扩现有feature探针，不改workflow/权限/CI基础设施。

## 本批验证分工

[原117真实先红](khmer197-first-red.json)记录37核心18过/19断言红，随后新70TS为10过/60断言红、10py为1过/9断言红，0导入/环境/运行时错误。实施首次107TS为104过/3断言红，10py全过；补齐真实普通研究地点与独立真实成本用途后，仅余3标题恢复通过。另合法整654反事实的两项展示断言独立红2→绿2，总119个不同新用例，未将分段执行称为一次119全绿。新文件仅格式化/拆raw数据，静态AST及完整JSON值证明原断言与输入语义相同。首次lint因两个新文件超过600行上限失败，按职责拆成三份生产文件及独立测试JSON后定点ESLint恢复，未改规则。本批保留真实UTC/exit/inputSHA及失败恢复：实现者执行必要新单元/py、producer、静态、相关旧兼容与一次原317；独立代理核来源与保护范围，root/UI在同一不可变A上执行一次构建、相关浏览器与烟测，独立采集并离线比较8+55运行结果。历史slavs等规格保持。

[实际分段转绿与本地检查](khmer197-green-boundary.json)保留119不同用例、真实失败/恢复、WIP输入指纹，以及唯一#317生成1过/12筛选跳过和正常12过/1禁用生成跳过。实际85→86，仅新增Khmer-1:null，原85逐值保持；默认near2供给饱和未改变原库存/时钟投影，完整说明已核后单独加入UNTRIGGERED，未改变算法。实际A一次构建成功，484份源码输入稳定、1695份dist文件SHA绑定；新高棉9项浏览器首轮9/9通过，原#322完整22项一次22/22通过且所有旧文字/数字保持，同dist现有builds烟测62路由通过。独立亲看48份原图中的24份（含4张真实1080×1350PNG），余24份只做指纹/尺寸盘点，未提交PNG。

独立实际一次采集8份高棉和440份其它文明时间线，并采集1512份辅助计算及224份真实成本。其它55完整/数值、1485辅助、55附注/支持，以及高棉24个非farm辅助和全部224独立真实成本均0差异；高棉3个farm辅助按新模型核验。支持集合实际50/6，旧12个全局和其它55原始经济行保持。

4套无farm方案的全数值保持；另2套因199箭羽必须等待铁匠铺完成，仅精确6个数值叶变化：maa末步850.7→880.7秒，archers末步784.5→814.5秒，后者显式农田受付款队列的地点等待约束，完成时间推后且最后两完成实体条目重排。六套全部已保存步骤起始库存、完整升时代记录和房屋付款保持。原“六套全数值相等”的严格离线比较确实失败且原报告保留；固定来源与已保存结果独立分类后，单独纯离线六叶核验通过，未改代码、原比较器、旧金标准或重新采集。公开复合步骤字段未暴露单项研究开始/完成，不捏造该时刻。

两FC各4农工从354.7秒分配，实际Food与early误差带有8/10处数值变化，默认封建点击/到达543.6/673.6秒、城堡768.9/928.9秒保持，没有默认提速结论。旧捕获是当时UI尚不支持时的低层Khmer调用，不能称为已实测的旧UI通用回退或游戏内收益对照。

详见[实际本地验证](khmer197-validation.json)、[量化对照](khmer197-runtime-quantified.json)及[独立图审](khmer197-ui-review.json)。这些本地结果始终归属A，后续文档提交不冒称本地重构建或重跑；完整CI及线上交付以PR和实际run记录为准。
