//! Tudu in the background (chunk 16): closing the desk keeps Tudu running in the menu bar, out of the Dock unless
//! you keep it there; Tudu stays awake while nobody looks at it; and it can open at login, straight into the menu
//! bar.
//!
//! The Dock icon follows the desk: a regular app while the desk is open (or always, if you chose that in Settings ›
//! This Mac), an accessory app (no Dock icon, not in ⌘Tab) once it is closed. The Inbox count goes where you can see
//! it: the Dock's badge while there is a Dock icon, beside the tick in the menu bar while there is not.

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};

use crate::{windows, App};

/// Settings › This Mac › Show Tudu in the Dock.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Dock {
    /// While the window is open (the default).
    #[default]
    Open,
    Always,
}

/// What macOS is told the app is.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Policy {
    /// In the Dock and ⌘Tab, with the app menu.
    Regular,
    /// The menu bar only.
    Accessory,
}

pub fn policy(dock: Dock, desk_open: bool) -> Policy {
    if desk_open || dock == Dock::Always {
        Policy::Regular
    } else {
        Policy::Accessory
    }
}

/// Where the Inbox count shows: the Dock's badge while there is a Dock icon, the tick's title while there is not.
/// No count, neither.
pub fn count_places(policy: Policy, count: Option<i64>) -> (Option<i64>, Option<String>) {
    let count = count.filter(|n| *n > 0);
    match policy {
        Policy::Regular => (count, None),
        Policy::Accessory => (None, count.map(|n| n.to_string())),
    }
}

/// Settings › This Mac › Open at login, as macOS has it.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Login {
    Off,
    On,
    /// Registered, waiting for you to allow it in System Settings › General › Login Items.
    Approval,
    /// macOS answered the switch with an error.
    Refused,
}

/// SMAppServiceStatus: not registered (0), enabled (1), requires approval (2), not found (3).
pub fn login_from_status(status: isize) -> Login {
    match status {
        1 => Login::On,
        2 => Login::Approval,
        _ => Login::Off,
    }
}

/// The background's own state, kept with the app.
#[derive(Default)]
pub struct Background {
    pub dock: Mutex<Dock>,
    /// The desk is open: shown, or minimised into the Dock. Closing it is the only way out.
    pub desk_open: AtomicBool,
    /// This launch came from the login item: no window, no Dock icon.
    pub at_login: bool,
    /// The App Nap opt-out is held (from launch to quit).
    pub awake: AtomicBool,
    /// What the tick carries beside it now (the Inbox count, while there is no Dock icon).
    pub tray_title: Mutex<Option<String>>,
}

#[derive(Serialize, Deserialize, Default)]
struct Prefs {
    #[serde(default)]
    dock: Dock,
}

/// Where This Mac's choices live: the app's own config folder (Tudu Test: the run's data folder). Never the server.
fn prefs_path(app: &AppHandle) -> Option<PathBuf> {
    #[cfg(feature = "control")]
    if let Some(d) = crate::control::data_dir() {
        return Some(d.join("this-mac.json"));
    }
    app.path()
        .app_config_dir()
        .ok()
        .map(|d| d.join("this-mac.json"))
}

fn load(app: &AppHandle) -> Dock {
    prefs_path(app)
        .and_then(|p| std::fs::read(p).ok())
        .map(|b| dock_from(&b))
        .unwrap_or_default()
}

/// The saved choice; anything unreadable (an old "never", a torn write) is the default.
fn dock_from(bytes: &[u8]) -> Dock {
    serde_json::from_slice::<Prefs>(bytes)
        .unwrap_or_default()
        .dock
}

fn save(app: &AppHandle, dock: Dock) {
    let Some(p) = prefs_path(app) else { return };
    if let Some(dir) = p.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    if let Ok(text) = serde_json::to_vec(&Prefs { dock }) {
        let _ = std::fs::write(p, text);
    }
}

