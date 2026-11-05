# #710 罗马机制数值资料

基线main002dbe0793ddd21c61cac5e92a979bbb1199f5bf；版本0.77.29。仅tech884资料与BonusDetail的Romans-1追加DL；不扩Core/LOADERS/StatSet/效果引擎/PK/BonusBody/文明内联，不改effects.json、eco.json、pins、全局CSS、原table或保护golden/capture。

## 固定来源与charge投影

现有data_sources.json固定DAT：auto-mods@e293dc106b0f3b0ceac2db98409fbcc5c921190b，SHA256 d0aefd92428e2215d6f4d9b1d544901e6f171e19183f9e0b88218de5153a337f，DE188329。字段语义：[AGE属性59–62](https://github.com/Tapsa/AGE/blob/eb1202b70bf3a45d4264212b53b70bbad4369e98/AGE_Frame/Lists.cpp#L325)、[模式](https://github.com/Tapsa/AGE/blob/eb1202b70bf3a45d4264212b53b70bbad4369e98/AGE_Frame/Units.cpp#L1404)、[固定上游静态换算](https://github.com/SiegeEngineers/aoe2techtree/blob/e56728e76b7d08301fba7b18d5f16bc8554c109a/scripts/generateDataFiles.py#L416)、[秒单位展示](https://github.com/SiegeEngineers/aoe2techtree/blob/e56728e76b7d08301fba7b18d5f16bc8554c109a/js/main.js#L389)（同文件L489–491）。meta同时保留公式与秒单位来源。public-semantics审计有charge映射；原treb/blast摘要不是charge原始导出。

新增scripts/charge_attack_build.py沿relic_income已有有界DUMP/cache/--check：只读tech884及实际effect、实际Romans文明四字段；不用British缓存，不另下数据或扩dat_source缓存。Type0/4/5按原始顺序set/add/mul，保index/Type/A/B/C/D与原float。属性59/60/61/62分别max_charge/recharge_rate/charge_event/charge_type；101训练时间是明确伴随分支，未知/重复/缺字段/非finite/bool伪数值或错身份/资格失败，不补0或静默丢命令。

输出charge_attack.json封闭结构：meta含generatedBy/patch/datSource/datSha256/engineVerifiedInPinnedBuild:false/固定语义URL与公式；tech身份、有限原始commands、rawTargets、legalTargets、examples[{unitId,before,after,commandIndices}]。每个state恰为四字段，容量/速率非负finite，模式只接收基底0/已核1；其它模式schema拒绝，合法0不默认解释为Attack，helper待确认。不存需同步维护的20。sort_keys/allow_nan=False/稳定换行，无动态时间戳；--check不覆写。新data-charge-attack schema、catalog映射、独立compiled validator/.d.mts与唯一features/techs/chargeAttack710 typed reader，沿readValidatedJson坏结构直接throw，不吞错伪0。有效但资格不成立/未支持模式给明确待确认；rate0不换算、不Infinity。

当前raw12=[38,74,75,77,283,473,567,569,1790,1792,1793,1813]；目录Romans AND树status1合法8=[38,74,75,77,283,1790,1792,1793]；展示3例=[283,1792,1793]。示例需科技884可用、时代与形态已升级假设，不能将12称可训或8称同局同时可生产。生产数值全部derive：当前四基底0，after容量5/恢复率0.25/event1/type1；静态容量/恢复率自然20秒，不能硬填。

tech884概览新增“攻击类蓄力参数”，3例各h3和DL读当前名称、目录基础容量、仅科技后容量、恢复率/秒、静态从零至满秒数。明确“容量不等于额外伤害”“静态换算不是运行时冷却”；冲锋额外伤害、触发距离、初始蓄力、部分蓄力伤害、实际每击消耗/恢复运行条件待确认。type1只解释攻击类，event是消耗事件，不声称实测。概览与affects仅884的现成建造速度/时间文字改训练速度/时间，保原数字/对象/分组；icon title/alt同步，437专属显示保留，非884原串不变。

## Romans-1护甲资料

仅BonusDetail效果tab在BonusBody后挂local RomanArmor710。通过本条b.techFx的英文key与现有TECH_EFFECTS真实pred/fx匹配；!b、unit.civs Romans、树u状态1、普通科技pred、tech目录Romans/树t状态1/时代与额外age全部满足才算，缺资料待确认，不按名字正则或固定对象名单推断。Core无techByEn，用makeSimContext或局部索引。无需新增护甲JSON。

“步兵护甲科技对照”：每个可用科技单独列对象和普通单项/罗马该单项增量；当前74/76各自然+1/+1→+2/+2。全部值由新baseStats及applyEffects普通/本条额外各一次算，simTechs已合并则不能再叠extra。当前动态对象7为u74/75/77/93/358/359/1793，不把骑士/百夫长混入；这是对账值不是生产白名单。

另“同一形态的合法累计”选真实u1793：基础→鳞甲→鳞甲及锁甲，前置闭包读真实76.pre74；当前自然2/2→4/4→6/6。不把单项锁甲贡献称独立合法研究状态，明确帝王同一形态已升级、仅两项护甲科技、无其它科技/团队，不声称封建能训练罗马军。t77钢甲目录不含Romans且树0，虽有隐藏891仍显示“罗马无法研究步兵钢甲，本例不计入”，不输出罗马可用加倍值或加入累计；u77不是t77。

## 状态/布局与验证

有效数据但缺树/单位、资格/来源不成立显示待确认/不可用，不保留旧有效数字。schema坏数据在reader拒绝，与UI资格pending分层。相邻bonus/其它文明不挂Roman卡；非884文本原样。现有Loading/错误沿原接口，新局部组件不让全bonus页新增数据门槛。

沿DetailSection/StatTiles或detail-cost-grid输出DL；不新table，两个路由360/1280既有338表基准[]保留。数字与单位.num.nw，文字沿现有tokens，所有新增导航community-tool-entry实际≥44，不叠ulink。来源具名href与about-data（既有h2），正文不印长pin/hash。四宽360/375/390/1280×明暗无overflow/数字拆行/console-pageerror，相关axe A/AA零违规；真实fullPage前blur/scroll0，图含实际SHA。

真实现有页面SSR/浏览器先红覆盖缺charge/Roman护甲卡和错误建造措辞；使用真实Routes匹配useParams，不能将missing module/JSON收集错误冒称产品红。数据foundation后验证Python build合成变异/拒绝/确定性及真实DAT生成--check；schema/reader深破坏沿generatedSchemas285/jsonBoundary285追加，不新校验框架。charge数据变异影响静态时长且输入不变；护甲normal/extra/pred/目录/tree变异跟随、Chain前置/禁钢甲、全输入不改分别断言。

新romanCharge710 unit/e2e常驻techs，分别source-only TechDetail/TechAffects/local charge及adapter证明；RomanArmor的BonusDetail/bonuses-local既有full长期覆盖，不新bonuses窄profile，不挂civs/units/duel。新JSON/Python producer为full+data；data_update/现有DATA_CHECKS独立--check登记，compile/catalog完整。本项实际full/data=true。本地相关CI必须整份releasePlan，并含既有schema边界；精确集合合法迁移只加成员保旧equal/排除。先实际commitSHA build/快新browser+首图自检，再push/full，独立实际SHA终审后由集成代理完整交付。

实际DAT另保留tech.repeatable原始标志1，仅记录字段，不解释成可重复研究；上方效果投影只按命令序列应用一次。容量/率均为有限数仍须防除法溢出，溢出给待确认，不显示Infinity。

## 独立源码审阅补强

7a4ce30生产新18/24图虽通过，源码审发现缺树键误称不可研究、通用mul/set累计用单项delta会算错及普通规则变异覆盖不足，故未push。真实新红记录710-review-first-red.log及710-review-source-first-red.log；不把该head称交付完成。目标身份但src非dat/idx非1只给待确认（fresh仅为文本一致性审计，不作为有效DAT的门禁）；引用科技缺目录、普通规则或相关树键缺失也待确认，只有明确不可用才写无法研究。现有合法单项可保留；冻结累计必须同一u1793的74及76齐全、真实pre闭包成立，再从新base按普通效果和本条extra顺序各应用一次，支持现有add/mul/set，不以相对最初基础的delta反复相加。任何累计非finite转待确认。普通规则真实变异以finally还原，原三阶段现值与7对象/禁77断言保持。
