# #652 剩余测试的基线对照诊断

## 结论

本次新路线未改动失败测试的传递依赖，未发现新模块导入或全局副作用参与；在干净main上已复现同类5秒超时。原四个剩余用例在Node20当前分支整文件验证中均通过，但另外一个旧矩阵用例超时，因此不能宣称全量稳定性已通过，也不能把Node24或CPU限流认定为唯一根因。没有提高阈值、修改断言或改动旧模拟器。

## 受控条件

- 当前应用：43b418abf394d95b09e71a6e084555fc12e5b104（应用代码1a61d2c）；干净main：e2637089ecbaafc30d08327a080df923064bb8f4，fetch后确认未变化，独立detached工作树 `/workspace/aoe2-652-baseline`。
- 两树共享同一实体node_modules、相同锁文件和Vitest3.2.7；每次只启动一个测试文件、`--maxWorkers=1`，原5秒阈值不变。逐用例用`-t`精确匹配，其他skipped只是本次过滤，不计作回归通过。
- 逐用例和单文件均串行交替当前/基线顺序，不同时运行构建或其他测试。开始前检查仅有RSS为0的退出进程，没有活跃残留Vitest/浏览器worker；僵尸的历史CPU百分比不作为当前竞争证据。
- Node24.19.0为云端默认；CI的`.github/workflows/ci.yml`明确Node20。第二阶段使用官方Node20.20.2/npm10.8.2，PATH向所有子进程传递，依赖/源码不变。下载官方latest-v20.x并核对SHASUMS256，SHA256为`df770b2a6f130ed8627c9782c988fda9669fa23898329a61a871e32f965e007d`。
- cgroup CPU配额4核、内存上限16GiB。每秒采样进程状态、RSS、cgroup cpu.stat/memory.current，并以wait4记录命令及子进程CPU时间/最大RSS。运行前后均无活跃竞争测试；内存events的high/max/oom/oom_kill均为0。
- `/proc/pressure/*`不可用，不能声称排除宿主机所有争用。采样显示部分CPU限流，但不足以单独解释所有耗时差异；本诊断未做未经验证的JIT/GC归因。

独立代理以TypeScript AST追踪测试、setup、Vite配置、动态读取与数据，共76文件，与main逐文件内容及SHA256完全相同，未解析相对依赖0，新路线/UI模块0。唯一配置值差异__BUILD__为各自HEAD，不参与这组模拟计算。审计原文为证据目录`652-route-import-audit.txt`。

## Node24逐用例

表内为Vitest单用例耗时，不是整条命令启动/收集耗时。

| 原剩余用例                                                 | 当前分支        | 干净main        |
| ---------------------------------------------------------- | --------------- | --------------- |
| hybrid-fish-18 × Wei                                       | passed 868.7ms  | passed 1345.2ms |
| hybrid-fish-18 × Cumans                                    | passed 897.7ms  | passed 906.6ms  |
| hybrid-fish-18 × Franks                                    | failed 5131.6ms | passed 751.7ms  |
| 当前八开局不建大学，原团队研究加成不改变结果或额外计入采金 | passed 2117.9ms | passed 2674.4ms |

## Node24单文件

| 文件    | 当前通过/失败 | main通过/失败 |
| ------- | ------------- | ------------- |
| matrix1 | 113/1         | 111/3         |
| matrix3 | 113/1         | 114/0         |
| malians | 48/0          | 48/0          |

准确失败用例（均为5秒超时；其余断言未失败）：

- file-matrix1-baseline: `同一个时间全站一致 hybrid-fish-18 × Bulgarians`，7190.3ms。
- file-matrix1-baseline: `同一个时间全站一致 hybrid-fish-18 × Incas`，5793.7ms。
- file-matrix1-baseline: `同一个时间全站一致 hybrid-fish-18 × Poles`，5816.5ms。
- file-matrix1-current: `同一个时间全站一致 hybrid-fish-18 × Spanish`，6857.3ms。
- file-matrix3-current: `同一个时间全站一致 hybrid-fish-18 × Armenians`，10560.7ms。

原四个剩余用例在这轮整文件对照两边均通过。失败迁移到其他旧用例，且main本身复现3个超时，说明不能只凭单次Franks当前失败/main通过认定本次回归。

## Node20限定验证

