# 瞿折罗当前模板的来源边界

固定 DE188329 DAT：`SiegeEngineers/auto-mods@e293dc106b0f3b0ceac2db98409fbcc5c921190b`，`dat/empires2_x2_p1.dat`，原文件SHA256 `d0aefd92428e2215d6f4d9b1d544901e6f171e19183f9e0b88218de5153a337f`。本批未更换来源，未运行该版本游戏客户端，也未实现牲畜驻磨坊的正收益公式。

## 重建来源

```bash
python3 scripts/build_sim_source.py --civ Gurjaras --tech 856 --tech 857 \
  --output docs/design/gurjaras197-source-summary.json \
  --raw-output scripts/.cache/gurjaras197-closure.json
python3 scripts/gurjaras_source197.py
```

两条命令均支持`--check`。标准[摘要](gurjaras197-source-summary.json)保留civ42/tree842/team843的完整命令、13项专属科技指纹、856/857完整记录和169项已知引用闭包指纹；完整中间输出仅留忽略缓存。[物理记录](gurjaras197-source-physical.json)保留原始果丛、起始侦察单位、人口成本和相对基础文明的资源差异。来源报告各小于64KiB，旧来源原件不改。

## 两项经济机制

856/effect871完整9条命令依次为：对68/129/130/131四种磨坊形态的属性30设16，再将其属性2设10，最后将资源254设15。公开文明原文“Can garrison livestock in Mills to passively produce food”说明它是驻畜能力；固定[UGC资源254](https://github.com/Divy1211/AoE2DE_UGC_Guide/blob/d9d63e28c1a1ac7dcc87214f778ac385b48f45a1/docs/general/resources/resources.md#254-livestock-food-productivity)也指向驻畜产粮。但该指南示例为3.5，当前DAT为15，不借旧示例臆造现版公式。

当前动作类型及8套模板没有驻军/撤驻或牲畜实体数量。本批按未驻畜估算，不自动把采羊村民或建成磨坊转换成驻牲畜，不增加被动食物。将来引入这些动作须重新建模；这不是对实际驻军产粮的支持承诺。

857/effect872在普通起始条件639/307下先将234设1，再以Type7创建1549两份。原始1549属于Gaia的FORAGGURJ果树，class7、type10，第一资源存储为175食物。这是两丛共350食物的有限可采资源，不是现成库存或额外村民。当前无限资源和固定往返距离模型没有额外果丛数量、落点、耗尽或由此省下的距离收益；不赠350食物、不赠2村民，也不提高采果工作率。

## 普通起始及军事模板

原始Gurjaras资源与基础文明只在locale73和初始侦察单位263上不同；263由448改为1755骆驼斥候，人口成本仍为1。普通3村民、4/5人口与200食物/200木/100金/200石库存保持既有模型，不模拟骆驼斥候的移动或战斗。普通侦察骑兵448仍可在马厩训练；当前scouts-18沿原动作，不自动改为需要55食物/60金、22秒的1755训练。

逐项对照固定科技树`SiegeEngineers/aoe2techtree@e56728e76b7d08301fba7b18d5f16bc8554c109a`生成的`trees.json`：当前8套实际单位4/13/74/75/93/448、研究14/22/199/202/203全部启用，原建筑没有替代机制。tree842禁用骑士使能166，38骑士不可用；仅fast-castle-knights显示通用军事模板经济估算边界。

其它专属能力包括骆驼/骑乘单位战斗额外伤害、城堡独特科技和单位解锁，不影响当前未交战、未研究独特科技的模板。团队843的20条训练时间倍率作用于骆驼/象兵目标；默认团队关闭，当前8套也不训练这些目标，不新增团队收益。

## 数据变化

生产器只给856和857新增`gurjaraTech`完整原始字段。错误文明、研究地点、费用和未知伴随命令须保留到运行时失效门控，不能因通用解码为空而丢弃。删除这两字段后完整eco对象精确恢复本批基线，所有其它55文明及全局字段保持不变；物理解释仅在来源文档中，不额外扩充运行时数据对象。
