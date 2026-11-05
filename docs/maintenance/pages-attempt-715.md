# Pages attempt 时间校验（#715）

本轮机制批次#704交付发现的发布阻塞；不扩游戏功能，不改权限、依赖、数据或验证预算。当前未发布版本仍为v0.77.21，按同版本恢复流程交付。

## 真实证据

main `9d05b664646aae0052be0eb1394158b576aeaaf8` 的CI run42024496417，test成功，deploy失败为CI_PAGES_FAILED。GitHub `/actions/runs/42024496417` 创建时间12:07:33Z，`/attempts/1`创建12:07:34Z、开始12:07:33Z。attempt2创建12:13:29Z、开始12:13:28Z。合法attempt创建时间可晚于原run，也可略晚于其开始时间。

## 修复边界

保留`run.created_at === budget.originMs`与原始30分钟deadline；attempt创建时间须合法且在原run epoch到当前时钟之间，开始时间独立在同一窗口。保留run/repository/attempt/SHA、成功test gate、当前artifact、OIDC、线上不可变manifest等所有身份和时序验证。禁止以attempt时间重置预算。新增合法晚1秒及晚数分钟场景；拒绝创建过去/未来/非法日期、错id/attempt/SHA与非法开始时间，原到期及来源负例保持。

## 验证与交付

先在当前main运行新增case，确认真实失败；独立预审后改最小校验条件，原ciDeploy659全文件与ciBudget相关测试通过。CI策略代码走现行full范围（data=false），未改页面故无新增UI截图要求。独立终审实际SHA、CI成功后合入，main真实build/smoke/test/deploy及正式v0.77.21 Release核验后关闭#715与已交付#704，再继续#705。
