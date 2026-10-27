//! Nudges (working hours): macOS notifications from Tudu, through UserNotifications.
//!
//! One nudge at a time: every nudge is posted under the same identifier, so a new one replaces the one still in
//! Notification Center. It is never time sensitive. Its one action, Pause for today, tells the page; a click on the
//! banner brings the desk forward on Today. Banners show even while Tudu is the frontmost app.
//!
//! With the ad hoc signature macOS never shows the permission prompt: `requestAuthorization` answers "not allowed"
//! until you turn Tudu on in System Settings › Notifications, after which it answers allowed.
//!
//! UserNotifications needs a real app bundle: an unbundled binary (a bare `cargo run`) has no bundle proxy and
//! `UNUserNotificationCenter` aborts the process. So everything here asks `available` first, and answers
//! `unavailable` instead of touching the center.

use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Manager};

use crate::windows;

/// The identifier every nudge is posted under, so a new one replaces the delivered one.
pub const NUDGE_ID: &str = "tudu.nudge";
/// The nudge's category, which carries its action.
pub const CATEGORY: &str = "tudu.nudge";
/// Pause for today.
pub const PAUSE: &str = "pause";
pub const PAUSE_TITLE: &str = "Pause for today";
/// Where a click on the banner takes the desk.
pub const TODAY: &str = "/today";
/// System Settings › Notifications.
pub const SETTINGS: &str = "x-apple.systempreferences:com.apple.Notifications-Settings.extension";

/// What macOS lets Tudu do with notifications.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Permission {
    /// Not asked yet.
    Unknown,
    Allowed,
    Denied,
    /// Not a bundled app: notifications cannot be asked for here.
    Unavailable,
}

/// UNAuthorizationStatus: not determined (0), denied (1), authorized (2), provisional (3), ephemeral (4). A
/// provisional or ephemeral grant still delivers, so it counts as allowed.
pub fn permission_from_status(status: isize) -> Permission {
    match status {
        0 => Permission::Unknown,
        2..=4 => Permission::Allowed,
        _ => Permission::Denied,
    }
}

/// What happened to a nudge, as macOS reported it: the click (`default`), the action (`pause`) or a dismissal.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Answer {
    Open,
    Pause,
    Other(String),
}

/// UNNotificationDefaultActionIdentifier is the click on the banner itself.
pub fn answer_from(action: &str) -> Answer {
    match action {
        "com.apple.UNNotificationDefaultActionIdentifier" => Answer::Open,
        PAUSE => Answer::Pause,
        other => Answer::Other(other.to_string()),
    }
}

/// The last nudge posted and the last answer to one, for the control channel.
#[derive(Default, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Last {
    pub posted: Option<Posted>,
    pub answer: Option<Answer>,
    /// macOS refused the last post (no permission, an error).
    pub error: Option<String>,
}

#[derive(Clone, Serialize)]
pub struct Posted {
    pub id: String,
    pub title: String,
    pub body: String,
}

#[derive(Default)]
pub struct Nudges(pub Mutex<Last>);

/// Whether this process is a bundled app UserNotifications can serve.
pub fn available() -> bool {
    mac::available()
}

/// At launch: the delegate (banners while in front, the click, the action) and the nudge's category.
pub fn start(app: &AppHandle) {
    if !available() {
        eprintln!("tudu: not a bundled app; notifications are unavailable");
        return;
    }
    mac::start(app);
}

/// What macOS answered for a nudge: the click brings the desk forward on Today, Pause for today tells the page.
/// macOS asks the delegate on a queue of its own; the desk is brought forward from the main thread (off it, the
/// window stays hidden).
fn answered(app: &AppHandle, action: &str) {
    let answer = answer_from(action);
    if let Ok(mut l) = app.state::<Nudges>().0.lock() {
        l.answer = Some(answer.clone());
    }
    match answer {
        Answer::Open => {
            let a = app.clone();
            let _ = app.run_on_main_thread(move || windows::show_main(&a, Some(TODAY)));
        }
        Answer::Pause => {
            use tauri::Emitter;
            let _ = app.emit_to(windows::MAIN, "nudges:pause", ());
        }
        Answer::Other(_) => {}
    }
}

/// Ask macOS for notifications (it asks you once; later calls answer what you chose).
pub fn ask() -> Permission {
    if !available() {
        return Permission::Unavailable;
    }
    mac::ask()
}

/// Notifications as macOS has them now.
pub fn status() -> Permission {
    if !available() {
        return Permission::Unavailable;
    }
    mac::status()
}

/// Post a nudge, replacing the one in Notification Center. Err: macOS refused it.
pub fn post(app: &AppHandle, title: &str, body: &str) -> Result<(), String> {
    if !available() {
        return Err("unavailable".into());
    }
    let r = mac::post(title, body);
    if let Ok(mut l) = app.state::<Nudges>().0.lock() {
        l.posted = Some(Posted {
            id: NUDGE_ID.into(),
            title: title.into(),
            body: body.into(),
        });
        l.error = r.as_ref().err().cloned();
    }
    r
}

