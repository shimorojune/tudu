//! Updates: the page asks for a check on launch and every four hours. A newer version on the track's feed is
//! downloaded at once and its signature checked; only then does the page hear of it (and the Inbox show it).
//! Restart to update installs what is on disk and relaunches.

use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_updater::{Update, UpdaterExt};

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
    pub ready: Option<Ready>,
    pub error: Option<String>,
    pub downloads: u32,
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

fn finish(app: &AppHandle, f: impl FnOnce(&mut Status)) {
    if let Ok(mut s) = app.state::<Updates>().0.lock() {
        s.checks += 1;
        s.last_check = Some(now());
        f(&mut s);
    }
}

/// Check the feed, and download a newer version straight away. Answers the version that is ready to install,
/// if any. Never two at once: a check asked for while one runs waits its turn, then asks the feed again. A check or
/// download that fails answers what was ready before it (the failure is kept in the status and tried again at the
/// next check).
#[tauri::command]
pub async fn update_check(app: AppHandle) -> Result<Option<Ready>, String> {
    let updates = app.state::<Updates>();
    let _turn = updates.1.lock().await;
    let found = match updater(&app) {
        Ok(u) => u.check().await.map_err(|e| e.to_string()),
        Err(e) => Err(e),
    };
    let update = match found {
        Ok(Some(u)) => u,
        Ok(None) => {
            finish(&app, |s| {
                s.last_result = Some("none".into());
                s.error = None;
            });
            return Ok(None);
        }
        Err(e) => {
            eprintln!("tudu: update check failed: {e}");
            let ready = app
                .state::<Updates>()
                .0
                .lock()
                .ok()
                .and_then(|s| s.ready.clone());
            finish(&app, |s| {
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
    if app
        .state::<Updates>()
        .0
        .lock()
        .map(|s| s.ready.as_ref() == Some(&ready))
        .unwrap_or(false)
    {
        finish(&app, |s| s.last_result = Some("ready".into()));
        return Ok(Some(ready));
    }
    // The download checks the signature against the app's public key before it answers.
    match update.download(|_, _| {}, || {}).await {
        Ok(bytes) => {
            let r = ready.clone();
            // The desk hears of it whoever asked (its own check, or the control channel's).
            let _ = app.emit_to(crate::windows::MAIN, "update:ready", &ready);
            finish(&app, move |s| {
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
            let ready = app
                .state::<Updates>()
                .0
                .lock()
                .ok()
                .and_then(|s| s.ready.clone());
            finish(&app, |s| {
                s.last_result = Some("error".into());
                s.error = Some(e.clone());
            });
            Ok(ready)
        }
    }
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
