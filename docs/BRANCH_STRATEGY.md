# Git 分支策略规范

本仓库采用 **GitHub Flow 简化版** + **develop 集成分支** 的双层模型,所有新功能与修复必须遵循本文档约定的分支命名、生命周期与合并流程。

## 核心原则

1. **`main` 是真相之源**:永远处于"可发布"状态,每个 commit 都可以直接打 tag 发版。
2. **`develop` 是集成分支**:所有 feature 合到 develop,验证稳定后再向 main 发起 PR。
3. **特性分支短命**:单个 feature/hotfix 分支存活时间不超过 1 周,超过 2 周的分支必须 rebase main。
4. **永远不要在 main 或 develop 上直接开发**:所有改动都走分支 + PR 流程。
5. **禁止长期落后 develop**:`develop` 与 `main` 的分叉时间不应超过 2 周。

## 分支模型

```
main (生产版本,打 tag 发版)
  ↑
  │  PR (发版前合并)
  │
develop (集成分支,日常开发)
  ↑ ↑
  │ │  PR (feature/xxx → develop)
  │ └──────┐
  │        │  PR (hotfix/xxx → develop,同时 cherry-pick 到 main)
  feature/xxx  hotfix/xxx
```

## 分支定义

### 长期分支

| 分支      | 角色     | 谁可以推    | 保护规则                        |
| --------- | -------- | ----------- | ------------------------------- |
| `main`    | 生产版本 | 只能通过 PR | 必须 PR + Code Review + CI 全绿 |
| `develop` | 集成分支 | 只能通过 PR | 必须 PR + CI 全绿               |

### 临时分支

| 模式                | 用途                     | 拉自    | 合到                         | 删除时机           |
| ------------------- | ------------------------ | ------- | ---------------------------- | ------------------ |
| `feature/<name>`    | 新功能、新应用、新模块   | develop | develop                      | PR 合并后立即删除  |
| `fix/<name>`        | develop 上发现的一般 bug | develop | develop                      | PR 合并后立即删除  |
| `hotfix/<name>`     | main 上的紧急修复        | main    | main(立即) + develop(同步)   | PR 合并后立即删除  |
| `release/<version>` | 发版前的冻结分支(可选)   | develop | main(打 tag) + develop(回写) | tag 打完后立即删除 |

## 命名规范

分支名必须使用全英文 kebab-case,动词在前,功能模块在后:

```bash
# 正确
feature/infinity-nikki-player-online-library
feature/new-app-photo-watermark
fix/template-editor-allow-clear
fix/song-list-cover-cropper
hotfix/auto-updater-cn-endpoint
hotfix/1-1-5-midi-parser-crash

# 错误
feature_xxx              # 用下划线
Feature-Online-Library   # 用了大写
my-feature               # 没有功能动词/对象
update                   # 名字不具体
```

## 完整工作流

### 场景 1:日常开发新功能

```bash
# 1. 确认 develop 是最新的
git checkout develop
git pull origin develop

# 2. 拉特性分支
git checkout -b feature/xxx

# 3. 提交(commit message 遵循仓库约定)
git add .
git commit -m "feat: 新增 xxx 功能"
git push -u origin feature/xxx

# 4. 在 GitHub 上提 PR: feature/xxx → develop

# 5. CI 全绿 + Code Review 通过 → 合并

# 6. 删除本地与远端分支
git checkout develop
git pull origin develop
git branch -d feature/xxx
git push origin --delete feature/xxx
```

### 场景 2:发版流程

```bash
# 1. 在 develop 上确认所有 feature 稳定后,提 PR: develop → main
# 2. 合并后,在 main 上:
git checkout main
git pull origin main
git tag -a v1.2.0 -m "Release 1.2.0"
git push origin v1.2.0

# 3. (如有 release/ 分支) 同步回 develop:
git checkout develop
git merge --no-ff main
git push origin develop
```

### 场景 3:线上紧急修复(hotfix)

```bash
# 1. 从 main 拉 hotfix 分支
git checkout main
git pull origin main
git checkout -b hotfix/urgent-fix

# 2. 修复并提交
git commit -m "fix: 紧急修复 xxx"
git push -u origin hotfix/urgent-fix

# 3. 同时提两个 PR:
#    - hotfix/urgent-fix → main(立刻合并并发版)
#    - hotfix/urgent-fix → develop(同步修复)
```

## rebase 同步策略

为避免长生命周期 feature 分支与 develop 产生大量冲突,必须 **频繁 rebase develop**:

```bash
# 在 feature/xxx 分支上
git fetch origin develop
git rebase origin/develop

# 如果 rebase 过程中出现冲突:
# 1. 解决冲突
# 2. git add <冲突文件>
# 3. git rebase --continue
# 4. 重复直到完成
```

**频率建议**:

- 每天开发前先 rebase
- develop 上有新 PR 合并后立即 rebase
- PR 提交前必须 rebase,确保无冲突

