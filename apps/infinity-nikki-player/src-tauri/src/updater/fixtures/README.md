# 更新验签测试数据

`package.txt` 是文本测试数据，不是可安装程序。公钥与 `.sig` 使用 Tauri 官方 CLI 的 `signer generate`、`signer sign` 生成，测试私钥不入库，也不用于任何正式发布。

本地故障服务器用它验证真实 HTTP 下载、重试与 Minisign 校验。测试只下载字节，绝不调用安装器。
