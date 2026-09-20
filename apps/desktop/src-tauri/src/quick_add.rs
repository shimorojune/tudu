use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, State, WebviewWindow};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

pub const DEFAULT_QUICK_ADD_ACCELERATOR: &str = "CommandOrControl+Shift+N";

pub struct QuickAddShortcutState(pub Mutex<String>);

/// When Quick Add is open: whether the main window was visible before it opened.
pub struct QuickAddSession(pub Mutex<Option<bool>>);

/// Last user-dragged position for the Quick Add window (current app session only).
pub struct QuickAddWindowState(pub Mutex<Option<LogicalPosition<f64>>>);

pub struct QuickAddToggleGuard(pub Mutex<Option<Instant>>);

const TOGGLE_DEBOUNCE: Duration = Duration::from_millis(320);

pub const QUICK_ADD_WINDOW_WIDTH: f64 = 590.0;
pub const QUICK_ADD_WINDOW_HEIGHT: f64 = 320.0;

fn bottom_center_position(
    window: &WebviewWindow,
    width: f64,
    height: f64,
) -> Option<LogicalPosition<f64>> {
    let Ok(Some(monitor)) = window.current_monitor() else {
        return None;
    };
    let scale = monitor.scale_factor();
    let screen = monitor.size();
    let screen_w = screen.width as f64 / scale;
    let screen_h = screen.height as f64 / scale;
    let x = (screen_w - width) / 2.0;
    let y = screen_h - height - 72.0;
    Some(LogicalPosition::new(x, y.max(24.0)))
}

fn apply_quick_add_size(window: &WebviewWindow, width: f64, height: f64) {
    let _ = window.set_size(LogicalSize::new(width, height));
}

fn show_quick_add_window(
    window: &WebviewWindow,
    window_state: &QuickAddWindowState,
) {
    let saved = window_state
        .0
        .lock()
        .ok()
        .and_then(|guard| *guard);

    apply_quick_add_size(window, QUICK_ADD_WINDOW_WIDTH, QUICK_ADD_WINDOW_HEIGHT);

    if let Some(position) = saved {
        let _ = window.set_position(position);
    } else if let Some(position) =
        bottom_center_position(window, QUICK_ADD_WINDOW_WIDTH, QUICK_ADD_WINDOW_HEIGHT)
    {
        let _ = window.set_position(position);
    }

    let _ = window.set_shadow(false);
    let _ = window.show();
    let _ = window.set_focus();
    let _ = window.emit("quick-add:shown", ());
}

#[tauri::command]
pub fn save_quick_add_window_position(
    _app: AppHandle,
    state: State<'_, QuickAddWindowState>,
    x: f64,
    y: f64,
) -> Result<(), String> {
    if let Ok(mut guard) = state.0.lock() {
        *guard = Some(LogicalPosition::new(x, y));
    }
    Ok(())
}

#[tauri::command]
pub fn resize_quick_add_window(
    app: AppHandle,
    width: f64,
    height: f64,
) -> Result<(), String> {
    let window = app
        .get_webview_window("quick-add")
        .ok_or("Quick Add window is missing")?;
    apply_quick_add_size(&window, width, height);
    Ok(())
}

/// Repositions and resizes (used when resetting to default placement).
#[tauri::command]
pub fn place_quick_add_window_command(
    app: AppHandle,
    state: State<'_, QuickAddWindowState>,
    width: f64,
    height: f64,
    reset_position: Option<bool>,
) -> Result<(), String> {
    let window = app
        .get_webview_window("quick-add")
        .ok_or("Quick Add window is missing")?;

    if reset_position.unwrap_or(false) {
        if let Ok(mut guard) = state.0.lock() {
            *guard = None;
        }
    }

    apply_quick_add_size(&window, width, height);

    let saved = state
        .0
        .lock()
        .ok()
        .and_then(|guard| *guard);

    if let Some(position) = saved {
        let _ = window.set_position(position);
    } else if let Some(position) = bottom_center_position(&window, width, height) {
        let _ = window.set_position(position);
    }

    Ok(())
}

#[tauri::command]
pub fn present_quick_add_window(app: AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("quick-add")
        .ok_or("Quick Add window is missing")?;
    let _ = window.show();
    let _ = window.set_focus();
    Ok(())
}

fn main_was_visible(app: &AppHandle) -> bool {
    app.get_webview_window("main")
        .map(|window| window.is_visible().unwrap_or(false))
        .unwrap_or(false)
}

