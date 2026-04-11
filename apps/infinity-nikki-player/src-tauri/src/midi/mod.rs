pub mod melody;
pub mod parser;

pub use melody::extract_melody;
pub use melody::extract_all_notes;
pub use parser::parse_midi_file;
