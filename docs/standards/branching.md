# Git 分支管理规范

本仓库采用 **GitHub Flow 简化版**：`main` 是唯一长期分支，所有功能和修复都从 `main` 创建短命分支，通过 Pull Request 合入 `main`。CI、代码审查和 PR 本身是合入前的安全边界，不再增加一个长期 `develop` 分支。

## 核心原则

1. **`main` 始终保持可发布**：每个合入 `main` 的提交都应通过仓库要求的检查，并可以作为发布候选。
2. **改动必须经过 PR**：禁止直接在 `main` 上开发或绕过保护规则推送。
3. **分支从最新 `main` 创建**：开始工作前先获取远端最新提交；长时间开发的分支在提交 PR 前必须同步 `main`。
4. **PR 负责集成验证**：PR 的 CI、review 和冲突检查共同验证改动，再决定是否合入。
5. **分支短命**：PR 合入后立即删除对应 feature/fix/hotfix 分支，避免分支长期漂移。

## 分支模型

```text
main (唯一长期分支，可发布、可打 tag)
 ↑
 │  PR + CI + Code Review
 ├── feature/<name>
 ├── fix/<name>
 └── hotfix/<name>
```

| 分支模式         | 用途                   | 从哪里创建  | 合到哪里 | 删除时机  |
| ---------------- | ---------------------- | ----------- | -------- | --------- |
| `feature/<name>` | 新功能、新应用、新模块 | 最新 `main` | `main`   | PR 合入后 |
| `fix/<name>`     | 一般 bug 修复          | 最新 `main` | `main`   | PR 合入后 |
| `hotfix/<name>`  | 线上紧急修复           | 最新 `main` | `main`   | PR 合入后 |

`develop` 不再是新工作的来源或 PR 目标。旧分支已停用并删除，删除前的提交由 `archive/develop-before-main-only` tag 保留；不得重新创建或继续使用 `develop`。

## 命名规范

分支名使用全英文 kebab-case，按用途选择前缀：

```text
feature/infinity-nikki-player-online-library
feature/new-app-photo-watermark
fix/template-editor-allow-clear
hotfix/auto-updater-cn-endpoint
```

## 日常开发流程

```bash
# 1. 从最新 main 创建分支
git fetch origin
git switch main
git pull --ff-only origin main
git switch -c feature/xxx

# 2. 开发、提交并推送
git add <files>
git commit -m "feat(scope): 新增 xxx 功能"
git push -u origin feature/xxx

# 3. 创建 Pull Request：feature/xxx → main
#    CI 全绿、review 通过且无冲突后，使用 Squash and merge

# 4. 合入后清理本地分支
git switch main
git pull --ff-only origin main
git branch -d feature/xxx
```

PR 可以在开发早期先创建为 Draft。不要为了“等集成”把未完成代码合入 `main`；需要提前验证时，应在 PR 中运行 CI 或在本地启动应用验收。

## 合入前同步 `main`

GitHub PR 的检查针对目标分支的合并结果运行。提交 PR 前和 PR 长时间打开期间，应将最新 `main` 合入自己的分支：

```bash
git fetch origin
git switch feature/xxx
git merge origin/main
# 解决冲突后运行本地检查
git add <files>
git commit
git push
```

个人且无人基于其继续开发的分支也可以选择 `git rebase origin/main`，但已经共享给他人的分支不要改写历史；使用 merge 并推送即可。不要使用 `git reset --hard origin/main`、强推或重建分支来“同步”，这些操作可能丢失已有提交。

## 合并规则

- PR 目标统一为 `main`。
- 必须通过仓库配置的 CI 检查，并满足所需 Code Review。
- 常规 PR 使用 **Squash and merge**，将一个完整改动压成一个清晰提交，保持 `main` 线性历史。
- 不要使用 `main → feature` 的反向 PR；同步时在 feature 分支执行 `git merge origin/main`。
- 合入后删除远端 feature/fix/hotfix 分支，除非该分支仍有明确的后续工作。

## Hotfix 流程

Hotfix 与普通修复使用同一条路径：

