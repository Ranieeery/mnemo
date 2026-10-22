//! The app window's modes: pinned on top of other windows, and the mini player (the same window shrunk to a small
//! video in a corner, always on top). Nothing here is stored: the app always starts as a normal, unpinned window.
//!
//! Window calls made by a command wait for the main thread, which meanwhile reports the resulting window events;
//! [`WindowControl::note_resize`] runs there and only `try_lock`s, so it skips the app's own changes instead of
//! waiting for the command that holds the lock.

mod native;

use std::sync::{Mutex, MutexGuard};

pub use native::NativeWindow;

use crate::domain::window::{
    LogicalSize, MINI_MIN_SIZE, Rect, Size, WindowMode, is_programmatic, is_wayland_session, mini_rect,
    refit_for_aspect, restore_rect,
};
use crate::error::{AppError, AppResult};

/// How the window was before the mini player, to give it back exactly.
#[derive(Debug, Clone, Copy)]
struct Normal {
    rect: Rect,
    maximized: bool,
}

#[derive(Debug, Clone, Copy)]
struct MiniSession {
    normal: Normal,
    /// Title bar and borders: the outer size minus the content's.
    frame: Size,
    scale: f64,
    /// The content size the app last asked for; a resize to it is not the user's.
    expected: Size,
}

#[derive(Debug, Default)]
struct State {
    pinned: bool,
    mini: Option<MiniSession>,
    /// The video width (logical) the user gave the mini player in this session.
    preferred_width: Option<f64>,
}

pub struct WindowControl {
    state: Mutex<State>,
    on_top_supported: bool,
    /// The window's configured minimum size, given back after the mini player.
    normal_min_size: Option<LogicalSize>,
}

/// Why a window mode is refused where windows cannot stay on top.
const ON_TOP_UNSUPPORTED: &str = "keeping the window on top is not supported on this system";

impl WindowControl {
    pub fn new(on_top_supported: bool, normal_min_size: Option<LogicalSize>) -> Self {
        Self {
            state: Mutex::new(State::default()),
            on_top_supported,
            normal_min_size,
        }
    }

    /// Whether this system can keep a window on top: not under Wayland, where the request is silently ignored.
    pub fn system_supports_on_top() -> bool {
        !(cfg!(target_os = "linux")
            && is_wayland_session(
                std::env::var("WAYLAND_DISPLAY").ok().as_deref(),
                std::env::var("GDK_BACKEND").ok().as_deref(),
            ))
    }

