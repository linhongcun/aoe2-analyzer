# #364 全页视觉守恒验证工具

这些脚本只读取通过 HTTP 托管的生产产物、采集浏览器截图和核对像素，不修改产品、游戏数据、验收 fixture 或截图内容，也不添加项目依赖。用途是核对标题语义修复前后外观完全一致，不替代 heading-order、数值或功能验收。

## 环境

- 项目已有的 Node、`@playwright/test` 与对应 Chromium；在项目执行过 `npm ci` 和浏览器安装。
- Python 3.10+ 与 Pillow。准备阶段实际使用 Pillow 12.3.0。Pillow 只需要在执行本地像素验证的环境中存在，不加入 package.json，也不让每个 CI 阶段额外安装或运行全矩阵。
- 前后使用同一 Chromium、系统字体和机器环境；脚本记录并要求浏览器版本一致。DPR 为1、viewport 高度900、reduced motion、禁止 service worker。每个场景使用新页面，等待网络和字体、展开后再等待字体及两帧，截图关闭动画和光标。

脚本从项目正常解析 `@playwright/test`，没有固定工作区路径。应在当前 checkout 的项目中运行，不把脚本复制到失去 node_modules 解析路径的随机目录后执行。

## 产物与身份

基线应是实施时最新 main 的已部署 ZIP或明确的固定提交生产构建，候选是待复核的生产构建。分别托管到两个本地端口，保持基线目录不可被候选 `npm run build` 覆盖。

CLI 的 build/version 参数表示**编译页脚标识**，脚本会实际核对每页的版本、构建前缀和唯一 footer 元素；它们本身不能证明构建来自哪个源代码 tree。交付记录还必须附真实 source commit/tree、构建来源 run/manifest 或本地构建记录，并由独立代理核对与最终提交的关系。不要把旧页脚的已测产物声称成后来提交已构建或已上线。

准备阶段可以采集 a0ed295/v0.40.0 的预备基线；它不是 #442 之后的新版 main。仅在确认 #442 未改变 Duel 及共享运行时/样式闭包并记录真实资产关系后，才能认定其可复用；否则使用新的实际 main 重新采基线。

## 完整矩阵

`all` 模式为23个场景×4宽度（360/375/390/1280）×2主题（light/dark），共184张/阶段：

- 1v1、N vs M、等资源、等采集时间、单方不可用、双方不可用，各默认和全部详情展开。
- 保存基准的升级比较、条件瓦兰吉加成，各默认和展开。
- 已计入、未支持、研究费用类三个来源浮层，以及采集时间口径浮层。
- 单位模拟器、建筑模拟器的默认共享面板，以及单位概览的 Basis 浮层。

`sample` 只取其中7个场景的390/light，用来校验工具确定性，不能当完整矩阵通过。没有空矩阵、减少场景或只比较局部标题的模式。

唯一归一化是两个发布元数据的文字：

1. `[data-t="footer-app-version"]` → `VERSION`
2. `[data-t="footer-build"]` → `BUILD`

前后都要求这两个元素各恰好一个。不会隐藏整个页脚、改变其他内容或增加遮罩。版本号与构建号随独立发布变化，不属于标题修复的视觉变化。

## 使用

在两个独立目录中准备并托管生产产物后，从项目根运行。以下 `<...>` 是要替换的已知真实编译标识；输出目录必须为空，每次失败保留原目录，选择新目录恢复，不混入旧截图。

```bash
node docs/design/duel-heading-364-visual/capture.mjs \
  http://127.0.0.1:3643/ /tmp/364-before \
  <BASELINE_BUILD_SHA> <BASELINE_APP_VERSION> all

node docs/design/duel-heading-364-visual/capture.mjs \
  http://127.0.0.1:3642/ /tmp/364-after \
  <CANDIDATE_BUILD_SHA> <CANDIDATE_APP_VERSION> all

python3 docs/design/duel-heading-364-visual/compare.py \
  /tmp/364-before /tmp/364-after > /tmp/364-visual-comparison.json
```

直接重定向仍保留非零退出码；若改用管道记录日志，先设置 `set -o pipefail`。报告生成但命令非零仍表示失败。

## 严格比较内容

`capture.json` 记录模式、场景集合、视口/主题、输入路由、规范化后的 hash、实际页脚标识、浏览器版本、采集脚本 SHA256 和每张 PNG 的 SHA256。脚本摘要在启动时读取，不能因采集中修改脚本而把后来文件冒充已执行版本。

`compare.py` 检查完整非空矩阵、唯一 keys、PNG 文件库存和文件名、重算所有 PNG SHA256，再要求前后对应的输入 route、canonicalHash 和可见标题文字/顺序相同。不会错误地要求输入 query 与 canonicalHash 逐字相同：例如等采集时间的默认 vil/min 会按原规则从 canonicalHash 去除。

前后必须使用相同采集脚本、浏览器、配置及两个固定归一化字段。图片尺寸相同，宽度与视口对应；RGBA 任一通道的不同都计为一个不同像素，最终必须全部为0。算法通过四通道最大差值直方图计数，不用可能漏掉透明 RGB 差异的 RGBA `getbbox()`，不引入抗锯齿阈值或容差。失败时检查代码和样式，不增加遮罩、减场景或放宽期望。

## 报告范围与后续 CI

`determinism-sample-report.json` 是准备阶段对**同一未修复基线**独立采集两次的7对全页零差异报告，只证明字体、截图与比较工具可稳定工作，不是产品修复已通过或已上线的证据。

完整预备基线的真实采集身份、计数和摘要见 `baseline-summary.json`；PNG与原始 capture.json 留在本地验证产物中，不提交PNG。后续产品实施完成后，再执行一次完整候选矩阵并严格比较，附实际 commit/tree与像素报告交独立复核。

工具完整性还实测拒绝了六种只改 manifest 的反例：PNG 摘要不符、输入 route 不符、canonicalHash 不符、空矩阵、重复 key，以及前后共同添加第三个归一化字段。反例没有修改 PNG 文件。这些结果只验证工具，不表示标题修复已经实施。

最终 E2E 可另加8个四宽×主题的代表展开态检查，包含 heading-order、溢出、console/pageerror 与截图，使用默认 test-results 目录供 PR CI 上传四宽明暗产物。完整184对像素矩阵只做一次必要本地验证，不在 PR/main/Release 每个阶段机械重复。
