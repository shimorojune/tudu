use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::Manager;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    pub text: String,
    pub done: bool,
    pub date: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_id: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct TaskStore {
    tasks: Vec<Task>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskInput {
    pub text: String,
    pub date: String,
    pub parent_id: Option<String>,
}

fn tasks_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|dir| dir.join("tasks.json"))
        .map_err(|e| e.to_string())
}

fn read_store(app: &tauri::AppHandle) -> Result<TaskStore, String> {
    let path = tasks_path(app)?;
    if !path.exists() {
        return Ok(TaskStore { tasks: vec![] });
    }
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&content).map_err(|e| e.to_string())
}

fn write_store(app: &tauri::AppHandle, store: &TaskStore) -> Result<(), String> {
    let path = tasks_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let content = serde_json::to_string_pretty(store).map_err(|e| e.to_string())?;
    fs::write(&path, content).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn list_tasks(app: &tauri::AppHandle, date: Option<String>) -> Result<Vec<Task>, String> {
    let store = read_store(app)?;
    let tasks = if let Some(date) = date {
        store
            .tasks
            .into_iter()
            .filter(|task| task.date == date)
            .collect()
    } else {
        store.tasks
    };
    Ok(tasks)
}

pub fn add_task(app: &tauri::AppHandle, input: TaskInput) -> Result<Task, String> {
    let mut store = read_store(app)?;

    if let Some(parent_id) = &input.parent_id {
        let parent_exists = store.tasks.iter().any(|t| t.id == *parent_id && t.parent_id.is_none());
        if !parent_exists {
            return Err("Parent task not found".to_string());
        }
    }

    let task = Task {
        id: Uuid::new_v4().to_string(),
        text: input.text.trim().to_string(),
        done: false,
        date: input.date,
        parent_id: input.parent_id,
        created_at: Utc::now().to_rfc3339(),
    };

    if task.text.is_empty() {
        return Err("Task text cannot be empty".to_string());
    }

    store.tasks.push(task.clone());
    write_store(app, &store)?;
    Ok(task)
}

pub fn toggle_task(app: &tauri::AppHandle, id: String) -> Result<Task, String> {
    let mut store = read_store(app)?;
    let parent_id = store
        .tasks
        .iter()
        .find(|t| t.id == id)
        .ok_or_else(|| "Task not found".to_string())?
        .parent_id
        .is_none()
        .then(|| id.clone());

    let task = store
        .tasks
        .iter_mut()
        .find(|t| t.id == id)
        .ok_or_else(|| "Task not found".to_string())?;

    task.done = !task.done;
    let done = task.done;
    let updated = task.clone();

    if let Some(parent_id) = parent_id {
        if done {
            for child in store
                .tasks
                .iter_mut()
                .filter(|t| t.parent_id.as_deref() == Some(parent_id.as_str()))
            {
                child.done = true;
            }
        }
    }

    write_store(app, &store)?;
    Ok(updated)
}

pub fn delete_task(app: &tauri::AppHandle, id: String) -> Result<(), String> {
    let mut store = read_store(app)?;
    store.tasks.retain(|t| t.id != id && t.parent_id.as_deref() != Some(id.as_str()));
    write_store(app, &store)
}

pub fn move_task(app: &tauri::AppHandle, id: String, date: String) -> Result<Task, String> {
    let mut store = read_store(app)?;
    let task = store
        .tasks
        .iter_mut()
        .find(|t| t.id == id)
        .ok_or_else(|| "Task not found".to_string())?;

    task.date = date.clone();
    let parent_id = if task.parent_id.is_none() {
        Some(task.id.clone())
    } else {
        None
    };
    let updated = task.clone();

    if let Some(parent_id) = parent_id {
        for child in store
            .tasks
            .iter_mut()
            .filter(|t| t.parent_id.as_deref() == Some(parent_id.as_str()))
        {
            child.date = date.clone();
        }
    }

    write_store(app, &store)?;
    Ok(updated)
}

pub fn count_open_tasks_for_date(app: &tauri::AppHandle, date: &str) -> Result<u32, String> {
    let store = read_store(app)?;
    let count = store
        .tasks
        .iter()
        .filter(|t| t.date == date && !t.done)
        .count() as u32;
    Ok(count)
}

pub fn today_str() -> String {
    Utc::now().format("%Y-%m-%d").to_string()
}
