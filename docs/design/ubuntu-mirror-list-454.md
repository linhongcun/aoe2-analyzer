# #454 Ubuntu runner 镜像列表修复

## 来源与故障

已核对 [actions/runner-images 的 configure-apt-sources.sh（固定提交 6d35e16176367288d91febefafbd221cb2da6ca1）](https://github.com/actions/runner-images/blob/6d35e16176367288d91febefafbd221cb2da6ca1/images/ubuntu/scripts/build/configure-apt-sources.sh)。该脚本将 Ubuntu 源改为 `mirror+file:/etc/apt/apt-mirrors.txt`，列表依次为：

| 地址                                      | 优先级 |
| ----------------------------------------- | ------ |
| `http://azure.archive.ubuntu.com/ubuntu/` | 1      |
| `https://archive.ubuntu.com/ubuntu/`      | 2      |
| `https://security.ubuntu.com/ubuntu/`     | 3      |

此前工作流只替换 `sources.list` 和 `ubuntu.sources` 内的 Azure 主机名；源使用上述文件间接寻址时，实际优先级 1 的地址仍是 Azure，因此修复没有作用。

## 精确范围与验收

仅在 CI、Release 的既有 `Use Ubuntu public package mirror` 循环中加入 `/etc/apt/apt-mirrors.txt`，继续按文件存在性检查并替换同一主机名。优先级 1 变为 `http://archive.ubuntu.com/ubuntu/`；协议、优先级、备用及安全源、suite、组件、签名设置，以及 Release 的 `should_release` 门禁全部保持原样。不改产品界面、数据、领域逻辑、依赖、超时、重试或测试选择策略。

`tests/unit/releaseUbuntuMirror454.test.ts` 从两份 YAML 提取真实 shell，在临时 `/etc/apt` fixture 中执行（只重映射路径、去掉 `sudo`），沿真实 `mirror+file:` 配置读取镜像列表，再按优先级核对所选主机。另核对直接源、完整文件内容及缺失可选文件的行为。修改工作流前，首次回归为 6 项失败、7 项通过，所选主机明确仍是 `azure.archive.ubuntu.com`；日志保留于执行环境 `/tmp/civ454-first-red.log`。

## 同版本恢复

本次是 v0.45.1 交付的必要恢复：#452 的界面代码已进入 main，但该版本尚未部署、打 tag 或正式 Release。按 [RELEASING 的故障恢复规则](../RELEASING.md#核验恢复与环境)修复真实原因后继续同版本交付，保留 package 与锁文件的 `0.45.1`，不为未发布版本另增版本号。
