# 开局模拟：来源与扩展点

本文说明怎样生成可复现的来源记录，以及代码中已有的注册点；它不定义新的游戏行为。具体支持范围和未知项以当前代码、数据及测试为准。

## 固定来源与可复现记录

[scripts/data_sources.json](../../scripts/data_sources.json) 与 [scripts/dat_source.py](../../scripts/dat_source.py) 给出当前 DAT 的 repo、commit、路径、SHA-256 和补丁标记。DAT 仅在受控生成时下载到忽略目录 `scripts/.cache/`，校验实际字节和版本后解析；DAT 与完整中间导出不提交、不发布。

新记录默认从当前固定来源生成到忽略缓存，再用相同输入复核：

```sh
python3 scripts/build_sim_source.py --civ Mayans --tech 554 \
  --output scripts/.cache/mayans-current-summary.json \
  --raw-output scripts/.cache/mayans-current-closure.json
python3 scripts/build_sim_source.py --civ Mayans --tech 554 \
  --output scripts/.cache/mayans-current-summary.json --check
```

历史 pin 必须显式来自原摘要；不得把当前 DAT 标成旧版本。仓库中的固定示例可这样重建和比较：

```sh
python3 scripts/build_sim_source.py --civ Mayans --tech 554 \
  --pin-from docs/design/mayans197-source-summary.json \
  --output docs/design/mayans197-source-summary.json --check
python3 scripts/build_sim_source.py --check-budget
```

[scripts/build_sim_source.py](../../scripts/build_sim_source.py) 的 `--pin-from` 校验原 repo/commit/path/SHA-256、DAT 补丁标记与规范化版本；`--check` 必须使用与生成时相同的文明、科技和 pin。不要用当前来源为历史记录重新贴标签。

摘要使用 `build-sim-source/1`，包含来源身份、文明 raw ID、tree/team 命令、选择的完整科技记录、专属科技指纹及已知引用闭包。脚本要求 `--raw-output` 位于忽略目录 `scripts/.cache/` 中；完整导出不得写入或提交到跟踪目录。

## 大小与证据边界

每份新来源摘要最多 **64 KiB**。[scripts/build_sim_source_history.json](../../scripts/build_sim_source_history.json) 固定十份历史文件的 SHA-256；`python3 scripts/build_sim_source.py --check-budget` 检查这些哈希并限制其它 `*197*source*.json` 的大小。不能修改历史原件或新增豁免。

标准化摘要不包含每文明完整单位、资源和全部任务字段。闭包追踪已知科技引用（`Type 8/101/103.A` 和 `Type 102.D`）；未知命令原样保留，仍需按原始来源审阅。发现需要摘要中没有的字段时，应新增边界清楚、固定输入的小型提取器，避免复制完整 DAT 或把中间数据提交进仓库。

闭包成员不表示科技会自动应用、当前可用或该文明受到模拟支持。来源身份、运行时覆盖分类和支持范围是不同证据；不得由来源 JSON 单独放宽模型门控。

## 模型注册点

- [src/domain/buildSimMechanisms.ts](../../src/domain/buildSimMechanisms.ts)：`CIV_MECHANISMS`、`APPLICATION_RULES`。
- [src/domain/buildSimEffects.ts](../../src/domain/buildSimEffects.ts)：效果与资源应用通道。
- [src/domain/buildSimCivRules.ts](../../src/domain/buildSimCivRules.ts)：来源身份、对象类别和配对校验。
- [src/domain/buildSimCoverage.ts](../../src/domain/buildSimCoverage.ts)：效果分类、支持范围与拒绝理由。
- [src/domain/buildSimNotes.ts](../../src/domain/buildSimNotes.ts)：按既有顺序输出的模型说明。

新增行为应沿现有 hook 和实际数据输入增加针对性用例；未知、损坏或来源不完整的输入继续拒绝应用。任何现有模型假设或未验证机制，以原 Issue 和代码测试为准，不以本页推断。
