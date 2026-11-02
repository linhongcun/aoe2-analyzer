# CI 最小效率修正（2026-11-02）

基线 main：`e2637089ecbaafc30d08327a080df923064bb8f4`（v0.74.15）。本轮仅本地实现、验证与独立复核；不推送、创建 PR、合并或部署。路线功能分支不在本改动内。

## 范围与安全边界

- `ci-scope.mjs` 的 home profile 增加已上线 `mechanism652` 单测和浏览器验收。保留 smoke、editorial6、startGame592/632；新增功能的消费者测试仍须显式登记，不能靠名称推断覆盖。
- 只有已审计的运行时加载入口 `src/data/index.ts` 不再作为生成输入。仍 `full=true`；main 全浏览器，PR 按原有 capped 规则。其它 data 文件、生成脚本、固定来源、依赖配置混入时仍 `data=true`。不清除其它路径已置真的 data；未知代码继续 full。夜间和显式全量行为不变。
- `planCovers` 允许 full-unit/capped-browser 的同级覆盖：必需数据必须已验，完整单测须有完整单测证据，浏览器列表及功能集合逐项覆盖。PR capped 不能覆盖 main full-browser。未实现跨阶段部分复用。
- 证据 manifest 的版本/tree/policy/计划不符时提前拒绝，避免无收益 jobs/commit 查询；匹配仍完整校验 run、attempt、全部 test jobs、artifact、实际提交树、PR merge 父节点和原执行来源。绝不用 PR head SHA 代替真实 merge tree。
- 查询结果只在单次 find 内按完整 endpoint 缓存。10 秒预算包括成功 runs 列表、artifact 下载/解压、API 和来源追溯；子进程使用剩余时间超时，迟到成功不予复用。缺失、过期、坏证据、网络失败或预算用尽均执行当前计划。日志记录 elapsed/hit/miss。预算是查询目标，含进程清理的墙钟可能略超；缩短查找可能损失命中，应观察整条发布链耗时。
- Git tree、工作流/工具链配置、锁文件与验证脚本指纹继续有效。策略改变使旧证据失效，首轮重新验证。没有修改工作流、保护规则、发布产物身份检查、业务断言或测试超时。
- 工作流改动沿用现有 maintenance/release 策略测试，并非声称自动跑全部业务浏览器；混入未知 domain/data 后仍 full。本轮仅扩大首页固定测试清单，不放宽原固定清单断言。

## 失败先行与本地验证

Node 20.20.2/npm 10.8.2，与 CI Node 20 主版本一致。新增测试在未改实现的 main 基线产生 5 个预期失败（home映射、loader生成标志、同级覆盖、提前拒绝、预算耗尽），其余58项通过。修复后专项通过。

发布策略回归执行 `vitest run tests/unit/release tests/unit/buildingHistoryCiScope.test.ts tests/unit/mechanism652.test.ts`。首次477项中475通过，2项旧首页清单因新增 mechanism652 而失败；将清单扩大至5个文件，保留精确相等断言后复跑对应测试。证据文件达到行数门禁，按覆盖判断与来源验证拆分，原断言保留。最终结果在交付记录中补充。

验证包括计划/运行器/证据来源/Release CLI 本地假服务及浏览器夹具、配置指纹、lint、types、严格层级与脚本语法。没有改产品代码或测试内容，未跑全量5800单测、3000浏览器、数据再生成或远端 CI；不能据此声称新远端提速已实测。

## 原发布案例回放

本地以实际 Git diff `254c4b5689f90ea5f39898abd46041380fb0c477..e2637089ecbaafc30d08327a080df923064bb8f4`，分别用旧/新策略模拟 PR 与 push：

| 场景    | 旧→新 data | unit      | browser                        |
| ------- | ---------- | --------- | ------------------------------ |
| PR #654 | true→false | full→full | 原5份spec（131项历史用例）保持 |
| main    | true→false | full→full | full→full（历史2971项）        |

因此只取消无关数据步骤：Python 数据测试、固定源缓存/依赖准备、dat/stats、地图预览/目录、核心数据图标拼音、effects/eco/market/garrison/trade 可复现性等 `scope.data` 控制的步骤；没有删除 job。JSON 内容检查、类型/层级、实际 SHA 构建及浏览器门禁保持。

- [PR run 41441855284](https://github.com/linhongcun/aoe2-analyzer/actions/runs/41441855284)：数据步骤累计378秒。
- [main run 41444316267](https://github.com/linhongcun/aoe2-analyzer/actions/runs/41444316267)：数据步骤累计331秒；浏览器2886秒，仍是主要长尾。
- 这类 loader 改动每阶段预计少约5–6分钟；普通 UI 本就不生成，收益为零。上述是历史步骤相加估算，非新 CI 实测。
- 证据 miss 历史55/44秒，以10秒查询预算估计可少约34–45秒；命中率/全链收益未测，不能与避免的测试时间无条件相加。同级 capped 修复不使该 PR 直接覆盖 main。
- [Release run 41453215769](https://github.com/linhongcun/aoe2-analyzer/actions/runs/41453215769)不受本轮影响，保留同一已部署产物发布机制。

发布前须新授权推送/PR，并在新策略下跑实际 CI、独立复核最终提交，观察查询命中率与 main 必需覆盖；本地成果不等于上线。回退可恢复这两个脚本的原逻辑（home新增覆盖应保留），不删除业务断言。
