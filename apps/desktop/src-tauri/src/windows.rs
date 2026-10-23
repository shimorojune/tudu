//! The three windows: the desk (`main`), the floating Quick Add (`floating`) and today from the menu bar
//! (`menubar`).
//!
//! The desk has no title bar: the traffic lights sit over the sidebar and the top bar drags the window. Closing it
//! hides it. The floating window and the menu bar's sheet are non-activating panels: they take the keyboard without
//! bringing Tudu (and its desk) forward, float over every app and space, and hide when they lose focus.

use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{
    AppHandle, Emitter, Manager, PhysicalPosition, Url, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder, WindowEvent,
};

use crate::place::{
    self, Icon, Screen, FLOATING_HEIGHT, FLOATING_WIDTH, SHEET_HEIGHT, SHEET_WIDTH,
};
use crate::App;

pub const MAIN: &str = "main";
pub const FLOATING: &str = "floating";
pub const MENUBAR: &str = "menubar";

/// When the sheet last hid because it lost focus. A click on the tick takes the focus first, so a click that comes
/// this soon after is the one that closed it, and must not open it again.
static SHEET_BLURRED: Mutex<Option<Instant>> = Mutex::new(None);
const BLUR_GRACE: Duration = Duration::from_millis(300);

/// Where this build's windows find Tudu on the web.
pub fn web(app: &AppHandle) -> Url {
    #[cfg(feature = "control")]
    if let Some(u) = crate::control::web() {
        return u;
    }
    Url::parse(app.state::<App>().track.web()).expect("the track's web address")
}

fn same_origin(a: &Url, b: &Url) -> bool {
    a.scheme() == b.scheme()
        && a.host_str() == b.host_str()
        && a.port_or_known_default() == b.port_or_known_default()
}

/// The app's own loader page (tauri://localhost), Tudu on the web, and under `tauri dev` the local Vite server.
/// Anything else is an outside link: it goes to the default browser and the window stays where it is.
fn inside(url: &Url, web: &Url, dev: bool) -> bool {
    match url.scheme() {
        "tauri" | "about" => true,
        "http" | "https" => {
            same_origin(url, web)
                || url.host_str() == Some("tauri.localhost")
                || (dev && matches!(url.host_str(), Some("localhost") | Some("127.0.0.1")))
        }
        _ => false,
    }
}

/// A window opens on the loader (`page`, bundled with the app), which moves on to `path` on the web once the
/// site answers. Under `tauri dev` it opens `path` on the Vite server straight away.
fn builder<'a>(
    app: &'a AppHandle,
    label: &'a str,
    page: &str,
    path: &str,
) -> WebviewWindowBuilder<'a, tauri::Wry, AppHandle> {
    let web = web(app);
    let nav = app.clone();
    let home = web.clone();
    let url = if tauri::is_dev() {
        WebviewUrl::App(path.trim_start_matches('/').into())
    } else {
        WebviewUrl::App(page.into())
    };
    #[allow(unused_mut)]
    let mut b = WebviewWindowBuilder::new(app, label, url)
        .initialization_script(format!(
            "window.__TUDU_WEB__ = {};",
            serde_json::Value::String(web.to_string())
        ))
        .on_navigation(move |url| {
            if inside(url, &home, tauri::is_dev()) {
                return true;
            }
            crate::bridge::open_outside(&nav, url.as_str());
            false
        });
    #[cfg(feature = "control")]
    {
        b = crate::control::prepare(b);
    }
    b
}

pub fn create(app: &AppHandle) -> tauri::Result<()> {
    let track = app.state::<App>().track;
    let main = builder(app, MAIN, "index.html", "/")
        .title(track.name())
        .inner_size(1200.0, 800.0)
        .min_inner_size(900.0, 600.0)
        .center()
        .title_bar_style(tauri::TitleBarStyle::Overlay)
        .hidden_title(true)
        .build()?;
    let m = main.clone();
    main.on_window_event(move |e| {
        if let WindowEvent::CloseRequested { api, .. } = e {
            // Closing the desk hides it: Tudu stays in the dock and the menu bar. ⌘Q quits.
            api.prevent_close();
            let _ = m.hide();
        }
    });

    let floating = builder(app, FLOATING, "quick-add.html", "/quick-add")
        .title("Quick Add")
        .inner_size(FLOATING_WIDTH, FLOATING_HEIGHT)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .resizable(false)
        .always_on_top(true)
        .visible_on_all_workspaces(true)
        .skip_taskbar(true)
        .focused(false)
        .visible(false)
        .build()?;
    #[cfg(target_os = "macos")]
    panel::make_panel(&floating);
    let f = floating.clone();
    floating.on_window_event(move |e| match e {
        WindowEvent::Focused(false) => {
            if f.is_visible().unwrap_or(false) {
                let _ = f.hide();
            }
        }
        WindowEvent::CloseRequested { api, .. } => {
            api.prevent_close();
            let _ = f.hide();
        }
        _ => {}
    });

    let sheet = builder(app, MENUBAR, "menubar.html", "/menubar")
        .title("Today")
        .inner_size(SHEET_WIDTH, SHEET_HEIGHT)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .resizable(false)
        .always_on_top(true)
        .visible_on_all_workspaces(true)
        .skip_taskbar(true)
        .focused(false)
        .visible(false)
        .build()?;
    #[cfg(target_os = "macos")]
    panel::make_panel(&sheet);
    let a = app.clone();
    sheet.on_window_event(move |e| match e {
        // Hiding the sheet also takes its focus; only a blur while it shows counts.
        WindowEvent::Focused(false) => {
            let shown = a
                .get_webview_window(MENUBAR)
                .and_then(|w| w.is_visible().ok())
                .unwrap_or(false);
            if shown {
                if let Ok(mut t) = SHEET_BLURRED.lock() {
                    *t = Some(Instant::now());
                }
                hide_menubar(&a);
            }
        }
        WindowEvent::CloseRequested { api, .. } => {
            api.prevent_close();
            hide_menubar(&a);
        }
        _ => {}
    });
    Ok(())
}

