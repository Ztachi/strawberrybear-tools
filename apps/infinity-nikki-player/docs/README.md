# 文档索引

本文档包含 Infinity Nikki Player 项目的各类文档、问题记录和开发指南。

## 问题记录 (Issues)

| 编号                                                                  | 问题名称               | 状态      | 日期       |
| --------------------------------------------------------------------- | ---------------------- | --------- | ---------- |
| [ISSUE-001](./ISSUE-001-old-compiled-js-files-with-i18n-reference.md) | 旧编译文件残留导致白屏 | ✅ 已解决 | 2026-04-07 |

## 文档结构

```
docs/
├── README.md                    # 本文档（索引）
├── ISSUE-001-old-compiled-js-files-with-i18n-reference.md  # 问题详情
```

## 已知问题

### ISSUE-001: 旧编译文件残留导致白屏

**问题现象**：应用启动后页面显示白屏，控制台报错 `TypeError: undefined is not an object (evaluating 'Ke._s')`

**根本原因**：项目中残留了旧编译文件 `src/main.js`，该文件引用了已删除的 `vue-i18n` 模块

**解决方案**：删除 `src/main.js`、`src/stores/player.js`、`src/types/index.js` 等残留文件

👉 [查看完整问题报告](./ISSUE-001-old-compiled-js-files-with-i18n-reference.md)

## 开发指南

> 更多开发指南文档待添加...
