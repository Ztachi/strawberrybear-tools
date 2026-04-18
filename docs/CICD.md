# CI/CD 规范

本仓库采用 **GitHub Actions + Changesets** 管理所有应用的 CI/CD 流程。

---

## 当前 Workflow 一览

| 文件                                | 触发条件                                                                | 作用                             | 范围                     |
| ----------------------------------- | ----------------------------------------------------------------------- | -------------------------------- | ------------------------ |
| `ci.yml`                            | push / PR 到 main（非纯文档变更）                                       | 构建 + 类型检查 + Lint           | 仅对变更包及下游         |
| `release-infinity-nikki-player.yml` | push 到 main，`apps/infinity-nikki-player/**` 或 `.changeset/**` 有变化 | 构建 Tauri 包体 + Changeset 发版 | 仅 infinity-nikki-player |

---

## 设计原则

1. **paths 过滤**：每个应用的 release workflow 只监听自己的目录 + `.changeset/**`，其他应用变更不会触发它。
2. **CI 只跑变更包**：`ci.yml` 使用 `turbo --filter=...[HEAD^1]`，只构建/检查本次 push 涉及的包及其下游依赖，节省 CI 时间。
3. **Changelog 来自 Changesets**：Release 的发布说明直接从应用自身的 `CHANGELOG.md` 中提取，不依赖 GitHub 自动生成。
4. **一个应用一个 release workflow 文件**：职责清晰，互不干扰，便于维护。

---

## 新增 App 的 CICD 配置步骤

### 情形一：普通 Web 应用（无需打包产物，只发 Release）

1. 在 `.github/workflows/` 下新建 `release-<app-name>.yml`，内容如下：

```yaml
name: 'Release: <app-name>'

on:
  push:
    branches:
      - main
    paths:
      - 'apps/<app-name>/**'
      - '.changeset/**'
  workflow_dispatch:

env:
  FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true

jobs:
  release:
    timeout-minutes: 20
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - name: Checkout
        uses: actions/checkout@v6

      - name: Setup Node.js
        uses: actions/setup-node@v6
        with:
          node-version: '24'

      - name: Install pnpm
        run: npm install -g pnpm@10

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run changeset version
        id: changeset
        run: |
          pnpm ci:version
          CHANGESET_SUMMARY=$(git status --porcelain)
          if [ -n "$CHANGESET_SUMMARY" ]; then
            echo "has_changes=true" >> $GITHUB_OUTPUT
          else
            echo "has_changes=false" >> $GITHUB_OUTPUT
          fi

      - name: Commit and push version bump
        if: steps.changeset.outputs.has_changes == 'true'
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add .
          git commit -m "chore: version bump"
          git push

      - name: Fetch latest commit
        if: steps.changeset.outputs.has_changes == 'true'
        run: |
          git fetch origin main
          git checkout origin/main

      - name: Get app version
        id: version
        run: |
          VERSION=$(grep '"version"' apps/<app-name>/package.json | sed 's/.*"version": "\([^"]*\)".*/\1/')
          echo "version=$VERSION" >> $GITHUB_OUTPUT

      - name: Get changelog entry
        id: changelog
        run: |
          VERSION=${{ steps.version.outputs.version }}
          CONTENT=$(awk "/^## ${VERSION}/{flag=1; next} /^## [0-9]/{if(flag) exit} flag" apps/<app-name>/CHANGELOG.md)
          echo "content<<EOF" >> $GITHUB_OUTPUT
          echo "$CONTENT" >> $GITHUB_OUTPUT
          echo "EOF" >> $GITHUB_OUTPUT

      - name: Create Release
        uses: softprops/action-gh-release@v2
        with:
          draft: false
          prerelease: false
          generate_release_notes: false
          tag_name: <app-name>@v${{ steps.version.outputs.version }}
          name: <AppDisplayName> v${{ steps.version.outputs.version }}
          body: ${{ steps.changelog.outputs.content }}
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

> 替换所有 `<app-name>` 和 `<AppDisplayName>` 为实际值。

---

### 情形二：Tauri 桌面应用（需构建多平台产物）

参考 [release-infinity-nikki-player.yml](../.github/workflows/release-infinity-nikki-player.yml)，完整流程为：

1. `build-tauri` job：在 macOS 和 Windows 上并行构建，上传 artifacts
2. `release` job：需要 `build-tauri` 完成后才运行，下载 artifacts → changeset 发版 → 创建 Release 并附带安装包

关键差异点（相比普通 Web 应用）：

- 需要安装 Rust：`dtolnay/rust-toolchain@stable`
- 需要 Rust 缓存：`swatinem/rust-cache@v2`，`workspaces` 路径指向应用的 `src-tauri`
- 构建命令：`pnpm --filter @strawberrybear/<app-name> tauri build <args>`
- artifact 路径：`apps/<app-name>/src-tauri/target/release/bundle/<format>`
- Release 需要 `files` 字段附带构建产物

---

## Release 发布说明规范

Release 的 body **只使用 Changeset 生成的 CHANGELOG 内容**，通过以下 `awk` 命令提取当前版本条目：

```bash
awk "/^## ${VERSION}/{flag=1; next} /^## [0-9]/{if(flag) exit} flag" apps/<app-name>/CHANGELOG.md
```

- **不使用** `generate_release_notes: true`（GitHub 自动生成），避免与 Changeset 内容重复
- Changeset 内容来源：开发者在 `.changeset/` 目录下手动编写的变更描述

---

## Changeset 文件命名规范

`.changeset/` 下的文件名任意（通常由工具自动生成随机名），内容格式：

```markdown
---
"@strawberrybear/<app-name>": patch | minor | major
---

变更描述（会直接出现在 CHANGELOG 和 Release 说明中，请用中文写清楚）
```
