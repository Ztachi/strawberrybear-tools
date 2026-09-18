---
'@strawberrybear/infinity-nikki-player': patch
---

桌面端全局禁用文本选择，避免误操作选中无关 UI 文字。同时在 `style.css` 内以高优先级白名单统一放行 antdv 浮层（Tooltip/Popover/Modal/Drawer/Notification）、表单输入与富文本编辑，以及业务侧所有"纯展示型"信息元素（完整标题、歌单/歌曲/模板名、简介/描述、联系方式、按键日志、钢琴音轨名、在线曲库元数据、帮助文档、关于信息等）。光标状态与可选中行为对齐——可选元素显示 I 字光标，可点击按钮保持 pointer；并修复了部分组件（如歌单详情 `.detail-description`、悬浮窗 `.mini-bar`）原局部 cursor 覆盖导致光标与可选状态不一致的问题。关于中联系方式改为 QQ 群 967529814。