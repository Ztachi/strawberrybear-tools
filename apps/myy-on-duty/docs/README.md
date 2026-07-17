# 萌园园上岗日文档

- [当前开发进度与交接记录](HANDOFF.md)
- [架构与开发约定](architecture.md)
- [素材替换清单](assets.md)
- [第一版验收清单](acceptance.md)

本应用继承根层项目结构、开发、UI、Tailwind、测试、常量、注释和国际化规范。

## 国际化

使用 `vue-i18n`，资源入口为 `src/i18n/index.ts`，默认与回退语言均为 `zh-CN`。第一版先提供完整中文 key；增加语言时新增同构消息对象，再将语言加入设置选项。
