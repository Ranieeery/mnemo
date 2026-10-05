use serde::Deserialize;

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

#[cfg(test)]
mod tests {
    use super::*;

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
