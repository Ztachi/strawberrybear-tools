---
name: launch-cloudflare-pages-app
description: >-
  在 strawberrybear-tools monorepo 中从 0 到 1 创建、部署并发布一个需要 Cloudflare Pages 的 Web 应用。Use when user asks to add/create/scaffold/launch a new web app that matches docs/standards/cicd.md "情形三：需同时部署到 Cloudflare Pages 的 Web 应用", or asks for the full feature branch →规范阅读→app folder→CI/CD→Cloudflare Pages project→develop→main release workflow.
---

# Cloudflare Pages Web App 上线流程

本 skill 适用于本仓库 `apps/<app-name>` 下需要同时走 GitHub Release 和 Cloudflare Pages 部署的 Web 应用。目标不是只写代码，而是把 feature 分支、规范、目录、CI/CD、Cloudflare Pages 项目、PR、develop 集成、main 发版和线上验证串成一套闭环。

## 总原则

- 从 `develop` 拉 `feature/<app-name>`，不要直接在 `develop` 或 `main` 上开发。
- 先读规范，再动代码；规范冲突时以仓库文档和现有可工作的 workflow 为准。
- Cloudflare Pages 项目名、app 目录名、package scope、workflow 文件名保持一致：`<app-name>` / `apps/<app-name>` / `@strawberrybear/<app-name>` / `release-<app-name>.yml`。
- Cloudflare Pages deploy job 和 release job 并行，不互相依赖。
- 不在仓库根目录生成 `<app-name>-dist.zip`；打包附件放 `$RUNNER_TEMP` 或直接使用稳定产物路径。
- 不让某个 app 的 workflow 被其他 app 的 changeset 或 workflow 文件误触发；`paths` 只包含该 app 目录和必要的自身配置。

## Step 0：读取上下文

开始前必须读取：

```text
docs/README.md
docs/standards/branching.md
docs/standards/cicd.md
docs/standards/development.md
docs/standards/comments.md
docs/standards/i18n.md
docs/standards/styling.md
docs/standards/project-structure.md
docs/standards/public-packages.md（如果会引用 packages）
skills/create-app/SKILL.md
```

同时读取最接近的新 Web app 示例：

```text
.github/workflows/release-sensitive-word-checker.yml
.github/workflows/release-infinity-nikki-stylist-office.yml
apps/sensitive-word-checker/package.json
apps/infinity-nikki-stylist-office/package.json
```

重点确认 `docs/standards/cicd.md` 中“情形三：需同时部署到 Cloudflare Pages 的 Web 应用”的模板，以及当前仓库里最新可工作的 protected-main 发布模式。

## Step 1：确认输入

向用户确认或从上下文推断这些项：

| 项目            | 约束                                                                          |
| --------------- | ----------------------------------------------------------------------------- |
| `app-name`      | kebab-case，必须可用于目录、包名、Cloudflare Pages 项目名                     |
| 技术栈          | Vue / React / 其他 Vite Web app                                               |
| 路由模式        | SPA 时确认是否需要 404 fallback                                               |
| i18n            | 至少 `zh-CN` 和 `en-US`                                                       |
| 发版类型        | 首发通常 `minor` 或 `1.0.0`，后续按 patch/minor/major                         |
| Cloudflare 权限 | 本机 Wrangler 登录态或可用的 `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` |

如果 Cloudflare 登录态、GitHub 权限或 secret 不足，先把本地代码和 workflow 做完，再明确列出需要用户补授权的步骤。

## Step 2：建立 feature 分支

```bash
git checkout develop
git pull origin develop
git checkout -b feature/<app-name>
```

如果本地没有 `develop`，先 `git fetch origin develop`；如果远端也没有，暂停并向用户说明分支策略与仓库实际状态不一致。

## Step 3：创建 app 目录

按当前技术栈创建 `apps/<app-name>`，最小结构：

```text
apps/<app-name>/
├── package.json
├── README.md
├── CHANGELOG.md
├── docs/
│   └── README.md
├── src/
│   ├── app/ 或 main.tsx/main.ts
│   ├── components/
│   └── i18n/
├── index.html
└── vite.config.ts
```

`package.json` 必须满足：

```json
{
  "name": "@strawberrybear/<app-name>",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vue-tsc -b && vite build",
    "preview": "vite preview",
    "type-check": "vue-tsc -b",
    "lint": "eslint .",
    "test": "vitest run"
  }
}
```

React 或非 Vue 项目要替换 type-check/build 命令，但必须保留 `build`、`type-check`、`lint`。有测试就保留 `test`。

## Step 4：实现应用和本地验证

执行顺序：

1. 先搭 UI、路由、i18n、README、内部 docs。
2. 更新根 README 项目列表和必要索引。
3. 跑 `pnpm install`（新增依赖时）。
4. 跑：

```bash
pnpm --filter @strawberrybear/<app-name> build
pnpm --filter @strawberrybear/<app-name> type-check
pnpm --filter @strawberrybear/<app-name> lint
pnpm --filter @strawberrybear/<app-name> test
```

5. 打包后跑 `dist` 预览验证真实产物，不只看 dev server：

```bash
pnpm --filter @strawberrybear/<app-name> build
cd apps/<app-name>
pnpm exec vite preview --host 127.0.0.1 --port <free-port> --strictPort
```

用浏览器检查核心页面、路由刷新、资源加载、移动端布局和 console errors。验证结束关闭预览进程。

