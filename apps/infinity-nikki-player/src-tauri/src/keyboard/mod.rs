pub mod simulator;

#[cfg(target_os = "macos")]
pub mod mac_input;

#[cfg(target_os = "windows")]
pub mod win_input;

pub use simulator::KeySimulator;
