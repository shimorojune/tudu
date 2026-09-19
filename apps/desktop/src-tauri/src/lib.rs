mod app_icon;
mod cleanup;
mod quick_add;

use std::sync::Mutex;

use quick_add::{
    dismiss_quick_add, hide_quick_add_window, pause_quick_add_shortcuts_command,
    place_quick_add_window_command, present_quick_add_window, register_quick_add_shortcut,
    register_quick_add_shortcut_command, resize_quick_add_window,
    save_quick_add_window_position, show_main_window_command, QuickAddSession,
    QuickAddShortcutState, QuickAddToggleGuard, QuickAddWindowState,
    DEFAULT_QUICK_ADD_ACCELERATOR,
};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, RunEvent, WindowEvent,
};

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_positioner::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .manage(QuickAddShortcutState(Mutex::new(
            DEFAULT_QUICK_ADD_ACCELERATOR.to_string(),
        )))
        .manage(QuickAddSession(Mutex::new(None)))
        .manage(QuickAddWindowState(Mutex::new(None)))
        .manage(QuickAddToggleGuard(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            register_quick_add_shortcut_command,
            pause_quick_add_shortcuts_command,
            hide_quick_add_window,
            show_main_window_command,
            place_quick_add_window_command,
            present_quick_add_window,
            resize_quick_add_window,
            save_quick_add_window_position,
        ])
        .setup(|app| {
            cleanup::cleanup_legacy_data(&app.handle());

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
                        show_main_window(app);
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
                                show_main_window(&app);
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

            if let Some(window) = app.get_webview_window("quick-add") {
                let app_handle = app.handle().clone();
                window.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        dismiss_quick_add(&app_handle);
                    }
                });
            }

            let handle = app.handle().clone();
            let shortcut_state = app.state::<QuickAddShortcutState>();
            if let Err(error) = register_quick_add_shortcut(
                &handle,
                shortcut_state.inner(),
                DEFAULT_QUICK_ADD_ACCELERATOR.to_string(),
            ) {
                eprintln!("Failed to register Quick Add shortcut: {error}");
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        #[cfg(target_os = "macos")]
        if let RunEvent::Reopen { .. } = event {
            show_main_window(app_handle);
        }
    });
}
