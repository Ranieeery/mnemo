//! Business rules. Services orchestrate repositories, the file system and external tools; commands only adapt them
//! to IPC.

pub mod asset_scope;
pub mod backup;
pub mod folder_order;
pub mod hidden;
pub mod library;
pub mod library_groups;
pub mod maintenance;
pub mod media;
pub mod relocation;
pub mod scanner;
pub mod search;
pub mod subtitles;
pub mod sync;
pub mod system;
pub mod tags;
pub mod videos;
pub mod watch;