    fn lock(&self) -> AppResult<MutexGuard<'_, State>> {
        self.state
            .lock()
            .map_err(|_| AppError::Internal("the window state is unavailable".into()))
    }

    fn mode_of(&self, state: &State) -> WindowMode {
        WindowMode {
            pinned: state.pinned,
            mini: state.mini.is_some(),
            on_top_supported: self.on_top_supported,
        }
    }

    pub fn mode(&self) -> AppResult<WindowMode> {
        Ok(self.mode_of(&*self.lock()?))
    }

    fn ensure_supported(&self) -> AppResult<()> {
        if self.on_top_supported {
            Ok(())
        } else {
            Err(AppError::InvalidInput(ON_TOP_UNSUPPORTED.into()))
        }
    }

    /// Keeps the window on top of the others, or stops. In the mini player, which is always on top, the choice
    /// applies once it ends.
    pub fn set_pinned(&self, window: &impl NativeWindow, pinned: bool) -> AppResult<WindowMode> {
        self.ensure_supported()?;
        let mut state = self.lock()?;
        if state.mini.is_none() {
            window.set_always_on_top(pinned)?;
        }
        state.pinned = pinned;
        Ok(self.mode_of(&state))
    }

    /// Shrinks the window to the mini player for a video of the given size (unknown sizes give 16:9).
    pub fn enter_mini(&self, window: &impl NativeWindow, aspect: f64) -> AppResult<WindowMode> {
        self.ensure_supported()?;
        let mut state = self.lock()?;
        if state.mini.is_some() {
            return Ok(self.mode_of(&state));
        }
        // The player leaves full screen first, but the window may still be on its way out: finish it here, so what
        // is saved below is the normal window.
        if window.is_fullscreen()? {
            window.exit_fullscreen()?;
        }
        if window.is_minimized()? {
            window.unminimize()?;
        }
        let maximized = window.is_maximized()?;
        if maximized {
            window.unmaximize()?;
        }
        let rect = window.outer_rect()?;
        let frame = rect.size().saturating_sub(window.inner_size()?);
        let (work_area, scale) = window.work_area()?;
        let preferred = state.preferred_width.map(|width| width * scale);
        let target = mini_rect(work_area, scale, aspect, frame, preferred);
        let session = MiniSession {
            normal: Normal { rect, maximized },
            frame,
            scale,
            expected: target.size().saturating_sub(frame),
        };
        state.mini = Some(session);
        let applied = window
            .set_min_size(Some(MINI_MIN_SIZE))
            .and_then(|()| place(window, target, frame))
            .and_then(|()| window.set_always_on_top(true));
        if let Err(error) = applied {
            // Half a mini player is worse than none: put the window back as it was.
            state.mini = None;
            if let Err(restore_error) = self.restore(window, &session, state.pinned) {
                tracing::warn!(%restore_error, "could not restore the window after a failed mini player");
            }
            return Err(error);
        }
        Ok(self.mode_of(&state))
    }

    /// Gives the window back its size, position, maximized state, minimum size and pin. Does nothing outside the mini
    /// player.
    pub fn exit_mini(&self, window: &impl NativeWindow) -> AppResult<WindowMode> {
        let mut state = self.lock()?;
        if let Some(session) = state.mini.take() {
            self.restore(window, &session, state.pinned)?;
        }
        Ok(self.mode_of(&state))
    }

    fn restore(&self, window: &impl NativeWindow, session: &MiniSession, pinned: bool) -> AppResult<()> {
        if window.is_minimized()? {
            window.unminimize()?;
        }
        if window.is_maximized()? {
            window.unmaximize()?;
        }
        window.set_min_size(self.normal_min_size)?;
        let (work_areas, primary) = window.work_areas()?;
        let target = restore_rect(session.normal.rect, &work_areas, primary);
        place(window, target, session.frame)?;
        if session.normal.maximized {
            window.maximize()?;
        }
        window.set_always_on_top(pinned)
    }

    /// Fits the mini player to the next video's aspect ratio, keeping its width and corner.
    pub fn set_mini_aspect(&self, window: &impl NativeWindow, aspect: f64) -> AppResult<WindowMode> {
        let mut state = self.lock()?;
        if let Some(session) = state.mini.as_mut() {
            let (work_area, scale) = window.work_area()?;
            let target = refit_for_aspect(window.outer_rect()?, work_area, scale, aspect, session.frame);
            session.scale = scale;
            session.expected = target.size().saturating_sub(session.frame);
            place(window, target, session.frame)?;
        }
        Ok(self.mode_of(&state))
    }

    /// Follows a resize reported by the window, on the main thread. Returns whether it was the user's (to be settled
    /// with [`Self::settle_resize`] off the main thread); the app's own resizes are ignored.
    pub fn note_resize(&self, size: Size) -> bool {
        let Ok(state) = self.state.try_lock() else {
            return false;
        };
        state
            .mini
            .is_some_and(|session| !is_programmatic(session.expected, size))
    }

    /// A monitor with another DPI: lengths the user chose keep their logical size.
    pub fn note_scale(&self, scale: f64) {
        if let Ok(mut state) = self.state.try_lock()
            && let Some(session) = state.mini.as_mut()
        {
            session.scale = scale;
        }
    }

    /// After the user resized the mini player: maximizing it means "expand", any other size becomes the width the
    /// mini player keeps for the rest of the session. Returns the new mode when the mini player ended.
    pub fn settle_resize(&self, window: &impl NativeWindow) -> AppResult<Option<WindowMode>> {
        let mut state = self.lock()?;
        let Some(session) = state.mini else {
            return Ok(None);
        };
        if window.is_maximized()? {
            state.mini = None;
            self.restore(window, &session, state.pinned)?;
            return Ok(Some(self.mode_of(&state)));
        }
        let size = window.inner_size()?;
        if !window.is_minimized()? && !is_programmatic(session.expected, size) {
            state.preferred_width = Some(f64::from(size.width) / session.scale);
        }
        Ok(None)
    }
}

/// Moves and sizes the window to `rect` (frame included).
fn place(window: &impl NativeWindow, rect: Rect, frame: Size) -> AppResult<()> {
    window.set_inner_size(rect.size().saturating_sub(frame))?;
    window.set_position(rect.x, rect.y)
}

