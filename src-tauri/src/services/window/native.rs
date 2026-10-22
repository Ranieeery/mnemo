//! The window as the mini player sees it: the [`NativeWindow`] trait (faked in tests) and its Tauri implementation.

use tauri::{Monitor, PhysicalPosition, PhysicalSize, Window};

use crate::domain::window::{LogicalSize, Rect, Size};
use crate::error::{AppError, AppResult};

/// What the mini player needs from the window, so its rules can be tested without one.
pub trait NativeWindow {
    /// Position and size of the window, frame included.
    fn outer_rect(&self) -> AppResult<Rect>;
    /// Size of the window's content (the webview).
    fn inner_size(&self) -> AppResult<Size>;
    fn is_maximized(&self) -> AppResult<bool>;
    fn is_minimized(&self) -> AppResult<bool>;
    fn is_fullscreen(&self) -> AppResult<bool>;
    fn exit_fullscreen(&self) -> AppResult<()>;
    fn maximize(&self) -> AppResult<()>;
    fn unmaximize(&self) -> AppResult<()>;
    fn unminimize(&self) -> AppResult<()>;
    fn set_always_on_top(&self, on_top: bool) -> AppResult<()>;
    fn set_min_size(&self, size: Option<LogicalSize>) -> AppResult<()>;
    fn set_inner_size(&self, size: Size) -> AppResult<()>;
    fn set_position(&self, x: i32, y: i32) -> AppResult<()>;
    /// Work area and scale factor of the monitor the window is on, or of the primary one when that is unknown.
    fn work_area(&self) -> AppResult<(Rect, f64)>;
    /// Work areas of every monitor, and the primary monitor's.
    fn work_areas(&self) -> AppResult<(Vec<Rect>, Rect)>;
}

fn work_area_of(monitor: &Monitor) -> Rect {
    let area = monitor.work_area();
    Rect {
        x: area.position.x,
        y: area.position.y,
        width: area.size.width,
        height: area.size.height,
    }
}

fn no_monitor() -> AppError {
    AppError::NotFound("a monitor to show the window on".into())
}

impl NativeWindow for Window {
    fn outer_rect(&self) -> AppResult<Rect> {
        let position = self.outer_position()?;
        let size = self.outer_size()?;
        Ok(Rect {
            x: position.x,
            y: position.y,
            width: size.width,
            height: size.height,
        })
    }

    fn inner_size(&self) -> AppResult<Size> {
        let size = Window::inner_size(self)?;
        Ok(Size {
            width: size.width,
            height: size.height,
        })
    }

    fn is_maximized(&self) -> AppResult<bool> {
        Ok(Window::is_maximized(self)?)
    }

    fn is_minimized(&self) -> AppResult<bool> {
        Ok(Window::is_minimized(self)?)
    }

    fn is_fullscreen(&self) -> AppResult<bool> {
        Ok(Window::is_fullscreen(self)?)
    }

    fn exit_fullscreen(&self) -> AppResult<()> {
        Ok(self.set_fullscreen(false)?)
    }

    fn maximize(&self) -> AppResult<()> {
        Ok(Window::maximize(self)?)
    }

    fn unmaximize(&self) -> AppResult<()> {
        Ok(Window::unmaximize(self)?)
    }

    fn unminimize(&self) -> AppResult<()> {
        Ok(Window::unminimize(self)?)
    }

    fn set_always_on_top(&self, on_top: bool) -> AppResult<()> {
        Ok(Window::set_always_on_top(self, on_top)?)
    }

    fn set_min_size(&self, size: Option<LogicalSize>) -> AppResult<()> {
        Ok(Window::set_min_size(
            self,
            size.map(|size| tauri::LogicalSize::new(size.width, size.height)),
        )?)
    }

    fn set_inner_size(&self, size: Size) -> AppResult<()> {
        Ok(self.set_size(PhysicalSize::new(size.width, size.height))?)
    }

    fn set_position(&self, x: i32, y: i32) -> AppResult<()> {
        Ok(Window::set_position(self, PhysicalPosition::new(x, y))?)
    }

    fn work_area(&self) -> AppResult<(Rect, f64)> {
        let monitor = match self.current_monitor()? {
            Some(monitor) => monitor,
            None => self.primary_monitor()?.ok_or_else(no_monitor)?,
        };
        Ok((work_area_of(&monitor), monitor.scale_factor()))
    }

    fn work_areas(&self) -> AppResult<(Vec<Rect>, Rect)> {
        let areas: Vec<Rect> = self.available_monitors()?.iter().map(work_area_of).collect();
        let primary = match self.primary_monitor()? {
            Some(monitor) => work_area_of(&monitor),
            None => *areas.first().ok_or_else(no_monitor)?,
        };
        Ok((areas, primary))
    }
}
