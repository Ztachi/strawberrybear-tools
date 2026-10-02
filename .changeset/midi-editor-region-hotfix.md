---
"@strawberrybear/infinity-nikki-player": patch
"@strawberrybear/midi-editor": patch
"@strawberrybear/piano-roll": patch
---

修复 MIDI 编辑器曲长计算、音轨区域延长和画笔误触滚动条。

- 曲长以最长启用音轨区域的右边界为准，禁用、删除或缩短音轨时同步更新曲长和试听位置。
- 总览支持拖动音轨区域右边缘调整长度，边缘自动滚动，松手仅记录一次撤销。
- 导出只包含启用音轨，各轨保留自身区域长度。
- 增强撤销、重做按钮的禁用样式，增加 1/64 与 1/128 节拍网格。
