# RM 1v1 地图快照（#570）

页面只读 `src/data/ladder-insights-rm1v1-arabia.json` 和 `src/data/ladder-insights-rm1v1-arena.json`。运行时不请求 AoE2 Insights。

## 采集

| 项       | 值                                                                                                                                                      |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 接口     | `https://www.aoe2insights.com/stats/api/match-ups/`                                                                                                     |
| 字段说明 | 2026-11-08 对上述地址发 GET，返回 Match Ups 的 fields 与 aggregations                                                                                   |
| 查询     | `by=civilization`，聚合 `agg_win_rate`、`agg_n_matches`、`agg_n_won`、`agg_play_rate`、`n_rows`，filter 只有 `ladder=3`（RM 1v1）和 `map=9` 或 `map=29` |
| 阿拉伯   | 响应体接收时间 `2026-11-08T02:27:25Z`（本机收到字节的时间，没有记下 HTTP Date）                                                                         |
| 竞技场   | 响应 Date 头 `Sun, 08 Nov 2026 02:30:37 GMT`，记为 `2026-11-08T02:30:37Z`                                                                               |
| 原始字节 | `docs/data/insights-match-ups/rm1v1-map-9.json`、`rm1v1-map-29.json`                                                                                    |
| sha256   | 只覆盖对应原始响应体的精确字节，不含规范化 JSON，也不含这份说明                                                                                         |

校验：

```bash
python3 scripts/insights_ladder_snapshot.py --check
```

`--fetch` 会再次请求这两张图，两次请求之间暂停 20 秒。失败或 `pending` 不会替换已经通过校验的文件。站点构建和默认 CI 不跑 `--fetch`。

`robots.txt`（https://www.aoe2insights.com/robots.txt）对 `User-agent: *` 写了 `Disallow: /stats/api/`。因此脚本只在维护者指定的这一次开发取数里使用，不放进页面，也不放进默认 CI。Pro 页面（https://www.aoe2insights.com/pro/）没有写自动查询配额；没有把没写的限制说成已经允许批量抓取。

## 统计口径

接口总述：1v1 每次对阵存两行，双方各一行。聚合标签里 `agg_n_matches` 是 “Match (Count)”，`n_rows` 是 “Number of rows”。这两份响应里，每个文明的两个数都相等，胜率等于 `agg_n_won / agg_n_matches`（来源比率约四位小数），选取率等于该文明行数占本次行数之和。

所以页面把 `agg_n_matches` 写成玩家行，不写成独立对局，也不把单个文明的数除以 2。各文明之和同样是行数合计。阿拉伯这次合计 2,531,958 行；issue 评论里的 2,531,954 是更早一次读取，少 4，不回改本次字节。竞技场合计 494,926 行，与该评论的全时段数字一致。

没有 `patch`、`elo_group`、`started_time` 条件。来源条写「未按补丁筛选」「Elo 未筛选」。采集时间不是覆盖截止。官方 Update 185872 的日期见 https://www.ageofempires.com/news/age-of-empires-ii-definitive-edition-update-185872/ ，但本查询没有补丁号，页面不借用这个日期。评论里「patch≥185872 时最少 28」是另一条查询，这次没有请求，不写入快照。

低样本：来源没有定义阈值。本站暂定原始 `agg_n_matches` < 100 标「低样本」，状态待确认，不是平衡建议。

胜率和选取率在接口里是 0–1 的比率，页面乘 100 后显示百分数，不另作估算。
