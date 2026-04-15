pub mod simulator;

#[cfg(target_os = "windows")]
pub mod driver;

#[cfg(target_os = "windows")]
pub use simulator::KeySimulator;

#[cfg(target_os = "windows")]
pub use driver::{init as init_driver, is_initialized as is_driver_initialized};

#[cfg(not(target_os = "windows"))]
pub use simulator::KeySimulator;
