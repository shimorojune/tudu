//! The note window (chunk 22): a small window for writing without the desk. Like Quick Add it is a non-activating
//! panel, so it takes the keyboard without bringing the desk forward, but it stays when you click into another app.
//! It drags by its bar and resizes from its corner; Pin keeps it above other apps (off to start) and the arrows fill
//! the screen and take it back. Its place and size are kept across launches and brought back onto a screen when
//! displays change.

use std::path::PathBuf;
use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, State, WebviewWindow};

use crate::place::{self, Frame, Screen};
use crate::windows::{self, NOTE};
use crate::App;

/// What the window was last asked to show: a note, or a blank one (linked to a task). Each ask has its own nonce, so
/// the page acts on it once however it hears of it.
#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Ask {
    pub id: Option<String>,
    pub link_to: Option<String>,
    pub nonce: u64,
}

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteState {
    pub pinned: bool,
    pub expanded: bool,
    pub ask: Option<Ask>,
}

#[derive(Default)]
pub struct Notes {
    state: Mutex<NoteState>,
    /// Where it sits while not filling the screen.
    frame: Mutex<Option<Frame>>,
}

impl Notes {
    pub fn state(&self) -> NoteState {
        self.state.lock().map(|s| s.clone()).unwrap_or_default()
    }
    pub fn frame(&self) -> Option<Frame> {
        self.frame.lock().ok().and_then(|f| *f)
    }
}

/// Where its place and size are kept between launches (Tudu Test: the run's own folder).
fn frame_file(app: &AppHandle) -> Option<PathBuf> {
    #[cfg(feature = "control")]
    if let Some(d) = crate::control::data_dir() {
        return Some(d.join("note-window.json"));
    }
    app.path()
        .app_config_dir()
        .ok()
        .map(|d| d.join("note-window.json"))
}

/// The place and size it was left at, from the last launch.
pub fn load(app: &AppHandle) {
    let Some(path) = frame_file(app) else { return };
    let Ok(text) = std::fs::read_to_string(path) else {
        return;
    };
    if let Ok(f) = serde_json::from_str::<Frame>(&text) {
        if let Ok(mut frame) = app.state::<Notes>().frame.lock() {
            *frame = Some(f);
        }
    }
}

fn save(app: &AppHandle) {
    let (Some(path), Some(f)) = (frame_file(app), app.state::<Notes>().frame()) else {
        return;
    };
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    if let Ok(text) = serde_json::to_string(&f) {
        let _ = std::fs::write(path, text);
    }
}

fn frame_of(w: &WebviewWindow) -> Option<Frame> {
    let p = w.outer_position().ok()?;
    let s = w.outer_size().ok()?;
    Some(Frame {
        x: p.x as f64,
        y: p.y as f64,
        width: s.width as f64,
        height: s.height as f64,
    })
}

fn set_frame(w: &WebviewWindow, f: Frame) {
    let _ = w.set_size(PhysicalSize::new(f.width as u32, f.height as u32));
    let _ = w.set_position(PhysicalPosition::new(f.x as i32, f.y as i32));
}

/// It moved or was resized: remember where, unless it is filling the screen (that is not where you put it).
pub fn remember(app: &AppHandle, w: &WebviewWindow) {
    let notes = app.state::<Notes>();
    if notes.state().expanded || !w.is_visible().unwrap_or(false) {
        return;
    }
    let Some(f) = frame_of(w) else { return };
    if let Ok(mut frame) = notes.frame.lock() {
        *frame = Some(f);
    };
}

/// Before it shows: where you left it, kept on a screen; the first time, its own size near the top of the screen the
/// pointer is on. Filling the screen, the screen it is on.
fn place_window(app: &AppHandle, w: &WebviewWindow) {
    let screens = windows::screens(w);
    let notes = app.state::<Notes>();
    if notes.state().expanded {
        if let Some(area) = work_area(w) {
            set_frame(w, place::fill(area));
        }
        return;
    }
    let pointer = app.cursor_position().ok().map(|p| (p.x, p.y));
    let frame = notes
        .frame()
        .or_else(|| place::screen_for(pointer, &screens).map(place::note_default));
    if let Some(f) = frame.and_then(|f| place::keep_on_screen(f, &screens)) {
        set_frame(w, f);
    }
}

