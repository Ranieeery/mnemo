//! Subtitles, media tracks and the player preferences.

use serde::{Deserialize, Serialize};
use specta::Type;
use specta_typescript::Number;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum SubtitleFormat {
    Srt,
    Vtt,
    Sub,
    Ass,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SubtitleFile {
    pub format: SubtitleFormat,
    pub content: String,
}

/// The audio and subtitle streams inside a video file, in file order.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct MediaTracks {
    pub audio: Vec<AudioTrack>,
    pub subtitles: Vec<SubtitleTrack>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AudioTrack {
    /// Position among the file's audio streams (ffmpeg's `0:a:<index>`).
    pub index: i64,
    /// ISO 639 code from the file, when it has one other than "undetermined".
    pub language: Option<String>,
    pub title: Option<String>,
    pub codec: String,
    pub channels: Option<i64>,
    pub is_default: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SubtitleTrack {
    /// Position among the file's subtitle streams (ffmpeg's `0:s:<index>`).
    pub index: i64,
    pub language: Option<String>,
    pub title: Option<String>,
    pub codec: String,
    pub is_default: bool,
    pub is_forced: bool,
    /// Text subtitles can be extracted and shown; image ones (PGS, VobSub, DVB) cannot without OCR.
    pub is_text: bool,
}

/// How the built-in player was left: kept between sessions and used for every video. Fields missing from a stored
/// value take their default (see `db::settings::Player`), so fields can be added later without a migration.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PlayerPreferences {
    /// From 0 (silent) to 1 (full).
    #[specta(type = Number)]
    pub volume: f64,
    pub muted: bool,
    #[specta(type = Number)]
    pub speed: f64,
    pub subtitles_enabled: bool,
    pub theater: bool,
    /// Width of the "Up next" column in pixels, set by dragging its edge; `None` lets it follow the window.
    pub up_next_width: Option<i64>,
}

impl Default for PlayerPreferences {
    fn default() -> Self {
        Self {
            volume: 1.0,
            muted: false,
            speed: 1.0,
            subtitles_enabled: true,
            theater: false,
            up_next_width: None,
        }
    }
}