**禁止的行为**:

- 禁止对已经推送到远端并被他人基于此的分支执行 rebase(用 merge 代替)
- 禁止在 main 上 rebase(只能 merge)

## commit message 规范

沿用 Conventional Commits,与 Husky + commitlint 配合校验:

```
<type>(<scope>): <subject>

<body>

<footer>
```

**type 必须是以下之一**:

| type       | 用途                                      | 触发版本变化 |
| ---------- | ----------------------------------------- | ------------ |
| `feat`     | 新功能                                    | minor        |
| `fix`      | bug 修复                                  | patch        |
| `docs`     | 仅文档变更                                | 无           |
| `style`    | 不影响代码含义的格式变更(空格、分号等)    | 无           |
| `refactor` | 既不修 bug 也不加功能的代码变更           | 无           |
| `perf`     | 性能优化                                  | patch        |
| `test`     | 添加/修改测试                             | 无           |
| `chore`    | 构建过程、辅助工具、依赖库变更            | 无           |
| `revert`   | 回滚之前的 commit                         | 视情况       |
| `release`  | 发版提交(由 Changesets / release-it 生成) | 视情况       |

**scope**:可选,标明影响的范围(应用名、模块名)。

**示例**:

```bash
feat(infinity-nikki-player): 新增自建歌单功能
fix(online-library): 修复详情页 404 问题
docs(branch-strategy): 补充 hotfix 流程说明
chore(deps): 升级 vite 到 5.4
```

## Pull Request 规范

### PR 标题

格式同 commit subject:`<type>(<scope>): <subject>`

### PR 描述必须包含

- **背景**:这个 PR 解决了什么问题 / 实现了什么功能
- **改动点**:主要变更(可贴关键 diff)
- **测试方式**:如何验证(手动步骤/单元测试/截图)
- **影响范围**:是否影响其他模块/应用
- **关联 Issue**:如有相关 issue,使用 `Closes #123` / `Fixes #456` 关联

### PR 合并规则

- 必须有 **至少 1 人 Code Review 通过**(自己 + 协作开发者均可,关键改动需 2 人)
- CI 必须全绿(lint / type-check / test / build)
- 与目标分支无冲突
- 标题符合 Conventional Commits
- **必须使用 Squash and merge** 合并(保持 main/develop 历史的线性)

## 禁止行为

以下行为会显著增加冲突成本,**严格禁止**:

1. ❌ **在 main 或 develop 上直接 commit**(必须走分支 + PR)
2. ❌ **把长期集成分支(如 develop)落后于 main 超过 2 周**而不合并
3. ❌ **存在超过 2 周的 feature 分支**不 rebase
4. ❌ **用 `git push --force` 覆盖已经多人协作的分支**(个人分支可以 force-with-lease)
5. ❌ **在 PR 合并前删除目标分支**(会丢失提交)
6. ❌ **绕过 PR 直接推到 main 或 develop**(即使只有自己一个开发者)
7. ❌ **merge --no-ff 到 main/develop**(用 Squash and merge 保持线性)

## CI/CD 配套

分支保护(在 GitHub Repository Settings → Branches 设置):

- `main`:必须 PR 合入、必须 1 人 Review、必须 CI 全绿、禁止 force push、禁止直接 push
- `develop`:必须 PR 合入、必须 CI 全绿、禁止 force push、禁止直接 push

## 常见问题

### Q: 为什么不直接用 main + 短命 feature 分支,还要加 develop?

A: 本仓库是 monorepo + 桌面应用,有"发版前集成测试"和"按节奏发版"的需求。develop 提供了一个"准生产"环境,让多个 feature 并行集成、跑全量测试,稳定后再向 main 发版。这能避免"main 上有未测试的功能"。

### Q: 一个人开发也需要 develop 吗?

A: 需要。即使一个人,develop 也能起到"集成缓冲"和"发版节奏控制"的作用。main 上的 commit 永远等同于"已发版的版本",不会因为直接 push 而引入半成品。

### Q: 老的 dev 分支已经废弃了,为什么?

A: 老 dev 分支长期未与 main 同步,导致单次合并产生 110+ 冲突。详见 `docs/CICD.md` 中的发布历史。新 develop 分支以 main 为起点,采用本文档约定,避免重蹈覆辙。

### Q: 已经存在的 feature/codex-xxx 分支怎么办?

A: 本文档生效后,所有不符合新规范的分支应:

1. 提 PR 合到对应目标分支(develop 或 main)
2. 合并后立即删除
3. 不要保留任何"长期 feature 分支"

## 历史背景

本文档首次落地时间: 2026-06-18

落地原因: 老 dev 分支长期未同步 main,1.1.0 → 1.1.4 期间产生 110+ 合并冲突,
为避免类似问题再次发生,采用更严格的分支规范。

参考模型: GitHub Flow + Git Flow 简化版(只保留 main / develop 双层结构)。
