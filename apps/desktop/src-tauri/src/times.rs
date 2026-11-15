//! Times on Planned and Due (docs/plans/task-times.md): macOS notifications at a task's planned start and at its
//! due time.
//!
//! The desk's page works out the next 48 hours of starts and due times and sends the whole set; this replaces every
//! pending time notification with it. They are scheduled with macOS, so they come while Tudu's window is closed.
//! Each is posted as `tudu.time.<taskId>.<start|due>`, so a click (or Cross off, or Open) knows its task. Nudges are
//! posted with no trigger and are never pending, so clearing the pending set touches only these.

use serde::Deserialize;
use tauri::{AppHandle, Emitter};

use crate::{nudges, windows};

pub const PREFIX: &str = "tudu.time.";
/// The time notifications' category, with Cross off and Open.
pub const CATEGORY: &str = "tudu.time";
pub const CROSS: &str = "cross";
pub const CROSS_TITLE: &str = "Cross off";
pub const OPEN: &str = "open";
pub const OPEN_TITLE: &str = "Open";
/// macOS keeps at most 64 pending; the nearest 60 go.
pub const MAX: usize = 60;

/// One time to notify at, from the page.
#[derive(Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TimeItem {
    pub task_id: String,
    /// `start` (the planned start) or `due`.
    pub kind: String,
    pub title: String,
    pub body: String,
    /// When, in ms since the epoch.
    pub at_ms: i64,
}

pub fn identifier(task_id: &str, kind: &str) -> String {
    format!("{PREFIX}{task_id}.{kind}")
}

/// The task a time notification is for; None for any other notification.
pub fn task_of(identifier: &str) -> Option<&str> {
    let rest = identifier.strip_prefix(PREFIX)?;
    let (id, kind) = rest.rsplit_once('.')?;
    (matches!(kind, "start" | "due") && !id.is_empty()).then_some(id)
}

/// What is scheduled: the times still ahead, nearest first, at most MAX, one per identifier, each with its seconds
/// from now.
pub fn plan(items: &[TimeItem], now_ms: i64) -> Vec<(String, &TimeItem, f64)> {
    let mut ahead: Vec<&TimeItem> = items
        .iter()
        .filter(|i| i.at_ms > now_ms && matches!(i.kind.as_str(), "start" | "due"))
        .collect();
    ahead.sort_by_key(|i| i.at_ms);
    let mut seen = std::collections::HashSet::new();
    ahead
        .into_iter()
        .filter(|i| seen.insert(identifier(&i.task_id, &i.kind)))
        .take(MAX)
        .map(|i| {
            (
                identifier(&i.task_id, &i.kind),
                i,
                (i.at_ms - now_ms) as f64 / 1000.0,
            )
        })
        .collect()
}

/// What you did with a time notification: Cross off tells the page (the desk keeps running hidden); the click and
/// Open bring the desk forward on the task. False when the notification is not a time one.
pub fn answered(app: &AppHandle, identifier: &str, action: &str) -> bool {
    let Some(id) = task_of(identifier) else {
        return false;
    };
    let id = id.to_string();
    if action == CROSS {
        let _ = app.emit_to(windows::MAIN, "times:cross", id);
        return true;
    }
    if action == OPEN || action == "com.apple.UNNotificationDefaultActionIdentifier" {
        let a = app.clone();
        let _ = app.run_on_main_thread(move || {
            windows::show_main(&a, None);
            let _ = a.emit_to(windows::MAIN, "times:open", id);
        });
    }
    true
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Replace the pending time notifications with these. Answers how many were scheduled.
pub fn schedule(items: &[TimeItem]) -> Result<usize, String> {
    if !nudges::available() {
        return Err("unavailable".into());
    }
    let list: Vec<(String, String, String, f64)> = plan(items, now_ms())
        .into_iter()
        .map(|(id, i, s)| (id, i.title.clone(), i.body.clone(), s))
        .collect();
    let n = list.len();
    mac::schedule(list)?;
    Ok(n)
}

#[tauri::command]
pub async fn schedule_times(items: Vec<TimeItem>) -> Result<usize, String> {
    tauri::async_runtime::spawn_blocking(move || schedule(&items))
        .await
        .map_err(|e| e.to_string())?
}

/// The switch off: no time notifications are left pending.
#[tauri::command]
pub async fn cancel_times() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(|| schedule(&[]).map(|_| ()))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(target_os = "macos")]
pub mod mac {
    use objc2::rc::Retained;
    use objc2_foundation::NSString;
    use objc2_user_notifications::{
        UNMutableNotificationContent, UNNotificationAction, UNNotificationActionOptions,
        UNNotificationCategory, UNNotificationCategoryOptions, UNNotificationInterruptionLevel,
        UNNotificationRequest, UNNotificationSound, UNTimeIntervalNotificationTrigger,
        UNUserNotificationCenter,
    };