| 范围                    | 通过/失败 | 说明                                                 |
| ----------------------- | --------- | ---------------------------------------------------- |
| node20-matrix1-current  | 114/0     | 通过                                                 |
| node20-matrix3-current  | 113/1     | 同一个时间全站一致 maa-archers-18 × Generic 8101.8ms |
| node20-malians-current  | 48/0      | 通过                                                 |
| node20-routes-current   | 23/0      | 通过                                                 |
| node20-matrix3-baseline | 114/0     | 通过                                                 |

当前限定范围298通过、1超时；原四个剩余用例在Node20下通过，新路线23项通过。Node20 main的matrix3为114通过；current超时迁移到maa-archers-18 × Generic。单份通过不能证明稳定，切换Node主版本并未完全消除问题。

## CPU与内存记录

CPU秒为本条命令及子进程累计用户+内核时间，可能超过墙钟秒；RSS是wait4报告的子进程最大驻留值，不是所有子进程同时相加。cgroup峰值涵盖整个本容器。原始每秒进程记录可用于核对测试并发。

| 运行                    | 墙钟秒 | CPU秒   | 最大RSS MiB | cgroup峰值 MiB | 限流增量ms |
| ----------------------- | ------ | ------- | ----------- | -------------- | ---------- |
| file-malians-baseline   | 6.164  | 10.001  | 226.34      | 830.66         | 114.802    |
| file-malians-current    | 9.798  | 14.863  | 236.85      | 849.72         | 0.0        |
| file-matrix1-baseline   | 76.398 | 108.679 | 321.75      | 896.72         | 149.923    |
| file-matrix1-current    | 67.205 | 102.076 | 270.09      | 851.29         | 317.506    |
| file-matrix3-baseline   | 58.324 | 89.308  | 281.41      | 863.81         | 17.657     |
| file-matrix3-current    | 82.558 | 117.632 | 292.01      | 857.42         | 2499.295   |
| node20-malians-current  | 6.203  | 11.133  | 211.67      | 1015.58        | 0.0        |
| node20-matrix1-current  | 52.637 | 88.342  | 232.68      | 992.55         | 123.672    |
| node20-matrix3-baseline | 79.174 | 132.658 | 249.77      | 1015.55        | 2090.515   |
| node20-matrix3-current  | 67.638 | 111.973 | 239.21      | 989.75         | 186.642    |
| node20-routes-current   | 4.124  | 5.178   | 148.58      | 931.11         | 0.0        |
| single-cumans-baseline  | 5.319  | 6.868   | 147.43      | 685.85         | 0.0        |
| single-cumans-current   | 6.379  | 7.805   | 146.38      | 679.45         | 0.0        |
| single-franks-baseline  | 4.139  | 5.635   | 137.45      | 702.59         | 0.0        |
| single-franks-current   | 10.991 | 13.815  | 154.87      | 721.38         | 329.222    |
| single-malians-baseline | 6.22   | 10.536  | 235.62      | 816.86         | 0.0        |
| single-malians-current  | 6.2    | 8.839   | 235.71      | 807.36         | 0.0        |
| single-wei-baseline     | 6.276  | 7.695   | 146.24      | 710.08         | 0.0        |
| single-wei-current      | 6.235  | 7.24    | 142.66      | 697.89         | 0.0        |

当前matrix3的Node24限流约2.50秒、Franks单例约0.329秒，不能解释全部差异。无内存上限事件，也没有观察到同时运行的其他测试任务；资源记录只能界定可观察范围，不能把所有超时归于CPU限流。

## 复现与后续边界

原始证据：`/workspace/652-route-evidence/diagnostics/`。`run_compare.py`执行四个单用例对照，`run_files.py`执行三文件对照，`run_node20.py`及`run_node20_baseline.py`执行CI主版本限定对照。每条命令、工作目录、退出码、CPU/内存样本在对应`.metrics.json`，测试名/耗时/状态在Vitest `.json`，完整输出在`.log`。本轮没有再跑全站套件。

本轮应用代码及专项质量核验完成，无证据需要修改新路线；旧矩阵在当前云环境的时间稳定性仍未满足发布门禁。若要进一步消除此发布阻断，下一项具体操作是授权推送此分支，再通过既有`workflow_dispatch`运行仓库Node20验证（工作流标明完整后台回归、不部署），以区分该云执行器与正式CI。它将包含这三个旧文件，不能保证只执行这些文件；**不包含合并或部署，也无需创建PR**。当前授权明确禁止推送/PR，因此没有执行该外部操作，并非工具拒绝。若正式CI同样超时，则应另行处理旧模拟器/测试矩阵性能，不能借此扩大本轮功能或放宽5秒阈值。
