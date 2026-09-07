mod app_icon;
mod cleanup;

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WindowEvent,
};

#[cfg(all(not(debug_assertions), target_os = "macos"))]
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
#[cfg(all(not(debug_assertions), target_os = "macos"))]
use tauri_plugin_updater::UpdaterExt;

#[cfg(all(not(debug_assertions), target_os = "macos"))]
const MAX_RELEASE_NOTES_LEN: usize = 240;

#[cfg(all(not(debug_assertions), target_os = "macos"))]
fn build_update_message(version: &str, body: &Option<String>) -> String {
    let mut message = format!("Version {version} is ready. Install it now?");
    if let Some(notes) = body {
        let trimmed = notes.trim();
        if !trimmed.is_empty() && trimmed.len() <= MAX_RELEASE_NOTES_LEN {
            message.push_str("\n\n");
            message.push_str(trimmed);
        }
    }
    message
}

#[cfg(all(not(debug_assertions), target_os = "macos"))]
fn ask_yes_no(
    app: &tauri::AppHandle,
    title: &str,
    message: &str,
    yes_label: &str,
    no_label: &str,
) -> bool {
    app.dialog()
        .title(title)
        .message(message)
        .buttons(MessageDialogButtons::OkCancelCustom(yes_label, no_label))
        .blocking_show()
}

#[cfg(all(not(debug_assertions), target_os = "macos"))]
async fn check_for_updates(app: tauri::AppHandle) {
    let updater = match app.updater() {
        Ok(updater) => updater,
        Err(error) => {
            eprintln!("Updater unavailable: {error}");
            return;
        }
    };

    let update = match updater.check().await {
        Ok(Some(update)) => update,
        Ok(None) => return,
        Err(error) => {
            eprintln!("Failed to check for updates: {error}");
            return;
        }
    };

    let version = update.version.clone();
    let message = build_update_message(&version, &update.body);
    let should_update = ask_yes_no(&app, "Update available", &message, "Update", "Later");

    if !should_update {
        return;
    }

    if let Err(error) = update
        .download_and_install(|_chunk, _total| {}, || {})
        .await
    {
        eprintln!("Failed to install update: {error}");
        return;
    }

    let should_restart = ask_yes_no(
        &app,
        "Restart Tudu",
        "The update is installed. Restart now to use it.",
        "Restart",
        "Later",
    );

    if should_restart {
        app.restart();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_positioner::init())
        .setup(|app| {
            cleanup::cleanup_legacy_data(&app.handle());

            #[cfg(all(not(debug_assertions), target_os = "macos"))]
            {
                let handle = app.handle().clone();
                std::thread::spawn(move || {
                    tauri::async_runtime::block_on(check_for_updates(handle));
                });
            }

            #[cfg(target_os = "macos")]
            {
                if let Err(error) = app_icon::set_dock_icon() {
                    eprintln!("Failed to set macOS dock icon: {error}");
                }
                let handle = app.handle().clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(400));
                    let _ = handle.run_on_main_thread(|| {
                        if let Err(error) = app_icon::set_dock_icon() {
                            eprintln!("Failed to set macOS dock icon: {error}");
                        }
                    });
                });
            }

            let show_item = MenuItem::with_id(app, "show", "Show Tudu", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

            let mut tray_builder = TrayIconBuilder::new().menu(&menu).tooltip("Tudu");

            #[cfg(target_os = "macos")]
            {
                if let Ok(icon) = app_icon::tray_icon() {
                    tray_builder = tray_builder.icon(icon).icon_as_template(true);
                }
            }

            #[cfg(not(target_os = "macos"))]
            if let Some(icon) = app.default_window_icon() {
                tray_builder = tray_builder.icon(icon.clone());
            }

            let _tray = tray_builder
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    tauri_plugin_positioner::on_tray_event(tray.app_handle(), &event);
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            if let Some(window) = app.get_webview_window("main") {
                let main_window = window.clone();
                window.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = main_window.hide();
                    }
                });
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