/// At launch: the saved Dock choice, whether the login item started us, and the App Nap opt-out.
pub fn start(app: &AppHandle) -> Background {
    let at_login = launched_at_login();
    let b = Background {
        dock: Mutex::new(load(app)),
        desk_open: AtomicBool::new(!at_login),
        at_login,
        awake: AtomicBool::new(false),
        tray_title: Mutex::new(None),
    };
    b.awake.store(mac::hold_awake(), Ordering::SeqCst);
    b
}

fn launched_at_login() -> bool {
    #[cfg(feature = "control")]
    if std::env::var("TUDU_TEST_AT_LOGIN").is_ok_and(|v| v == "1") {
        return true;
    }
    mac::launched_at_login()
}

pub fn current_policy(app: &AppHandle) -> Policy {
    let b = app.state::<Background>();
    let dock = b.dock.lock().map(|d| *d).unwrap_or_default();
    policy(dock, b.desk_open.load(Ordering::SeqCst))
}

/// Tell macOS what the app is now, and put the Inbox count where it can be seen.
pub fn apply(app: &AppHandle) {
    let p = current_policy(app);
    mac::set_policy(app, p);
    let count = app.state::<App>().seen.lock().ok().and_then(|s| s.badge);
    let (badge, title) = count_places(p, count);
    if let Some(w) = app.get_webview_window(windows::MAIN) {
        let _ = w.set_badge_count(badge);
    }
    if let Some(tray) = app.tray_by_id("tray") {
        let _ = tray.set_title(title.as_deref());
    }
    if let Ok(mut t) = app.state::<Background>().tray_title.lock() {
        *t = title;
    }
}

/// The desk opened (the sheet's Open Tudu, the Dock icon, opening Tudu again) or was closed.
pub fn desk(app: &AppHandle, open: bool) {
    app.state::<Background>()
        .desk_open
        .store(open, Ordering::SeqCst);
    apply(app);
}

/// The desk is coming forward: a regular app first, so its window can be the active one.
pub fn bring_forward(app: &AppHandle) {
    desk(app, true);
    mac::activate(app);
}

/// Each window's page keeps running while it is hidden.
pub fn keep_awake(w: &tauri::WebviewWindow) {
    mac::keep_webview_awake(w);
}

/// The webview's inactive scheduling policy (0 suspend, 1 throttle, 2 none), for the control channel.
#[cfg(feature = "control")]
pub fn webview_policy(w: &tauri::WebviewWindow) -> Option<isize> {
    mac::webview_policy(w)
}

