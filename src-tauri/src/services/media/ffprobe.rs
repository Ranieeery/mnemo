use serde::Deserialize;

use crate::domain::models::{AudioTrack, MediaTracks, SubtitleTrack};
use crate::error::{AppError, AppResult};

#[derive(Deserialize)]
struct ProbeOutput {
    #[serde(default)]
    streams: Vec<ProbeStream>,
    format: Option<ProbeFormat>,
}

#[derive(Deserialize)]
struct ProbeStream {
    codec_type: Option<String>,
}

#[derive(Deserialize)]
struct ProbeFormat {
    duration: Option<String>,
}

/// Extracts the duration from `ffprobe -print_format json -show_format -show_streams` output. Files without a video
/// stream are rejected; a missing or unparsable duration counts as unknown (0).
pub fn parse_duration(json: &[u8]) -> AppResult<f64> {
    let output: ProbeOutput = serde_json::from_slice(json).map_err(|error| AppError::MediaProcessFailed {
        tool: "ffprobe".into(),
        message: format!("unexpected output: {error}"),
    })?;
    if !output
        .streams
        .iter()
        .any(|stream| stream.codec_type.as_deref() == Some("video"))
    {
        return Err(AppError::MediaProcessFailed {
            tool: "ffprobe".into(),
            message: "no video stream found".into(),
        });
    }
    Ok(output
        .format
        .and_then(|format| format.duration)
        .and_then(|duration| duration.parse::<f64>().ok())
        .filter(|duration| duration.is_finite() && *duration > 0.0)
        .unwrap_or(0.0))
}

#[derive(Deserialize)]
struct TrackOutput {
    #[serde(default)]
    streams: Vec<TrackStream>,
}

#[derive(Deserialize)]
struct TrackStream {
    codec_type: Option<String>,
    codec_name: Option<String>,
    channels: Option<i64>,
    #[serde(default)]
    tags: StreamTags,
    #[serde(default)]
    disposition: Disposition,
}

#[derive(Default, Deserialize)]
struct StreamTags {
    language: Option<String>,
    title: Option<String>,
}

#[derive(Default, Deserialize)]
struct Disposition {
    #[serde(default)]
    default: u8,
    #[serde(default)]
    forced: u8,
}

/// Subtitle codecs ffmpeg can turn into WebVTT. Everything else (PGS, VobSub, DVB...) is a picture.
const TEXT_SUBTITLE_CODECS: &[&str] = &["subrip", "srt", "ass", "ssa", "webvtt", "mov_text", "text", "microdvd"];