#[cfg(test)]
mod tests {
    use std::cell::RefCell;

    use super::*;
    use crate::domain::window::DEFAULT_ASPECT;

    const SCREEN: Rect = Rect {
        x: 0,
        y: 0,
        width: 1920,
        height: 1040,
    };
    const FRAME: Size = Size { width: 16, height: 39 };
    const NORMAL_MIN: LogicalSize = LogicalSize {
        width: 900.0,
        height: 600.0,
    };

    /// A window that applies what it is told, as far as these rules can see.
    #[derive(Debug, Clone)]
    struct Fake {
        rect: Rect,
        maximized: bool,
        minimized: bool,
        fullscreen: bool,
        on_top: bool,
        min_size: Option<LogicalSize>,
        scale: f64,
        monitors: Vec<Rect>,
        /// The rect a maximized window takes, and the one it goes back to.
        restored: Rect,
        fail_on_top: bool,
    }

    struct FakeWindow(RefCell<Fake>);

    impl FakeWindow {
        fn new() -> Self {
            let rect = Rect {
                x: 100,
                y: 50,
                width: 1200 + FRAME.width,
                height: 800 + FRAME.height,
            };
            Self(RefCell::new(Fake {
                rect,
                maximized: false,
                minimized: false,
                fullscreen: false,
                on_top: false,
                min_size: Some(NORMAL_MIN),
                scale: 1.0,
                monitors: vec![SCREEN],
                restored: rect,
                fail_on_top: false,
            }))
        }

        fn get(&self) -> Fake {
            self.0.borrow().clone()
        }

        fn with(&self, change: impl FnOnce(&mut Fake)) {
            change(&mut self.0.borrow_mut());
        }
    }

    impl NativeWindow for FakeWindow {
        fn outer_rect(&self) -> AppResult<Rect> {
            Ok(self.0.borrow().rect)
        }
        fn inner_size(&self) -> AppResult<Size> {
            Ok(self.0.borrow().rect.size().saturating_sub(FRAME))
        }
        fn is_maximized(&self) -> AppResult<bool> {
            Ok(self.0.borrow().maximized)
        }
        fn is_minimized(&self) -> AppResult<bool> {
            Ok(self.0.borrow().minimized)
        }
        fn is_fullscreen(&self) -> AppResult<bool> {
            Ok(self.0.borrow().fullscreen)
        }
        fn exit_fullscreen(&self) -> AppResult<()> {
            let mut fake = self.0.borrow_mut();
            fake.rect = fake.restored;
            fake.fullscreen = false;
            Ok(())
        }
        fn maximize(&self) -> AppResult<()> {
            let mut fake = self.0.borrow_mut();
            fake.restored = fake.rect;
            fake.rect = SCREEN;
            fake.maximized = true;
            Ok(())
        }
        fn unmaximize(&self) -> AppResult<()> {
            let mut fake = self.0.borrow_mut();
            fake.rect = fake.restored;
            fake.maximized = false;
            Ok(())
        }
        fn unminimize(&self) -> AppResult<()> {
            self.0.borrow_mut().minimized = false;
            Ok(())
        }
        fn set_always_on_top(&self, on_top: bool) -> AppResult<()> {
            let mut fake = self.0.borrow_mut();
            if fake.fail_on_top {
                return Err(AppError::Internal("refused".into()));
            }
            fake.on_top = on_top;
            Ok(())
        }
        fn set_min_size(&self, size: Option<LogicalSize>) -> AppResult<()> {
            self.0.borrow_mut().min_size = size;
            Ok(())
        }
        fn set_inner_size(&self, size: Size) -> AppResult<()> {
            let mut fake = self.0.borrow_mut();
            fake.rect.width = size.width + FRAME.width;
            fake.rect.height = size.height + FRAME.height;
            Ok(())
        }
        fn set_position(&self, x: i32, y: i32) -> AppResult<()> {
            let mut fake = self.0.borrow_mut();
            fake.rect.x = x;
            fake.rect.y = y;
            Ok(())
        }
        fn work_area(&self) -> AppResult<(Rect, f64)> {
            let fake = self.0.borrow();
            Ok((fake.monitors[0], fake.scale))
        }
        fn work_areas(&self) -> AppResult<(Vec<Rect>, Rect)> {
            let fake = self.0.borrow();
            Ok((fake.monitors.clone(), fake.monitors[0]))
        }
    }