/// The work area (the screen without the menu bar and the Dock) of the screen the window is on.
fn work_area(w: &WebviewWindow) -> Option<Screen> {
    let m = w
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| w.primary_monitor().ok().flatten())?;
    let a = m.work_area();
    Some(Screen {
        x: a.position.x as f64,
        y: a.position.y as f64,
        width: a.size.width as f64,
        height: a.size.height as f64,
        scale: m.scale_factor(),
    })
}

/// The window on a note, or on a blank note: over whatever app you are in, the desk left where it is. The menu bar's
/// sheet goes first. Nobody signed in: the desk opens on Sign in instead.
pub fn open(app: &AppHandle, id: Option<String>, link_to: Option<String>) {
    windows::hide_menubar(app);
    let signed_in = app
        .state::<App>()
        .seen
        .lock()
        .map(|s| s.signed_in)
        .unwrap_or(false);
    if !signed_in {
        windows::show_main(app, Some("/sign-in"));
        return;
    }
    let Some(w) = app.get_webview_window(NOTE) else {
        return;
    };
    let state = {
        let notes = app.state::<Notes>();
        let Ok(mut s) = notes.state.lock() else {
            return;
        };
        let nonce = s.ask.as_ref().map(|a| a.nonce).unwrap_or(0) + 1;
        s.ask = Some(Ask { id, link_to, nonce });
        s.clone()
    };
    if !w.is_visible().unwrap_or(false) {
        place_window(app, &w);
    }
    let _ = w.show();
    windows::focus_panel(&w);
    let _ = w.emit_to(NOTE, "note:open", state);
}

/// Close: it hides, keeping its place, its size and its page.
pub fn hide(app: &AppHandle) {
    if let Some(w) = app.get_webview_window(NOTE) {
        remember(app, &w);
        let _ = w.hide();
    }
    save(app);
}

pub fn set_pinned(app: &AppHandle, on: bool) -> bool {
    if let Some(w) = app.get_webview_window(NOTE) {
        let _ = w.set_always_on_top(on);
    }
    if let Ok(mut s) = app.state::<Notes>().state.lock() {
        s.pinned = on;
    }
    on
}

/// Fill the screen, or go back to where it was.
pub fn set_expanded(app: &AppHandle, on: bool) -> bool {
    let Some(w) = app.get_webview_window(NOTE) else {
        return false;
    };
    let notes = app.state::<Notes>();
    if on {
        remember(app, &w);
        if let Ok(mut s) = notes.state.lock() {
            s.expanded = true;
        }
        if let Some(area) = work_area(&w) {
            set_frame(&w, place::fill(area));
        }
    } else {
        if let Ok(mut s) = notes.state.lock() {
            s.expanded = false;
        }
        let screens = windows::screens(&w);
        if let Some(f) = notes
            .frame()
            .and_then(|f| place::keep_on_screen(f, &screens))
        {
            set_frame(&w, f);
        }
    }
    on
}

#[tauri::command]
pub fn open_note(app: AppHandle, id: Option<String>, link_to: Option<String>) {
    open(&app, id, link_to);
}

#[tauri::command]
pub fn note_state(notes: State<'_, Notes>) -> NoteState {
    notes.state()
}

#[tauri::command]
pub fn set_note_pinned(app: AppHandle, on: bool) -> bool {
    set_pinned(&app, on)
}

#[tauri::command]
pub fn set_note_expanded(app: AppHandle, on: bool) -> bool {
    set_expanded(&app, on)
}

/// Open in your Notebook: the desk comes forward on the note (or the Notebook) and the window hides.
#[tauri::command]
pub fn open_in_notebook(app: AppHandle, id: Option<String>) {
    hide(&app);
    let path = match id {
        Some(id) if !id.is_empty() => format!("/notebook/{}", encode(&id)),
        _ => "/notebook".to_string(),
    };
    windows::show_main(&app, Some(&path));
}

#[tauri::command]
pub fn hide_note(app: AppHandle) {
    hide(&app);
}

/// A note's id in a path: letters, digits and `-` as they are, anything else percent-encoded.
fn encode(id: &str) -> String {
    id.bytes()
        .map(|b| match b {
            b'a'..=b'z' | b'A'..=b'Z' | b'0'..=b'9' | b'-' | b'_' => (b as char).to_string(),
            _ => format!("%{b:02X}"),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn c22_d04_open_in_your_notebook_goes_to_the_note_s_page() {
        assert_eq!(encode("c35d0663-b6e4-4024"), "c35d0663-b6e4-4024");
        assert_eq!(encode("a/b c"), "a%2Fb%20c");
    }
}
