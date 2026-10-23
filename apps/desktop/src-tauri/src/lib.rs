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
    tray::{TrayIcon, TrayIconBuilder, TrayIconEvent},
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
            bridge::summon,
            bridge::hide_menubar,
            bridge::quit,
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

/// The menu-bar icon: the ink tick as a template image. It has no menu: a click, left or right, opens today from the
/// menu bar (the `menubar` window) under it.
fn tray(app: &tauri::AppHandle, track: Track) -> tauri::Result<()> {
    TrayIconBuilder::with_id("tray")
        .icon(tauri::image::Image::from_bytes(include_bytes!(
            "../icons/tray.png"
        ))?)
        .icon_as_template(true)
        .tooltip(track.name())
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button,
                button_state,
                rect,
                ..
            } = event
            {
                if windows::tray_toggles(button, button_state) {
                    windows::toggle_menubar(tray.app_handle(), Some(icon_of(rect)));
                }
            }
        })
        .build(app)?;
    Ok(())
}

/// The tick's place, in physical pixels.
fn icon_of(rect: tauri::Rect) -> place::Icon {
    let p = rect.position.to_physical::<f64>(1.0);
    let s = rect.size.to_physical::<f64>(1.0);
    place::Icon {
        x: p.x,
        y: p.y,
        width: s.width,
        height: s.height,
    }
}

/// Where the tick is now (for the control channel's click, which has no event to read it from).
pub fn tray_icon(app: &tauri::AppHandle) -> Option<place::Icon> {
    let tray: TrayIcon = app.tray_by_id("tray")?;
    tray.rect().ok().flatten().map(icon_of)
}
