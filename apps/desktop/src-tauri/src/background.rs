//! Tudu in the background (chunk 16): closing the desk keeps Tudu running in the menu bar, out of the Dock unless
//! you keep it there; Tudu stays awake while nobody looks at it; and it can open at login, straight into the menu
//! bar.
//!
//! The Dock icon follows the desk: a regular app while the desk is open (or always, if you chose that in Settings ›
//! This Mac), an accessory app (no Dock icon, not in ⌘Tab) once it is closed. Beside the tick: how many of today's
//! tasks are left, with a dot while something is new in the Inbox; the Dock's badge, while there is a Dock icon, is
//! the Inbox count.
//!
//! The tick in a crowded menu bar: macOS has no priority for an app's icon and hides them from the left when the bar
//! is full. On a first launch Tudu takes the place macOS would save for a ⌘-drag to the right end of the apps' icons;
//! once there is a saved place (yours or that seed) it is never touched again. If macOS hides the tick anyway, Tudu
//! keeps its Dock icon while it runs, so it is never out of reach.

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};

use crate::look::Look;
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

/// `tick_hidden`: macOS is not showing the tick (a full menu bar), so the Dock icon is the way back in.
pub fn policy(dock: Dock, desk_open: bool, tick_hidden: bool) -> Policy {
    if desk_open || dock == Dock::Always || tick_hidden {
        Policy::Regular
    } else {
        Policy::Accessory
    }
}

/// What the tick and the Dock icon show.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Places {
    /// The Dock's badge: the Inbox count, while there is a Dock icon.
    pub badge: Option<i64>,
    /// Beside the tick: today's tasks left, with or without a Dock icon.
    pub title: Option<String>,
    /// The dot on the tick: something is new in the Inbox.
    pub dot: bool,
}

pub fn tick_places(policy: Policy, inbox: Option<i64>, left: Option<i64>) -> Places {
    let inbox = inbox.filter(|n| *n > 0);
    Places {
        badge: match policy {
            Policy::Regular => inbox,
            Policy::Accessory => None,
        },
        title: tray_title(left),
        dot: inbox.is_some(),
    }
}

/// Today as the page counts it: tasks left, out of how many are planned.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Today {
    pub left: i64,
    pub total: i64,
}

/// The tick's tooltip says what the number and the dot mean; each part only when it is true.
pub fn tick_tooltip(name: &str, today: Option<Today>, inbox: Option<i64>) -> String {
    let mut parts = vec![name.to_string()];
    match today {
        Some(t) if t.total <= 0 => parts.push("Nothing planned today".into()),
        Some(t) if t.left <= 0 => parts.push("All done for today".into()),
        Some(t) => parts.push(format!("{} left today", t.left)),
        None => {}
    }
    if let Some(n) = inbox.filter(|n| *n > 0) {
        parts.push(format!("{n} new in your Inbox"));
    }
    parts.join(" · ")
}

/// The count beside the tick stops at 99+, so the tick stays narrow.
pub fn tray_title(count: Option<i64>) -> Option<String> {
    match count.filter(|n| *n > 0)? {
        n if n > 99 => Some("99+".into()),
        n => Some(n.to_string()),
    }
}

/// Where macOS keeps the tick's place: the app's defaults, under the status item's autosave name. Tudu's tray sets
/// none, so macOS names the first (and only) item `Item-0`.
pub const TRAY_AUTOSAVE: &str = "Item-0";
pub const TRAY_POSITION_KEY: &str = "NSStatusItem Preferred Position Item-0";
/// The seed, in points from the right edge of the screen: as far right as macOS lets an app's icon go, which is just
/// left of its own icons.
pub const TRAY_SEED: f64 = 20.0;