/// The login item as macOS has it now.
pub fn login() -> Login {
    mac::login_status()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ThisMac {
    open_at_login: Login,
    dock: Dock,
}

/// Settings › This Mac, as it opens: macOS's answer for the login item, read fresh, and the Dock choice.
#[tauri::command]
pub fn this_mac(state: State<'_, Background>) -> ThisMac {
    ThisMac {
        open_at_login: login(),
        dock: state.dock.lock().map(|d| *d).unwrap_or_default(),
    }
}

/// The Open at login switch: registers or unregisters the app with macOS and answers where that left it.
#[tauri::command]
pub fn set_open_at_login(on: bool) -> Login {
    mac::set_login(on)
}

/// Open Login Items, for when macOS waits for your OK.
#[tauri::command]
pub fn open_login_items(app: AppHandle) {
    if let Ok(mut s) = app.state::<App>().seen.lock() {
        s.opened
            .push("x-apple.systempreferences:com.apple.LoginItems-Settings.extension".into());
    }
    if cfg!(feature = "control") {
        return;
    }
    mac::open_login_items();
}

/// Show Tudu in the Dock: kept on this Mac and applied at once.
#[tauri::command]
pub fn set_dock(app: AppHandle, state: State<'_, Background>, dock: Dock) {
    if let Ok(mut d) = state.dock.lock() {
        *d = dock;
    }
    save(&app, dock);
    apply(&app);
}

#[cfg(target_os = "macos")]
mod mac {
    use objc2::msg_send;
    use objc2::rc::Retained;
    use objc2_app_kit::NSApplication;
    use objc2_foundation::{
        MainThreadMarker, NSActivityOptions, NSAppleEventDescriptor, NSAppleEventManager,
        NSProcessInfo, NSString,
    };
    use objc2_service_management::{SMAppService, SMAppServiceStatus};
    use objc2_web_kit::{WKInactiveSchedulingPolicy, WKWebView};
    use tauri::{ActivationPolicy, AppHandle, WebviewWindow};

    use super::{login_from_status, Login, Policy};

    pub fn set_policy(app: &AppHandle, p: Policy) {
        let _ = app.set_activation_policy(match p {
            Policy::Regular => ActivationPolicy::Regular,
            Policy::Accessory => ActivationPolicy::Accessory,
        });
    }

    /// Coming back from the menu bar the app is not active; without this the desk opens behind the frontmost app.
    pub fn activate(app: &AppHandle) {
        let _ = app.run_on_main_thread(|| {
            if let Some(mtm) = MainThreadMarker::new() {
                NSApplication::sharedApplication(mtm).activate();
            }
        });
    }

    /// Out of App Nap from launch to quit, while still letting the Mac sleep: the outbox, the live stream and the
    /// update check keep their time when no window is on screen. The activity is held for the process's life.
    pub fn hold_awake() -> bool {
        let reason = NSString::from_str("Tudu keeps your day in sync from the menu bar.");
        let activity = NSProcessInfo::processInfo().beginActivityWithOptions_reason(
            NSActivityOptions::UserInitiatedAllowingIdleSystemSleep,
            &reason,
        );
        std::mem::forget(activity);
        true
    }

    /// WebKit suspends a page nobody can see; Tudu's pages keep running (macOS 14 and later).
    pub fn keep_webview_awake(w: &WebviewWindow) {
        let _ = w.with_webview(|v| {
            let wk = v.inner() as *const WKWebView;
            if wk.is_null() {
                return;
            }
            unsafe {
                (*wk)
                    .configuration()
                    .preferences()
                    .setInactiveSchedulingPolicy(WKInactiveSchedulingPolicy::None);
            }
        });
    }

    #[cfg(feature = "control")]
    pub fn webview_policy(w: &WebviewWindow) -> Option<isize> {
        let (tx, rx) = std::sync::mpsc::channel();
        let _ = w.with_webview(move |v| {
            let wk = v.inner() as *const WKWebView;
            let p = (!wk.is_null()).then(|| unsafe {
                (*wk)
                    .configuration()
                    .preferences()
                    .inactiveSchedulingPolicy()
                    .0
            });
            let _ = tx.send(p);
        });
        rx.recv_timeout(std::time::Duration::from_secs(2))
            .ok()
            .flatten()
    }

    fn service() -> Retained<SMAppService> {
        unsafe { SMAppService::mainAppService() }
    }

    pub fn login_status() -> Login {
        login_from_status(unsafe { service().status() }.0)
    }

    pub fn set_login(on: bool) -> Login {
        let s = service();
        let done = unsafe {
            if on {
                s.registerAndReturnError()
            } else {
                s.unregisterAndReturnError()
            }
        };
        let now = unsafe { s.status() };
        match done {
            Ok(()) => login_from_status(now.0),
            // Waiting for approval also answers with an error; that is not a refusal.
            Err(_) if on && now == SMAppServiceStatus::RequiresApproval => Login::Approval,
            Err(e) => {
                eprintln!("tudu: the login item: {}", e.localizedDescription());
                if on {
                    Login::Refused
                } else {
                    login_from_status(now.0)
                }
            }
        }
    }

    pub fn open_login_items() {
        unsafe { SMAppService::openSystemSettingsLoginItems() };
    }

    const OPEN_APPLICATION: u32 = u32::from_be_bytes(*b"oapp");
    const PROP_DATA: u32 = u32::from_be_bytes(*b"prdt");
    const AS_LOGIN_ITEM: u32 = u32::from_be_bytes(*b"lgit");

    /// The open-application event that launched us says whether it came from a login item. It is only there while
    /// the app finishes launching, which is when setup runs.
    pub fn launched_at_login() -> bool {
        let Some(event) = NSAppleEventManager::sharedAppleEventManager().currentAppleEvent() else {
            return false;
        };
        // Four-character codes, asked for directly: the typed accessors need all of CoreServices.
        let id: u32 = unsafe { msg_send![&*event, eventID] };
        if id != OPEN_APPLICATION {
            return false;
        }
        let prop: Option<Retained<NSAppleEventDescriptor>> =
            unsafe { msg_send![&*event, paramDescriptorForKeyword: PROP_DATA] };
        prop.is_some_and(|d| {
            let code: u32 = unsafe { msg_send![&*d, enumCodeValue] };
            code == AS_LOGIN_ITEM
        })
    }
}

#[cfg(not(target_os = "macos"))]
mod mac {
    use super::{Login, Policy};
    use tauri::{AppHandle, WebviewWindow};

    pub fn set_policy(_: &AppHandle, _: Policy) {}
    pub fn activate(_: &AppHandle) {}
    pub fn hold_awake() -> bool {
        false
    }
    pub fn keep_webview_awake(_: &WebviewWindow) {}
    #[cfg(feature = "control")]
    pub fn webview_policy(_: &WebviewWindow) -> Option<isize> {
        None
    }
    pub fn login_status() -> Login {
        Login::Off
    }
    pub fn set_login(_: bool) -> Login {
        Login::Refused
    }
    pub fn open_login_items() {}
    pub fn launched_at_login() -> bool {
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn c16_u01_the_dock_icon_follows_the_desk_unless_you_keep_it() {
        assert_eq!(policy(Dock::Open, true), Policy::Regular);
        assert_eq!(policy(Dock::Open, false), Policy::Accessory);
        assert_eq!(policy(Dock::Always, true), Policy::Regular);
        assert_eq!(policy(Dock::Always, false), Policy::Regular);
        assert_eq!(Dock::default(), Dock::Open);
        assert_eq!(serde_json::to_string(&Dock::Always).unwrap(), "\"always\"");
        assert_eq!(
            serde_json::from_str::<Dock>("\"open\"").unwrap(),
            Dock::Open
        );
    }

    #[test]
    fn c16_u01_the_count_rides_beside_the_tick_only_while_there_is_no_dock_icon() {
        assert_eq!(count_places(Policy::Regular, Some(3)), (Some(3), None));
        assert_eq!(
            count_places(Policy::Accessory, Some(3)),
            (None, Some("3".into()))
        );
        assert_eq!(count_places(Policy::Accessory, Some(0)), (None, None));
        assert_eq!(count_places(Policy::Regular, None), (None, None));
    }

    #[test]
    fn c16_u02_the_dock_choice_is_kept_and_anything_unreadable_is_the_default() {
        let saved = serde_json::to_vec(&Prefs { dock: Dock::Always }).unwrap();
        assert_eq!(dock_from(&saved), Dock::Always);
        assert_eq!(dock_from(b"{}"), Dock::Open);
        assert_eq!(dock_from(br#"{"dock":"never"}"#), Dock::Open);
        assert_eq!(dock_from(b"{\"do"), Dock::Open);
    }

    #[test]
    fn c16_u03_the_login_item_reads_as_macos_has_it() {
        assert_eq!(login_from_status(0), Login::Off);
        assert_eq!(login_from_status(1), Login::On);
        assert_eq!(login_from_status(2), Login::Approval);
        assert_eq!(login_from_status(3), Login::Off);
        assert_eq!(
            serde_json::to_string(&Login::Approval).unwrap(),
            "\"approval\""
        );
    }
}
