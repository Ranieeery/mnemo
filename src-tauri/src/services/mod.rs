//! Business rules. Services orchestrate repositories, the file system and external tools; commands only adapt them
//! to IPC.

pub mod asset_scope;
pub mod backup;
pub mod library;
pub mod maintenance;
pub mod media;
pub mod scanner;
pub mod search;
pub mod subtitles;
pub mod system;
pub mod tags;
pub mod watch;