/// Lists the audio and subtitle streams from `ffprobe -print_format json -show_streams` output. Indexes count each
/// kind separately, as ffmpeg's `0:a:N` and `0:s:N` stream specifiers do.
pub fn parse_tracks(json: &[u8]) -> AppResult<MediaTracks> {
    let output: TrackOutput = serde_json::from_slice(json).map_err(|error| AppError::MediaProcessFailed {
        tool: "ffprobe".into(),
        message: format!("unexpected output: {error}"),
    })?;
    let mut tracks = MediaTracks {
        audio: Vec::new(),
        subtitles: Vec::new(),
    };
    for stream in output.streams {
        let codec = stream.codec_name.unwrap_or_else(|| "unknown".into());
        let language = stream
            .tags
            .language
            .filter(|language| !language.is_empty() && language != "und");
        let title = stream.tags.title.filter(|title| !title.trim().is_empty());
        match stream.codec_type.as_deref() {
            Some("audio") => tracks.audio.push(AudioTrack {
                index: tracks.audio.len() as i64,
                language,
                title,
                codec,
                channels: stream.channels,
                is_default: stream.disposition.default == 1,
            }),
            Some("subtitle") => tracks.subtitles.push(SubtitleTrack {
                index: tracks.subtitles.len() as i64,
                language,
                title,
                is_text: TEXT_SUBTITLE_CODECS.contains(&codec.as_str()),
                codec,
                is_default: stream.disposition.default == 1,
                is_forced: stream.disposition.forced == 1,
            }),
            _ => {}
        }
    }
    Ok(tracks)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Trimmed `ffprobe` output of an anime release: two audio tracks, text and image subtitles, a font attachment.
    const MKV_STREAMS: &[u8] = br#"{ "streams": [
        { "index": 0, "codec_name": "hevc", "codec_type": "video", "disposition": { "default": 1, "forced": 0 } },
        { "index": 1, "codec_name": "ac3", "codec_type": "audio", "channels": 6,
          "disposition": { "default": 1, "forced": 0 }, "tags": { "language": "jpn", "title": "Japanese 5.1" } },
        { "index": 2, "codec_name": "aac", "codec_type": "audio", "channels": 2,
          "disposition": { "default": 0, "forced": 0 }, "tags": { "language": "eng" } },
        { "index": 3, "codec_name": "ass", "codec_type": "subtitle",
          "disposition": { "default": 1, "forced": 0 }, "tags": { "language": "eng", "title": "Full" } },
        { "index": 4, "codec_name": "subrip", "codec_type": "subtitle",
          "disposition": { "default": 0, "forced": 1 }, "tags": { "language": "por" } },
        { "index": 5, "codec_name": "hdmv_pgs_subtitle", "codec_type": "subtitle",
          "disposition": { "default": 0, "forced": 0 }, "tags": { "language": "und", "title": " " } },
        { "index": 6, "codec_name": "ttf", "codec_type": "attachment", "tags": { "filename": "font.ttf" } }
    ] }"#;

    #[test]
    fn lists_audio_and_subtitle_tracks_with_their_own_indexes() {
        let tracks = parse_tracks(MKV_STREAMS).unwrap();
        assert_eq!(
            tracks.audio,
            [
                AudioTrack {
                    index: 0,
                    language: Some("jpn".into()),
                    title: Some("Japanese 5.1".into()),
                    codec: "ac3".into(),
                    channels: Some(6),
                    is_default: true,
                },
                AudioTrack {
                    index: 1,
                    language: Some("eng".into()),
                    title: None,
                    codec: "aac".into(),
                    channels: Some(2),
                    is_default: false,
                },
            ]
        );
        let subtitles: Vec<_> = tracks
            .subtitles
            .iter()
            .map(|track| {
                (
                    track.index,
                    track.language.as_deref(),
                    track.title.as_deref(),
                    track.is_default,
                    track.is_forced,
                    track.is_text,
                )
            })
            .collect();
        assert_eq!(
            subtitles,
            [
                (0, Some("eng"), Some("Full"), true, false, true),
                (1, Some("por"), None, false, true, true),
                (2, None, None, false, false, false),
            ]
        );
    }

    #[test]
    fn tolerates_streams_without_tags_or_dispositions() {
        let tracks =
            parse_tracks(br#"{ "streams": [ { "codec_type": "audio" }, { "codec_type": "video" } ] }"#).unwrap();
        assert_eq!(tracks.audio[0].codec, "unknown");
        assert_eq!(tracks.audio[0].language, None);
        assert!(tracks.subtitles.is_empty());
        assert!(parse_tracks(b"{}").unwrap().audio.is_empty());
        assert!(parse_tracks(b"not json").is_err());
    }

    #[test]
    fn reads_the_duration_of_a_video() {
        let json = br#"{
            "streams": [ { "codec_type": "audio" }, { "codec_type": "video", "width": 1920 } ],
            "format": { "duration": "1425.360000", "bit_rate": "4000000" }
        }"#;
        assert_eq!(parse_duration(json).unwrap(), 1425.36);
    }

    #[test]
    fn unknown_duration_is_zero() {
        let json = br#"{ "streams": [ { "codec_type": "video" } ], "format": { "duration": "N/A" } }"#;
        assert_eq!(parse_duration(json).unwrap(), 0.0);
        assert_eq!(
            parse_duration(br#"{ "streams": [ { "codec_type": "video" } ] }"#).unwrap(),
            0.0
        );
    }

    #[test]
    fn rejects_files_without_video_and_invalid_output() {
        assert!(parse_duration(br#"{ "streams": [ { "codec_type": "audio" } ], "format": {} }"#).is_err());
        assert!(parse_duration(b"not json").is_err());
    }
}
