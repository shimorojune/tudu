//! Updates: the page asks for a check on launch and every four hours; the app also checks by itself when one of its
//! windows comes to the front and when the Mac wakes, once the last check is 30 minutes old. A newer version on the
//! track's feed is downloaded at once and its signature checked; only then does the page hear of it (and the Inbox
//! show it). Restart to update installs what is on disk and relaunches.
//!
//! Every change of state goes to all three windows as `update:status`, so Settings › This Mac and the menu bar's ⋯
//! follow a check whoever started it.

use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_updater::{Update, UpdaterExt};

/// A check by itself (focus, wake) waits this long after the last one finished.
pub const AUTO_FLOOR: Duration = Duration::from_secs(30 * 60);
/// Download progress goes to the windows at most this often.
const PROGRESS_EVERY: Duration = Duration::from_millis(100);

#[derive(Default)]
pub struct Updates(pub Mutex<Status>, tauri::async_runtime::Mutex<()>);

/// Where the updater stands, for the control channel and for the page.
#[derive(Default, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub checks: u32,
    pub last_check: Option<String>,
    /// none (up to date), ready (downloaded and verified) or error.
    pub last_result: Option<String>,
    /// The last check was asked for (Check now): only then does the page show its error.
    pub last_manual: bool,
    pub ready: Option<Ready>,
    pub error: Option<String>,
    pub downloads: u32,
    /// A check is asking the feed or downloading, or waiting its turn to.
    pub checking: bool,
    /// Checks started and not finished (one runs, the rest wait their turn).
    #[serde(skip)]
    pub pending: u32,
    pub downloading: Option<Downloading>,
    /// When the last check finished, for the floor (the control channel can move it back).
    #[serde(skip)]
    pub finished: Option<SystemTime>,
    #[serde(skip)]
    pub bundle: Option<(Update, Vec<u8>)>,
}

#[derive(Serialize, Clone, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Ready {
    pub version: String,
    pub notes: String,
    pub date: Option<String>,
}

#[derive(Serialize, Clone, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Downloading {
    pub version: String,
    pub received: u64,
    pub total: Option<u64>,
}

/// Whether a check by itself goes ahead: none running, and the last one finished at least the floor ago (or never).
pub fn auto_due(checking: bool, finished: Option<SystemTime>, now: SystemTime) -> bool {
    if checking {
        return false;
    }
    match finished {
        None => true,
        // A clock set back counts as just now.
        Some(at) => now
            .duration_since(at)
            .map(|d| d >= AUTO_FLOOR)
            .unwrap_or(false),
    }
}

fn now() -> String {
    time::OffsetDateTime::now_utc()
        .format(&time::format_description::well_known::Rfc3339)
        .unwrap_or_default()
}

fn updater(app: &AppHandle) -> Result<tauri_plugin_updater::Updater, String> {
    #[allow(unused_mut)]
    let mut b = app.updater_builder();
    #[cfg(feature = "control")]
    {
        b = crate::control::feed(b)?;
    }
    b.build().map_err(|e| e.to_string())
}

/// Change the status and tell every window.
fn change(app: &AppHandle, f: impl FnOnce(&mut Status)) {
    let snap = match app.state::<Updates>().0.lock() {
        Ok(mut s) => {
            f(&mut s);
            s.clone()
        }
        Err(_) => return,
    };
    let _ = app.emit("update:status", &snap);
}

fn finish(app: &AppHandle, manual: bool, f: impl FnOnce(&mut Status)) {
    change(app, |s| {
        s.checks += 1;
        s.last_check = Some(now());
        s.finished = Some(SystemTime::now());
        s.last_manual = manual;
        s.pending = s.pending.saturating_sub(1);
        s.checking = s.pending > 0;
        s.downloading = None;
        f(s);
    });
}

fn ready_before(app: &AppHandle) -> Option<Ready> {
    app.state::<Updates>()
        .0
        .lock()
        .ok()
        .and_then(|s| s.ready.clone())
}

/// Check the feed, and download a newer version straight away. Answers the version that is ready to install,
/// if any. Never two at once: a check asked for while one runs waits its turn, then asks the feed again. A check or
/// download that fails answers what was ready before it (the failure is kept in the status and tried again at the
/// next check). `manual`: asked for with Check now, so the page may show its error.
#[tauri::command]
pub async fn update_check(app: AppHandle, manual: Option<bool>) -> Result<Option<Ready>, String> {
    change(&app, |s| {
        s.pending += 1;
        s.checking = true;
    });
    run(app, manual.unwrap_or(false)).await
}

