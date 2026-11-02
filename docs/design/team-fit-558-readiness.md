# #558 阶段一真实基线

本记录在产品实现前生成，供独立 readiness 复核；本阶段只有设计文档和浏览器测试，未创建新页面或模型。

- 实际基线：main `ef3d0e6f988eaa73a5e111a0eed29013336cc907`（#585 合入后）。
- 被测版本/构建：浏览器实际读取 `v0.74.13` / `构建 ef3d0e6`，预览端口4558。
- 身份：`hongcun lin <linhongcun2021@gmail.com>`，沿仓库配置。
- `git diff --exit-code HEAD -- src package.json package-lock.json` 在构建前及浏览器运行后均成功，产品源码与包版本为零差分。
- `npm run build` 成功，包括957个静态页与OG生成；不是另造缺页替身。

实际命令：

```sh
BASE_URL=http://127.0.0.1:4558/ npx playwright test tests/e2e/teamFit558.spec.ts --workers=1 --retries=0 --reporter=line
```

结果为 **2 failed / 1 passed，12.0s**。失败来自实际页面缺少预期标题，不是环境、导入或编译错误：

| 实际入口                                                                                    | 实际观察                                         | 断言结果                        |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------- |
| `#/team-fit`                                                                                | h1“找不到该页”，h2“你是不是要找”                 | 预期h1“文明搭配”不存在，红灯    |
| `#/team-fit?v=1&mates=Persians%2CMayans&candidate=Franks`                                   | 同上；浏览器地址保留实际配置                     | 预期h1“文明搭配”不存在，红灯    |
| `#/team-bonuses?tv=1&players=Franks%2CPersians%2CMayans&age=4&target=all&unit=&researched=` | h1“队伍加成一屏汇总”；三文明真实来源可见         | 正控制通过                      |
| `#/team-plan`                                                                               | h1“团战分工计划”；P1主兵种为空且显示“未指定兵种” | 同一正控制测试通过；无pageerror |

每个入口在预期断言前均写出实际URL、标题、页脚版本/构建JSON与首屏PNG；测试重跑后产物位于 `test-results/`。本次固定记录另存于执行环境的 `/workspace/work/issue558-evidence/`：`baseline-build.log`、`baseline-readiness.log`、`baseline-observations.json` 及四组同名前缀的JSON/PNG。没有将构建产物或截图提交进产品源码。

[形态事实审计](team-fit-558-shape-alias-review.json)所记录的units/trees输入SHA256与本基线一致，校验结果在同一证据目录的 `source-fingerprint-check.json`。该文件是事实核对，不冒充产品算法测试。

新模型模块尚不存在，[模型与交互合同](team-fit-558-contract.md)尚未执行行为断言；没有以缺模块/import error充当精确投影红灯。独立 readiness PASS 后再实现模型、页面、版本和CI，随后让同一浏览器合同由红转绿并补齐规格中的完整验收。
