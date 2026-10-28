# #478 开局机制来源证据

以后新增文明只提交有界的来源摘要和实际模型需要的完整机制记录，不再复制整份关联科技、开局动作、基础单位和资源数组。完整审计输出放在 `scripts/.cache/`，由固定来源重建；DAT 和缓存仍不提交。

## 生成与核验

```bash
python3 scripts/build_sim_source.py --civ Mayans --tech 554 \
  --output docs/design/mayans197-source-summary.json \
  --raw-output scripts/.cache/mayans197-closure.json
python3 scripts/build_sim_source.py --civ Mayans --tech 554 \
  --output docs/design/mayans197-source-summary.json --check
python3 scripts/build_sim_source.py --check-budget
```

`--civ` 使用站点英文文明名；重复 `--tech` 选择本批真正要核对的机制科技。命令调用现有 `dat_source.load()`：按 `scripts/data_sources.json` 的固定提交下载 DAT，先验证原文件 SHA256 和补丁标记，再使用固定 `genieutils-py==0.1.2` 解析。缓存已存在时也会核对 DAT 字节，生成过程不改 `src/data`。首次生成需要网络及现有 DAT 管线环境；`--check-budget` 不下载数据。

摘要 `build-sim-source/1` 保留固定上游 repo/commit/path/SHA256、文明 raw ID、完整 tree/team 命令、本批选择科技的完整规范化记录、所有专属科技的 ID/名称/指纹，以及已知科技引用闭包的 ID、数量与整体指纹。闭包递归前置和 `Type8/101/103.A`、`Type102.D`；Type102 的 D 不能漏掉。指纹使用 UTF-8、键排序、无空白 JSON 的 SHA256，数组顺序和命令数值保持原样。未选择的完整闭包只输出到忽略的缓存，禁止用 `--raw-output` 写进文档或数据目录。

本次实际固定 DAT 生成的 [玛雅示例](mayans197-source-summary.json)为 14,018 字节；它包含选择的 554 完整记录及 154 条规范化科技引用闭包的指纹。它是新工具的可复现示例，不取代旧玛雅审计的 133 项范围与原始字节，两者的入口和提取字段不同。

## 证据边界

摘要是来源索引，不是自动审计结论。`dat_source.py` 的规范化导出没有每个文明的完整单位、资源、所有任务字段；需要这些字段时，应为新增机制提供小型固定来源提取器和必要的完整记录，仍把大范围中间件留在缓存。`selectedTechs`、tree/team 保留未知命令，但闭包只解释上文列出的已知科技引用种类；审阅者仍须核对未知命令、完整配对、反例和公开语义来源。

闭包中的科技不等于自动应用科技、当前可用科技或支持文明，不能绕过运行时完整来源门控。来源审阅、专测、浏览器验证与独立复核仍按原流程执行。若更新上游 pin、提取字段或机制范围，重新生成摘要并复核对应变化，不重录旧验收期望。

## 历史与增长门

既有 `*197-source.json` 是历史审阅原件，多份还被现有测试直接读取，保持其字节和链接。本次不删除它们，也不把格式压缩当成证据精简。

新来源报告每份最多 64 KiB；超出时按真正审阅的机制拆摘要，完整中间数据留缓存。`tests/py/test_build_sim_source478.py` 和 `--check-budget` 扫描 `docs/design/**` 下 `*197*source*.json`；既有十份超限文件仅以 [固定路径与 SHA256](../../scripts/build_sim_source_history.json)兼容，修改旧大文件或新增大文件都会失败。该清单固定于 main `08ad03b0335f9b98a3b893694b793674c1f21b3b`，不能随新文明扩充豁免。新摘要沿用 `文明197-source-summary.json` 命名并纳入同一检查。
