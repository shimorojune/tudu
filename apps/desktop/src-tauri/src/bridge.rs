//! What the web page asks of the app: who it is, whether someone is signed in, the dock badge, outside links,
//! saving a file to Downloads, and moving between the windows (the desk, the floating bar and the menu bar's sheet).

use std::path::PathBuf;

use serde::Serialize;
use tauri::{AppHandle, Manager, State};

use crate::windows;
use crate::{App, SUMMON_LABEL};

/// What the app has been asked to do that leaves no trace in a window, kept for the control channel.
#[derive(Default, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Seen {
    pub signed_in: bool,
    pub badge: Option<i64>,
    /// Outside links handed to the default browser, in order.
    pub opened: Vec<String>,
    /// Files saved to Downloads, as full paths.
    pub saved: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    track: crate::Track,
    name: &'static str,
    version: String,
    shortcut: &'static str,
}

#[tauri::command]
pub fn app_info(app: AppHandle, state: State<'_, App>) -> AppInfo {
    AppInfo {
        track: state.track,
        name: state.track.name(),
        version: app.package_info().version.to_string(),
        shortcut: SUMMON_LABEL,
    }
}

/// The desk tells the app when someone signs in or out, so the summon knows which window to open.
#[tauri::command]
pub fn set_signed_in(state: State<'_, App>, signed_in: bool) {
    if let Ok(mut s) = state.seen.lock() {
        s.signed_in = signed_in;
    }
}

/// The Inbox count across your spaces on the dock icon; zero clears it.
#[tauri::command]
pub fn set_badge(app: AppHandle, state: State<'_, App>, count: i64) -> Result<(), String> {
    let value = (count > 0).then_some(count);
    if let Ok(mut s) = state.seen.lock() {
        s.badge = value;
    }
    let w = app.get_webview_window(windows::MAIN).ok_or("no window")?;
    w.set_badge_count(value).map_err(|e| e.to_string())
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
}
