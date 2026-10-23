# 发行版本

1. 从最新 main 建立 `release/vX.Y.Z` 分支，将 `package.json` 和锁文件中的版本号一起更新，把 Unreleased 内容移入对应日期的 CHANGELOG 小节。
2. 提交发行准备 PR。按仓库约定完成检查后，以 merge commit 合入 main，保留 release 分支头部及其 CI 记录。
3. 等待 release 分支的 CI 和 main 的部署全部成功。
4. 从 **main** 手动调度 GitHub Actions 的 **Release** 工作流，填写三段版本号，例如 `v0.12.0`。

工作流复用 `scripts/release.mjs`，核对 release 头部 CI、线上渲染后的版本号和构建号，再创建 annotated tag 和草稿 Release。随后在已部署网站检查地图、补丁筛选和分享功能；从确认过的 tag 构建静态站点 ZIP 及 SHA256SUMS.txt，上传后发布为正式 Release。

工作流必须从 main 调度：其自身的 check 记录在 main 的合并提交上，避免把运行中的发版任务误算进 release 分支头部的 CI 门禁。release 分支与 main 尖端重合时，脚本忽略名为 release 的 check，test 与 deploy 仍把门禁。首次运行前必须已合并发行准备 PR。

任何步骤失败都停止发布。修复原因后，可以用同一个版本号重跑；发版脚本会核对已有标签的指向，并跳过已完成的步骤。不要用临时本地站点代替线上页脚核对。

下载 ZIP 后，解压到静态 HTTP 服务器目录即可运行，例如在解压目录执行 `python3 -m http.server 8080`，再访问 `http://localhost:8080/`。网站需要 HTTP 服务，不支持直接双击 HTML 文件运行。