/// The desk, shown and focused; `go` takes it to a page first (Sign in from the floating window, a task from the
/// menu bar's sheet, which hides as the desk comes forward).
pub fn show_main(app: &AppHandle, go: Option<&str>) {
    hide_menubar(app);
    if let Some(w) = app.get_webview_window(MAIN) {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
        if let Some(path) = go {
            let _ = w.emit_to(MAIN, "tudu:go", path);
        }
    }
}

pub fn hide_floating(app: &AppHandle) {
    if let Some(w) = app.get_webview_window(FLOATING) {
        let _ = w.hide();
    }
}

/// The summon (⌘⇧N, or New task in the tray). Shown: `toggle` hides it again. Not signed in: the desk opens on Sign
/// in and the floating window stays hidden.
pub fn summon(app: &AppHandle, toggle: bool) {
    let Some(w) = app.get_webview_window(FLOATING) else {
        return;
    };
    if w.is_visible().unwrap_or(false) {
        if toggle {
            let _ = w.hide();
        } else {
            focus_floating(&w);
        }
        return;
    }
    let signed_in = app
        .state::<App>()
        .seen
        .lock()
        .map(|s| s.signed_in)
        .unwrap_or(false);
    if !signed_in {
        show_main(app, Some("/sign-in"));
        return;
    }
    place_floating(app, &w);
    let _ = w.show();
    focus_floating(&w);
    let _ = w.emit_to(FLOATING, "floating:shown", ());
}

/// A click on the tick, either button, as it comes up: the sheet opens under the tick, or closes when open.
pub fn tray_toggles(
    button: tauri::tray::MouseButton,
    state: tauri::tray::MouseButtonState,
) -> bool {
    use tauri::tray::{MouseButton, MouseButtonState};
    matches!(button, MouseButton::Left | MouseButton::Right) && state == MouseButtonState::Up
}

/// Whether a click opens the sheet: it is hidden, and it did not just hide because this same click took its focus.
fn opens(visible: bool, blurred: Option<Duration>) -> bool {
    !visible && blurred.is_none_or(|ago| ago > BLUR_GRACE)
}

/// The tick's click: the sheet under `icon` (the tick's place), or hidden again.
pub fn toggle_menubar(app: &AppHandle, icon: Option<Icon>) {
    let Some(w) = app.get_webview_window(MENUBAR) else {
        return;
    };
    let visible = w.is_visible().unwrap_or(false);
    let blurred = SHEET_BLURRED
        .lock()
        .ok()
        .and_then(|t| t.map(|t| t.elapsed()));
    if visible {
        hide_menubar(app);
        return;
    }
    if !opens(visible, blurred) {
        return;
    }
    if let Some(icon) = icon {
        let screens = screens(&w);
        let centre = (icon.x + icon.width / 2.0, icon.y + icon.height / 2.0);
        if let Some(s) = place::screen_for(Some(centre), &screens) {
            let (x, y) = place::sheet_origin(icon, s);
            let _ = w.set_size(tauri::LogicalSize::new(SHEET_WIDTH, SHEET_HEIGHT));
            let _ = w.set_position(PhysicalPosition::new(x as i32, y as i32));
        }
    }
    let _ = w.show();
    focus_floating(&w);
    let _ = w.emit_to(MENUBAR, "menubar:shown", ());
}

/// The sheet away: it lost focus, Esc, a click on the tick, or something in it brought another window forward.
pub fn hide_menubar(app: &AppHandle) {
    if let Some(w) = app.get_webview_window(MENUBAR) {
        if w.is_visible().unwrap_or(false) {
            let _ = w.hide();
            let _ = w.emit_to(MENUBAR, "menubar:hidden", ());
        }
    }
}

fn screens(w: &WebviewWindow) -> Vec<Screen> {
    w.available_monitors()
        .unwrap_or_default()
        .iter()
        .map(|m| Screen {
            x: m.position().x as f64,
            y: m.position().y as f64,
            width: m.size().width as f64,
            height: m.size().height as f64,
            scale: m.scale_factor(),
        })
        .collect()
}

