use crate::config;
use crate::jira;
use crate::tasks;
use parking_lot::Mutex;
use serde::Serialize;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_positioner::{Position, WindowExt};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AvatarPayload {
    pub message: String,
    pub kind: String,
}

pub struct SchedulerState {
    pub last_jira_had_changes: Arc<Mutex<bool>>,
}

impl SchedulerState {
    pub fn new() -> Self {
        Self {
            last_jira_had_changes: Arc::new(Mutex::new(false)),
        }
    }
}

pub fn start_scheduler(app: AppHandle, state: Arc<SchedulerState>) {
    let jira_app = app.clone();
    let jira_state = state.clone();
    tauri::async_runtime::spawn(async move {
        loop {
            let poll_minutes = config::load_config(&jira_app)
                .map(|c| c.jira_poll_interval_minutes)
                .unwrap_or(config::DEFAULT_JIRA_POLL_INTERVAL_MINUTES);
            tokio::time::sleep(std::time::Duration::from_secs(poll_minutes as u64 * 60)).await;

            match jira::fetch_issues(&jira_app, true).await {
                Ok(result) => {
                    let has_changes = !result.changes.new.is_empty() || !result.changes.updated.is_empty();
                    *jira_state.last_jira_had_changes.lock() = has_changes;

                    let _ = jira_app.emit("jira-updated", &result);

                    if has_changes {
                        let count = result.changes.new.len() + result.changes.updated.len();
                        let message = if count == 1 {
                            "1 JIRA update".to_string()
                        } else {
                            format!("{count} JIRA updates")
                        };
                        show_avatar(&jira_app, AvatarPayload {
                            message,
                            kind: "jira".to_string(),
                        });
                        send_notification(&jira_app, "Tudu", "You have new JIRA updates");
                    }
                }
                Err(err) => {
                    let _ = jira_app.emit("jira-error", err);
                }
            }
        }
    });

    let reminder_app = app.clone();
    let reminder_state = state;
    tauri::async_runtime::spawn(async move {
        loop {
            let checkin_minutes = config::load_config(&reminder_app)
                .map(|c| c.checkin_interval_minutes)
                .unwrap_or(config::DEFAULT_CHECKIN_INTERVAL_MINUTES);
            tokio::time::sleep(std::time::Duration::from_secs(checkin_minutes as u64 * 60)).await;

            if *reminder_state.last_jira_had_changes.lock() {
                *reminder_state.last_jira_had_changes.lock() = false;
                continue;
            }

            let today = tasks::today_str();
            let personal_open = tasks::count_open_tasks_for_date(&reminder_app, &today).unwrap_or(0);
            let jira_open = match jira::fetch_issues(&reminder_app, false).await {
                Ok(result) => result.issues.len() as u32,
                Err(_) => 0,
            };

            let total = personal_open + jira_open;
            if total == 0 {
                continue;
            }

            let message = if total == 1 {
                "1 task waiting".to_string()
            } else {
                format!("{total} tasks waiting")
            };

            show_avatar(&reminder_app, AvatarPayload {
                message: message.clone(),
                kind: "reminder".to_string(),
            });
            send_notification(&reminder_app, "Tudu", &message);
            let _ = reminder_app.emit("reminder-triggered", ());
        }
    });
}

pub fn show_avatar(app: &AppHandle, payload: AvatarPayload) {
    if let Some(window) = app.get_webview_window("avatar") {
        let _ = window.emit("avatar-show", &payload);
        let _ = window.move_window(Position::BottomRight);
        let _ = window.show();
    }
}

pub fn hide_avatar(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("avatar") {
        let _ = window.hide();
    }
}

pub fn send_notification(app: &AppHandle, title: &str, body: &str) {
    let _ = app
        .notification()
        .builder()
        .title(title)
        .body(body)
        .show();
}

pub async fn trigger_manual_jira_sync(app: &AppHandle) -> Result<jira::JiraFetchResult, String> {
    jira::fetch_issues(app, true).await
}

pub fn trigger_manual_reminder(app: &AppHandle) {
    let today = tasks::today_str();
    let personal_open = tasks::count_open_tasks_for_date(app, &today).unwrap_or(0);
    let message = if personal_open == 0 {
        "Time to check in".to_string()
    } else if personal_open == 1 {
        "1 task waiting".to_string()
    } else {
        format!("{personal_open} tasks waiting")
    };

    show_avatar(app, AvatarPayload {
        message,
        kind: "reminder".to_string(),
    });
    send_notification(app, "Tudu", "Time to check in on your tasks");
    let _ = app.emit("reminder-triggered", ());
}
