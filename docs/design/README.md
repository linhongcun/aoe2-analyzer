# 设计与实现来源

- [当前系统架构](../ARCHITECTURE.md)
- [当前体验设计原则](DESIGN-SYSTEM.md)
- [体验设计接手指南](../../role/experience-design.md)
- [开局模拟来源与扩展点](../BUILD-SIM-SOURCES.md)

当前设计决定与完成态设计图归属于原 Issue。机器可读来源、生成结果和验证证据统一存放于 [`data/evidence/`](../../data/README.md)，原文件字节与固定哈希保持不变；历史证据中的旧路径字符串是来源记录，不作改写。历史记录中指向已退役文档的路径，可在清理基线 [362f1ed7a7acebbecb08f43dfa04684828eba923](https://github.com/linhongcun/aoe2-analyzer/tree/362f1ed7a7acebbecb08f43dfa04684828eba923/docs/design) 的 Git 历史中查阅。
