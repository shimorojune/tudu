//! Tudu for macOS: the same web app in a window that is the desk, a tray icon, a floating Quick Add on a global
//! summon, and an updater fed from the app's own track. Tudu Test (the `control` feature) adds a loopback control
//! channel so the desktop layer is tested for real; Tudu and Tudu Staging are built without it.

mod bridge;
#[cfg(feature = "control")]
mod control;
mod place;
mod track;
mod updates;
mod windows;

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    Manager, RunEvent,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

pub use track::{Track, SUMMON, SUMMON_LABEL};

/// What the app knows about itself, shared by the commands, the tray and the control channel.
pub struct App {
    pub track: Track,
    pub seen: std::sync::Mutex<bridge::Seen>,
}

macro_rules! handlers {
    ($($extra:path),*) => {
        tauri::generate_handler![
            bridge::app_info,
            bridge::set_signed_in,
            bridge::set_badge,
            bridge::open_external,
            bridge::save_download,
            bridge::show_main,
            bridge::hide_floating,
            updates::update_check,
            updates::update_install,
            $($extra),*
        ]
    };
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        windows::summon(app, true);
                    }
                })
                .build(),
        )
        .manage(updates::Updates::default());

    #[cfg(feature = "control")]
    let builder = builder
        .manage(control::Control::default())
        .invoke_handler(handlers![control::control_reply]);
    #[cfg(not(feature = "control"))]
    let builder = builder.invoke_handler(handlers![]);

    let app = builder
        .setup(|app| {
            let track = Track::from_identifier(&app.config().identifier);
            app.manage(App {
                track,
                seen: Default::default(),
            });

            windows::create(app.handle())?;
            tray(app.handle(), track)?;
            if let Err(e) = app.global_shortcut().register(SUMMON) {
                eprintln!("tudu: the summon {SUMMON} could not be registered: {e}");
            }
            #[cfg(feature = "control")]
            control::start(app.handle());
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("Tudu could not start");

    app.run(|app, event| {
        // The dock icon, clicked while no window shows: the desk comes back.
        if let RunEvent::Reopen { .. } = event {
            windows::show_main(app, None);
        }
    });
}

/// The menu-bar icon: the ink tick as a template image, and its menu.
fn tray(app: &tauri::AppHandle, track: Track) -> tauri::Result<()> {
    let menu = Menu::new(app)?;
    for item in track::tray_items(track) {
        match item {
            Some(i) => menu.append(&MenuItem::with_id(app, i.id, &i.text, true, i.accelerator)?)?,
            None => menu.append(&PredefinedMenuItem::separator(app)?)?,
        }
    }
    TrayIconBuilder::with_id("tray")
        .icon(tauri::image::Image::from_bytes(include_bytes!(
            "../icons/tray.png"
        ))?)
        .icon_as_template(true)
        .tooltip(track.name())
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| tray_action(app, event.id.as_ref()))
        .build(app)?;
    Ok(())
}

/// A tray item, by id: what clicking it does.
pub fn tray_action(app: &tauri::AppHandle, id: &str) {
    match id {
        "open" => windows::show_main(app, None),
        "new" => windows::summon(app, false),
        "quit" => app.exit(0),
        _ => {}
    }
}
