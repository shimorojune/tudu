//! What the web page asks of the app: who it is, whether someone is signed in, the dock badge, outside links,
//! saving a file to Downloads, and moving between the windows (the desk, the floating bar and the menu bar's sheet).

use std::path::PathBuf;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_global_shortcut::GlobalShortcutExt;

use crate::windows;
use crate::{App, NOTES, NOTES_LABEL, SUMMON_LABEL};

/// What the app has been asked to do that leaves no trace in a window, kept for the control channel.
#[derive(Default, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Seen {
    pub signed_in: bool,
    /// The Inbox count the page last gave.
    pub badge: Option<i64>,
    /// Today's tasks left and planned, as the page last gave them (none: not known yet, or signed out).
    pub today: Option<crate::background::Today>,
    /// Outside links handed to the default browser, in order.
    pub opened: Vec<String>,
    /// Files saved to Downloads, as full paths.
    pub saved: Vec<String>,
    /// What the floating bar opens on next (Make a task in the note window): taken once, then gone.
    pub seed: Option<serde_json::Value>,
}

/// Keep a seed for the floating bar; a newer one replaces it.
pub fn keep_seed(seen: &mut Seen, seed: serde_json::Value) {
    seen.seed = Some(seed);
}

/// The seed, once: the next summon opens a plain Quick Add.
pub fn take_seed(seen: &mut Seen) -> Option<serde_json::Value> {
    seen.seed.take()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    track: crate::Track,
    name: &'static str,
    version: String,
    shortcut: &'static str,
    /// The note window's shortcut, only while it is registered (another app may hold it).
    #[serde(skip_serializing_if = "Option::is_none")]
    note_shortcut: Option<&'static str>,
}

#[tauri::command]
pub fn app_info(app: AppHandle, state: State<'_, App>) -> AppInfo {
    AppInfo {
        track: state.track,
        name: state.track.name(),
        version: app.package_info().version.to_string(),
        shortcut: SUMMON_LABEL,
        note_shortcut: app
            .global_shortcut()
            .is_registered(NOTES)
            .then_some(NOTES_LABEL),
    }
}

/// The desk tells the app when someone signs in or out, so the summon knows which window to open.
#[tauri::command]
pub fn set_signed_in(state: State<'_, App>, signed_in: bool) {
    if let Ok(mut s) = state.seen.lock() {
        s.signed_in = signed_in;
    }
}

/// The Inbox count across your spaces: the Dock icon's badge while there is one, and the tick's dot; zero clears
/// both.
#[tauri::command]
pub fn set_badge(app: AppHandle, state: State<'_, App>, count: i64) {
    if let Ok(mut s) = state.seen.lock() {
        s.badge = (count > 0).then_some(count);
    }
    crate::background::apply(&app);
}

/// Today's tasks across your spaces, left and planned: the number beside the tick. None clears it (signed out).
#[tauri::command]
pub fn set_tick(app: AppHandle, state: State<'_, App>, left: Option<i64>, total: Option<i64>) {
    if let Ok(mut s) = state.seen.lock() {
        s.today = left
            .zip(total)
            .map(|(left, total)| crate::background::Today { left, total });
    }
    crate::background::apply(&app);
}

/// An outside link (Open in Jira, an invite's join link): the default browser opens it.
pub fn open_outside(app: &AppHandle, url: &str) {
    if let Ok(mut s) = app.state::<App>().seen.lock() {
        s.opened.push(url.to_string());
    }
    // Tudu Test records the link and stops there, so the tests never open a browser.
    if cfg!(feature = "control") {
        return;
    }
    use tauri_plugin_opener::OpenerExt;
    if let Err(e) = app.opener().open_url(url, None::<&str>) {
        eprintln!("tudu: could not open {url}: {e}");
    }
}

#[tauri::command]
pub fn open_external(app: AppHandle, url: String) -> Result<(), String> {
    let parsed = tauri::Url::parse(&url).map_err(|e| e.to_string())?;
    if !matches!(parsed.scheme(), "http" | "https" | "mailto") {
        return Err("Only web and mail links open outside.".into());
    }
    open_outside(&app, &url);
    Ok(())
}

/// A file name that is safe to write into a folder: no folders of its own, nothing hidden.
pub fn safe_name(name: &str) -> String {
    let base = name.rsplit(['/', '\\']).next().unwrap_or("");
    let cleaned: String = base
        .chars()
        .filter(|c| !c.is_control() && *c != ':')
        .collect();
    let cleaned = cleaned.trim().trim_start_matches('.').to_string();
    if cleaned.is_empty() {
        "Attachment".into()
    } else {
        cleaned
    }
}

/// `name`, or `name (2)`, `name (3)`… when Downloads already has one.
pub fn free_path(dir: &std::path::Path, name: &str) -> PathBuf {
    let first = dir.join(name);
    if !first.exists() {
        return first;
    }
    let (stem, ext) = match name.rfind('.') {
        Some(i) if i > 0 => (&name[..i], &name[i..]),
        _ => (name, ""),
    };
    (2..)
        .map(|n| dir.join(format!("{stem} ({n}){ext}")))
        .find(|p| !p.exists())
        .expect("a free name")
}

