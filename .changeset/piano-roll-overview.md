---
"@strawberrybear/piano-roll": minor
"@strawberrybear/infinity-nikki-player": patch
"@strawberrybear/player": patch
---

升级钢琴卷帘公共库与 MIDI 详情页，新增可缩放多轨总览、独立单轨钢琴卷帘浮层、精确 tempo map 时间轴和播放头 seek 交互。

公共卷帘迁移到 document/transport 输入（原曲秒单位），提供 core/browser/vue 分层入口、可见音符索引、独立 Follow 与拖拽预览。预览音频使用原始 MIDI 时间轴，通用播放器忽略已失效的异步 seek。