/// How many of Tudu's notifications are in Notification Center now (one at most), for the control channel.
#[cfg(feature = "control")]
pub fn delivered() -> Option<usize> {
    available().then(mac::delivered).flatten()
}

/// The last nudge and answer, for the control channel.
#[cfg(feature = "control")]
pub fn last(app: &AppHandle) -> Last {
    app.state::<Nudges>()
        .0
        .lock()
        .map(|l| l.clone())
        .unwrap_or_default()
}

/// Ask for notifications; the answer comes once you choose (or at once, if you already have).
#[tauri::command]
pub async fn notify_permission() -> Permission {
    tauri::async_runtime::spawn_blocking(ask)
        .await
        .unwrap_or(Permission::Unavailable)
}

#[tauri::command]
pub async fn notify_status() -> Permission {
    tauri::async_runtime::spawn_blocking(status)
        .await
        .unwrap_or(Permission::Unavailable)
}

#[tauri::command]
pub async fn notify_nudge(app: AppHandle, title: String, body: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || post(&app, &title, &body))
        .await
        .map_err(|e| e.to_string())?
}

/// System Settings › Notifications, for when notifications are off.
#[tauri::command]
pub fn open_notification_settings(app: AppHandle) {
    crate::bridge::open_outside(&app, SETTINGS);
}

#[cfg(target_os = "macos")]
mod mac {
    use std::sync::mpsc::channel;
    use std::time::Duration;

    use block2::RcBlock;
    use objc2::rc::Retained;
    use objc2::runtime::{Bool, NSObject, NSObjectProtocol, ProtocolObject};
    use objc2::{define_class, msg_send, AllocAnyThread, DefinedClass};
    use objc2_foundation::{NSArray, NSBundle, NSError, NSSet, NSString};
    use objc2_user_notifications::{
        UNAuthorizationOptions, UNMutableNotificationContent, UNNotification, UNNotificationAction,
        UNNotificationActionOptions, UNNotificationCategory, UNNotificationCategoryOptions,
        UNNotificationInterruptionLevel, UNNotificationPresentationOptions, UNNotificationRequest,
        UNNotificationResponse, UNNotificationSettings, UNNotificationSound,
        UNUserNotificationCenter, UNUserNotificationCenterDelegate,
    };
    use tauri::AppHandle;

    use super::{permission_from_status, Permission, CATEGORY, NUDGE_ID, PAUSE, PAUSE_TITLE};

    /// How long a question to macOS may take before Tudu stops waiting (the permission prompt waits on you).
    const ASK_WAIT: Duration = Duration::from_secs(120);
    const WAIT: Duration = Duration::from_secs(5);

    /// A bundle identifier alone may not be enough: Tauri can embed Info.plist in the binary, so an unbundled binary
    /// may answer one. The process must also run from inside an `.app`.
    pub fn available() -> bool {
        let bundle = NSBundle::mainBundle();
        bundle.bundleIdentifier().is_some() && bundle.bundlePath().to_string().ends_with(".app")
    }

    fn center() -> Retained<UNUserNotificationCenter> {
        UNUserNotificationCenter::currentNotificationCenter()
    }

    define_class!(
        // The center's delegate: banners while Tudu is in front, and what you did with a nudge.
        #[unsafe(super(NSObject))]
        #[name = "TuduNudgeDelegate"]
        #[ivars = AppHandle]
        struct Delegate;

        unsafe impl NSObjectProtocol for Delegate {}

        unsafe impl UNUserNotificationCenterDelegate for Delegate {
            #[unsafe(method(userNotificationCenter:willPresentNotification:withCompletionHandler:))]
            fn will_present(
                &self,
                _center: &UNUserNotificationCenter,
                _notification: &UNNotification,
                done: &block2::DynBlock<dyn Fn(UNNotificationPresentationOptions)>,
            ) {
                done.call((UNNotificationPresentationOptions::Banner
                    | UNNotificationPresentationOptions::List,));
            }

            #[unsafe(method(userNotificationCenter:didReceiveNotificationResponse:withCompletionHandler:))]
            fn did_receive(
                &self,
                _center: &UNUserNotificationCenter,
                response: &UNNotificationResponse,
                done: &block2::DynBlock<dyn Fn()>,
            ) {
                super::answered(self.ivars(), &response.actionIdentifier().to_string());
                done.call(());
            }
        }
    );

    impl Delegate {
        fn new(app: AppHandle) -> Retained<Self> {
            let this = Self::alloc().set_ivars(app);
            unsafe { msg_send![super(this), init] }
        }
    }

