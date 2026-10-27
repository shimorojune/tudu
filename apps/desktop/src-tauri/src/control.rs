//! Tudu Test's control channel (the `control` feature; never in Tudu or Tudu Staging).
//!
//! A small HTTP server on 127.0.0.1:$TUDU_TEST_PORT that the desktop tests drive:
//! - `GET /state`: the app's state: track and version, each window (visibility, focus, place, size, always on top,
//!   its page), the tray's tooltip (it has no menu: a click opens the menu bar's sheet), the summon and whether it is registered, the dock badge as the Dock
//!   shows it, the updater's last check, download and error, every outside link or file the app was handed, and the
//!   background (chunk 16): the activation policy, the Dock choice, the count beside the tick, the login item, the
//!   App Nap opt-out and each webview's inactive scheduling policy; and the tick's place as macOS keeps it (its
//!   autosave name and saved position) and whether it is hidden; and the last blur, click or app coming forward that
//!   could put the sheet away, with whether it did (`outside`).
//! - `POST /act {"do": …}`: what a person does outside the page: `summon`, `notes-shortcut` (⌥⌘N), `tray` (a click on the tick, with
//!   `button`: left or right), `reopen` (the dock icon), `close` (with `window`), `frame` (a window dragged and
//!   resized: `window`, `x`, `y`, `width`, `height` in points), `outside-click` (a click in another
//!   app), `check-update` (`auto`: only past the floor, as focus would), `wake`, `age-check` (with `minutes`), `quit`,
//!   `tick` (with `hidden`: true or false says macOS hides or shows the tick, null hands the answer back to macOS).
//! - `POST /eval {"window", "script"}`: runs the script (an async function body) in that window's WKWebView and
//!   answers its result, so the tests drive the real page.
//!
//! The rest of the test set-up comes from the environment the harness launches the app with: TUDU_TEST_DATA (this
//! run's folder: the webview's own data store is derived from it, so every folder starts clean), TUDU_TEST_WEB
//! (the local web app the windows open), TUDU_TEST_API (the API, for the update feed) and TUDU_TEST_AT_LOGIN=1 (a
//! launch as the login item would make it). The updater's public key
//! is a build input (the run's throwaway key).

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc::{channel, Sender};
use std::sync::Mutex;
use std::time::Duration;

use serde_json::{json, Value};
use tauri::{AppHandle, Manager, State, WebviewWindow, WebviewWindowBuilder};
use tauri_plugin_global_shortcut::GlobalShortcutExt;

use crate::{background, updates, windows, App, NOTES, SUMMON};

#[derive(Default)]
pub struct Control {
    next: AtomicU64,
    pending: Mutex<HashMap<u64, Sender<(bool, String)>>>,
}

fn env(name: &str) -> Option<String> {
    std::env::var(name).ok().filter(|v| !v.is_empty())
}

pub fn data_dir() -> Option<PathBuf> {
    env("TUDU_TEST_DATA").map(PathBuf::from)
}

/// Downloads land in the run's own folder.
pub fn downloads() -> Option<PathBuf> {
    data_dir().map(|d| d.join("Downloads"))
}

/// A webview data store per data folder: the same folder keeps you signed in across launches, a new one starts
/// clean.
fn store_id(dir: &std::path::Path) -> [u8; 16] {
    use std::hash::{Hash, Hasher};
    let mut out = [0u8; 16];
    for (i, salt) in [0x7475_6475u64, 0x7465_7374u64].into_iter().enumerate() {
        let mut h = std::collections::hash_map::DefaultHasher::new();
        salt.hash(&mut h);
        dir.hash(&mut h);
        out[i * 8..i * 8 + 8].copy_from_slice(&h.finish().to_be_bytes());
    }
    // An RFC 4122 v4 shape, which WebKit expects of a data store identifier.
    out[6] = (out[6] & 0x0f) | 0x40;
    out[8] = (out[8] & 0x3f) | 0x80;
    out
}

