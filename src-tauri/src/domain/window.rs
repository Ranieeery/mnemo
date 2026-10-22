//! The app window's modes (pinned on top, mini player) and the geometry of the mini player. Rectangles and sizes are
//! in physical pixels, as the system reports them; the lengths below are logical and scaled by the monitor's DPI.

use serde::{Deserialize, Serialize};
use specta::Type;

/// Whether the window stays on top of the others, whether it is the mini player, and whether this system can keep a
/// window on top at all.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct WindowMode {
    pub pinned: bool,
    pub mini: bool,
    pub on_top_supported: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

impl Rect {
    fn right(&self) -> i64 {
        i64::from(self.x) + i64::from(self.width)
    }

    fn bottom(&self) -> i64 {
        i64::from(self.y) + i64::from(self.height)
    }

    fn overlaps(&self, other: &Rect) -> bool {
        i64::from(self.x) < other.right()
            && i64::from(other.x) < self.right()
            && i64::from(self.y) < other.bottom()
            && i64::from(other.y) < self.bottom()
    }

    pub fn size(&self) -> Size {
        Size {
            width: self.width,
            height: self.height,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct Size {
    pub width: u32,
    pub height: u32,
}

impl Size {
    pub fn saturating_sub(self, other: Size) -> Size {
        Size {
            width: self.width.saturating_sub(other.width),
            height: self.height.saturating_sub(other.height),
        }
    }
}

/// A size in logical pixels, as the window's minimum size is configured.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct LogicalSize {
    pub width: f64,
    pub height: f64,
}

/// The smallest the mini player's video gets, also its window's minimum size while it lasts.
pub const MINI_MIN_SIZE: LogicalSize = LogicalSize {
    width: 256.0,
    height: 144.0,
};
/// The mini player's video starts at this share of the work area's width, within the two widths below.
const MINI_WIDTH_SHARE: f64 = 0.25;
const MINI_MIN_START_WIDTH: f64 = 320.0;
const MINI_MAX_START_WIDTH: f64 = 560.0;
/// A tall video never makes the mini player taller than this share of the work area.
const MINI_MAX_HEIGHT_SHARE: f64 = 0.5;
/// Space between the mini player and the edges of the work area.
const MINI_MARGIN: f64 = 16.0;

pub const DEFAULT_ASPECT: f64 = 16.0 / 9.0;
const MIN_ASPECT: f64 = 0.25;
const MAX_ASPECT: f64 = 4.0;
/// Size changes within this many pixels of the one requested come from the app itself.
const RESIZE_TOLERANCE: u32 = 2;

/// The width-to-height ratio of a video, or 16:9 when its size is unknown or absurd.
pub fn aspect_or_default(width: f64, height: f64) -> f64 {
    let aspect = width / height;
    if aspect.is_finite() && (MIN_ASPECT..=MAX_ASPECT).contains(&aspect) {
        aspect
    } else {
        DEFAULT_ASPECT
    }
}

fn valid_scale(scale: f64) -> f64 {
    if scale.is_finite() && scale > 0.0 { scale } else { 1.0 }
}

fn to_pixels(length: f64) -> u32 {
    // Lengths here are positive and far below u32::MAX; `as` saturates anyway.
    length.round().max(0.0) as u32
}

/// The video size for a requested video width: `aspect` kept, no taller than the share of the work area allowed and
/// no larger than what fits inside it next to the window's `frame` and the margins.
fn video_size(width: f64, aspect: f64, work_area: Rect, frame: Size, scale: f64) -> Size {
    let margin = MINI_MARGIN * scale;
    let room_width = (f64::from(work_area.width) - 2.0 * margin - f64::from(frame.width)).max(1.0);
    let room_height = (f64::from(work_area.height) - 2.0 * margin - f64::from(frame.height)).max(1.0);
    let max_height = (f64::from(work_area.height) * MINI_MAX_HEIGHT_SHARE).min(room_height);
    let mut width = width.max(MINI_MIN_SIZE.width * scale).min(room_width);
    let mut height = width / aspect;
    if height > max_height {
        height = max_height;
        width = height * aspect;
    }
    Size {
        width: to_pixels(width).max(1),
        height: to_pixels(height).max(1),
    }
}

/// Keeps `rect` inside `area`, shrinking it only when it is larger than the area.
pub fn clamp_into(rect: Rect, area: Rect) -> Rect {
    let width = rect.width.min(area.width);
    let height = rect.height.min(area.height);
    let max_x = area.right() - i64::from(width);
    let max_y = area.bottom() - i64::from(height);
    let x = i64::from(rect.x).clamp(i64::from(area.x), max_x);
    let y = i64::from(rect.y).clamp(i64::from(area.y), max_y);
    Rect {
        // Within the area, which is made of i32 coordinates.
        x: i32::try_from(x).unwrap_or(area.x),
        y: i32::try_from(y).unwrap_or(area.y),
        width,
        height,
    }
}

/// The mini player's window: the video at `aspect` (the user's `preferred_width` in this session, or a share of the
/// work area), plus the window's `frame` (title bar and borders), in the bottom-right corner of `work_area`.
pub fn mini_rect(work_area: Rect, scale: f64, aspect: f64, frame: Size, preferred_width: Option<f64>) -> Rect {
    let scale = valid_scale(scale);
    let start_width = (f64::from(work_area.width) * MINI_WIDTH_SHARE)
        .clamp(MINI_MIN_START_WIDTH * scale, MINI_MAX_START_WIDTH * scale);
    let video = video_size(preferred_width.unwrap_or(start_width), aspect, work_area, frame, scale);
    let width = video.width + frame.width;
    let height = video.height + frame.height;
    let margin = i64::from(to_pixels(MINI_MARGIN * scale));
    let x = work_area.right() - margin - i64::from(width);
    let y = work_area.bottom() - margin - i64::from(height);
    clamp_into(
        Rect {
            x: i32::try_from(x).unwrap_or(work_area.x),
            y: i32::try_from(y).unwrap_or(work_area.y),
            width,
            height,
        },
        work_area,
    )
}

/// The mini player fitted to a new video `aspect`: same video width, new height, still against the corner of the
/// work area it is closest to, and inside it.
pub fn refit_for_aspect(current: Rect, work_area: Rect, scale: f64, aspect: f64, frame: Size) -> Rect {
    let scale = valid_scale(scale);
    let video_width = f64::from(current.width.saturating_sub(frame.width));
    let video = video_size(video_width, aspect, work_area, frame, scale);
    let width = video.width + frame.width;
    let height = video.height + frame.height;
    let closer_to_right = work_area.right() - current.right() < i64::from(current.x) - i64::from(work_area.x);
    let closer_to_bottom = work_area.bottom() - current.bottom() < i64::from(current.y) - i64::from(work_area.y);
    let x = if closer_to_right {
        current.right() - i64::from(width)
    } else {
        i64::from(current.x)
    };
    let y = if closer_to_bottom {
        current.bottom() - i64::from(height)
    } else {
        i64::from(current.y)
    };
    clamp_into(
        Rect {
            x: i32::try_from(x).unwrap_or(current.x),
            y: i32::try_from(y).unwrap_or(current.y),
            width,
            height,
        },
        work_area,
    )
}

/// Where the window goes back to after the mini player: where it was, unless no monitor shows any of it anymore
/// (unplugged meanwhile), in which case it is centered on the primary monitor's work area.
pub fn restore_rect(saved: Rect, work_areas: &[Rect], primary: Rect) -> Rect {
    if work_areas.iter().any(|area| area.overlaps(&saved)) {
        return saved;
    }
    let width = saved.width.min(primary.width);
    let height = saved.height.min(primary.height);
    let x = i64::from(primary.x) + (i64::from(primary.width) - i64::from(width)) / 2;
    let y = i64::from(primary.y) + (i64::from(primary.height) - i64::from(height)) / 2;
    Rect {
        x: i32::try_from(x).unwrap_or(primary.x),
        y: i32::try_from(y).unwrap_or(primary.y),
        width,
        height,
    }
}

/// Whether a size the window reports is the one the app asked for, rather than the user's doing.
pub fn is_programmatic(expected: Size, actual: Size) -> bool {
    expected.width.abs_diff(actual.width) <= RESIZE_TOLERANCE
        && expected.height.abs_diff(actual.height) <= RESIZE_TOLERANCE
}

/// Whether the app runs in a Wayland session, where windows cannot keep themselves on top or choose their position.
/// GTK uses Wayland when it is available, unless told otherwise.
pub fn is_wayland_session(wayland_display: Option<&str>, gdk_backend: Option<&str>) -> bool {
    wayland_display.is_some_and(|display| !display.is_empty())
        && !gdk_backend.is_some_and(|backend| backend.trim().starts_with("x11"))
}

#[cfg(test)]
mod tests {
    use super::*;

    const FULL_HD: Rect = Rect {
        x: 0,
        y: 0,
        width: 1920,
        height: 1040,
    };
    const NO_FRAME: Size = Size { width: 0, height: 0 };
    const WINDOWS_FRAME: Size = Size { width: 16, height: 39 };

    fn ratio(size: Size) -> f64 {
        f64::from(size.width) / f64::from(size.height)
    }

    fn inside(rect: Rect, area: Rect) -> bool {
        rect.x >= area.x && rect.y >= area.y && rect.right() <= area.right() && rect.bottom() <= area.bottom()
    }

    #[test]
    fn starts_in_the_bottom_right_corner_at_a_quarter_of_the_width() {
        let rect = mini_rect(FULL_HD, 1.0, DEFAULT_ASPECT, WINDOWS_FRAME, None);
        assert_eq!(
            rect,
            Rect {
                x: 1920 - 16 - 496,
                y: 1040 - 16 - 309,
                width: 480 + 16,
                height: 270 + 39,
            }
        );
    }

    #[test]
    fn keeps_the_video_aspect_ratio() {
        for aspect in [16.0 / 9.0, 4.0 / 3.0, 21.0 / 9.0, 9.0 / 16.0] {
            let rect = mini_rect(FULL_HD, 1.0, aspect, WINDOWS_FRAME, None);
            let video = rect.size().saturating_sub(WINDOWS_FRAME);
            assert!((ratio(video) - aspect).abs() < 0.01, "{aspect}: {video:?}");
            assert!(inside(rect, FULL_HD), "{aspect}");
        }
    }

    #[test]
    fn a_tall_video_is_capped_at_half_the_work_area() {
        let rect = mini_rect(FULL_HD, 1.0, 9.0 / 16.0, NO_FRAME, None);
        assert_eq!(rect.height, 520);
        assert_eq!(rect.width, 293);
    }

    #[test]
    fn scales_lengths_with_the_monitor_dpi() {
        let area = Rect {
            x: 0,
            y: 0,
            width: 2560,
            height: 1400,
        };
        for scale in [1.0, 1.5, 2.0] {
            let rect = mini_rect(area, scale, DEFAULT_ASPECT, NO_FRAME, None);
            let margin = to_pixels(16.0 * scale);
            assert_eq!(rect.right(), i64::from(area.width - margin), "{scale}");
            assert!(
                f64::from(rect.width) >= 320.0 * scale && f64::from(rect.width) <= 560.0 * scale,
                "{scale}"
            );
        }
    }

    #[test]
    fn follows_a_monitor_left_of_or_above_the_primary_one() {
        let left = Rect {
            x: -1280,
            y: -200,
            width: 1280,
            height: 984,
        };
        let rect = mini_rect(left, 1.0, DEFAULT_ASPECT, WINDOWS_FRAME, None);
        assert!(inside(rect, left));
        assert_eq!(rect.right(), -16);
    }

    #[test]
    fn uses_the_width_the_user_chose() {
        let rect = mini_rect(FULL_HD, 1.0, DEFAULT_ASPECT, NO_FRAME, Some(800.0));
        assert_eq!((rect.width, rect.height), (800, 450));
    }

    #[test]
    fn fits_tiny_and_huge_monitors() {
        let tiny = Rect {
            x: 0,
            y: 0,
            width: 200,
            height: 120,
        };
        let rect = mini_rect(tiny, 1.0, DEFAULT_ASPECT, WINDOWS_FRAME, None);
        assert!(inside(rect, tiny), "{rect:?}");

        let huge = Rect {
            x: 0,
            y: 0,
            width: 7680,
            height: 4280,
        };
        let rect = mini_rect(huge, 1.0, DEFAULT_ASPECT, NO_FRAME, None);
        assert_eq!(rect.width, 560);
        assert!(inside(rect, huge));
        // A width the user set on a larger monitor shrinks to what fits on this one.
        let rect = mini_rect(tiny, 1.0, DEFAULT_ASPECT, NO_FRAME, Some(5000.0));
        assert!(inside(rect, tiny), "{rect:?}");
    }

    #[test]
    fn never_goes_below_the_minimum_when_there_is_room() {
        let rect = mini_rect(FULL_HD, 1.0, DEFAULT_ASPECT, NO_FRAME, Some(10.0));
        assert_eq!((rect.width, rect.height), (256, 144));
    }

    #[test]
    fn refits_a_new_aspect_against_the_nearest_corner() {
        let current = mini_rect(FULL_HD, 1.0, DEFAULT_ASPECT, WINDOWS_FRAME, None);
        let refit = refit_for_aspect(current, FULL_HD, 1.0, 4.0 / 3.0, WINDOWS_FRAME);
        assert_eq!(refit.width, current.width);
        assert_eq!((refit.right(), refit.bottom()), (current.right(), current.bottom()));
        assert!((ratio(refit.size().saturating_sub(WINDOWS_FRAME)) - 4.0 / 3.0).abs() < 0.01);

        let top_left = Rect {
            x: 20,
            y: 30,
            ..current
        };
        let refit = refit_for_aspect(top_left, FULL_HD, 1.0, 4.0 / 3.0, WINDOWS_FRAME);
        assert_eq!((refit.x, refit.y), (20, 30));
    }

    #[test]
    fn a_refit_stays_inside_the_work_area() {
        let current = mini_rect(FULL_HD, 1.0, DEFAULT_ASPECT, NO_FRAME, None);
        let refit = refit_for_aspect(current, FULL_HD, 1.0, 9.0 / 16.0, NO_FRAME);
        assert!(inside(refit, FULL_HD));
        assert_eq!(refit.height, 520);
    }

    #[test]
    fn clamps_into_the_area() {
        let rect = Rect {
            x: 1900,
            y: -50,
            width: 400,
            height: 300,
        };
        assert_eq!(
            clamp_into(rect, FULL_HD),
            Rect {
                x: 1520,
                y: 0,
                width: 400,
                height: 300,
            }
        );
        let larger = Rect {
            x: 0,
            y: 0,
            width: 3000,
            height: 2000,
        };
        assert_eq!(clamp_into(larger, FULL_HD), FULL_HD);
    }

    #[test]
    fn restores_where_the_window_was_or_on_the_primary_monitor() {
        let saved = Rect {
            x: 2000,
            y: 100,
            width: 1200,
            height: 800,
        };
        let second = Rect {
            x: 1920,
            y: 0,
            width: 1920,
            height: 1040,
        };
        assert_eq!(restore_rect(saved, &[FULL_HD, second], FULL_HD), saved);
        // The second monitor was unplugged.
        assert_eq!(
            restore_rect(saved, &[FULL_HD], FULL_HD),
            Rect {
                x: 360,
                y: 120,
                width: 1200,
                height: 800,
            }
        );
        let small = Rect {
            x: 0,
            y: 0,
            width: 1024,
            height: 728,
        };
        assert_eq!(restore_rect(saved, &[small], small), small);
    }

    #[test]
    fn tells_programmatic_resizes_apart() {
        let expected = Size {
            width: 480,
            height: 270,
        };
        assert!(is_programmatic(
            expected,
            Size {
                width: 481,
                height: 269
            }
        ));
        assert!(!is_programmatic(
            expected,
            Size {
                width: 600,
                height: 270
            }
        ));
    }

    #[test]
    fn reads_the_aspect_of_a_video() {
        assert_eq!(aspect_or_default(1920.0, 1080.0), 1920.0 / 1080.0);
        for (width, height) in [(0.0, 0.0), (1920.0, 0.0), (f64::NAN, 1.0), (10_000.0, 10.0)] {
            assert_eq!(aspect_or_default(width, height), DEFAULT_ASPECT, "{width}x{height}");
        }
    }

    #[test]
    fn detects_wayland_sessions() {
        assert!(is_wayland_session(Some("wayland-0"), None));
        assert!(!is_wayland_session(Some("wayland-0"), Some("x11")));
        assert!(!is_wayland_session(None, None));
        assert!(!is_wayland_session(Some(""), None));
    }
}
