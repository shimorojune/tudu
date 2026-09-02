use crate::config::{self, PublicConfig, SaveConfigInput};
use crate::jira::{self, JiraFetchResult, JiraSyncStatus, JiraTestResult};
use crate::scheduler::{self, SchedulerState};
use crate::tasks::{self, Task, TaskInput};
use std::sync::Arc;
use tauri::{AppHandle, Manager, State};

#[tauri::command]
pub fn get_config(app: AppHandle) -> Result<PublicConfig, String> {
    let config = config::load_config(&app)?;
    Ok(config::to_public_config(&config))
}

#[tauri::command]
pub fn save_config(app: AppHandle, input: SaveConfigInput) -> Result<PublicConfig, String> {
    config::save_config(&app, input)
}

#[tauri::command]
pub async fn test_jira_connection(app: AppHandle) -> Result<JiraTestResult, String> {
    jira::test_connection(&app, None).await
}

#[tauri::command]
pub fn list_tasks(app: AppHandle, date: Option<String>) -> Result<Vec<Task>, String> {
    tasks::list_tasks(&app, date)
}

#[tauri::command]
pub fn add_task(app: AppHandle, input: TaskInput) -> Result<Task, String> {
    tasks::add_task(&app, input)
}

#[tauri::command]
pub fn toggle_task(app: AppHandle, id: String) -> Result<Task, String> {
    tasks::toggle_task(&app, id)
}

#[tauri::command]
pub fn delete_task(app: AppHandle, id: String) -> Result<(), String> {
    tasks::delete_task(&app, id)
}

#[tauri::command]
pub fn move_task(app: AppHandle, id: String, date: String) -> Result<Task, String> {
    tasks::move_task(&app, id, date)
}

#[tauri::command]
pub async fn fetch_jira_issues(app: AppHandle, track_changes: Option<bool>) -> Result<JiraFetchResult, String> {
    jira::fetch_issues(&app, track_changes.unwrap_or(false)).await
}

#[tauri::command]
pub fn get_jira_sync_status(app: AppHandle) -> Result<JiraSyncStatus, String> {
    jira::get_sync_status(&app)
}

#[tauri::command]
pub fn clear_jira_pending_changes(app: AppHandle) -> Result<(), String> {
    jira::clear_pending_changes(&app)
}

#[tauri::command]
pub fn hide_avatar(app: AppHandle) -> Result<(), String> {
    scheduler::hide_avatar(&app);
    Ok(())
}

#[tauri::command]
pub fn show_main_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
        scheduler::hide_avatar(&app);
    }
    Ok(())
}

#[tauri::command]
pub fn trigger_reminder(app: AppHandle) -> Result<(), String> {
    scheduler::trigger_manual_reminder(&app);
    Ok(())
}

#[tauri::command]
pub async fn trigger_jira_sync(
    app: AppHandle,
    state: State<'_, Arc<SchedulerState>>,
) -> Result<JiraFetchResult, String> {
    let result = scheduler::trigger_manual_jira_sync(&app).await?;
    let has_changes = !result.changes.new.is_empty() || !result.changes.updated.is_empty();
    *state.last_jira_had_changes.lock() = has_changes;
    Ok(result)
}

#[tauri::command]
pub fn get_window_label(app: AppHandle) -> Result<String, String> {
    app.get_webview_window("main")
        .map(|_| "main".to_string())
        .or_else(|| app.get_webview_window("avatar").map(|_| "avatar".to_string()))
        .ok_or_else(|| "unknown".to_string())
}