    use super::{CATEGORY, CROSS, CROSS_TITLE, OPEN, OPEN_TITLE};

    /// Cross off (in the background) and Open (brings Tudu forward).
    pub fn category() -> Retained<UNNotificationCategory> {
        let cross = UNNotificationAction::actionWithIdentifier_title_options(
            &NSString::from_str(CROSS),
            &NSString::from_str(CROSS_TITLE),
            UNNotificationActionOptions::empty(),
        );
        let open = UNNotificationAction::actionWithIdentifier_title_options(
            &NSString::from_str(OPEN),
            &NSString::from_str(OPEN_TITLE),
            UNNotificationActionOptions::Foreground,
        );
        UNNotificationCategory::categoryWithIdentifier_actions_intentIdentifiers_options(
            &NSString::from_str(CATEGORY),
            &objc2_foundation::NSArray::from_retained_slice(&[cross, open]),
            &objc2_foundation::NSArray::new(),
            UNNotificationCategoryOptions::empty(),
        )
    }

    pub fn schedule(list: Vec<(String, String, String, f64)>) -> Result<(), String> {
        let c = UNUserNotificationCenter::currentNotificationCenter();
        c.removeAllPendingNotificationRequests();
        for (id, title, body, secs) in list {
            let content = UNMutableNotificationContent::new();
            content.setTitle(&NSString::from_str(&title));
            content.setBody(&NSString::from_str(&body));
            content.setCategoryIdentifier(&NSString::from_str(CATEGORY));
            content.setSound(Some(&UNNotificationSound::defaultSound()));
            content.setInterruptionLevel(UNNotificationInterruptionLevel::Active);
            let trigger = UNTimeIntervalNotificationTrigger::triggerWithTimeInterval_repeats(
                secs.max(1.0),
                false,
            );
            let request = UNNotificationRequest::requestWithIdentifier_content_trigger(
                &NSString::from_str(&id),
                &content,
                Some(&**trigger),
            );
            c.addNotificationRequest_withCompletionHandler(&request, None);
        }
        Ok(())
    }
}

#[cfg(not(target_os = "macos"))]
pub mod mac {
    pub fn schedule(_: Vec<(String, String, String, f64)>) -> Result<(), String> {
        Err("unavailable".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn item(id: &str, kind: &str, at_ms: i64) -> TimeItem {
        TimeItem {
            task_id: id.into(),
            kind: kind.into(),
            title: format!("{kind} {id}"),
            body: String::new(),
            at_ms,
        }
    }

    #[test]
    fn tt_d01_identifiers_are_stable_and_name_their_task() {
        assert_eq!(identifier("t-1", "start"), "tudu.time.t-1.start");
        assert_eq!(task_of("tudu.time.t-1.start"), Some("t-1"));
        assert_eq!(task_of("tudu.time.a.b.due"), Some("a.b"));
        assert_eq!(task_of("tudu.time.t-1.other"), None);
        assert_eq!(task_of("tudu.nudge"), None);
    }

    #[test]
    fn tt_d01_plan_keeps_what_is_ahead_nearest_first_at_most_sixty() {
        let mut items: Vec<TimeItem> = (0..70)
            .map(|n| item(&format!("t{n}"), "due", 1_000 + n * 1_000))
            .collect();
        items.push(item("gone", "start", 500));
        items.push(item("t5", "due", 99_999)); // the same identifier again: the nearest one stays
        let p = plan(&items, 900);
        assert_eq!(p.len(), MAX);
        assert_eq!(p[0].0, "tudu.time.t0.due");
        assert!((p[0].2 - 0.1).abs() < 1e-9);
        assert!(p.iter().all(|(id, _, _)| id != "tudu.time.gone.start"));
        assert_eq!(
            p.iter()
                .filter(|(id, _, _)| id == "tudu.time.t5.due")
                .count(),
            1
        );
    }

    #[test]
    fn tt_d01_items_read_from_the_page() {
        let i: TimeItem = serde_json::from_str(
            r#"{"taskId":"t","kind":"start","title":"Starts now: X","body":"3 to 4 PM","atMs":5}"#,
        )
        .unwrap();
        assert_eq!(
            i,
            TimeItem {
                task_id: "t".into(),
                kind: "start".into(),
                title: "Starts now: X".into(),
                body: "3 to 4 PM".into(),
                at_ms: 5
            }
        );
    }
}