    fn control() -> WindowControl {
        WindowControl::new(true, Some(NORMAL_MIN))
    }

    fn mini_size(window: &FakeWindow) -> Size {
        window.get().rect.size().saturating_sub(FRAME)
    }

    #[test]
    fn starts_normal_and_unpinned() {
        assert_eq!(
            control().mode().unwrap(),
            WindowMode {
                pinned: false,
                mini: false,
                on_top_supported: true,
            }
        );
    }

    #[test]
    fn pins_and_unpins_the_window() {
        let control = control();
        let window = FakeWindow::new();
        assert!(control.set_pinned(&window, true).unwrap().pinned);
        assert!(window.get().on_top);
        assert!(!control.set_pinned(&window, false).unwrap().pinned);
        assert!(!window.get().on_top);
    }

    #[test]
    fn a_refused_pin_changes_nothing() {
        let control = control();
        let window = FakeWindow::new();
        window.with(|fake| fake.fail_on_top = true);
        assert!(control.set_pinned(&window, true).is_err());
        assert!(!control.mode().unwrap().pinned);
    }

    #[test]
    fn without_support_the_modes_are_refused() {
        let control = WindowControl::new(false, Some(NORMAL_MIN));
        let window = FakeWindow::new();
        assert!(matches!(
            control.set_pinned(&window, true),
            Err(AppError::InvalidInput(_))
        ));
        assert!(matches!(
            control.enter_mini(&window, DEFAULT_ASPECT),
            Err(AppError::InvalidInput(_))
        ));
        assert!(!control.mode().unwrap().on_top_supported);
    }

    #[test]
    fn the_mini_player_is_small_on_top_and_restores_everything() {
        let control = control();
        let window = FakeWindow::new();
        let before = window.get();

        let mode = control.enter_mini(&window, DEFAULT_ASPECT).unwrap();
        assert!(mode.mini && !mode.pinned);
        let mini = window.get();
        assert!(mini.on_top);
        assert_eq!(mini.min_size, Some(MINI_MIN_SIZE));
        assert_eq!(
            mini_size(&window),
            Size {
                width: 480,
                height: 270
            }
        );
        assert_eq!(mini.rect.x + i32::try_from(mini.rect.width).unwrap(), 1920 - 16);

        let mode = control.exit_mini(&window).unwrap();
        assert!(!mode.mini);
        let after = window.get();
        assert_eq!(after.rect, before.rect);
        assert!(!after.on_top);
        assert_eq!(after.min_size, Some(NORMAL_MIN));
    }

    #[test]
    fn a_maximized_pinned_window_comes_back_maximized_and_pinned() {
        let control = control();
        let window = FakeWindow::new();
        let normal = window.get().rect;
        control.set_pinned(&window, true).unwrap();
        window.maximize().unwrap();

        control.enter_mini(&window, DEFAULT_ASPECT).unwrap();
        assert!(!window.get().maximized);
        control.exit_mini(&window).unwrap();

        let after = window.get();
        assert!(after.maximized && after.on_top);
        window.unmaximize().unwrap();
        assert_eq!(window.get().rect, normal);
    }

    #[test]
    fn pinning_in_the_mini_player_applies_after_it() {
        let control = control();
        let window = FakeWindow::new();
        control.enter_mini(&window, DEFAULT_ASPECT).unwrap();
        control.set_pinned(&window, true).unwrap();
        assert!(window.get().on_top);
        control.exit_mini(&window).unwrap();
        assert!(window.get().on_top);
    }

    #[test]
    fn a_minimized_mini_player_is_restored() {
        let control = control();
        let window = FakeWindow::new();
        let before = window.get().rect;
        control.enter_mini(&window, DEFAULT_ASPECT).unwrap();
        window.with(|fake| fake.minimized = true);
        control.exit_mini(&window).unwrap();
        assert!(!window.get().minimized);
        assert_eq!(window.get().rect, before);
    }

    #[test]
    fn leaving_when_not_in_the_mini_player_does_nothing() {
        let control = control();
        let window = FakeWindow::new();
        let before = window.get().rect;
        assert!(!control.exit_mini(&window).unwrap().mini);
        assert_eq!(window.get().rect, before);
        assert_eq!(window.get().min_size, Some(NORMAL_MIN));
    }

