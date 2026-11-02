# #558 未发布0.74.14的导航集成恢复

基线为actualmain `8ff448e43232b3679b6af8838abb8eed64a7f1ef`。完整浏览器9项失败、2934项通过、13项跳过，部署停止，0.74.14未发布。本轮只处理这两类实际失败，不修改版本、游戏数据、Matchup加载或评分、受保护验收及现行CI风险规则。

## 建议入口的普通验收迁移

新增已授权 `/team-fit` 后，已登记入口的404建议仍沿既有 `suggestRoutes` 最多3条合同。共享team词现在正确得到“团战分工” `/team-plan`、“文明搭配” `/team-fit`、“队伍加成” `/team-bonuses`；普通notFound290仍硬写2条，导致四宽双主题8项失败。实际main在360浅色再次复现expected2/actual3。只将该普通验收精确迁移为当前三标签和三href，逐条进入实际页面、核标题并返回，保留原四宽明暗与错误/溢出检查。算法上限、排序及新页面登记不改。

## Compare过期效果不能接管后续导航

原smoke失败快照显示浏览器实际回到Compare，`compare=true/matchup=false`且无pageerror/failedRequest，不是先推定加载慢。独立复现在实际生产构建中仅设CPU10x、Matchup页面chunk延迟200ms，沿原流程从Compare评分文字出现后立即前往Matchup，两次实际发生回退。CDP只读断点确认旧effect捕获`pathname=/compare`、`query=''`、`needsReplace=true`，执行时浏览器已是`#/matchup`，随后它写回`#/compare?a=Franks&b=Britons`。这段来源于旧#403，不声称由558新写；协调者将它纳入本次完整发布的必要集成恢复。

Compare本feature增加纯位置守卫：依HashRouter的`parsePath(hash.slice(1))`与leadingSlash规则解析浏览器当前fragment，缺省pathname为`/`，既不以`/`也不以`.`起头才补`/`。仅当原始pathname/search/hash与本render的`useLocation`快照逐字一致，且解码后的路径仍匹配Compare时，才允许原canonical replace。原query字节、重复/unknown参数和fragment用于一致性比较，不预先重排。保留原`resolveCompareQuery`和canonical写法，保留`#compare`、`/COMPARE`、`/%63ompare`及trailing slash；不使用全局history补丁、生产延迟、加等待或提高5秒超时。

新单测覆盖真实过期快照、同页新pair、query顺序/编码字节与fragment变化、别名和路径所有权。普通浏览器回归仅一个有界CPU10x＋Matchup chunk200ms场景，使用原smoke断言并在finally还原控制；另核当前pair/重复query/fragment与Back。既有#403全部单测/浏览器和原smoke评分用例保持。新helper与回归仅在真实compare profile追加具体路径，未新增domain/routing豁免，最终计划独立核对。

真实全量失败摘录及两份受控旧构建证据由本轮交付记录保存；执行者不以普通本地偶发通过冒称旧竞态不存在，也不将新的定向成功写成全站浏览器已经全部通过。

## 本版累计发布短核验

本版前两次main均未完成部署。最后一次main的增量CI计划若只有compare，不能据此漏掉本版先前新增的Team Fit上线检查。复用现有prepare-release增加`--smoke-plan`模式，保留原可信来源/版本/current-main/test+deploy全部门禁，仅在npm ci及已部署产物身份/字节验证之后动态加载planRange。

基线从同仓库API的最新正式非draft、非prerelease、有效发布时间/id/tag的Release取得。远端精确tag对象须与本地refs/tags对象一致，再剥离commit、核包版本与tag相等且为actualdeployed祖先。手动恢复已正式同版本时，从列表选择严格较早版本的最近正式Release并同款核验；没有可信基线即失败，不用head..head或猜版本。仅向RUNNER_TEMP固定release-smoke-plan.json写真实baseline→actualdeployed差分计划，purpose明确只是累计feature smoke；不修改dist的原增量CI证据、来源runid、产物身份或字节，不声称该累计范围已被CI全部验证。

workflow只在现有npm ci/产物验证后、打tag前增加同权限的计划步骤，并将原feature smoke的plan路径改向该临时文件。原post-artifact验证、ZIP、权限、超时及构建保持。合法maintenance累计features=[]仍核首页/页脚。实际CLI测试采用临时Git历史和fake gh，覆盖轻量/annotated tag、未发布多提交累计、同版手动恢复、maintenance空特性、基线与来源拒绝、原artifact不变及workflow阶段；旧CLI的实际缺累计计划行为单独记录，不拿缺新export当失败证据。
