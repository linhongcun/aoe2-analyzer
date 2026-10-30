# #197 最后两文明验证记录

基于main ed866abd（v0.69.0），候选v0.70.0，固定DE188329。未合并、未部署；受保护旧合同仍待具体迁移授权，详见[提案](final-civs197-acceptance-migration.md)。

- 来源：eco producer一次完成、零对账差异；Poles/Romans标准有界摘要和combined physical三报告复现检查通过，schema严格验证通过，来源预算通过。完整DAT与闭包仅留忽略缓存。
- 计算：Poles34项与Romans52项专测通过；13份相关unit文件206通过、1todo（其中buildSim包含全部模板×文明完成检查）。真实首次失败涉及物理守卫对缺少全局record的后时代实体过严、草稿探针tick/自动建房设置等，已修；不把修前失败算通过。
- 因果/用途：沿原#317生成器生成97项，旧93项结果逐项精确保持，新增Poles-1/2=null、Romans-0=feudal-drush-18、Romans-2=null。首次验证发现蝎式弩费用被整体标为当前模拟已计入、波兰未触发科技树缺明确结论；修复892使用共享实际对象分类并补波兰当前无对应研究说明。该真实修复后，#31713项及Romans52项共65项通过；没有扩到无关全量。
- 回归：其它54文明加Generic的440份完整timeline对象和1485份gather helper前后精确一致。两新文明16份完整模板无超时，前后时代、库存、建筑变化见量化报告。892分类修正不改变当前8模板计时/收入，仅修正无蝎式弩时的用途分类。
- 静态：TypeScript/build通过；lint原唯一新error为unused参数已修并定点ESLint通过，其余既有max-lines warnings保留；颜色、CSS语法、strict层检查、strict content49份零告警、compiled validators8边界复现、bo:check8模板零错、diff whitespace通过。第二次构建由首次用途检查真实发现后的修正触发，不是重复阶段等待。
- 浏览器：同次候选构建运行33项，32通过，唯一本次已知322Roman旧合同失败。含新9项四宽360/375/390/1280×浅深，56选择器、两文明八模板、说明、分享、跟练/打印、两份真实1080×1350PNG、share axe；v060两项和322其余20场景及清单检查通过。最初收集遇Node24 JSON attribute错误已修，未把收集失败算运行通过。
- 最终修正后的构建短烟测：两文明360px直链无fallback、正确说明，Poles未研究骑兵升级说明与Romans无蝎式弩sim用途行均通过；补两文明360px scrollTop0清晰首屏。前一批窄屏fullPage截图存在浏览器继承scroll位置产生sticky遮住首步的捕获伪影，不据其宣称每行无遮，最终清晰首屏已补；未重复全部浏览器矩阵。
- 独立复核：batch18_integration_review范围及code/source GO；batch18_poles_source和batch18_status_ui分别实际查看各13张两文明原图（各四宽双主题timeline、share DOM/下载PNG、practice/print/bonus），GO。26张原图已审；最终提交绑定另记，未冒称原图按最终SHA重新构建。
- 历史保护：322 spec/JSON、civ42v070、v0300-289及原数值fixtures字节保持；C段真实定点运行4失败、2通过、16未选。未改期望、跳过、改mock或以空列表伪造通过。此冲突在批准迁移前阻止合并。

构建和测试日志、截图仅在`/tmp/batch18-*`，不提交dist/PNG/node_modules/DAT/cache。当前不需要启动已知会因历史合同失败的重复远端全量CI；PR保持draft供维护者审核具体迁移。没有宣称远端CI或部署已成功。