```bash
git fetch origin
git switch main
git pull --ff-only origin main
git switch -c hotfix/urgent-fix
# 修复、检查、推送
git push -u origin hotfix/urgent-fix
# 创建 hotfix/urgent-fix → main 的 PR，按常规规则合入
```

Hotfix 合入 `main` 后不需要再向 `develop` 回写；所有后续分支都从新的 `main` 创建。

## 发版与 Changesets

- 发布 workflow 只监听 `main`，合入 `main` 后按应用的 Changesets 流程生成版本、变更日志和发布产物。
- 功能 PR 在自己的分支中提交对应的 `.changeset/*.md`；不要在 `main` 之外手动生成版本提交。
- 发布产生的版本提交属于 `main` 的正常历史，不需要再同步到其他长期分支。

## 现有分支迁移

迁移期间不要改写已有分支历史。对于仍要继续开发、但基于旧 `develop` 的分支，先保留其全部提交，再同步最新 `main`：

```bash
git fetch origin
git switch feature/xxx
git merge origin/main
# 解决冲突并完成本地检查
git push
```

然后把 PR 的 base 改为 `main`。如果冲突很多或分支包含已废弃的集成内容，可以从最新 `main` 创建新分支，只 cherry-pick 仍然需要的业务提交；这必须人工确认，不能批量覆盖原分支。

`feature/infinity-nikki-player-piano-roll` 已包含最新 `main`，并且已有连续的 piano-roll 提交。继续在该分支提交即可，不要 reset、rebase、cherry-pick 这些已有提交，也不要强推覆盖远端历史。

## CI 与保护规则

当前 `.github/workflows/ci.yml` 对 `main` 的 push 和 Pull Request 运行变更包的 build、type-check、lint。应用的测试命令和设备/浏览器验收仍由对应 app 文档负责；新增或修复行为时必须补充有意义的测试。

建议 `main` 保持以下保护：

- 必须通过 Pull Request，禁止直接推送。
- 至少 1 人 Code Review（按仓库设置执行）。
- 必须通过 `build` 检查，并要求分支与 `main` 最新提交保持同步后再合入。
- 开启 Require linear history，配合 Squash and merge。
- 禁止 force push。

## 禁止行为

1. 在 `main` 上直接开发或提交。
2. 创建新的 `develop` 分支或向现有 `develop` 提交 PR。
3. 为同步而 reset、rebase 已共享分支或强制推送。
4. 在 PR 合入前删除源分支。
5. 把多个未完成 feature 先合入 `main` 充当临时集成区。
6. 用手工复制文件或 cherry-pick 替代正常的 PR 集成；只有迁移旧分支时才按提交逐个、人工确认地 cherry-pick。

## 常见问题

### 为什么没有 develop 保险？

安全边界由短命分支、PR、CI、review 和 `main` 分支保护共同提供。`develop` 只是在合入前增加一个长期分叉点，并不能自动证明 feature 之间兼容；它还会带来同步、重复合并和历史分叉成本。需要集成验证时，在 PR 的合并结果上运行 CI 即可。

### 多个 feature 如何验证互不影响？

每个 PR 都以最新 `main` 为目标，CI 会检查该 PR 与 `main` 的合并结果。若多个功能必须一起验收，可以先把它们依次合入一个临时协作分支并运行完整测试，但该分支不能替代 `main`，验证完成后应按真实 PR 顺序合入或关闭。

### 为什么以前会出现 ahead/behind？

GitHub 比较的是提交图，不只是文件内容。即使两个分支最终文件完全相同，只要分别通过 Squash 产生了不同提交，仍会显示一方 ahead、另一方 behind。只有一个长期 `main` 后，这类双向同步就不再存在。

## 文档边界

- 本文只定义分支、PR 和合并规则。
- CI/CD 的 workflow、paths 和 Changesets 细节见 [CI/CD 规范](cicd.md)。
- 开发命令、提交格式和基础编码要求见 [开发规范](development.md)。
- 应用的构建、部署、设备和浏览器验收见对应 `apps/<app>/docs/`。
