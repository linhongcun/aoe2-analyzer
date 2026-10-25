# 历史补丁收录与证据

<!-- 由 scripts/history_build.py 生成；手工校对输入见 scripts/history_inputs/。 -->

本批仅收录下表列出的 DE 正式版平衡栏目。版本号之间的其他补丁、同页后续热修、原版/征服者/HD 历史尚未补齐；不能把无记录理解为从未改动。

| 正式版 | 官方发行日 | 公告当地日 | 公告公开（北京时间） | 官方项目 | 已映射 | 明确排除 | 实体记录 |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: |
| [66692](https://www.ageofempires.com/news/age-of-empires-ii-definitive-edition-update-66692/) | 2022-08-29 | 2022-08-29 | 2022-08-30 | 32 | 32 | 0 | 46 |
| [81058](https://www.ageofempires.com/news/age-of-empires-ii-definitive-edition-update-81058/) | 2023-04-11 | 2023-04-11 | 2023-04-12 | 130 | 129 | 1 | 154 |
| [125283](https://www.ageofempires.com/news/age-of-empires-ii-definitive-edition-update-preview-125283/) | 2024-10-15 | 2024-10-14 | 2024-10-15 | 25 | 25 | 0 | 33 |

## 核对口径

- 核对日期：2026-10-25。逐条保存官方英文项目与中文摘要、所属版本、来源链接和核对状态；数值描述当时的变化，不表示当前游戏数值。
- `releaseDate` 保留官方标注的发行日历日期，不代表已核实发行时刻；`announcedAt` 保留公告当地日期。`sourcePublishedAt` 保存官方网页 `article:published_time` 的完整带时区时间戳，`publishedAt` 严格换算为北京时间日期。来源发布时间不能当作正式版发行时刻。
- 完整覆盖只针对指定平衡栏目。每个官方顶层项目必须对应一条或多条实体记录，或明确的排除理由。嵌套子项目随其父项目保留，不以拆分后的实体条数冒充官方项目数。
- `history_build.py` 固定三份已打开核实的官方项目清单摘要，校验来源、发行日、公告日、身份及双向覆盖关系。它不在线爬站，也不自动判断加强/削弱。
- 实体身份与当前目录校对；历史前后数值直接依据对应正式公告，不拿 DE 185872 的现值验证 2022/2023/2024 的历史值，未声称有这些历史版本的完整 `.dat`。
- 全局变更不自动归入当前可用的全部文明。`affectedCivIds` 与 `relatedTargets` 仅保留原文可支持的关联；缺失关联不能据此推断不受影响。
- `changeType: fix` 配合 `kind: adjust` 表示官方游戏修复；保留已有 `kind: fix` 的本站数据修正含义。混合调整、资源种类互换与机制重做不简单判为整体加强/削弱。
- 升级科技费用与时间挂接相应单位并标为 `upgrade`；不使用未核实的升级科技数字 ID。补给 716 使用独立历史档案，旧 Berserkergang 与当前 Bogsveigar 49 不共用历史身份。旧 Zealotry 亦使用独立字符串历史键。

## 特殊边界

- 66692 只含主版本 Civilization Balance；同页 Hotfix 71094（2022-10-17）不纳入。官方未在骑象射手数值项目单列精锐时，保留普通单位条目和范围说明，不推定未列出的旧值。
- 81058 采用正式版文字，加粗内容是 PUP 后定稿。中国的 “No changes” 显式排除，不把测试服提案当作已上线改动。
- 125283 的官方文章标题含 Preview，发表于 2024-10-14，开头写明次日更新；发行日按 2024-10-15。该日的[官方论坛正式客户端报告](https://forums.ageofempires.com/t/set-gather-point-hotkey-is-not-working/264288)记录 Steam build #125283，作为发行日期的交叉证据。同页后续 Minor Update 127161 不纳入。
- 原版、征服者、HD、PUP、Return of Rome 和 Chronicles 不与本批常规 DE 规则混合。

## 来源公开时间戳

| 版本 | 官方 article:published_time | 北京时间日期 |
| --- | --- | --- |
| 66692 | `2022-08-29T16:10:00-07:00` | 2022-08-30 |
| 81058 | `2023-04-11T15:20:00-07:00` | 2023-04-12 |
| 125283 | `2024-10-14T12:13:32-07:00` | 2024-10-15 |

## 明确排除项

- `81058-b051`：**No changes** — 正式版明确 No changes；不收录 PUP 中未上线提案。

## 复现

```bash
python3 scripts/history_build.py
python3 scripts/history_build.py --check
python3 -m unittest discover -s tests/py -p test_history_build.py
```
