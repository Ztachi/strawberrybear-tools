# Agent Skills

本目录是 strawberrybear-tools 仓库级 Agent Skill 的**唯一源**。Cursor 等工具可从本目录加载 skill；`.cursor/skills/README.md` 提供索引指向此处。

## 索引

| Skill                                                               | 说明                              |
| ------------------------------------------------------------------- | --------------------------------- |
| [doc-architecture](doc-architecture/SKILL.md)                       | 文档分层、去重与重组流程          |
| [create-app](create-app/SKILL.md)                                   | 创建新 app 的完整流程             |
| [launch-cloudflare-pages-app](launch-cloudflare-pages-app/SKILL.md) | Cloudflare Pages Web 应用上线闭环 |
| [vue-1.0.1](vue-1.0.1/SKILL.md)                                     | Vue 3 Composition API 实践        |
| [rust-1.0.1](rust-1.0.1/SKILL.md)                                   | Rust 所有权与并发参考             |

## 新增 Skill

1. 在 `skills/<skill-name>/` 下创建 `SKILL.md`（含 YAML frontmatter：`name`、`description`）。
2. 在本 README 表格中追加条目。
3. 同步更新 `docs/README.md` 的 Skill 章节。

## 相关文档

- [文档分层规范](../docs/standards/documentation.md)
- [文档索引](../docs/README.md)
