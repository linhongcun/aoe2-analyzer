# #285 JSON 数据校验边界

后续状态：#442 已将这份初始迁移中的 22 处来源展示清零。原始 provenance 保留，公开投影由独立 checker 严格验证，CI 使用 `--strict`。当前实现与验证范围见 [公开来源规格](source-presentation-442.md)；下文保留 #285 当时的设计与迁移依据。

本项为手写内容和固定数据的读取增加结构检查，不修改游戏数字、生成 JSON、玩家文案、界面或计算口径。适用版本为当前 DE185872。

## 覆盖清单

当前共 46 份 JSON：`src/content` 11 份，`src/data` 35 份。8 份开局数据共享一种结构，4 份补丁共享一种结构，其余数据各有明确结构。schema 位于 `src/content/schema`，自身不作为待校验内容。登记表把每份现有 JSON 映射到一种 schema；新增未登记文件、重复匹配及 schema 错误均给出文件和路径诊断，不以通用 object/any 兜底。

schema 采用 JSON Schema 2020-12，按实际生成器、原始数据类型和页面消费者确定必填、可选、nullable、tuple、判别联合与递归节点。固定对象拒绝未知字段，动态字典的每个 value 仍有具体 schema。不能把运行时接口消费的子集误当作生成 JSON 的完整结构，例如驻军的内部审计与高棉 `resourceCapacity` 差异仍须保留。

## 来源与内部证据

公开来源 URL 使用共享 `public-url` 格式，接受公开 HTTP(S) DNS 域名、公有 IPv4 和全球单播 IPv6 链接，包括合法 GitHub 固定版本 URL；拒绝相对路径、其他协议、用户信息、localhost、私有/回环/保留 IP 和内部主机名。这是离线格式与公共地址类型检查，不联网声称来源可达。实际玩家可见的来源标题、说明等使用 `source-text` 格式，拒绝 SHA、CSV、提交号或裸提交哈希这类内部标记；短哈希要求混合十六进制字母和数字，明确允许 DE185872 等游戏版本、日期和普通英文词。`sourceIds` 是关联 ID，不能按 URL 校验。

审计发现手写内容有 1 处实际可见来源违规，已计入下述 22 条；战役内容另有 14 处隐藏的版本、校验值与字段证据，均未渲染。它们使用显式 provenance 结构保留，不把所有 `sources` 或 `meta` 泛化豁免。战役 `editorial` 整理记录没有 URL，但不会进入公开来源列表；公开引用分支仍要求 URL。