fn finish_hide_quick_add(app: &AppHandle, session: &QuickAddSession, _after_save: bool) {
    let main_was_visible = session.0.lock().ok().and_then(|mut guard| guard.take());

    if let Some(window) = app.get_webview_window("quick-add") {
        let _ = window.hide();
    }

    match main_was_visible {
        Some(true) => {}
        Some(false) => {
            if let Some(main) = app.get_webview_window("main") {
                let _ = main.hide();
            }
            #[cfg(target_os = "macos")]
            {
                let _ = app.hide();
            }
        }
        None => {}
    }
}

/// Same hide path as the window close button when session state is available.
pub fn dismiss_quick_add(app: &AppHandle) {
    if let Some(session) = app.try_state::<QuickAddSession>() {
        finish_hide_quick_add(app, session.inner(), false);
        return;
    }
    if let Some(window) = app.get_webview_window("quick-add") {
        let _ = window.hide();
    }
}

pub fn toggle_quick_add(app: &AppHandle) {
    if let Some(guard) = app.try_state::<QuickAddToggleGuard>() {
        let now = Instant::now();
        if let Ok(mut last) = guard.0.lock() {
            if let Some(previous) = *last {
                if now.duration_since(previous) < TOGGLE_DEBOUNCE {
                    return;
                }
            }
            *last = Some(now);
        }
    }

    let Some(window) = app.get_webview_window("quick-add") else {
        return;
    };

    let visible = window.is_visible().unwrap_or(false);
    if visible {
        let _ = window.emit("quick-add:hide-request", ());
        return;
    }

    let main_visible = main_was_visible(app);

    if let Some(session) = app.try_state::<QuickAddSession>() {
        if let Ok(mut guard) = session.0.lock() {
            *guard = Some(main_visible);
        }
    }

    if !main_visible {
        if let Some(main) = app.get_webview_window("main") {
            let _ = main.hide();
        }
    }

    if let Some(state) = app.try_state::<QuickAddWindowState>() {
        show_quick_add_window(&window, state.inner());
    } else {
        apply_quick_add_size(&window, QUICK_ADD_WINDOW_WIDTH, QUICK_ADD_WINDOW_HEIGHT);
        if let Some(position) =
            bottom_center_position(&window, QUICK_ADD_WINDOW_WIDTH, QUICK_ADD_WINDOW_HEIGHT)
        {
            let _ = window.set_position(position);
        }
        let _ = window.set_shadow(false);
        let _ = window.show();
        let _ = window.set_focus();
        let _ = window.emit("quick-add:shown", ());
    }
}

pub fn register_quick_add_shortcut(
    app: &AppHandle,
    state: &QuickAddShortcutState,
    accelerator: String,
) -> Result<(), String> {
    let accelerator = accelerator.trim().to_string();
    if accelerator.is_empty() {
        return Err("Shortcut cannot be empty".to_string());
    }

    let shortcut: Shortcut = accelerator
        .parse()
        .map_err(|error| format!("Invalid shortcut ({accelerator}): {error}"))?;

    app.global_shortcut()
        .unregister_all()
        .map_err(|error| error.to_string())?;

    let app_handle = app.clone();
    app.global_shortcut()
        .on_shortcut(shortcut, move |_app, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                toggle_quick_add(&app_handle);
            }
        })
        .map_err(|error| error.to_string())?;

    if let Ok(mut current) = state.0.lock() {
        *current = accelerator.clone();
    }

    Ok(())
}

#[tauri::command]
pub fn register_quick_add_shortcut_command(
    app: AppHandle,
    state: State<'_, QuickAddShortcutState>,
    accelerator: String,
) -> Result<(), String> {
    register_quick_add_shortcut(&app, state.inner(), accelerator)
}

#[tauri::command]
pub fn pause_quick_add_shortcuts_command(app: AppHandle) -> Result<(), String> {
    app.global_shortcut()
        .unregister_all()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn hide_quick_add_window(
    app: AppHandle,
    session: State<'_, QuickAddSession>,
    after_save: Option<bool>,
) -> Result<(), String> {
    finish_hide_quick_add(&app, session.inner(), after_save.unwrap_or(false));
    Ok(())
}

#[tauri::command]
pub fn show_main_window_command(
    app: AppHandle,
    session: State<'_, QuickAddSession>,
) -> Result<(), String> {
    if let Ok(mut guard) = session.0.lock() {
        guard.take();
    }
    if let Some(window) = app.get_webview_window("quick-add") {
        let _ = window.hide();
    }
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        window.show().map_err(|error| error.to_string())?;
        window.set_focus().map_err(|error| error.to_string())?;
        let _ = app.emit("quick-add:open-sign-in", ());
    }
    Ok(())
}