pub fn prepare<'a>(
    b: WebviewWindowBuilder<'a, tauri::Wry, AppHandle>,
) -> WebviewWindowBuilder<'a, tauri::Wry, AppHandle> {
    let mut b = b;
    if let Some(dir) = data_dir() {
        b = b.data_store_identifier(store_id(&dir));
    }
    b
}

/// The harness's local web app.
pub fn web() -> Option<tauri::Url> {
    env("TUDU_TEST_WEB").and_then(|u| tauri::Url::parse(&u).ok())
}

/// The test feed: the local API (its port changes from run to run).
pub fn feed(
    b: tauri_plugin_updater::UpdaterBuilder,
) -> Result<tauri_plugin_updater::UpdaterBuilder, String> {
    let mut b = b;
    if let Some(api) = env("TUDU_TEST_API") {
        let url = tauri::Url::parse(&format!(
            "{}/updates/latest.json",
            api.trim_end_matches('/')
        ))
        .map_err(|e| e.to_string())?;
        b = b.endpoints(vec![url]).map_err(|e| e.to_string())?;
    }
    Ok(b)
}

#[tauri::command]
pub fn control_reply(control: State<'_, Control>, id: u64, ok: bool, value: String) {
    if let Some(tx) = control.pending.lock().ok().and_then(|mut p| p.remove(&id)) {
        let _ = tx.send((ok, value));
    }
}

pub fn start(app: &AppHandle) {
    let Some(port) = env("TUDU_TEST_PORT") else {
        eprintln!("tudu: TUDU_TEST_PORT is not set; the control channel stays closed");
        return;
    };
    let app = app.clone();
    std::thread::spawn(move || {
        // After Restart to update the old process may hold the port for a moment.
        let mut listener = None;
        for _ in 0..100 {
            match TcpListener::bind(format!("127.0.0.1:{port}")) {
                Ok(l) => {
                    listener = Some(l);
                    break;
                }
                Err(_) => std::thread::sleep(Duration::from_millis(100)),
            }
        }
        let Some(listener) = listener else {
            eprintln!("tudu: the control port {port} is taken");
            return;
        };
        if let Some(dir) = data_dir() {
            let _ = std::fs::create_dir_all(&dir);
            let info = json!({ "port": port, "pid": std::process::id() });
            let _ = std::fs::write(dir.join("control.json"), info.to_string());
        }
        eprintln!("tudu: control channel on 127.0.0.1:{port}");
        for stream in listener.incoming().flatten() {
            let app = app.clone();
            std::thread::spawn(move || {
                if let Err(e) = serve(&app, stream) {
                    eprintln!("tudu: control request failed: {e}");
                }
            });
        }
    });
}

fn serve(app: &AppHandle, mut stream: TcpStream) -> std::io::Result<()> {
    let mut reader = BufReader::new(stream.try_clone()?);
    let mut line = String::new();
    reader.read_line(&mut line)?;
    let mut parts = line.split_whitespace();
    let method = parts.next().unwrap_or("").to_string();
    let path = parts.next().unwrap_or("").to_string();
    let mut length = 0usize;
    loop {
        let mut h = String::new();
        if reader.read_line(&mut h)? == 0 || h == "\r\n" || h == "\n" {
            break;
        }
        if let Some((k, v)) = h.split_once(':') {
            if k.trim().eq_ignore_ascii_case("content-length") {
                length = v.trim().parse().unwrap_or(0);
            }
        }
    }
    let mut body = vec![0u8; length];
    reader.read_exact(&mut body)?;
    let input: Value = serde_json::from_slice(&body).unwrap_or(Value::Null);
    let (status, out) = match (method.as_str(), path.as_str()) {
        ("GET", "/state") => (200, state(app)),
        ("POST", "/act") => act(app, &input),
        ("POST", "/eval") => eval(app, &input),
        _ => (404, json!({ "error": "unknown route" })),
    };
    let text = out.to_string();
    write!(
        stream,
        "HTTP/1.1 {status} OK\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{text}",
        text.len()
    )?;
    stream.flush()
}

