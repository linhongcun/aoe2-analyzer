# #282 页面数据预算与计算输入瘦身

本轮范围：保持多人施工、驻军预览、驻军回血及既有分享链接的所有计算与界面行为；只改变输入的存储和依赖边界，并增加测量。

## 预算口径

每个登记页面及详情路由样例使用独立浏览器 context，禁用缓存、阻止 Service Worker，从导航开始到 `networkidle` 统计同源 JavaScript 成功响应的解压后正文总字节数（raw bytes；不是 gzip 或 Content-Length）。只测初始默认状态，不触发交互加载，不排除入口和共享数据。

- 全路由首屏超过 1,200,000 bytes 记录告警和附件，不阻断存量页面。
- 本轮 `#/construction` 以 1,800,000 bytes 为严格上限。最新 main 基线为 2,600,907 bytes / 27 个 JS 响应，要求至少减少 30%。
- 原 issue 中 600KB 是建议目标；当前公共 core/trees/单位/科技/建筑数据及入口合计已约 870KB，无法在两份输入瘦身范围内实现 600KB raw 总量。将其保留为后续按页面裁剪公共依赖的目标，不把 gzip 数字冒充 raw 达标。

## 输入和依赖

1. `construction_build.py` 将 56 文明重复的 units、automatic 数组转成确定顺序的共享字典和索引；TypeScript 数据入口还原原结构。保留所有原字段、自动规则及前置闭包，公开导出和计算函数不变。
2. `garrison_general_build.py` 只移除无前端消费者的 name/languageId/minRange/resourceCapacity、重复 catalog.en/zh、building.civs、unitUnlockTechs；保留单位全集、全部计算字段与规则。该脚本同步生成轻量 `garrison_techs.json`，只含免费科技判定需要的规则键、文明 free/disabled 和形态升级索引。
3. 免费科技判定抽成纯函数，由驻军与施工共用。施工不再为免费科技与形态索引静态引入整份驻军单位数据。
4. `--check` 同时校验生成文件；只使用固定 .dat 与现有源 pin，不手改产物、不改游戏数字。

## 行为和验证

- 新增失败用例：旧 construction 原始正文超过 60,000 bytes、旧驻军仍含无消费者字段、施工冷缓存 raw 超过 1,800,000 bytes。
- 对全部 56 文明和全部建筑/规则做规范化 JSON SHA-256 对照。施工解包后须与 main 输入完全一致；驻军剔除上述未消费字段后须与 main 投影完全一致。基线固定于 main cca7e56。
- 既有施工、驻军预览、驻军回血单测与交互测试保持期望不变；Python 施工源回归仅在 setup 解包共享字典，不改断言。
- 360/375/390/1280 明暗主题检查页面无溢出、无 console error/pageerror，默认、非法输入、科技切换、结果与分享状态仍由既有用例覆盖。未更改任何 JSX、CSS、视觉令牌或文案。
- 本地执行必要静态、构建、生成复现与相关测试；PR 由 CI 选择完整验证和数据范围，保留其真实运行证据。
