pub mod simulator;

#[cfg(target_os = "windows")]
pub mod win_input;

#[cfg(target_os = "windows")]
pub use simulator::KeySimulator;

#[cfg(target_os = "windows")]
pub use win_input::init as init_driver;

#[cfg(not(target_os = "windows"))]
pub use simulator::KeySimulator;