fn window_state(w: Option<WebviewWindow>) -> Value {
    let Some(w) = w else { return Value::Null };
    let scale = w.scale_factor().unwrap_or(1.0);
    let pos = w.outer_position().map(|p| p.to_logical::<f64>(scale)).ok();
    let size = w.inner_size().map(|s| s.to_logical::<f64>(scale)).ok();
    let screen = w.current_monitor().ok().flatten().map(|m| {
        let s = m.scale_factor();
        json!({
            "x": m.position().x as f64 / s,
            "y": m.position().y as f64 / s,
            "width": m.size().width as f64 / s,
            "height": m.size().height as f64 / s,
        })
    });
    json!({
        "visible": w.is_visible().unwrap_or(false),
        "focused": w.is_focused().unwrap_or(false),
        "minimized": w.is_minimized().unwrap_or(false),
        "alwaysOnTop": w.is_always_on_top().unwrap_or(false),
        "decorated": w.is_decorated().unwrap_or(false),
        "x": pos.map(|p| p.x),
        "y": pos.map(|p| p.y),
        "width": size.map(|s| s.width),
        "height": size.map(|s| s.height),
        "screen": screen,
        "url": w.url().map(|u| u.to_string()).unwrap_or_default(),
        "theme": w.theme().ok(),
    })
}

/// The badge exactly as the Dock tile carries it.
fn dock_badge(app: &AppHandle) -> Option<String> {
    let (tx, rx) = channel();
    let _ = app.run_on_main_thread(move || {
        let label = objc2_foundation::MainThreadMarker::new().and_then(|mtm| {
            let tile = objc2_app_kit::NSApplication::sharedApplication(mtm).dockTile();
            tile.badgeLabel().map(|s| s.to_string())
        });
        let _ = tx.send(label);
    });
    rx.recv_timeout(Duration::from_secs(2))
        .ok()
        .flatten()
        .filter(|s| !s.is_empty())
}

/// The tick's tooltip as last set (None: still the one it was built with).
fn bg_tooltip(app: &AppHandle) -> Option<String> {
    app.state::<background::Background>()
        .tray_tooltip
        .lock()
        .ok()
        .and_then(|t| t.clone())
}

fn state(app: &AppHandle) -> Value {
    let a = app.state::<App>();
    let track = a.track;
    let seen = a.seen.lock().map(|s| s.clone()).unwrap_or_default();
    let updater = app
        .state::<updates::Updates>()
        .0
        .lock()
        .map(|s| s.clone())
        .unwrap_or_default();
    // No native menu any more: an empty list says so (chunk 20).
    let tray = app.tray_by_id("tray").map(|_| {
        json!({ "tooltip": bg_tooltip(app).unwrap_or_else(|| track.name().to_string()), "items": [], "rect": crate::tray_icon(app).map(|i| json!({
            "x": i.x, "y": i.y, "width": i.width, "height": i.height,
        })) })
    });
    let registered = app.global_shortcut().is_registered(SUMMON);
    let notes_registered = app.global_shortcut().is_registered(NOTES);
    let bg = app.state::<background::Background>();
    let webview = |label: &str| {
        app.get_webview_window(label)
            .and_then(|w| background::webview_policy(&w))
    };
    let looks = app.state::<crate::look::Looks>();
    let look = json!({
        "saved": crate::look::current(app),
        "launchedAt": looks.launched_at,
        "deskBackground": looks.background.lock().ok().and_then(|b| b.map(crate::look::hex)),
    });
    let background = json!({
        "policy": background::current_policy(app),
        "dock": bg.dock.lock().map(|d| *d).unwrap_or_default(),
        "deskOpen": bg.desk_open.load(Ordering::SeqCst),
        "atLogin": bg.at_login,
        "awake": bg.awake.load(Ordering::SeqCst),
        "trayTitle": bg.tray_title.lock().ok().and_then(|t| t.clone()),
        "trayDot": bg.tray_dot.lock().map(|d| *d).unwrap_or(false),
        "trayPosition": background::tray_position(),
        "trayAutosave": background::tray_autosave(app),
        "tickHidden": bg.tick_hidden.load(Ordering::SeqCst),
        "loginItem": background::login(),
        "webviews": {
            "main": webview(windows::MAIN),
            "floating": webview(windows::FLOATING),
            "menubar": webview(windows::MENUBAR),
            "note": webview(windows::NOTE),
        },
    });
    // The note window (chunk 22): pinned, filling the screen, what it was last asked for, and where it is kept.
    let notes = app.state::<crate::notes::Notes>();
    let note = json!({ "state": notes.state(), "frame": notes.frame(), "glideSteps": notes.glide_steps() });
    json!({
        "track": track,
        "name": track.name(),
        "identifier": app.config().identifier,
        "version": app.package_info().version.to_string(),
        "pid": std::process::id(),
        "windows": {
            "main": window_state(app.get_webview_window(windows::MAIN)),
            "floating": window_state(app.get_webview_window(windows::FLOATING)),
            "menubar": window_state(app.get_webview_window(windows::MENUBAR)),
            "note": window_state(app.get_webview_window(windows::NOTE)),
        },
        "note": note,
        "tray": tray,
        "shortcut": { "accelerator": SUMMON, "registered": registered },
        "shortcuts": {
            "summon": { "accelerator": SUMMON, "registered": registered },
            "notes": { "accelerator": NOTES, "registered": notes_registered },
        },
        "badge": dock_badge(app),
        "background": background,
        "look": look,
        "reduceMotion": windows::reduce_motion(),
        "updater": updater,
        "seen": seen,
        "outside": windows::last_outside(),
    })
}

