# 开局模拟覆盖与模型边界

本页是当前模型边界与验证入口，不维护可变的文明覆盖矩阵、数量表或批次日志。支持状态以当前实现、输入数据与测试为准；本页的保留是文档整理，不代表新增机制支持。

## 当前实现与验证入口

- 文明与机制分类由 [`src/domain/buildSimCoverage.ts`](../src/domain/buildSimCoverage.ts) 和 [`src/domain/buildSimMechanisms.ts`](../src/domain/buildSimMechanisms.ts) 执行；相关提示与约束见 [`src/domain/buildSimNotes.ts`](../src/domain/buildSimNotes.ts) 及当前[开局模拟界面](../src/features/builds/)。
- 固定来源、摘要边界与更新命令见[开局模拟来源说明](data/BUILD-SIM-SOURCES.md)。模型实现不从文档中的旧表推导。
- [`tests/unit/buildSim.test.ts`](../tests/unit/buildSim.test.ts) 与 [`tests/unit/buildSim815.test.ts`](../tests/unit/buildSim815.test.ts) 覆盖当前分类与回归；`npm run bo:check` 检查开局数据结构与引用。按本次差异和 [TESTING](TESTING.md) 选择验证范围。

文明或机制进入分类，不表示该文明的全部机制、每一种开局行为或完整客户端效果都已建模。未分类/未知项必须留在现有边界中，不能从近似数据、文案或旧审计表推断支持；源码和当前 UI 的限制说明优先于历史报告。此模型不是游戏客户端实测声明。

Issue #42/#197 的历史核对和当时模型限制见清理前不可变的[原始覆盖报告](https://github.com/linhongcun/aoe2-analyzer/blob/80f856ae3924ebce9d9d3b44211d6accad74c9b2/docs/BUILD-SIM-COVERAGE.md)。两个设计证据 JSON 的反向链接保持原样。
