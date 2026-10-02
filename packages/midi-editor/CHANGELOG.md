# @strawberrybear/midi-editor

## 0.1.2

### Patch Changes

- 7ab089c: 修复 MIDI 编辑器音轨长度、细分网格、草稿恢复与导出问题，完善编辑帮助和更新入口。
  - **音轨范围**：曲长按最长启用音轨有效区域的右边界计算，禁用、删除或缩短音轨后同步更新试听位置和循环范围。总览与音符详情均可拖动区域右边缘延长或缩短，支持边缘自动滚动、网格／小节／音符结尾吸附及落点预览，Option/Alt 临时绕过吸附，Esc 取消，松手仅记录一次撤销。缩短保留完整工程音符，拉长可恢复；试听和导出只使用有效部分。
  - **编辑与网格**：修复画笔拖动滚动条时误添音符、首次选中音符中断拖拽的问题，增强撤销和重做的禁用状态。增加 1/64、1/128、1/256 网格，修复细网格间距不均；标尺与网格统一随缩放细分，兼容三连音和拍号变化，有效范围之外使用中性灰区分。
  - **草稿与试听**：空白新建、每个项目、每首歌曲改编及项目副本分别保存草稿，切换入口不再串草稿。直接关闭保留最新草稿，再进入原入口可恢复；独立窗口还原保留来源，修复关闭时重复确认及切换项目期间的试听错误。
  - **MIDI 导出**：不再额外添加以文件名命名的空音轨，保留各音轨的有效长度和速度变化，循环选区只使用有效范围。
  - **歌曲管理**：歌曲和歌单增加按添加时间排序，默认最新在前；重复导入和修改歌曲信息不重置添加时间。
  - **帮助与界面**：补全中英文音轨拖拽说明，包括延长、缩短、吸附、预览、取消和工程／导出范围。帮助弹窗改为点击版本号检测更新，Tooltip 仅显示当前操作或进行中状态，移除手动下载与重复提示，导出诊断移到“了解更多”右侧；刷新及更新图标共用居中旋转组件，保留刷新悬浮动效。

- Updated dependencies [7ab089c]
  - @strawberrybear/piano-roll@0.3.1

## 0.1.1

### Patch Changes

- Updated dependencies [724a15f]
- Updated dependencies [05479b9]
- Updated dependencies [350f9c0]
- Updated dependencies [5f517fa]
- Updated dependencies [5f517fa]
- Updated dependencies [5f517fa]
- Updated dependencies [e19c1a8]
- Updated dependencies [8728363]
- Updated dependencies [de51c8f]
- Updated dependencies [f5917b4]
- Updated dependencies [5f517fa]
- Updated dependencies [c5e709b]
- Updated dependencies [39e4130]
  - @strawberrybear/piano-roll@0.3.0

## 0.1.0

- 首个版本：音符/轨道/歌曲编辑命令、撤销重做、剪贴板、吸附与量化、SMF 编解码、试听调度器与编辑会话。