fn place_floating(app: &AppHandle, w: &WebviewWindow) {
    let screens = screens(w);
    let pointer = app.cursor_position().ok().map(|p| (p.x, p.y));
    if let Some(s) = place::screen_for(pointer, &screens) {
        let (x, y) = place::floating_origin(s);
        let _ = w.set_size(tauri::LogicalSize::new(FLOATING_WIDTH, FLOATING_HEIGHT));
        let _ = w.set_position(PhysicalPosition::new(x as i32, y as i32));
    }
}

/// Key window without activating the app, so the desk stays where it is (the floating bar and the sheet).
fn focus_floating(w: &WebviewWindow) {
    #[cfg(target_os = "macos")]
    panel::make_key(w);
    #[cfg(not(target_os = "macos"))]
    let _ = w.set_focus();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn c11_u08_only_tudu_on_the_web_opens_in_the_window() {
        let web = Url::parse("https://tudu.ezdev.net").unwrap();
        let ok = |u: &str| inside(&Url::parse(u).unwrap(), &web, false);
        assert!(ok("tauri://localhost/index.html"));
        assert!(ok("https://tudu.ezdev.net/northwind/inbox"));
        assert!(!ok("https://staging.tudu.ezdev.net/"));
        assert!(!ok("https://api.tudu.ezdev.net/api/files/1"));
        assert!(!ok("https://jira.example.com/browse/NW-1"));
        assert!(!ok("http://tudu.ezdev.net/"));
        assert!(!ok("mailto:meera@example.com"));
        let local = Url::parse("http://localhost:5301").unwrap();
        assert!(inside(
            &Url::parse("http://localhost:5301/me").unwrap(),
            &local,
            false
        ));
        assert!(!inside(
            &Url::parse("http://localhost:3301/api/files/1").unwrap(),
            &local,
            false
        ));
        assert!(inside(
            &Url::parse("http://localhost:5173/me").unwrap(),
            &web,
            true
        ));
    }

    #[test]
    fn c20_u05_left_and_right_click_both_toggle_the_sheet_as_they_come_up() {
        use tauri::tray::{MouseButton, MouseButtonState};
        assert!(tray_toggles(MouseButton::Left, MouseButtonState::Up));
        assert!(tray_toggles(MouseButton::Right, MouseButtonState::Up));
        assert!(!tray_toggles(MouseButton::Left, MouseButtonState::Down));
        assert!(!tray_toggles(MouseButton::Middle, MouseButtonState::Up));
    }

    #[test]
    fn c20_u05_the_click_that_took_the_sheets_focus_does_not_open_it_again() {
        assert!(opens(false, None));
        assert!(!opens(true, None));
        assert!(!opens(false, Some(Duration::from_millis(40))));
        assert!(opens(false, Some(Duration::from_millis(900))));
    }
}

#[cfg(target_os = "macos")]
mod panel {
    use objc2::rc::Retained;
    use objc2::runtime::{AnyClass, AnyObject};
    use objc2::{define_class, ClassType, MainThreadOnly};
    use objc2_app_kit::{NSPanel, NSWindow, NSWindowCollectionBehavior, NSWindowStyleMask};
    use tauri::WebviewWindow;

    define_class!(
        // A panel that can take the keyboard but never becomes the app's main window, so showing it leaves the desk
        // and the frontmost app alone.
        #[unsafe(super(NSPanel, NSWindow))]
        #[thread_kind = MainThreadOnly]
        #[name = "TuduFloatingPanel"]
        struct FloatingPanel;

        impl FloatingPanel {
            #[unsafe(method(canBecomeKeyWindow))]
            fn can_become_key(&self) -> bool {
                true
            }
            #[unsafe(method(canBecomeMainWindow))]
            fn can_become_main(&self) -> bool {
                false
            }
        }
    );

    fn ns_window(w: &WebviewWindow) -> Option<Retained<NSWindow>> {
        let ptr = w.ns_window().ok()? as *mut NSWindow;
        unsafe { Retained::retain(ptr) }
    }

    pub fn make_panel(w: &WebviewWindow) {
        let w2 = w.clone();
        let _ = w.run_on_main_thread(move || {
            let Some(win) = ns_window(&w2) else { return };
            unsafe {
                let obj: &AnyObject = &win;
                let cls: &AnyClass = FloatingPanel::class();
                AnyObject::set_class(obj, cls);
            }
            win.setStyleMask(win.styleMask() | NSWindowStyleMask::NonactivatingPanel);
            win.setCollectionBehavior(
                NSWindowCollectionBehavior::CanJoinAllSpaces
                    | NSWindowCollectionBehavior::FullScreenAuxiliary,
            );
            win.setHidesOnDeactivate(false);
        });
    }

    pub fn make_key(w: &WebviewWindow) {
        let w2 = w.clone();
        let _ = w.run_on_main_thread(move || {
            if let Some(win) = ns_window(&w2) {
                win.orderFrontRegardless();
                win.makeKeyWindow();
            }
        });
    }
}