fn act(app: &AppHandle, input: &Value) -> (u16, Value) {
    let what = input.get("do").and_then(Value::as_str).unwrap_or("");
    let (tx, rx) = channel::<Value>();
    let a = app.clone();
    let input = input.clone();
    match what {
        "summon" | "notes-shortcut" | "tray" | "reopen" | "close" | "outside-click" => {
            // On the main thread, as a key press, a click in the menu or the Dock would be.
            let w = what.to_string();
            let _ = app.run_on_main_thread(move || {
                match w.as_str() {
                    "summon" => windows::summon(&a, true),
                    // ⌥⌘N, through the same handler a key press reaches.
                    "notes-shortcut" => {
                        if let Ok(s) = NOTES.parse() {
                            crate::pressed(&a, &s);
                        }
                    }
                    // Either button toggles the sheet; the click comes from where the tick is.
                    "tray" => windows::toggle_menubar(&a, crate::tray_icon(&a)),
                    "reopen" => windows::show_main(&a, None),
                    // A click in another app, as the global mouse monitor hears it (CI cannot post one).
                    "outside-click" => windows::outside(&a, "click", None, false),
                    "close" => {
                        let label = input
                            .get("window")
                            .and_then(Value::as_str)
                            .unwrap_or(windows::MAIN);
                        if let Some(win) = a.get_webview_window(label) {
                            let _ = win.close();
                        }
                    }
                    _ => {}
                }
                let _ = tx.send(json!({ "ok": true }));
            });
            match rx.recv_timeout(Duration::from_secs(5)) {
                Ok(v) => (200, v),
                Err(_) => (504, json!({ "error": "the main thread did not answer" })),
            }
        }
        "frame" => {
            // A window dragged and resized by hand (the note window by its bar and corner), in points.
            let label = input
                .get("window")
                .and_then(Value::as_str)
                .unwrap_or(windows::NOTE);
            let n = |k: &str| input.get(k).and_then(Value::as_f64);
            let Some(w) = app.get_webview_window(label) else {
                return (404, json!({ "error": format!("no window {label}") }));
            };
            if let (Some(width), Some(height)) = (n("width"), n("height")) {
                let _ = w.set_size(tauri::LogicalSize::new(width, height));
            }
            if let (Some(x), Some(y)) = (n("x"), n("y")) {
                let _ = w.set_position(tauri::LogicalPosition::new(x, y));
            }
            (200, json!({ "ok": true }))
        }
        "reduce-motion" => {
            // macOS Reduce motion as the app sees it: on, off, or (null) as the system says.
            let v = match input.get("on").and_then(Value::as_bool) {
                Some(false) => 1,
                Some(true) => 2,
                None => 0,
            };
            windows::REDUCE_MOTION_OVERRIDE.store(v, std::sync::atomic::Ordering::SeqCst);
            (200, json!({ "ok": true }))
        }
        "tick" => {
            let hidden = input.get("hidden").and_then(Value::as_bool);
            if let Ok(mut o) = app.state::<background::Background>().tick_override.lock() {
                *o = hidden;
            }
            (200, json!({ "ok": true }))
        }
        "check-update" => {
            // `auto`: as a window coming to the front would, so only past the floor; else a check now.
            if input.get("auto").and_then(Value::as_bool) == Some(true) {
                return (200, json!({ "started": updates::auto_check(app) }));
            }
            let r = tauri::async_runtime::block_on(updates::update_check(app.clone(), None, None));
            (200, json!({ "ready": r.ok().flatten() }))
        }
        "wake" => {
            updates::woke(app);
            (200, json!({ "ok": true }))
        }
        "age-check" => {
            // Moves the last check back this many minutes, so the floor is tested without waiting.
            let minutes = input.get("minutes").and_then(Value::as_u64).unwrap_or(0);
            if let Ok(mut s) = app.state::<updates::Updates>().0.lock() {
                let back = Duration::from_secs(minutes * 60);
                s.finished = Some(s.finished.unwrap_or_else(std::time::SystemTime::now) - back);
            }
            (200, json!({ "ok": true }))
        }
        "quit" => {
            let a = app.clone();
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_millis(50));
                a.exit(0);
            });
            (200, json!({ "ok": true }))
        }
        _ => (400, json!({ "error": format!("unknown action {what}") })),
    }
}