/// One check, counted in `pending` by whoever started it.
async fn run(app: AppHandle, manual: bool) -> Result<Option<Ready>, String> {
    let updates = app.state::<Updates>();
    let _turn = updates.1.lock().await;
    let found = match updater(&app) {
        Ok(u) => u.check().await.map_err(|e| e.to_string()),
        Err(e) => Err(e),
    };
    let update = match found {
        Ok(Some(u)) => u,
        Ok(None) => {
            finish(&app, manual, |s| {
                s.last_result = Some("none".into());
                s.error = None;
            });
            return Ok(None);
        }
        Err(e) => {
            eprintln!("tudu: update check failed: {e}");
            let ready = ready_before(&app);
            finish(&app, manual, |s| {
                s.last_result = Some("error".into());
                s.error = Some(e.clone());
            });
            return Ok(ready);
        }
    };
    let ready = Ready {
        version: update.version.clone(),
        notes: update.body.clone().unwrap_or_default(),
        date: update.date.map(|d| {
            d.format(&time::format_description::well_known::Rfc3339)
                .unwrap_or_default()
        }),
    };
    // Already on disk from an earlier check.
    if ready_before(&app).as_ref() == Some(&ready) {
        finish(&app, manual, |s| {
            s.last_result = Some("ready".into());
            s.error = None;
        });
        return Ok(Some(ready));
    }
    let version = ready.version.clone();
    change(&app, |s| {
        s.downloading = Some(Downloading {
            version: version.clone(),
            received: 0,
            total: None,
        })
    });
    let mut received: u64 = 0;
    let mut told = Instant::now();
    let progress = |chunk: usize, total: Option<u64>| {
        received += chunk as u64;
        if told.elapsed() >= PROGRESS_EVERY {
            told = Instant::now();
            let version = version.clone();
            change(&app, |s| {
                s.downloading = Some(Downloading {
                    version,
                    received,
                    total,
                })
            });
        }
    };
    // The download checks the signature against the app's public key before it answers.
    match update.download(progress, || {}).await {
        Ok(bytes) => {
            let r = ready.clone();
            // The desk hears of it whoever asked (its own check, the app's, or the control channel's).
            let _ = app.emit_to(crate::windows::MAIN, "update:ready", &ready);
            finish(&app, manual, move |s| {
                s.downloads += 1;
                s.last_result = Some("ready".into());
                s.error = None;
                s.ready = Some(r);
                s.bundle = Some((update, bytes));
            });
            Ok(Some(ready))
        }
        Err(e) => {
            let e = e.to_string();
            eprintln!("tudu: update download refused: {e}");
            let ready = ready_before(&app);
            finish(&app, manual, |s| {
                s.last_result = Some("error".into());
                s.error = Some(e.clone());
            });
            Ok(ready)
        }
    }
}

/// Where the updater stands, for Settings › This Mac and the menu bar's ⋯ (an app without this command is older
/// than both, and the page leaves them out).
#[tauri::command]
pub fn update_status(state: State<'_, Updates>) -> Result<Status, String> {
    state.0.lock().map(|s| s.clone()).map_err(|e| e.to_string())
}

/// A check by itself, when a window comes to the front or the Mac wakes: only past the floor, never beside another.
/// Answers whether one started.
pub fn auto_check(app: &AppHandle) -> bool {
    // Decided and counted under one lock, so a burst of focus changes starts one check.
    let snap = app.state::<Updates>().0.lock().ok().and_then(|mut s| {
        auto_due(s.checking, s.finished, SystemTime::now()).then(|| {
            s.pending += 1;
            s.checking = true;
            s.clone()
        })
    });
    let due = snap.is_some();
    if let Some(snap) = snap {
        let _ = app.emit("update:status", &snap);
        let a = app.clone();
        tauri::async_runtime::spawn(async move {
            let _ = run(a, false).await;
        });
    }
    due
}

/// The Mac woke: the wall clock jumped ahead of the process's own clock, which stands still while the Mac sleeps.
pub fn slept(wall: Duration, process: Duration) -> bool {
    wall.saturating_sub(process) >= Duration::from_secs(60)
}

/// Watches for the Mac waking, without a notification observer: every 30 seconds it compares the wall clock with the
/// process's clock, and a jump means the Mac slept in between.
pub fn watch_wake(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || loop {
        let (wall, mono) = (SystemTime::now(), Instant::now());
        std::thread::sleep(Duration::from_secs(30));
        let wall = SystemTime::now().duration_since(wall).unwrap_or_default();
        if slept(wall, mono.elapsed()) {
            woke(&app);
        }
    });
}

/// The Mac woke (or the control channel says so).
pub fn woke(app: &AppHandle) {
    auto_check(app);
}

/// Restart to update: install the downloaded version over this one and relaunch on it.
#[tauri::command]
pub async fn update_install(app: AppHandle, state: State<'_, Updates>) -> Result<(), String> {
    let bundle = state.0.lock().map_err(|e| e.to_string())?.bundle.take();
    let Some((update, bytes)) = bundle else {
        return Err("No update is ready.".into());
    };
    if let Err(e) = update.install(&bytes) {
        eprintln!("tudu: install failed: {e}");
        if let Ok(mut s) = state.0.lock() {
            s.bundle = Some((update, bytes));
        }
        return Err(e.to_string());
    }
    app.restart();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn c11_u10_a_check_by_itself_waits_for_the_floor_and_never_runs_beside_another() {
        let now = SystemTime::now();
        // Never checked: due.
        assert!(auto_due(false, None, now));
        // One running: never.
        assert!(!auto_due(true, None, now));
        assert!(!auto_due(true, Some(now - Duration::from_secs(3600)), now));
        // Under the floor: not yet.
        assert!(!auto_due(
            false,
            Some(now - Duration::from_secs(29 * 60)),
            now
        ));
        // At and past it: due.
        assert!(auto_due(false, Some(now - AUTO_FLOOR), now));
        assert!(auto_due(
            false,
            Some(now - Duration::from_secs(5 * 3600)),
            now
        ));
        // A clock set back counts as just now.
        assert!(!auto_due(false, Some(now + Duration::from_secs(60)), now));
    }

    #[test]
    fn c11_u10_a_jump_of_the_wall_clock_means_the_mac_slept() {
        let s = Duration::from_secs;
        assert!(!slept(s(30), s(30)));
        assert!(!slept(s(31), s(30)));
        assert!(!slept(s(30), s(31)));
        assert!(slept(s(30 + 60), s(30)));
        assert!(slept(s(8 * 3600), s(30)));
    }
}
