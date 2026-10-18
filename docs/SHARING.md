# 页面分享与静态入口

`npm run build` 先由 `scripts/page_metadata.mjs` 从站内数据生成 `page-metadata.json`，
再执行 Vite，最后由 `scripts/static_pages.mjs` 生成真实 HTML、1200×630 PNG 与 sitemap。
构建需要 Playwright Chromium（CI 已安装；本地首次运行 `npx playwright install chromium`）。
默认公开根地址是 `https://linhongcun.github.io/aoe2-analyzer/`，其他部署用 `SITE_URL` 指定。

静态文件保留完整应用入口，HTML 原文含每页 title、description、canonical、OG 标签，
不依赖爬虫执行 JS，也没有 meta refresh 或 HTTP 重定向。目录页使用相对 `<base>`，
因此 Vite 的相对资源和游戏图标可同时服务于根路径与 GitHub Pages 子路径。
浏览器首次打开真实路径时补齐 HashRouter；旧 hash 链接继续可用。查询参数原样传入路由。

所有详情都有真实路径；首页、文明和开局各有 OG 图，其他页面使用站点默认横图。
单位、科技、文明详情和 PK 结果可以生成、预览、下载 PNG，并复制真实路径分享链接。
图片显示基础属性或页面当前计算结果，不再次推导结果；文明评分明确为主观参考。
改变 PK 配置后隐藏旧预览，避免旧图片被误认为新结果。PK 链接保留完整双方和数量参数。

开局卡第二格的两段不拆开换行已在原实现完成，此次保留既有测试与 PNG 生成逻辑。
旧开局卡上的 hash 深链继续兼容；新生成的开局卡与复制/系统分享按钮也使用真实路径，并保留文明、距离、自动建房和当前步骤参数。

验证用原始 HTTP 请求（含 MicroMessenger UA）检查 HTML 和 PNG 尺寸，并用浏览器
检查真实路径资源加载、四宽度无溢出、PNG 下载及 PK 参数还原。
微信、QQ、Discord 客户端的实际卡片展示尚未真机验证；平台缓存、缩略图策略属于平台行为，
不能仅凭本地 HTTP 检查宣称已在这些客户端通过。
