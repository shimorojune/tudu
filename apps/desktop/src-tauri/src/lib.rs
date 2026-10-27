//! Tudu for macOS: the same web app in a window that is the desk, a tray icon, a floating Quick Add on a global
//! summon, and an updater fed from the app's own track. Tudu Test (the `control` feature) adds a loopback control
//! channel so the desktop layer is tested for real; Tudu and Tudu Staging are built without it.

mod background;
mod bridge;
#[cfg(feature = "control")]
mod control;
mod look;
mod notes;
mod place;
mod track;
mod updates;
mod windows;

use tauri::{
    tray::{TrayIcon, TrayIconBuilder, TrayIconEvent},
    Manager, RunEvent, WindowEvent,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

pub use track::{Track, NOTES, NOTES_LABEL, SUMMON, SUMMON_LABEL};

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
            bridge::set_tick,
            bridge::open_external,
            bridge::save_download,
            bridge::show_main,
            bridge::hide_floating,
            bridge::summon,
            bridge::summon_with,
            bridge::quick_add_seed,
            bridge::hide_menubar,
            bridge::quit,
            updates::update_check,
            updates::update_install,
            updates::update_status,
            background::this_mac,
            background::set_open_at_login,
            background::open_login_items,
            background::set_dock,
            look::set_appearance,
            notes::open_note,
            notes::note_state,
            notes::set_note_pinned,
            notes::set_note_expanded,
            notes::open_in_notebook,
            notes::hide_note,
            notes::note_resize_begin,
            notes::note_resize_to,
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
                .with_handler(|app, shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        pressed(app, shortcut);
                    }
                })
                .build(),
        )
        .manage(updates::Updates::default())
        .manage(notes::Notes::default())
        // Any of the windows coming to the front checks for a new version, once the last check is old enough.
        .on_window_event(|w, e| {
            if let WindowEvent::Focused(true) = e {
                updates::auto_check(w.app_handle());
            }
        });

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

            let background = background::start(app.handle());
            let at_login = background.at_login;
            app.manage(background);
            app.manage(look::Looks::start(app.handle()));

            windows::create(app.handle(), at_login)?;
            background::seed_tray_place();
            tray(app.handle(), track)?;
            background::apply(app.handle());
            background::watch_tick(app.handle());
            updates::watch_wake(app.handle());
            if let Err(e) = app.global_shortcut().register(SUMMON) {
                eprintln!("tudu: the summon {SUMMON} could not be registered: {e}");
            }
            // Taken by another app: logged, and the menu bar's New note shows no shortcut.
            if let Err(e) = app.global_shortcut().register(NOTES) {
                eprintln!("tudu: the note window's shortcut {NOTES} could not be registered: {e}");
            }
            #[cfg(feature = "control")]
            control::start(app.handle());
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("Tudu could not start");

    app.run(|app, event| {
        // The Dock icon clicked, or Tudu opened again from Finder or Spotlight while it runs in the menu bar: the
        // desk comes back.
        if let RunEvent::Reopen { .. } = event {
            windows::show_main(app, None);
        }
    });
}

/// A global shortcut pressed: ⌥⌘N opens the note window on a blank note (as the sheet's New note does), anything
/// else is the summon.
pub fn pressed(app: &tauri::AppHandle, shortcut: &Shortcut) {
    if NOTES.parse::<Shortcut>().ok().as_ref() == Some(shortcut) {
        notes::open(app, None, None);
    } else {
        windows::summon(app, true);
    }
}

/// The menu-bar icon: the bare ink tick as a template image. It has no menu: a click, left or right, opens today from the
/// menu bar (the `menubar` window) under it.
fn tray(app: &tauri::AppHandle, track: Track) -> tauri::Result<()> {
    TrayIconBuilder::with_id("tray")
        .icon(tick_icon(false)?)
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

/// The tick's image: the bare tick, or the tick with its Inbox dot. Both are template images.
pub fn tick_icon(dot: bool) -> tauri::Result<tauri::image::Image<'static>> {
    tauri::image::Image::from_bytes(if dot {
        include_bytes!("../icons/tray-dot.png").as_slice()
    } else {
        include_bytes!("../icons/tray.png").as_slice()
    })
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