    #[test]
    fn full_screen_ends_first_and_the_window_comes_back_windowed() {
        let control = control();
        let window = FakeWindow::new();
        let normal = window.get().rect;
        window.with(|fake| {
            fake.fullscreen = true;
            fake.rect = SCREEN;
        });

        assert!(control.enter_mini(&window, DEFAULT_ASPECT).unwrap().mini);
        assert!(!window.get().fullscreen);
        control.exit_mini(&window).unwrap();
        assert_eq!(window.get().rect, normal);
        assert!(!window.get().fullscreen);
    }

    #[test]
    fn a_failed_mini_player_puts_the_window_back() {
        let control = control();
        let window = FakeWindow::new();
        let before = window.get().rect;
        window.with(|fake| fake.fail_on_top = true);
        assert!(control.enter_mini(&window, DEFAULT_ASPECT).is_err());
        assert!(!control.mode().unwrap().mini);
        assert_eq!(window.get().rect, before);
        assert_eq!(window.get().min_size, Some(NORMAL_MIN));
    }

    #[test]
    fn restores_on_the_primary_monitor_when_the_other_one_is_gone() {
        let control = control();
        let window = FakeWindow::new();
        let second = Rect {
            x: 1920,
            y: 0,
            width: 1920,
            height: 1040,
        };
        window.with(|fake| {
            fake.monitors = vec![second, SCREEN];
            fake.rect.x = 2100;
        });
        control.enter_mini(&window, DEFAULT_ASPECT).unwrap();
        window.with(|fake| fake.monitors = vec![SCREEN]);
        control.exit_mini(&window).unwrap();
        let rect = window.get().rect;
        assert!(
            rect.x >= 0 && rect.x + i32::try_from(rect.width).unwrap() <= 1920,
            "{rect:?}"
        );
    }

    #[test]
    fn follows_the_next_video_aspect_ratio() {
        let control = control();
        let window = FakeWindow::new();
        control.enter_mini(&window, DEFAULT_ASPECT).unwrap();
        control.set_mini_aspect(&window, 4.0 / 3.0).unwrap();
        assert_eq!(
            mini_size(&window),
            Size {
                width: 480,
                height: 360
            }
        );
        // Outside the mini player, nothing moves.
        control.exit_mini(&window).unwrap();
        let before = window.get().rect;
        control.set_mini_aspect(&window, 1.0).unwrap();
        assert_eq!(window.get().rect, before);
    }

    #[test]
    fn the_apps_own_resizes_are_ignored() {
        let control = control();
        let window = FakeWindow::new();
        assert!(
            !control.note_resize(Size { width: 10, height: 10 }),
            "not in the mini player"
        );
        control.enter_mini(&window, DEFAULT_ASPECT).unwrap();
        assert!(!control.note_resize(mini_size(&window)));
        assert!(control.note_resize(Size {
            width: 700,
            height: 400
        }));
        // While a command holds the state, the main thread skips the resizes it causes.
        let held = control.lock().unwrap();
        assert!(!control.note_resize(Size {
            width: 700,
            height: 400
        }));
        drop(held);
    }

    #[test]
    fn the_width_the_user_gives_the_mini_player_is_kept_for_the_session() {
        let control = control();
        let window = FakeWindow::new();
        control.enter_mini(&window, DEFAULT_ASPECT).unwrap();
        // Moved to a monitor at 200%, then dragged wider by the user.
        control.note_scale(2.0);
        window
            .set_inner_size(Size {
                width: 1280,
                height: 720,
            })
            .unwrap();
        assert_eq!(control.settle_resize(&window).unwrap(), None);
        control.exit_mini(&window).unwrap();

        // Back at 100%, it keeps the same logical width.
        control.enter_mini(&window, DEFAULT_ASPECT).unwrap();
        assert_eq!(
            mini_size(&window),
            Size {
                width: 640,
                height: 360
            }
        );
    }

    #[test]
    fn maximizing_the_mini_player_expands_it() {
        let control = control();
        let window = FakeWindow::new();
        let before = window.get().rect;
        control.enter_mini(&window, DEFAULT_ASPECT).unwrap();
        window.maximize().unwrap();
        let mode = control.settle_resize(&window).unwrap();
        assert_eq!(mode.map(|mode| mode.mini), Some(false));
        let after = window.get();
        assert!(!after.maximized && !after.on_top);
        assert_eq!(after.rect, before);
    }
}
