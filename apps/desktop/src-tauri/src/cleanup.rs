use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

fn legacy_app_data_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    if let Some(home) = std::env::var_os("HOME") {
        let home = PathBuf::from(home);
        dirs.push(
            home.join("Library")
                .join("Application Support")
                .join("daily-todo-app"),
        );
        dirs.push(
            home.join("Library")
                .join("Application Support")
                .join("com.tudu.dailytodo"),
        );
        dirs.push(home.join(".daily-todo-app"));
    }
    dirs
}

fn remove_dir_if_exists(path: &PathBuf) {
    if path.exists() {
        if let Err(error) = fs::remove_dir_all(path) {
            eprintln!("Failed to remove {}: {error}", path.display());
        }
    }
}

pub fn cleanup_legacy_data(app: &AppHandle) {
    if let Ok(app_data_dir) = app.path().app_data_dir() {
        remove_dir_if_exists(&app_data_dir);
    }

    for legacy_dir in legacy_app_data_dirs() {
        remove_dir_if_exists(&legacy_dir);
    }
}