/// What to write before the tick appears: the seed when macOS has no place for it yet, nothing when it has one (a
/// drag of yours, or an earlier seed).
pub fn tray_place(stored: Option<f64>) -> Option<f64> {
    match stored {
        Some(_) => None,
        None => Some(TRAY_SEED),
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
    /// What the tick carries beside it now (today's tasks left).
    pub tray_title: Mutex<Option<String>>,
    /// Whether the tick now has its Inbox dot.
    pub tray_dot: Mutex<bool>,
    /// The tick's tooltip now (None: still the name it was built with).
    pub tray_tooltip: Mutex<Option<String>>,
    /// What macOS was last told, so a badge change that leaves the policy as it was does not tell it again.
    pub applied: Mutex<Option<Policy>>,
    /// macOS is not drawing the tick (the menu bar is full).
    pub tick_hidden: AtomicBool,
    /// Tudu Test: what the tests say about the tick, in place of what macOS says.
    #[cfg(feature = "control")]
    pub tick_override: Mutex<Option<bool>>,
}

/// This Mac's file: the Dock choice and the look (theme and Less motion).
#[derive(Serialize, Deserialize, Default, Clone, Copy, Debug, PartialEq)]
struct Prefs {
    #[serde(default)]
    dock: Dock,
    #[serde(default)]
    look: Look,
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

fn read_prefs(app: &AppHandle) -> Prefs {
    prefs_path(app)
        .and_then(|p| std::fs::read(p).ok())
        .map(|b| prefs_from(&b))
        .unwrap_or_default()
}

fn load(app: &AppHandle) -> Dock {
    read_prefs(app).dock
}

/// The saved look, for the windows at launch.
pub fn load_look(app: &AppHandle) -> Look {
    read_prefs(app).look
}

/// The saved choices, each on its own: one unreadable (an old "never", a torn write) is its default and leaves the
/// others as they were.
fn prefs_from(bytes: &[u8]) -> Prefs {
    let Ok(v) = serde_json::from_slice::<serde_json::Value>(bytes) else {
        return Prefs::default();
    };
    let field = |k: &str| v.get(k).cloned().unwrap_or(serde_json::Value::Null);
    Prefs {
        dock: serde_json::from_value(field("dock")).unwrap_or_default(),
        look: serde_json::from_value(field("look")).unwrap_or_default(),
    }
}

/// The saved Dock choice.
fn dock_from(bytes: &[u8]) -> Dock {
    prefs_from(bytes).dock
}

fn write_prefs(app: &AppHandle, prefs: Prefs) {
    let Some(p) = prefs_path(app) else { return };
    if let Some(dir) = p.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    if let Ok(text) = serde_json::to_vec(&prefs) {
        let _ = std::fs::write(p, text);
    }
}

fn save(app: &AppHandle, dock: Dock) {
    write_prefs(app, Prefs { dock, ..read_prefs(app) });
}

/// Keep the look beside the Dock choice.
pub fn save_look(app: &AppHandle, look: Look) {
    write_prefs(app, Prefs { look, ..read_prefs(app) });
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
        tray_dot: Mutex::new(false),
        tray_tooltip: Mutex::new(None),
        applied: Mutex::new(None),
        tick_hidden: AtomicBool::new(false),
        #[cfg(feature = "control")]
        tick_override: Mutex::new(None),
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
    policy(
        dock,
        b.desk_open.load(Ordering::SeqCst),
        b.tick_hidden.load(Ordering::SeqCst),
    )
}

/// Before the tick is built: seed its place if macOS has none (see `tray_place`).
pub fn seed_tray_place() {
    if let Some(at) = tray_place(mac::tray_position()) {
        mac::set_tray_position(at);
    }
}

/// The tick's place as macOS keeps it, for the control channel.
#[cfg(feature = "control")]
pub fn tray_position() -> Option<f64> {
    mac::tray_position()
}

/// The tick's autosave name as macOS has it, for the control channel.
#[cfg(feature = "control")]
pub fn tray_autosave(app: &AppHandle) -> Option<String> {
    mac::tray_autosave(app)
}

/// Every two seconds: is macOS drawing the tick? Two hidden answers in a row count, so a passing moment (a space
/// switching, the screen locking) does not flip the Dock icon. Only a change reaches `apply`.
pub fn watch_tick(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || {
        let mut hidden_runs = 0u8;
        loop {
            std::thread::sleep(std::time::Duration::from_secs(2));
            // Asked from here: macOS is asked on the main thread, and this waits for its answer.
            let seen = mac::tick_hidden(&app);
            #[cfg(feature = "control")]
            let seen = app
                .state::<Background>()
                .tick_override
                .lock()
                .ok()
                .and_then(|o| *o)
                .or(seen);
            let Some(hidden) = seen else { continue };
            hidden_runs = if hidden {
                hidden_runs.saturating_add(1)
            } else {
                0
            };
            tick(&app, hidden_runs >= 2);
        }
    });
}

/// The tick shown or hidden, applied only when it changes.
pub fn tick(app: &AppHandle, hidden: bool) {
    let b = app.state::<Background>();
    if b.tick_hidden.swap(hidden, Ordering::SeqCst) != hidden {
        apply(app);
    }
}

/// Tell macOS what the app is now, and put today's count and the Inbox where they can be seen.
pub fn apply(app: &AppHandle) {
    let b = app.state::<Background>();
    let p = current_policy(app);
    // Only a real change reaches macOS: the page reports its count often, and a status item or an activation
    // policy set again for nothing can disturb the window that has the focus.
    if let Ok(mut last) = b.applied.lock() {
        if *last != Some(p) {
            mac::set_policy(app, p);
            *last = Some(p);
        }
    }
    let a = app.state::<App>();
    let (inbox, today) = a
        .seen
        .lock()
        .map(|s| (s.badge, s.today))
        .unwrap_or_default();
    let places = tick_places(p, inbox, today.map(|t| t.left));
    if let Some(w) = app.get_webview_window(windows::MAIN) {
        let _ = w.set_badge_count(places.badge);
    }
    let tray = app.tray_by_id("tray");
    if let Ok(mut t) = b.tray_title.lock() {
        if *t != places.title {
            if let Some(tray) = &tray {
                let _ = tray.set_title(places.title.as_deref());
            }
            *t = places.title;
        }
    };
    if let Ok(mut d) = b.tray_dot.lock() {
        if *d != places.dot {
            if let Some(tray) = &tray {
                // A new image can drop the template flag; set it again so macOS keeps inking it.
                if let Ok(icon) = crate::tick_icon(places.dot) {
                    let _ = tray.set_icon(Some(icon));
                    let _ = tray.set_icon_as_template(true);
                }
            }
            *d = places.dot;
        }
    };
    let tip = tick_tooltip(a.track.name(), today, inbox);
    if let Ok(mut t) = b.tray_tooltip.lock() {
        if t.as_deref() != Some(tip.as_str()) {
            if let Some(tray) = &tray {
                let _ = tray.set_tooltip(Some(tip.as_str()));
            }
            *t = Some(tip);
        }
    };
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
    use objc2_app_kit::{NSApplication, NSMenu, NSWindowOcclusionState};
    use objc2_foundation::{
        MainThreadMarker, NSActivityOptions, NSAppleEventDescriptor, NSAppleEventManager,
        NSProcessInfo, NSString, NSUserDefaults,
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

    fn defaults() -> Retained<NSUserDefaults> {
        NSUserDefaults::standardUserDefaults()
    }

    pub fn tray_position() -> Option<f64> {
        let key = NSString::from_str(super::TRAY_POSITION_KEY);
        let d = defaults();
        d.objectForKey(&key).map(|_| d.doubleForKey(&key))
    }

    pub fn set_tray_position(at: f64) {
        defaults().setDouble_forKey(at, &NSString::from_str(super::TRAY_POSITION_KEY));
    }

    #[cfg(feature = "control")]
    pub fn tray_autosave(app: &AppHandle) -> Option<String> {
        let tray = app.tray_by_id("tray")?;
        tray.with_inner_tray_icon(|t| {
            t.ns_status_item()
                .map(|item| item.autosaveName().to_string())
        })
        .ok()
        .flatten()
    }

    /// Whether macOS is drawing the tick: its button's window not on screen while the menu bar itself is (a full
    /// screen app or an auto-hiding menu bar hides every icon, and that is not ours to answer). None: no answer.
    /// Called off the main thread; the tray runs the question there.
    pub fn tick_hidden(app: &AppHandle) -> Option<bool> {
        let tray = app.tray_by_id("tray")?;
        tray.with_inner_tray_icon(|t| {
            let mtm = MainThreadMarker::new()?;
            if !NSMenu::menuBarVisible(mtm) {
                return None;
            }
            let window = t.ns_status_item()?.button(mtm)?.window()?;
            Some(
                !window
                    .occlusionState()
                    .contains(NSWindowOcclusionState::Visible),
            )
        })
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
    pub fn tray_position() -> Option<f64> {
        None
    }
    pub fn set_tray_position(_: f64) {}
    #[cfg(feature = "control")]
    pub fn tray_autosave(_: &AppHandle) -> Option<String> {
        None
    }
    pub fn tick_hidden(_: &AppHandle) -> Option<bool> {
        None
    }
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
        assert_eq!(policy(Dock::Open, true, false), Policy::Regular);
        assert_eq!(policy(Dock::Open, false, false), Policy::Accessory);
        assert_eq!(policy(Dock::Always, true, false), Policy::Regular);
        assert_eq!(policy(Dock::Always, false, false), Policy::Regular);
        assert_eq!(Dock::default(), Dock::Open);
        assert_eq!(serde_json::to_string(&Dock::Always).unwrap(), "\"always\"");
        assert_eq!(
            serde_json::from_str::<Dock>("\"open\"").unwrap(),
            Dock::Open
        );
    }

    fn places(badge: Option<i64>, title: Option<&str>, dot: bool) -> Places {
        Places {
            badge,
            title: title.map(String::from),
            dot,
        }
    }

    #[test]
    fn mc_r01_today_beside_the_tick_either_way_the_inbox_on_the_badge_and_the_dot() {
        assert_eq!(
            tick_places(Policy::Regular, Some(2), Some(3)),
            places(Some(2), Some("3"), true)
        );
        assert_eq!(
            tick_places(Policy::Accessory, Some(2), Some(3)),
            places(None, Some("3"), true)
        );
        assert_eq!(
            tick_places(Policy::Accessory, Some(0), Some(0)),
            places(None, None, false)
        );
        assert_eq!(
            tick_places(Policy::Regular, None, None),
            places(None, None, false)
        );
    }

    #[test]
    fn mc_r03_the_tooltip_says_what_the_number_and_the_dot_mean() {
        let t = |left, total| Some(Today { left, total });
        assert_eq!(
            tick_tooltip("Tudu", t(3, 5), Some(2)),
            "Tudu · 3 left today · 2 new in your Inbox"
        );
        assert_eq!(
            tick_tooltip("Tudu", t(0, 4), Some(0)),
            "Tudu · All done for today"
        );
        assert_eq!(
            tick_tooltip("Tudu", t(0, 0), None),
            "Tudu · Nothing planned today"
        );
        assert_eq!(tick_tooltip("Tudu", None, None), "Tudu");
        assert_eq!(
            tick_tooltip("Tudu Staging", t(1, 1), Some(1)),
            "Tudu Staging · 1 left today · 1 new in your Inbox"
        );
        assert_eq!(
            tick_tooltip("Tudu", None, Some(4)),
            "Tudu · 4 new in your Inbox"
        );
    }

    #[test]
    fn mb_u01_the_count_beside_the_tick_stops_at_99_plus() {
        assert_eq!(tray_title(None), None);
        assert_eq!(tray_title(Some(0)), None);
        assert_eq!(tray_title(Some(-2)), None);
        assert_eq!(tray_title(Some(7)), Some("7".into()));
        assert_eq!(tray_title(Some(99)), Some("99".into()));
        assert_eq!(tray_title(Some(100)), Some("99+".into()));
        assert_eq!(tray_title(Some(12345)), Some("99+".into()));
    }

    #[test]
    fn mc_r02_only_the_tick_is_capped_the_dock_badge_keeps_the_number() {
        assert_eq!(
            tick_places(Policy::Accessory, Some(150), Some(120)),
            places(None, Some("99+"), true)
        );
        assert_eq!(
            tick_places(Policy::Regular, Some(150), Some(120)),
            places(Some(150), Some("99+"), true)
        );
    }

    #[test]
    fn mb_u03_the_place_is_seeded_once_and_a_saved_place_is_left_alone() {
        assert_eq!(tray_place(None), Some(TRAY_SEED));
        assert_eq!(tray_place(Some(TRAY_SEED)), None);
        assert_eq!(tray_place(Some(0.0)), None);
        assert_eq!(tray_place(Some(1400.0)), None);
        assert!(TRAY_POSITION_KEY.ends_with(TRAY_AUTOSAVE));
    }

    #[test]
    fn mb_u04_a_hidden_tick_keeps_the_dock_icon() {
        assert_eq!(policy(Dock::Open, false, false), Policy::Accessory);
        assert_eq!(policy(Dock::Open, false, true), Policy::Regular);
        assert_eq!(policy(Dock::Open, true, true), Policy::Regular);
        assert_eq!(policy(Dock::Always, false, true), Policy::Regular);
        assert_eq!(policy(Dock::Always, false, false), Policy::Regular);
    }

    #[test]
    fn c16_u02_the_dock_choice_is_kept_and_anything_unreadable_is_the_default() {
        let saved = serde_json::to_vec(&Prefs {
            dock: Dock::Always,
            ..Prefs::default()
        })
        .unwrap();
        assert_eq!(dock_from(&saved), Dock::Always);
        assert_eq!(dock_from(b"{}"), Dock::Open);
        assert_eq!(dock_from(br#"{"dock":"never"}"#), Dock::Open);
        assert_eq!(dock_from(b"{\"do"), Dock::Open);
    }

    #[test]
    fn c11_u17_the_look_is_kept_beside_the_dock_and_an_old_file_still_reads() {
        use crate::look::ThemeChoice;
        let look = Look {
            theme: ThemeChoice::Light,
            less_motion: true,
        };
        let saved = serde_json::to_vec(&Prefs {
            dock: Dock::Always,
            look,
        })
        .unwrap();
        assert_eq!(
            prefs_from(&saved),
            Prefs {
                dock: Dock::Always,
                look
            }
        );
        // A file from before the look: its Dock choice holds, the look is System with motion.
        assert_eq!(
            prefs_from(br#"{"dock":"always"}"#),
            Prefs {
                dock: Dock::Always,
                look: Look::default()
            }
        );
        assert_eq!(Look::default().theme, ThemeChoice::System);
        assert!(!Look::default().less_motion);
        // An unknown theme is System; one bad field leaves the other alone.
        assert_eq!(
            prefs_from(br#"{"dock":"always","look":{"theme":"sepia","lessMotion":true}}"#).look,
            Look {
                theme: ThemeChoice::System,
                less_motion: true
            }
        );
        assert_eq!(
            prefs_from(br#"{"dock":"never","look":{"theme":"dark"}}"#),
            Prefs {
                dock: Dock::Open,
                look: Look {
                    theme: ThemeChoice::Dark,
                    less_motion: false
                }
            }
        );
        // A torn file is all defaults.
        assert_eq!(prefs_from(b"{\"look"), Prefs::default());
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