fn downloads(app: &AppHandle) -> Result<PathBuf, String> {
    #[cfg(feature = "control")]
    if let Some(d) = crate::control::downloads() {
        return Ok(d);
    }
    app.path().download_dir().map_err(|e| e.to_string())
}

/// An attachment, fetched by the page with its session, written to Downloads. The body is the file; the name comes
/// in the `x-name` header.
#[tauri::command]
pub fn save_download(app: AppHandle, request: tauri::ipc::Request<'_>) -> Result<String, String> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("The file did not arrive.".into());
    };
    let name = request
        .headers()
        .get("x-name")
        .and_then(|v| v.to_str().ok())
        .map(|v| percent_decode(v))
        .unwrap_or_default();
    let dir = downloads(&app)?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = free_path(&dir, &safe_name(&name));
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    let shown = path.to_string_lossy().to_string();
    if let Ok(mut s) = app.state::<App>().seen.lock() {
        s.saved.push(shown.clone());
    }
    Ok(shown)
}

fn percent_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            if let Ok(v) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                out.push(v);
                i += 3;
                continue;
            }
        }
        out.push(b[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// From the floating window or the menu bar's sheet: the desk, on a page (Sign in when nobody is signed in, a task
/// from the sheet, or `feedback` for the Send feedback form).
#[tauri::command]
pub fn show_main(app: AppHandle, path: Option<String>) {
    windows::hide_floating(&app);
    windows::show_main(&app, path.as_deref());
}

#[tauri::command]
pub fn hide_floating(app: AppHandle) {
    windows::hide_floating(&app);
}

/// The sheet's New task: the sheet goes and the floating bar comes up, as the summon brings it.
#[tauri::command]
pub fn summon(app: AppHandle) {
    windows::hide_menubar(&app);
    windows::summon(&app, false);
}

/// Make a task in the note window: the floating bar comes up over every app, filled in with these words and the
/// note it links back to. The note window stays where it is and the desk never comes forward.
#[tauri::command]
pub fn summon_with(app: AppHandle, state: State<'_, App>, seed: serde_json::Value) {
    if let Ok(mut s) = state.seen.lock() {
        keep_seed(&mut s, seed);
    }
    let up = app
        .get_webview_window(windows::FLOATING)
        .and_then(|w| w.is_visible().ok())
        .unwrap_or(false);
    windows::summon(&app, false);
    // Already up, the summon only focuses it: say it again so it takes the new words.
    if up {
        let _ = app.emit_to(windows::FLOATING, "floating:shown", ());
    }
}

/// The floating page, as it comes up: the seed waiting for it, if any (taken, so it is used once).
#[tauri::command]
pub fn quick_add_seed(state: State<'_, App>) -> Option<serde_json::Value> {
    state.seen.lock().ok().and_then(|mut s| take_seed(&mut s))
}

/// Esc in the sheet, or a click on its clear edge.
#[tauri::command]
pub fn hide_menubar(app: AppHandle) {
    windows::hide_menubar(&app);
}

/// The sheet's ⋯ › Quit Tudu: there is no other menu to quit from.
#[tauri::command]
pub fn quit(app: AppHandle) {
    app.exit(0);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn c11_u08_saved_files_keep_their_name_and_never_overwrite() {
        assert_eq!(safe_name("../../etc/passwd"), "passwd");
        assert_eq!(safe_name(".hidden"), "hidden");
        assert_eq!(safe_name(""), "Attachment");
        assert_eq!(safe_name("Q3 plan.pdf"), "Q3 plan.pdf");
        let dir = std::env::temp_dir().join(format!("tudu-free-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        assert_eq!(free_path(&dir, "a.txt"), dir.join("a.txt"));
        std::fs::write(dir.join("a.txt"), "1").unwrap();
        assert_eq!(free_path(&dir, "a.txt"), dir.join("a (2).txt"));
        std::fs::write(dir.join("a (2).txt"), "1").unwrap();
        assert_eq!(free_path(&dir, "a.txt"), dir.join("a (3).txt"));
        std::fs::remove_dir_all(&dir).unwrap();
        assert_eq!(percent_decode("Q3%20plan.pdf"), "Q3 plan.pdf");
    }

    #[test]
    fn c22_d07_the_floating_bar_takes_its_seed_once() {
        let mut seen = Seen::default();
        assert_eq!(take_seed(&mut seen), None);
        keep_seed(&mut seen, serde_json::json!({ "title": "Call the venue" }));
        keep_seed(&mut seen, serde_json::json!({ "title": "Ask Meera" }));
        assert_eq!(
            take_seed(&mut seen),
            Some(serde_json::json!({ "title": "Ask Meera" }))
        );
        assert_eq!(take_seed(&mut seen), None);
    }
}
