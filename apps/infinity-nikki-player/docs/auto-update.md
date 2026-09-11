# 自动更新机制

本应用保留 Tauri 官方更新器、Store 和日志插件。Rust 的 `src-tauri/src/updater/` 唯一管理检查、下载、取消、安装和启动调度；前端 `features/app-updater/controller.ts` 只订阅状态、处理编辑保护并驱动顶部和关于页入口。

## 更新来源

固定清单 Release 为 `infinity-nikki-player-updates`，包含 `latest.json` 和 `latest-cn.json`。安装包仍在 `infinity-nikki-player@v版本号` Release。两个清单来自官方 `tauri-apps/tauri-action` 产出的同一份清单，代理版本只添加 `https://gh-proxy.com/` 下载前缀，签名不变。

- 检查同时请求两个固定入口，每个请求总时限 8 秒，包含读取正文；独立捕获网络、解析和平台错误。有效结果中选择最高 SemVer；保留本次运行已经发现的更高版本，避免缓存使候选回退。
- 任一有效清单可形成检查结果。只有有效结果明确没有更高版本，才显示“未发现新版本”。两路均失败则显示“检查更新失败”，后台检查失败不弹窗。
- 目标确定后，始终先代理下载，再 GitHub 直连。只切换同一版本、同一文件、同一签名的地址；每个来源网络错误最多两次，等待 2 秒；签名错误直接切源。
- 官方 HTTP 客户端设置连接超时 5 秒、连续读取停滞超时 30 秒、每次下载总时限 30 分钟。每次尝试重置进度。长度未知时只显示字节数，不能伪造百分比。
- 只有官方 `Update::download()` 返回成功（已通过签名校验）才进入待安装。取消会丢弃下载任务和未校验字节；操作代数及状态版本号隔离迟到回调。

代理和 GitHub 共享 GitHub 上游。任一路径可用时应能继续；两条路径均不可达时必须明确失败并提供恢复入口，不能承诺任意地区、任意网络下始终可用。

## 生命周期与安装

正式构建在 Rust 初始化后检查一次，不等待音频或 WebView 初始化。启动失败后在启动后的 30 秒、2 分钟补查；然后每 6 小时检查，休眠恢复跳过积压周期。联网恢复、窗口聚焦发起恢复检查，距上次尝试不足 5 分钟不请求。下载、待安装和安装期间跳过检查。开发构建不运行启动周期检查，手动及恢复事件仍通过相同原生策略。

前端先显示原生窗口，背景图交给浏览器绘制，音频预热在后台进行；不把图片解码、动画帧或音色加载作为更新入口可用的前置条件。恢复检查同时订阅官方原生窗口焦点事件和页面焦点，重复事件由 Rust 去重。

用户点击后才下载。下载完成后，主窗口通过当前路由页面已经暴露的 `confirmLeaveIfNeeded()` 确认保存、丢弃或取消；保存失败或取消保留已下载包。确认通过后停止试听与演奏，等待按键释放。安装准备期间禁用主窗口编辑，安装开始后禁止取消或并发更新。不能依赖 Windows 进程退出时的 `beforeunload` 保存内容。

调用安装前，官方 Store 显式保存 `updater-state.json`：旧版本、目标版本、原运行路径、尝试时间与结果。保存失败阻止安装。Windows 由官方 NSIS 更新流程负责安装目录恢复和启动新版，保留 `currentUser`；macOS 安装完成后调用 Tauri 的 `AppHandle::restart()`。

安装器启动或返回不代表成功。每次启动都用 Tauri 实际应用版本重新核对安装记录，包括已确认成功后又打开旧副本的情形：当前版本等于或高于目标才显示已生效，否则显示“上次更新尚未生效”。不会自动反复安装。

关于页使用官方 `getVersion()`，Tauri 配置引用 `../package.json`。自定义 Info.plist 不覆盖 Tauri 生成的版本、标识和最低系统要求。签名、公钥、应用标识及用户数据路径不随本次重构改变；原有设置、模板、歌单、草稿不做迁移或删除。

## 发布与恢复

工作流 `.github/workflows/release-infinity-nikki-player.yml` 全程串行，仅允许 main 发布；版本 PR 应先写入 package.json、Cargo.toml 及 Cargo.lock 中一致的版本，中文 Changeset 生成 CHANGELOG。没有版本值增加的普通提交不发布；Git 提交不可读取直接失败。

1. `prepare` 比较真实版本值，创建或恢复同提交的草稿；tag 查询返回 404 时从完整 Release 列表查找草稿，不能直接当作不存在。不同提交不能复用同版本；已公开版本只允许补齐固定入口。旧版本任务不能覆盖较新发布。
2. macOS Apple Silicon 和 Windows x64 依次调用官方 action 上传同一草稿，框架负责构建、签名与标准清单合并。构建后从实际应用包读取版本，并上传对应提交的双平台校验凭据。
3. `publish` 将官方 action v1 清单中的资产 API 地址，按同一 Release 已上传资产映射为 `browser_download_url`；版本、签名和其他字段不变，不猜测文件名。下载所有已上传产物，校验长度、可用的 GitHub 摘要、平台、版本、对应资产、签名文件，并使用 Minisign 官方工具验证更新签名。缺任一平台、签名或包内版本凭据都不公开。
4. 上传并回读采用公开下载地址的直连、代理双清单后公开正式 Release，设置 `make_latest: true`。每个正式 Release 永久保留双清单，兼容旧客户端。其他应用及固定清单 Release 使用 `make_latest: false`。
5. 固定入口先替换直连清单，认证 API 回读及公开路径验证成功后，再替换代理清单。任何一步失败立即停止；另一份有效清单保留。两份清单暂时版本不同，由客户端选择较高版本。

如果上次失败后只剩直连清单，先用它恢复同版本备用清单，再推进新版本；同内容重跑只验证，不删除重传，避免替换唯一有效入口。

同提交重跑失败工作流可以恢复草稿，或在版本已公开后继续固定入口发布；不得重新构建并覆盖已公开版本。发布前仍再次检查最高正式版本及固定入口版本，防止旧任务晚到。历史版本没有新的双平台校验凭据时，不能用新流程补写旧版产物，应发布新版本。

发布脚本是应用专属策略，不放入通用 packages。GitHub 交互使用官方 `gh`，版本比较使用维护中的 `semver`，没有自建签名算法或安装器。

## 验证

从仓库根目录运行：

```bash
node --test apps/infinity-nikki-player/scripts/updater-release.test.mjs
node apps/infinity-nikki-player/scripts/updater-release.mjs verify-version
pnpm --filter @strawberrybear/infinity-nikki-player test
pnpm --filter @strawberrybear/infinity-nikki-player test:browser
cargo test --locked --manifest-path apps/infinity-nikki-player/src-tauri/Cargo.toml updater::
```

原生故障测试在本机临时端口运行，调用真实官方检查和下载 API，覆盖超时、HTML、坏 JSON、缺平台、不同版本、截断、停滞、签名失败及切源。测试公钥只验证文本数据，从不执行安装。前端通过独立适配器注入测试，不提供可污染生产状态的全局模拟开关。

发布签名校验、平台包内版本和真实安装是不同的验收。隔离设备和地区网络尚未验证的项目见 [升级验收记录](update-validation.md)，不能用浏览器或单元测试代替。

## 官方参考

- [Tauri 更新插件](https://v2.tauri.app/plugin/updater/)
- [Tauri Store](https://v2.tauri.app/plugin/store/)
- [Tauri 日志插件](https://v2.tauri.app/plugin/logging/)
- [Tauri 发布 Action](https://github.com/tauri-apps/tauri-action)