## Step 5：创建 Cloudflare Pages 项目

先确认 Wrangler 可用：

```bash
npx wrangler --version
npx wrangler whoami
```

创建 Pages 项目：

```bash
npx wrangler pages project create <app-name> --production-branch production
```

如果项目已存在，使用：

```bash
npx wrangler pages project list
```

首次可手动部署一次来验证 Cloudflare 项目、token 和 dist 路径：

```bash
npx wrangler pages deploy apps/<app-name>/dist \
  --project-name=<app-name> \
  --branch=production \
  --commit-message="ci: deploy $(git rev-parse --short HEAD)"
```

不要把 Cloudflare token 写入仓库。GitHub Actions 需要仓库 secrets：

```text
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
```

## Step 6：配置情形三 CI/CD

创建 `.github/workflows/release-<app-name>.yml`。

触发条件必须收窄到该 app：

```yaml
on:
  push:
    branches:
      - main
    paths:
      - 'apps/<app-name>/**'
      - '!apps/<app-name>/**/*.md'
  workflow_dispatch:
```

`deploy-pages` job：

```yaml
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
      run: |
        COMMIT_SHA=$(git rev-parse --short HEAD)
        npx wrangler pages deploy apps/<app-name>/dist \
          --project-name=<app-name> \
          --branch=production \
          --commit-message="ci: deploy ${COMMIT_SHA}"
      env:
        CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
        CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

`release` job 推荐跟随当前仓库可工作的 protected-main 模式：

- 从已提交的 `apps/<app-name>/package.json` 读取版本。
- 检查 `<app-name>@v<version>` tag 是否存在，存在则跳过。
- build 后把 `dist` zip 写到 `$RUNNER_TEMP/<app-name>-dist.zip`。
- 从 `CHANGELOG.md` 读取当前版本条目。
- 用 `softprops/action-gh-release@v2` 创建 tag/release。

不要在 workflow 里 `git push` version bump 到 `main`，除非仓库保护规则明确允许且当前示例仍采用该模式。

## Step 7：版本和 changeset

首发有两种可接受模式，按仓库当前规范选择一种，不要混用：

| 模式            | 适用                                          | 要点                                                                               |
| --------------- | --------------------------------------------- | ---------------------------------------------------------------------------------- |
| Changesets 模式 | 文档和现有 workflow 仍要求 CI 自动 version    | 添加 `.changeset/<slug>.md`，release workflow 跑 `pnpm ci:version`                 |
| 已提交版本模式  | main 受保护，不允许 Actions 自推 version bump | 在 PR 中直接提交 `package.json` 版本和 `CHANGELOG.md`，workflow 只创建 tag/release |

如果采用 changeset：

```markdown
---
"@strawberrybear/<app-name>": minor
---

初始化 <app-name> Web 应用，并接入 Cloudflare Pages 部署。
```

如果采用已提交版本模式，确保 `CHANGELOG.md` 有：

```markdown
## 1.0.0

### Major Changes

- 初始化 <app-name> Web 应用，并接入 Cloudflare Pages 部署。
```

## Step 8：feature → develop

提交并推送：

```bash
git add .
git commit -m "feat(<app-name>): initialize cloudflare pages app"
git push -u origin feature/<app-name>
```

创建 PR：`feature/<app-name>` → `develop`。PR 描述必须包含：

```markdown
## 背景
## 改动点
## CI/CD
## Cloudflare Pages
## 测试方式
## 影响范围
```

合并前确认：

- CI 全绿。
- `paths` 没有触发其他 app 的 release workflow。
- Cloudflare Pages 项目存在。
- 本地 `dist` 验证过。

合并后删除 feature 分支。

## Step 9：develop → main 发版

从 `develop` 向 `main` 创建 release PR。合并前确认：

- `develop` 已包含目标 app 全部代码和 workflow。
- 版本号 / changeset 与目标发版类型一致。
- `release-<app-name>.yml` 只会被目标 app 变化触发。
- GitHub secrets 已配置。

合并到 `main` 后监控：

```text
GitHub Actions → Release: <app-name>
Cloudflare Pages → <app-name> production deployment
GitHub Releases → <app-name>@v<version>
```

必须验证：

- `deploy-pages` 成功。
- `release` 成功，tag 存在，Release 附带 dist zip。
- 线上 URL 可访问。
- SPA 刷新、静态资源路径、移动端布局正常。
- 没有其他 app 的 release workflow 被误触发。

## Step 10：收尾

- 更新 README 索引、项目列表、必要文档。
- 如果上线 URL 需要主站入口，在对应工具页或导航处加入口。
- 记录 Cloudflare Pages 项目名、生产分支、线上 URL。
- 清理本地预览进程、临时 zip、无用分支。
- 最终回复用户时列出 commit、PR、tag、Release、Pages URL 和验证结果。

## 常见坑

- `paths` 包含 `.changeset/**` 会让无关 app 的 release workflow 被误触发；除非设计明确需要，否则不要这么做。
- workflow 在受保护 `main` 上自推 version bump 容易失败；更稳的是 PR 中提交版本，workflow 只发 tag/release。
- `wrangler pages deploy` 必须加 ASCII `--commit-message`，规避 Cloudflare commit message 编码问题。
- zip 不要写到仓库根目录，避免本地残留和误提交。
- Cloudflare Pages production branch 在本仓库约定为 `production`，workflow deploy 也使用 `--branch=production`。
