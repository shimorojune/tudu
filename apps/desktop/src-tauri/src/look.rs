//! The look: the theme picked in Settings › Appearance and Less motion. The page tells the app whenever either
//! changes; the app keeps them in This Mac's file and builds every window with them, so the first frame of a launch,
//! the loader and the window's own controls (the traffic lights) are already in Tudu's theme, not macOS's.

use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::window::Color;
use tauri::{AppHandle, Manager, State, Theme};

use crate::{background, windows};

/// Settings › Appearance, as the page has it. Anything unreadable is System.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ThemeChoice {
    Light,
    Dark,
    #[default]
    #[serde(other)]
    System,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Look {
    #[serde(default)]
    pub theme: ThemeChoice,
    #[serde(default)]
    pub less_motion: bool,
}

/// The Paper theme's page background (`--background`), which the desk shows before its page paints.
pub const LIGHT_BACKGROUND: Color = Color(0xee, 0xec, 0xe6, 0xff);
pub const DARK_BACKGROUND: Color = Color(0x11, 0x12, 0x11, 0xff);

/// What macOS is told: a fixed appearance for Light and Dark, none for System so it keeps following macOS live.
pub fn native_theme(theme: ThemeChoice) -> Option<Theme> {
    match theme {
        ThemeChoice::Light => Some(Theme::Light),
        ThemeChoice::Dark => Some(Theme::Dark),
        ThemeChoice::System => None,
    }
}

/// The desk's background for a choice; System takes what macOS shows now.
pub fn desk_background(theme: ThemeChoice, system: Theme) -> Color {
    let dark = match theme {
        ThemeChoice::Light => false,
        ThemeChoice::Dark => true,
        ThemeChoice::System => system == Theme::Dark,
    };
    if dark {
        DARK_BACKGROUND
    } else {
        LIGHT_BACKGROUND
    }
}

/// What macOS shows now, read before any window exists (the desk is built with its background).
#[cfg(target_os = "macos")]
pub fn system_theme() -> Theme {
    use objc2_foundation::{NSString, NSUserDefaults};
    let style = NSUserDefaults::standardUserDefaults()
        .stringForKey(&NSString::from_str("AppleInterfaceStyle"))
        .map(|s| s.to_string());
    if style.as_deref() == Some("Dark") {
        Theme::Dark
    } else {
        Theme::Light
    }
}

#[cfg(not(target_os = "macos"))]
pub fn system_theme() -> Theme {
    Theme::Light
}

pub fn hex(c: Color) -> String {
    format!("#{:02x}{:02x}{:02x}", c.0, c.1, c.2)
}

/// The look as the app holds it, and when this launch began (for the pages' launch mark).
pub struct Looks {
    pub look: Mutex<Look>,
    pub launched_at: u64,
    /// The desk's background as last set, for the control channel.
    pub background: Mutex<Option<Color>>,
}

impl Looks {
    pub fn start(app: &AppHandle) -> Looks {
        Looks {
            look: Mutex::new(background::load_look(app)),
            launched_at: now_ms(),
            background: Mutex::new(None),
        }
    }
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

pub fn current(app: &AppHandle) -> Look {
    app.state::<Looks>()
        .look
        .lock()
        .map(|l| *l)
        .unwrap_or_default()
}

/// What every page of every window learns before it runs: the look and when the launch began.
pub fn init_script(look: Look, launched_at: u64) -> String {
    let v = serde_json::json!({
        "theme": look.theme,
        "lessMotion": look.less_motion,
        "launchedAt": launched_at,
    });
    format!("window.__TUDU_LOOK__ = {v};")
}

/// A new look to keep: whether it differs from the one held (so the page can send it on every load for nothing).
pub fn changed(held: Look, next: Look) -> bool {
    held != next
}

/// The page's Settings › Appearance and Less motion: kept on this Mac and applied to every window at once.
#[tauri::command]
pub fn set_appearance(app: AppHandle, state: State<'_, Looks>, theme: ThemeChoice, less_motion: bool) {
    let next = Look { theme, less_motion };
    {
        let Ok(mut held) = state.look.lock() else {
            return;
        };
        if !changed(*held, next) {
            return;
        }
        *held = next;
    }
    background::save_look(&app, next);
    apply(&app, next);
}

/// Every window takes the theme; the desk (the one opaque window) its background too.
pub fn apply(app: &AppHandle, look: Look) {
    for label in [windows::MAIN, windows::FLOATING, windows::MENUBAR, windows::NOTE] {
        if let Some(w) = app.get_webview_window(label) {
            let _ = w.set_theme(native_theme(look.theme));
        }
    }
    repaint_desk(app, look);
}

/// The desk's background for the look, System read from macOS now (also when macOS changes while on System).
pub fn repaint_desk(app: &AppHandle, look: Look) {
    let Some(w) = app.get_webview_window(windows::MAIN) else {
        return;
    };
    let bg = desk_background(look.theme, w.theme().unwrap_or(Theme::Light));
    let _ = w.set_background_color(Some(bg));
    if let Ok(mut b) = app.state::<Looks>().background.lock() {
        *b = Some(bg);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn c11_u18_the_theme_maps_to_macos_and_the_desk_background() {
        assert_eq!(native_theme(ThemeChoice::Light), Some(Theme::Light));
        assert_eq!(native_theme(ThemeChoice::Dark), Some(Theme::Dark));
        assert_eq!(native_theme(ThemeChoice::System), None);

        assert_eq!(hex(desk_background(ThemeChoice::Light, Theme::Dark)), "#eeece6");
        assert_eq!(hex(desk_background(ThemeChoice::Dark, Theme::Light)), "#111211");
        assert_eq!(hex(desk_background(ThemeChoice::System, Theme::Dark)), "#111211");
        assert_eq!(hex(desk_background(ThemeChoice::System, Theme::Light)), "#eeece6");

        let light = Look {
            theme: ThemeChoice::Light,
            less_motion: false,
        };
        assert!(!changed(light, light));
        assert!(changed(
            light,
            Look {
                less_motion: true,
                ..light
            }
        ));
        assert!(changed(
            light,
            Look {
                theme: ThemeChoice::System,
                ..light
            }
        ));
    }

    #[test]
    fn c11_u18_pages_learn_the_look_and_the_launch() {
        let s = init_script(
            Look {
                theme: ThemeChoice::Dark,
                less_motion: true,
            },
            1_700_000_000_000,
        );
        let json = s
            .strip_prefix("window.__TUDU_LOOK__ = ")
            .and_then(|r| r.strip_suffix(';'))
            .expect("one assignment");
        let v: serde_json::Value = serde_json::from_str(json).unwrap();
        assert_eq!(
            v,
            serde_json::json!({ "theme": "dark", "lessMotion": true, "launchedAt": 1_700_000_000_000u64 })
        );
    }
}