    /// The center holds its delegate weakly; this one is kept for the process's life. Set during launch, so a
    /// click that launched Tudu is still heard.
    pub fn start(app: &AppHandle) {
        let c = center();
        let delegate = Delegate::new(app.clone());
        c.setDelegate(Some(ProtocolObject::from_ref(&*delegate)));
        std::mem::forget(delegate);
        let pause = UNNotificationAction::actionWithIdentifier_title_options(
            &NSString::from_str(PAUSE),
            &NSString::from_str(PAUSE_TITLE),
            UNNotificationActionOptions::empty(),
        );
        let category =
            UNNotificationCategory::categoryWithIdentifier_actions_intentIdentifiers_options(
                &NSString::from_str(CATEGORY),
                &NSArray::from_retained_slice(&[pause]),
                &NSArray::new(),
                UNNotificationCategoryOptions::empty(),
            );
        c.setNotificationCategories(&NSSet::from_retained_slice(&[category]));
    }

    pub fn ask() -> Permission {
        let (tx, rx) = channel();
        let done = RcBlock::new(move |granted: Bool, e: *mut NSError| {
            if let Some(e) = unsafe { e.as_ref() } {
                eprintln!("tudu: notifications: {}", e.localizedDescription());
            }
            let _ = tx.send(granted.as_bool());
        });
        center().requestAuthorizationWithOptions_completionHandler(
            UNAuthorizationOptions::Alert
                | UNAuthorizationOptions::Sound
                | UNAuthorizationOptions::Badge,
            &done,
        );
        match rx.recv_timeout(ASK_WAIT) {
            Ok(true) => Permission::Allowed,
            Ok(false) => Permission::Denied,
            Err(_) => status(),
        }
    }

    pub fn status() -> Permission {
        let (tx, rx) = channel();
        let done = RcBlock::new(move |s: std::ptr::NonNull<UNNotificationSettings>| {
            let _ = tx.send(unsafe { s.as_ref() }.authorizationStatus().0);
        });
        center().getNotificationSettingsWithCompletionHandler(&done);
        rx.recv_timeout(WAIT)
            .map(permission_from_status)
            .unwrap_or(Permission::Unknown)
    }

    pub fn post(title: &str, body: &str) -> Result<(), String> {
        let content = UNMutableNotificationContent::new();
        content.setTitle(&NSString::from_str(title));
        content.setBody(&NSString::from_str(body));
        content.setCategoryIdentifier(&NSString::from_str(CATEGORY));
        content.setSound(Some(&UNNotificationSound::defaultSound()));
        content.setInterruptionLevel(UNNotificationInterruptionLevel::Active);
        let request = UNNotificationRequest::requestWithIdentifier_content_trigger(
            &NSString::from_str(NUDGE_ID),
            &content,
            None,
        );
        let (tx, rx) = channel();
        let done = RcBlock::new(move |e: *mut NSError| {
            let err = unsafe { e.as_ref() }.map(|e| e.localizedDescription().to_string());
            let _ = tx.send(err);
        });
        center().addNotificationRequest_withCompletionHandler(&request, Some(&done));
        match rx.recv_timeout(WAIT) {
            Ok(None) => Ok(()),
            Ok(Some(e)) => Err(e),
            Err(_) => Err("macOS did not answer".into()),
        }
    }

    #[cfg(feature = "control")]
    pub fn delivered() -> Option<usize> {
        let (tx, rx) = channel();
        let done = RcBlock::new(move |list: std::ptr::NonNull<NSArray<UNNotification>>| {
            let _ = tx.send(unsafe { list.as_ref() }.count());
        });
        center().getDeliveredNotificationsWithCompletionHandler(&done);
        rx.recv_timeout(WAIT).ok()
    }
}

#[cfg(not(target_os = "macos"))]
mod mac {
    use super::Permission;
    use tauri::AppHandle;

    pub fn available() -> bool {
        false
    }
    pub fn start(_: &AppHandle) {}
    pub fn ask() -> Permission {
        Permission::Unavailable
    }
    pub fn status() -> Permission {
        Permission::Unavailable
    }
    pub fn post(_: &str, _: &str) -> Result<(), String> {
        Err("unavailable".into())
    }
    #[cfg(feature = "control")]
    pub fn delivered() -> Option<usize> {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wh_u_permission_reads_as_macos_has_it() {
        assert_eq!(permission_from_status(0), Permission::Unknown);
        assert_eq!(permission_from_status(1), Permission::Denied);
        assert_eq!(permission_from_status(2), Permission::Allowed);
        assert_eq!(permission_from_status(3), Permission::Allowed);
        assert_eq!(permission_from_status(4), Permission::Allowed);
        assert_eq!(
            serde_json::to_string(&Permission::Unavailable).unwrap(),
            "\"unavailable\""
        );
    }

    #[test]
    fn wh_u_a_click_opens_today_and_the_action_pauses() {
        assert_eq!(
            answer_from("com.apple.UNNotificationDefaultActionIdentifier"),
            Answer::Open
        );
        assert_eq!(answer_from("pause"), Answer::Pause);
        assert_eq!(
            answer_from("com.apple.UNNotificationDismissActionIdentifier"),
            Answer::Other("com.apple.UNNotificationDismissActionIdentifier".into())
        );
    }

    #[test]
    fn wh_u_every_nudge_shares_one_identifier() {
        assert_eq!(NUDGE_ID, "tudu.nudge");
        assert_eq!(CATEGORY, "tudu.nudge");
    }
}
