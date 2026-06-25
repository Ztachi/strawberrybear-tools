---
name: doc-architecture
description: Maintain and reorganize the strawberrybear-tools monorepo documentation. Use when adding, updating, or restructuring README/docs at the root, in apps/<app>/docs/, or in packages/<pkg>/.
---

# Doc Architecture (strawberrybear-tools)

Use this skill before editing documentation in the `strawberrybear-tools` monorepo.

## Workflow

1. Audit current truth before writing:
   - Read the relevant app/package source, `package.json`, scripts, and existing README/docs.
   - Treat code, tests, package manifests, and check scripts as stronger evidence than old prose.
   - Do not preserve a rule just because it exists in an older document.
2. Classify each rule:
   - Keep at root only if it applies by rule category, technology category, or code category across the monorepo.
   - Move to `apps/<app>/docs/` if it describes one application, runtime, UI kit, platform port, deployment, or verification flow.
   - Keep in `packages/<package>/README.md` when it teaches a package's public API, examples, constraints, or tests.
   - Move to `docs/archive/` if it is historical product intent, old architecture, migration evidence, or obsolete planning context.
   - Delete duplicate or obsolete rules after the current owner document contains the surviving rule.
3. Deduplicate by owner:
   - `docs/architecture/monorepo.md` owns workspace layout and dependency direction.
   - `docs/standards/development.md` owns repo-wide development rules.
   - `docs/standards/project-structure.md` owns source layout, view-unit hierarchy, composables extraction, shared tsconfig, and constant directory shape.
   - `docs/standards/ui.md` owns generic UI principles, component library priority, icons, and text truncation.
   - `docs/standards/tailwindcss.md` owns Tailwind CSS usage rules (only applies to apps that enable Tailwind).
   - `docs/standards/styling.md` owns CSS-first principles and app-level scrollbar infrastructure.
   - `docs/standards/comments.md` owns comments, JSDoc, and exported API documentation.
   - `docs/standards/constants.md` owns constant data shape, source attribution, exports, and tests.
   - `docs/standards/dependencies.md` owns dependency sources, direction, version changes, and CI lockfile checks.
   - `docs/standards/testing.md` owns unit test writing rules, mock boundaries, and command matrices.
   - `docs/standards/public-packages.md` owns shared package boundaries and README requirements.
   - `docs/standards/i18n.md` owns internationalization requirements.
   - `docs/standards/cicd.md` owns CI/CD workflow design and new-app setup.
   - `docs/standards/branching.md` owns Git branch model, PR rules, and merge policies.
   - `docs/standards/documentation.md` owns doc layering principles and file-edit safety for agents.
   - App docs own app-local architecture, UI framework, platform ports, deploy rules, and verification.
4. Update navigation:
   - Root `README.md` links only to high-level docs and app docs indexes.
   - `docs/README.md` is the canonical root docs index.
   - Each `apps/<app>/docs/README.md` is the canonical app docs index.
   - `skills/README.md` indexes all repository skills.
5. Validate:
   - Search for stale links and duplicate authoritative docs.
   - Run `git diff --check` after doc changes.

## Ownership Rules

- Root docs must not contain app-only implementation detail or bind a root rule to a specific app.
- Root docs organize rules by category, not by app name. App names are acceptable in navigation indexes and clearly marked examples only.
- Testing rules that apply by code category belong in root testing standards. Device, browser, deployment, and platform-specific acceptance belong in app docs.
- App docs must not redefine public package contracts; link to package README or root public package standards instead.
- Public package docs must not choose platform defaults, runtime strategies, or temporary app switches.
- Historical requirements may be referenced only as archive context, never as current implementation scope.

## App Docs Pattern

- Each `apps/<app>/docs/README.md` indexes app-specific docs and states which root standards the app inherits.
- App design docs own the chosen component library, theme tokens, platform limitations, and device/browser acceptance.
- Suggested subdirectories: `design/`, `deploy/`, `product/`, `archive/`.

## Skill Location

- Repository skills live in `skills/<skill-name>/SKILL.md` (唯一源).
- `.cursor/skills/` is an index only; do not duplicate skill files there.

## Fast Load Order

When starting an engineering task:

1. `docs/architecture/monorepo.md`
2. `docs/standards/development.md`
3. `docs/standards/project-structure.md`
4. Task-specific: app `docs/README.md`, `docs/standards/cicd.md`, `docs/standards/comments.md`, etc.