fn eval(app: &AppHandle, input: &Value) -> (u16, Value) {
    let label = input
        .get("window")
        .and_then(Value::as_str)
        .unwrap_or(windows::MAIN);
    let script = input.get("script").and_then(Value::as_str).unwrap_or("");
    let timeout = input
        .get("timeoutMs")
        .and_then(Value::as_u64)
        .unwrap_or(10_000);
    let Some(w) = app.get_webview_window(label) else {
        return (404, json!({ "error": format!("no window {label}") }));
    };
    let control = app.state::<Control>();
    let id = control.next.fetch_add(1, Ordering::SeqCst);
    let (tx, rx) = channel();
    if let Ok(mut p) = control.pending.lock() {
        p.insert(id, tx);
    }
    let js = format!(
        r#"(async () => {{
  const reply = (ok, value) => window.__TAURI_INTERNALS__.invoke('control_reply', {{ id: {id}, ok, value }});
  try {{
    const v = await (async () => {{ {script} }})();
    await reply(true, JSON.stringify(v === undefined ? null : v));
  }} catch (e) {{
    await reply(false, String(e) + (e && e.stack ? '\n' + e.stack : ''));
  }}
}})();"#
    );
    if let Err(e) = w.eval(&js) {
        control.pending.lock().ok().map(|mut p| p.remove(&id));
        return (500, json!({ "ok": false, "error": e.to_string() }));
    }
    match rx.recv_timeout(Duration::from_millis(timeout)) {
        Ok((true, v)) => (
            200,
            json!({ "ok": true, "value": serde_json::from_str::<Value>(&v).unwrap_or(Value::Null) }),
        ),
        Ok((false, e)) => (200, json!({ "ok": false, "error": e })),
        Err(_) => {
            control.pending.lock().ok().map(|mut p| p.remove(&id));
            (
                200,
                json!({ "ok": false, "error": "timed out", "timeout": true }),
            )
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn c11_u08_each_data_folder_has_its_own_store() {
        let a = store_id(std::path::Path::new("/tmp/a"));
        let b = store_id(std::path::Path::new("/tmp/b"));
        assert_ne!(a, b);
        assert_eq!(a, store_id(std::path::Path::new("/tmp/a")));
        assert_eq!(a[6] >> 4, 4);
    }
}
