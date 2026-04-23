# CI/CD 规范

本仓库采用 **GitHub Actions + Changesets** 管理所有应用的 CI/CD 流程。

---

## 当前 Workflow 一览

| 文件                                 | 触发条件                                              | 作用                                             | 范围                      |
| ------------------------------------ | ----------------------------------------------------- | ------------------------------------------------ | ------------------------- |
| `ci.yml`                             | push / PR 到 main（非纯文档变更）                     | 构建 + 类型检查 + Lint                           | 仅对变更包及下游          |
| `release-dq7-shuffle.yml`            | push 到 main，`apps/dq7-shuffle/**` 有变化            | 构建 dist + Changeset 发版 + 附 dist             | 仅 dq7-shuffle            |
| `release-infinity-nikki-player.yml`  | push 到 main，`apps/infinity-nikki-player/**` 有变化  | 构建 Tauri 包体 + Changeset 发版                 | 仅 infinity-nikki-player  |
| `release-sensitive-word-checker.yml` | push 到 main，`apps/sensitive-word-checker/**` 有变化 | 部署到 Cloudflare Pages + Changeset 发版（并行） | 仅 sensitive-word-checker |
| `release-universe-explorer.yml`      | push 到 main，`apps/universe-explorer/**` 有变化      | 部署到 Cloudflare Pages + Changeset 发版（并行） | 仅 universe-explorer      |

---

## 设计原则

1. **paths 过滤**：每个应用的 release workflow 只监听自己的 `apps/<app-name>/**` 目录，其他应用变更不会触发它。建议同时排除 `!apps/<app-name>/**/*.md`，避免仅文档更新时也触发构建、部署和发版。`.changeset/**` **不加入** paths 过滤——若多个 workflow 都监听 `.changeset/**`，推一个 changeset 文件会导致所有 workflow 并发执行 `ci:version`，产生 git push 竞争冲突。若只推了 changeset 文件而无代码变更，请用 `workflow_dispatch` 手动触发。
2. **CI 只跑变更包**：`ci.yml` 使用 `turbo --filter=...[HEAD^1]`，只构建/检查本次 push 涉及的包及其下游依赖，节省 CI 时间。
3. **Changelog 来自 Changesets**：Release 的发布说明直接从应用自身的 `CHANGELOG.md` 中提取，不依赖 GitHub 自动生成。
4. **一个应用一个 release workflow 文件**：职责清晰，互不干扰，便于维护。5. **GitHub Artifacts 使用原则**：
   - GitHub 免费账户的 Artifacts 存储空间有限，应严格控制使用范围。
   - **仅**在多个 job 之间需要传递构建产物时才使用 `upload-artifact`（例如 Tauri 在 macOS/Windows 并行构建后需要将安装包传递给 release job）。
   - 所有 `upload-artifact` 必须设置 `retention-days: 3`，workflow 运行完毕后 3 天自动清理，避免占用存储配额。
   - **Web 应用禁止使用 `upload-artifact`**：在同一个 job 内完成构建、打包（zip）、上传至 Release，无需经过 Artifacts 中转。

---

## 新增 App 的 CICD 配置步骤

### 情形一：普通 Web 应用（构建 dist 并作为 Release 附件）

1. 在 `.github/workflows/` 下新建 `release-<app-name>.yml`，内容如下：

```yaml
name: 'Release: <app-name>'

on:
  push:
    branches:
      - main
    paths:
      - 'apps/<app-name>/**'
      - '!apps/<app-name>/**/*.md'
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

      - name: Build
        run: pnpm --filter @strawberrybear/<app-name> build

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

      - name: Skip release (no changeset)
        if: steps.changeset.outputs.has_changes != 'true'
        run: 'echo "Skip release: no changeset version change detected"'

      - name: Package dist
        if: steps.changeset.outputs.has_changes == 'true'
        run: |
          cd apps/<app-name>
          zip -r ../../<app-name>-dist.zip dist/

      - name: Commit and push version bump
        if: steps.changeset.outputs.has_changes == 'true'
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add apps/ .changeset/
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
          name: <app-name>@v${{ steps.version.outputs.version }}
          body: ${{ steps.changelog.outputs.content }}
          files: <app-name>-dist.zip
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

> 替换所有 `<app-name>` 为实际值。
>
> **推荐**：保留 `!apps/<app-name>/**/*.md` 规则，避免仅文档改动时触发发布链路。
>
> **注意**：如果应用的构建产物是单个文件（如全部内联的 `index.html`），可直接用 `files: apps/<app-name>/dist/index.html`，无需打 zip。

---

### 情形三：需同时部署到 Cloudflare Pages 的 Web 应用

在情形一的基础上，额外增加一个 `deploy-pages` job，与 `release` job **并行**运行（两者互不依赖，互不阻塞）。

```yaml
jobs:
  deploy-pages:
    timeout-minutes: 20
    runs-on: ubuntu-latest
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

      - name: Build
        run: pnpm --filter @strawberrybear/<app-name> build

      - name: Deploy to Cloudflare Pages
        run: npx wrangler pages deploy apps/<app-name>/dist --project-name=<app-name> --branch=production
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}

  release:
    # 不依赖 deploy-pages，两个 job 并行执行
    timeout-minutes: 20
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      # ... 与情形一相同
```

> **所需 GitHub Secrets**（在仓库 Settings → Secrets and variables → Actions 中配置）：
>
> - `CLOUDFLARE_API_TOKEN`：Cloudflare API Token，需具备 Pages Write 权限
> - `CLOUDFLARE_ACCOUNT_ID`：Cloudflare 账户 ID（在 Cloudflare Dashboard 右侧边栏可找到）
>
> **触发建议**：沿用情形一的 `paths` 排除规则（`!apps/<app-name>/**/*.md`），避免仅更新应用文档时触发 Cloudflare 部署。
>
> **注意**：两个 job 各自独立执行 build，因为它们运行在不同的 runner 上，这是 GitHub Actions 的正常模式。

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
- `upload-artifact` 必须设置 `retention-days: 3`

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
