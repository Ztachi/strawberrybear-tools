# Changelog

## 0.1.0

- 首个版本：`compileKeystrokeTimeline` 编译器与 `KeystrokeSequencer` 执行器。
- 约束求解：短音拉长防吞音、同键最短抬起间隔、同键过密按比例压缩、不同键完全独立（长音不被其他键截断）。
- 执行器：漂移自校准调度、play/pause/resume/seek/stop、暂停与停止自动抬起所有键、跨界长音恢复重按。
