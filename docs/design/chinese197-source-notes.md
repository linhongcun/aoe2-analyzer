# 中国开局来源边界

固定 DE188329 DAT 为 `SiegeEngineers/auto-mods@e293dc106b0f3b0ceac2db98409fbcc5c921190b` 的 `dat/empires2_x2_p1.dat`，原始字节 SHA256 `d0aefd92428e2215d6f4d9b1d544901e6f171e19183f9e0b88218de5153a337f`。本批不更换来源，未运行该版本游戏客户端。

## 可重建记录

```bash
python3 scripts/build_sim_source.py --civ Chinese \
  --tech 226 --tech 302 --tech 304 --tech 350 --tech 351 --tech 352 --tech 425 --tech 232 \
  --output docs/design/chinese197-source-summary.json \
  --raw-output scripts/.cache/chinese197-closure.json
python3 scripts/chinese_source197.py
```

两份命令均可加 `--check` 核验。标准[摘要](chinese197-source-summary.json)保留 civilization 6 / tree257 / team402 完整命令、16项专属科技指纹、本批8项完整科技及150项引用闭包指纹；完整闭包仅留忽略缓存。[物理记录](chinese197-source-physical.json)由额外有界提取器读取原始 DAT，保留 TC 三个资源槽和研究科技的完整原始记录（含 normalized exporter 没有的 `type`）。两份均小于64KiB；旧来源原件不改。

## 起始、人口与费用

- 226/effect215 的起始资源为食物 -200、木材 -50；302/effect302在普通起始门639/307下创建3名额外83村民。普通模型最终6村民、1侦骑、0食物、150木材，不扩展游牧、特殊模式或额外免费房屋。
- 425/effect437将109/71/141/142/444的属性21**设为15**，不是额外加15。原始普通与中国TC第一资源槽均为 `type4 / amount5 / flag4`；因此每个已完成TC总提供15人口。LOS与搜索范围加7属于当前经济模型之外。
- 304/350/351/352分别将85设为1、0.95、0.9、0.85，依实际时代生效。固定DAT的101/102/103为 `type2`，当前5种开局研究14/22/199/202/203为 `type0`；这只是交叉线索，不能单凭类型字段推出全部引擎筛选规则。
- 2022-08-20的[直接问答](https://www.reddit.com/r/aoe2/comments/wtkpie/chinese_tech_discount/)明确排除升时代，并另指出Spies/Treason例外；本批仅支持当前开局研究，不将type0泛化为全部应打折的研究。408原始类型同样为0，是保留的反例；Spies/Treason不在当前8套模板范围内。
- [AOEGuilds中国页](https://www.aoeguilds.com/civilizations/chinese)明确TC支持15人口、常规5；页面含火矛兵时代移速等当前条目。[2023-10-31编辑器讨论](https://forums.ageofempires.com/t/modify-pop-space/242202)说明建筑人口空间由第一资源存储量控制。这些公开语义佐证与DAT配对使用，不能当作同版客户端实验。

## 完整经济范围与当前开局

tree257未对当前8套模板的训练、建筑或5种研究作禁用；火矛兵/喷火船移速、爆破舰生命、独特科技和诸葛弩等不影响当前模板。team402使232免费自动；232的农田/牧场食物储量+10%在资源不耗尽模型中不产生数值收益，默认团队仍关闭，不估算耗尽、续种或节木。

逐项对照固定科技树 `SiegeEngineers/aoe2techtree@e56728e76b7d08301fba7b18d5f16bc8554c109a` 生成的 `trees.json`、`buildings.json`：当前8套开局实际训练4/13/38/74/93/448、升级75、研究14/22/199/202/203均启用；建造12/45/50/68/70/72/84/87/101/103/109/562/584全部对中国开放。无须套用其它文明的骑士或民兵通用模板警告。

生产器只对226/302/304/350/351/352/425附加 `chineseTech` 的完整来源；425即使通用解码为空也必须输出，错误文明、研究地点和未知伴随命令不能被筛选掉。除这7个字段和425空效果行之外，逆投影与本批基线逐字段一致；其它55文明及所有全局数据精确保持。
