---
"@strawberrybear/infinity-nikki-player": patch
---

1.1.2 补丁版本：修复列表时长与旋律音符数显示错误，新增在线曲库免责声明。

- 修复文件列表中时长显示错误、旋律音符数始终为 0 的问题：Rust 端 `parse_midi_file` 时长改为基于所有音符 `end_tick` 的最大值（多轨 MIDI 不再因轨道累加而虚高），并在 `MidiInfo` 中新增 `melody_note_count` 字段；`load_midi_config` 在配置文件不存在时返回错误，让前端能正确触发「重新计算并写缓存」流程。
- 新增在线曲库免责声明：搜索栏下方、列表上方展示「仅供学习交流，禁止商用」警告条，警示用户合规使用。
- 顺手同步 Cargo.lock 中遗漏的 1.1.0 → 1.1.1 版本号，与 package.json、Cargo.toml、tauri.conf.json 保持一致。
