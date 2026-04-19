# 🍓 strawberrybear-tools

Personal Tool Repository | Monorepo for managing multiple tool projects (Vue/React/CLI/Pure JS)

> **中文**: [README.md](README.md)

---

## Quick Start

```bash
# Install dependencies
pnpm install

# Build all projects
pnpm build

# Develop a single project (example)
cd apps/web-vue && pnpm dev
```

---

## Project List

| Project          | Type         | Description                   |
| ---------------- | ------------ | ----------------------------- |
| `apps/web-vue`   | Vite + Vue3  | Example project (for testing) |
| `apps/web-react` | Vite + React | Example project (for testing) |
| `apps/cli`       | Pure TS CLI  | Example project (for testing) |

> **These are example/test projects** used to verify the monorepo architecture and CI/CD pipeline. Refer to them when creating your own projects.

---

## How to Add Your Own Project

### 1. Create a new directory under `apps/`

```
apps/
└── my-new-tool/           # Your new project directory
    ├── package.json       # name: "@strawberrybear/my-new-tool"
    ├── src/
    └── ...
```

### 2. Configure package.json

```json
{
  "name": "@strawberrybear/my-new-tool",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "dev": "your dev command",
    "build": "your build command"
  }
}
```

### 3. Local Development

```bash
cd apps/my-new-tool
pnpm dev
```

### 4. Commit Code

```bash
git add .
git commit -m "feat(my-new-tool): add new tool"
git push
```

> **Note**: Committing code only triggers CI (build + type-check), not release.

---

## Release Process

Releases are declared via **changeset** files. A changeset tells the system "this project has changes and needs a release".

### 1. Create a changeset file

Create a `.md` file in the `.changeset/` directory:

**Manual creation**, format:

```markdown
---
"@strawberrybear/your-project-name": patch
---

Fix some issue
```

### 2. Changeset Type Reference

| Type  | Keyword | Meaning                           | Version Change    |
| ----- | ------- | --------------------------------- | ----------------- |
| Patch | `patch` | Bug fix                           | `0.0.1` → `0.0.2` |
| Minor | `minor` | New feature (backward compatible) | `0.0.1` → `0.1.0` |
| Major | `major` | Breaking changes                  | `0.0.1` → `1.0.0` |

### 3. Commit changeset

```bash
git add .changeset/xxx.md
git commit -m "chore: add release changeset"
git push
```

### 4. What Happens Automatically

After push, GitHub Actions automatically executes:

```
┌─────────────────────────────────────────────────────────────┐
│ Trigger: push to main branch with app directory changes      │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 1. CI Workflow (auto)                                        │
│    - Install dependencies                                     │
│    - Build all projects                                      │
│    - Type check                                             │
│    Status: ✅ Success / ❌ Failure (blocks further steps)   │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Release Workflow (auto)                                   │
│    - Detect changeset files                                  │
│    - Determine which packages changed                        │
│    - Build only changed packages (pnpm build)                │
│    - Run pnpm ci:version (bump versions)                   │
│    - Skip release if no changeset version change             │
│    - Generate CHANGELOG.md for each project                 │
│    - Commit version changes to main branch                   │
│    - Create GitHub Release (<app-name>@vX.Y.Z)               │
└─────────────────────────────────────────────────────────────┘
```

---

### 5. Release Artifact说明

After release, GitHub Release includes:

| Content         | Description                           |
| --------------- | ------------------------------------- |
| **CHANGELOG**   | Full version history and changelog    |
| **dist.tar.gz** | Build artifact archive (downloadable) |

**Example**: `web-react@0.2.1` Release includes `web-react-0.2.1.tar.gz` (downloadable build artifact)

---

## Single Package Release

**This project supports releasing only one package**, other packages are unaffected.

### Example Scenario

Assume you only modified `my-new-tool` and want to release only `my-new-tool`:

**Step 1**: Create a changeset targeting only `my-new-tool`:

```markdown
---
"@strawberrybear/my-new-tool": patch
---

Fix button click issue
```

**Step 2**: After push, the system will only:

- Update `my-new-tool` version
- Generate CHANGELOG for `my-new-tool` only
- Create GitHub Release for `my-new-tool` only

### Release Multiple Packages Simultaneously

If changes span multiple packages, declare them in the same changeset:

```markdown
---
"@strawberrybear/my-new-tool": minor
"@strawberrybear/another-tool": patch
---

Unified theme colors
```

---

## Version Number Rules

| Change Type      | Changeset Keyword | From    | To      |
| ---------------- | ----------------- | ------- | ------- |
| Bug fix          | `patch`           | `1.2.3` | `1.2.4` |
| New feature      | `minor`           | `1.2.3` | `1.3.0` |
| Breaking changes | `major`           | `1.2.3` | `2.0.0` |

---

## Common Commands

```bash
# Install dependencies
pnpm install

# Build all projects
pnpm build

# Build single project
pnpm --filter @strawberrybear/web-vue build

# Type check
pnpm type-check

# Develop single project
cd apps/web-vue && pnpm dev

# Create changeset (manually edit .changeset/xxx.md)
```

---

## GitHub Actions Workflows

| Workflow                   | File                                       | Trigger                           | Purpose                                                            |
| -------------------------- | ------------------------------------------ | --------------------------------- | ------------------------------------------------------------------ |
| **CI**                     | `.github/workflows/ci.yml`                 | push / pull_request to main       | Build + Type check + Lint (changed pkgs only)                      |
| **Release**                | `.github/workflows/release-<app-name>.yml` | push to main, app non-doc changes | Release only when changeset version change detected                |
| **Release + Cloud Deploy** | `.github/workflows/release-<app-name>.yml` | push to main, app non-doc changes | Same as above, plus a **parallel** auto-deploy to Cloudflare Pages |

> **Release + Cloud Deploy** is a specific configuration pattern: the same workflow file contains two parallel jobs — `deploy-pages` and `release` — with no dependency between them. Use this pattern when you need the build artifact to be publicly accessible at all times (e.g. web apps). See [CI/CD Guidelines](docs/CICD.md) for the template.
>
> Recommended default: exclude `apps/<app-name>/**/*.md` in workflow `paths` so docs-only updates do not trigger deploy/release pipelines.

### View CI/CD Status

Visit: https://github.com/Ztachi/strawberrybear-tools/actions

---

## Documentation

See [docs/README.md](docs/README.md)

- [Development Guidelines](docs/AGENT.md)
- [Internationalization Guidelines](docs/I18N.md)
- [Project Setup Plan](docs/PLAN.md)