实际存量问题共 22 处：除 `hybrid-fish-18` 外的 7 份开局各在 `/license`、`/sources/0/ref`、`/sources/0/section` 显示固定提交号或源码定位，共 21 处，`BuildPracticeView` 确实会渲染这些字段；一局入门的 `/sources/pinned-techs/version` 为 `main 8d669ac / DE185872`，`GameGuide` 会显示该短提交。后一条在补齐裸短哈希检查后发现，root 已独立核对它在基线提交中存在并批准加入初始冻结清单。它们必须真实报告，不能当成隐藏 metadata 豁免，也不在本 issue 顺手清理原页面或手改生成数据。来源展示清理另由 [#442](https://github.com/linhongcun/aoe2-analyzer/issues/442) 跟进，原作者、MIT 许可及其他必要归属必须保留。

生成数据的公开来源路径逐项对照实际消费者如下。`URL` 与 `text` 分别指共享公开链接和来源文案格式；数组/字典的 `*` 表示每个成员，属于文档记法，baseline 不使用泛匹配。

| 输入                     | 来源路径与规则                                                                                                                                                                                                                               | 实际消费者                                                                        |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `civs.json`              | `/*/bon/*` 为 text                                                                                                                                                                                                                           | `realCost.gatherModel` 将对应加成作为 applied.source，`RealCost` 显示文明描述来源 |
| `market.json`            | `/engine/sources/*/url` 为 URL，`scope` 为 text                                                                                                                                                                                              | `Market` 来源链接与文字                                                           |
| `garrison.json`          | `/meta/patch` 为 text                                                                                                                                                                                                                        | `GarrisonPreview` 数据版本                                                        |
| `relic_income.json`      | `/meta/patch` 为 text；`/meta/fieldSemantics/{resources,effectTypes}` 为 URL                                                                                                                                                                 | `RelicIncome` 版本及固定友好标题的外链                                            |
| `mapCatalog.json`        | `/meta/sourceUrls/{zh,en}`、`/maps/*/preview/sourceUrl` 为 URL                                                                                                                                                                               | `Maps` 来源链接                                                                   |
| `mapPreviews.json`       | `/*/sourceUrl` 为 URL                                                                                                                                                                                                                        | 先生成 `mapCatalog`，再由 `Maps` 消费                                             |
| `build-orders/*.json`    | `/sources/*/{title,author,section,ref}`、`/license` 为 text；`/sources/*/url` 为 URL                                                                                                                                                         | `BuildPracticeView`、`BuildOrderList`、`BuildTimelineView`                        |
| `patches/*.json`         | `/source`、`/entries/*/source` 为 URL；`/note`、`/title`、`/coverage`、`/entries/*/{summaryZh,originalText,scopeNote}`、`/entries/*/relatedTargets/*/relation`、`/archivedTargets/*/relation` 为 text                                        | `Patches` 与 `PatchHistory` 的来源、版本说明和适用关系                            |
| `team_bonuses.json`      | `/meta/scopeNotes/*`、`/permanent/*/notes/*`、`/technologies/*/notes/*` 与两类成员的 `unknownTargets/*/reason` 为 text                                                                                                                       | `TeamBonuses` 的数据范围、备注与待核实原因                                        |
| `generate_resource.json` | `/meta/sources/*` 为 URL                                                                                                                                                                                                                     | 当前没有直接 UI 消费，保留生成来源的链接约束                                      |
| 其余 15 格式             | `units`、`techs`、`buildings`、`trees`、`effects`、`eco`、`construction`、`garrison_general`、`garrison_healing`、`garrison_techs`、`garrison_hosts`、`trade_income`、`catalog-introductions`、`search-py`、`page-metadata` 没有公开来源字段 | 游戏属性、描述、计算输入、检索或分享数据；仍执行完整结构校验                      |

`relic_income.meta.datSource.{repo,commit,path}` 仅拼成固定 `https://github.com/.../blob/...` 外链，提交值不作为链接文字显示。其 `datSha256/numberEvidence/semanticsEvidence`，以及其他生成数据的 `generatedBy/generated_by/repo/commit/sha256/labelsCommit/populationSource` 属于隐藏 provenance。`effects.meta.sources`、`eco.meta.source` 同样不直接渲染。它们有明确结构，不使用全对象豁免。`mapCatalog.meta.copyright`、`patch.entries/*/sourceBullet` 虽未直接渲染，仍保守使用 text 格式。可见核对日期使用日期格式约束。`AboutData` 专门来源审计的数据来自范围外的 `scripts/data_sources.json`，本项不修改它的提交/SHA 展示。

## 命令与迁移

`npm run content:check` 运行完整文件发现、登记覆盖、schema 和必要语义检查，默认先告警并列出精确路径；`--strict` 对任何问题返回非零。当前不会声称 strict 零问题。

迁移期 CI 使用 `--ratchet`：仅固定这 22 个 `file + JSON Pointer + value SHA256` 的 `source-text` 格式问题可告警；全部新问题、结构问题、登记覆盖问题、URL 或施工索引问题都阻断。baseline 无 glob、前缀或数量豁免，不提供自动扩展 baseline 的命令。候选 baseline 只能取冻结清单的子集，修改指纹或新增路径都视为 baseline 无效。已不再发生的 baseline 条目必须同步删除，不能悄悄保留成未来回归豁免。清单清零后 ratchet 与 strict 等价，再将 CI 明确切换为 `--strict`。所有 schema 始终保持严格，baseline 不改变 schema 或运行时 validator。

## 五个运行时边界

CLI 使用固定版本 Ajv 8；前端只读取五个预编译 standalone validator，既不带 Ajv 编译器，也不导入完整 schema 登记表。生成器支持 `--check` 检测校验代码是否与 schema 一致。validator 不强制转换、不删除字段、不填默认值。通过类型谓词的检查后直接得到相应类型，移除原先的双重断言。

- 施工：先验证 compact 字典形状，再检查每个文明的 `units` / `automatic` 索引确实在字典范围内，之后才展开为 `ConstructionData`。
- 驻军回血、侦察内容、分享元信息、团队来源：在原来的导出常量初始化处验证；类型接口保留，数据与计算不变。
- 错误在读取边界显式报告，不允许未校验对象继续变为可信类型。

## 验证

先失败用例覆盖五个旧边界接收错误数据、施工越界索引、全文件登记、真实新文件和坏 JSON、固定对象未知字段、嵌套类型、tuple、公开来源和隐藏证据的区别，以及 warn/strict/ratchet 的实际退出行为。另验证新增或修改 baseline 不能放行错误 URL、结构或新文案，陈旧条目必须报错。后续跑相关领域/内容单测与三项静态检查、构建、`content:check --ratchet`、standalone 再生成检查，以及受影响页面交互。入口 gzip 必须仍不超过 121063 bytes，多人施工冷缓存 raw JS 必须仍不超过 1800000 bytes；不得退回上轮 #282 的大包依赖。
