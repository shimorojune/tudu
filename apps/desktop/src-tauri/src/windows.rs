//! The four windows: the desk (`main`), the floating Quick Add (`floating`), today from the menu bar (`menubar`)
//! and the note window (`note`, chunk 22; see notes.rs).
//!
//! The desk has no title bar: the traffic lights sit over the sidebar and the top bar drags the window. Closing it
//! hides it and Tudu carries on in the menu bar (chunk 16). The floating window and the menu bar's sheet are non-activating panels: they take the keyboard without
//! bringing Tudu (and its desk) forward, float over every app and space, and hide when they lose focus. The sheet
//! also hides on a click in another app, or when another app comes forward.

use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{
    AppHandle, Emitter, Manager, PhysicalPosition, Url, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder, WindowEvent,
};

use crate::place::{
    self, Icon, Screen, FLOATING_HEIGHT, FLOATING_WIDTH, NOTE_HEIGHT, NOTE_MIN_HEIGHT,
    NOTE_MIN_WIDTH, NOTE_WIDTH, SHEET_HEIGHT, SHEET_WIDTH,
};
use crate::{background, App};

pub const MAIN: &str = "main";
pub const FLOATING: &str = "floating";
pub const MENUBAR: &str = "menubar";
pub const NOTE: &str = "note";

/// When the sheet last hid because it lost focus. A click on the tick takes the focus first, so a click that comes
/// this soon after is the one that closed it, and must not open it again.
static SHEET_BLURRED: Mutex<Option<Instant>> = Mutex::new(None);
const BLUR_GRACE: Duration = Duration::from_millis(300);

/// The last thing outside the sheet that could put it away, and what came of it. The test channel shows it, so a
/// sheet left open says whether the app heard the blur, the click or the other app coming forward.
#[derive(Clone, Default, serde::Serialize)]
pub struct Outside {
    pub last: Option<&'static str>,
    /// The app that came forward (its bundle identifier), for `activate`.
    pub app: Option<String>,
    pub hid: bool,
    pub at: Option<String>,
}

static OUTSIDE: Mutex<Outside> = Mutex::new(Outside {
    last: None,
    app: None,
    hid: false,
    at: None,
});

pub fn last_outside() -> Outside {
    OUTSIDE.lock().map(|o| o.clone()).unwrap_or_default()
}

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
    // The look as saved: every window is built in Tudu's theme, and every page learns it (and when the launch began)
    // before it runs, so the loader paints in it from its first frame.
    let looks = app.state::<crate::look::Looks>();
    let look = looks.look.lock().map(|l| *l).unwrap_or_default();
    #[allow(unused_mut)]
    let mut b = WebviewWindowBuilder::new(app, label, url)
        .initialization_script(format!(
            "window.__TUDU_WEB__ = {};",
            serde_json::Value::String(web.to_string())
        ))
        .initialization_script(crate::look::init_script(look, looks.launched_at))
        .theme(crate::look::native_theme(look.theme))
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

/// The windows, made once at launch. Started by the login item, the desk stays hidden: Tudu is in the menu bar only.
pub fn create(app: &AppHandle, at_login: bool) -> tauri::Result<()> {
    let track = app.state::<App>().track;
    let look = crate::look::current(app);
    let main = builder(app, MAIN, "index.html", "/")
        .background_color(crate::look::desk_background(
            look.theme,
            crate::look::system_theme(),
        ))
        .title(track.name())
        .inner_size(1200.0, 800.0)
        .min_inner_size(900.0, 600.0)
        .center()
        .title_bar_style(tauri::TitleBarStyle::Overlay)
        .hidden_title(true)
        .visible(!at_login)
        .build()?;
    background::keep_awake(&main);
    let m = main.clone();
    let a = app.clone();
    crate::look::repaint_desk(app, look);
    main.on_window_event(move |e| {
        // On System, macOS changing appearance changes the desk's background with it.
        if let WindowEvent::ThemeChanged(_) = e {
            let look = crate::look::current(&a);
            if look.theme == crate::look::ThemeChoice::System {
                crate::look::repaint_desk(&a, look);
            }
        }
        if let WindowEvent::CloseRequested { api, .. } = e {
            // Closing the desk hides it: Tudu carries on in the menu bar, and leaves the Dock unless you keep it
            // there. ⌘Q quits.
            api.prevent_close();
            let _ = m.hide();
            background::desk(&a, false);
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
    background::keep_awake(&floating);
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
    background::keep_awake(&sheet);
    #[cfg(target_os = "macos")]
    panel::make_panel(&sheet);
    let a = app.clone();
    sheet.on_window_event(move |e| match e {
        // Hiding the sheet also takes its focus; only a blur while it shows counts.
        WindowEvent::Focused(false) => outside(&a, "blur", None, false),
        WindowEvent::CloseRequested { api, .. } => {
            api.prevent_close();
            hide_menubar(&a);
        }
        _ => {}
    });
    #[cfg(target_os = "macos")]
    panel::watch_outside(app);

    // The note window: a panel like Quick Add (the keyboard without the desk), but resizable, not on top to start,
    // and it stays when you click into another app.
    crate::notes::load(app);
    let note = builder(app, NOTE, "note.html", "/note-window")
        .title("Note")
        .inner_size(NOTE_WIDTH, NOTE_HEIGHT)
        .min_inner_size(NOTE_MIN_WIDTH, NOTE_MIN_HEIGHT)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .resizable(true)
        .always_on_top(false)
        .visible_on_all_workspaces(true)
        .skip_taskbar(true)
        .focused(false)
        .visible(false)
        .build()?;
    background::keep_awake(&note);
    #[cfg(target_os = "macos")]
    panel::make_panel(&note);
    let n = note.clone();
    let a = app.clone();
    note.on_window_event(move |e| match e {
        WindowEvent::CloseRequested { api, .. } => {
            api.prevent_close();
            crate::notes::hide(&a);
        }
        WindowEvent::Moved(_) | WindowEvent::Resized(_) => crate::notes::remember(&a, &n),
        _ => {}
    });
    Ok(())
}

/// Whether something outside the sheet puts it away: it shows, and the click or the app coming forward is not Tudu's.
fn outside_hides(visible: bool, ours: bool) -> bool {
    visible && !ours
}

/// The sheet lost its focus, a click landed in another app, or another app came forward. The sheet never makes Tudu
/// the active app, so a click into the app already in front takes no focus from it: losing focus alone misses that.
pub fn outside(app: &AppHandle, why: &'static str, who: Option<String>, ours: bool) {
    let visible = app
        .get_webview_window(MENUBAR)
        .and_then(|w| w.is_visible().ok())
        .unwrap_or(false);
    let hides = outside_hides(visible, ours);
    if let Ok(mut o) = OUTSIDE.lock() {
        *o = Outside {
            last: Some(why),
            app: who,
            hid: hides,
            at: time::OffsetDateTime::now_utc()
                .format(&time::format_description::well_known::Rfc3339)
                .ok(),
        };
    }
    if !hides {
        return;
    }
    if let Ok(mut t) = SHEET_BLURRED.lock() {
        *t = Some(Instant::now());
    }
    hide_menubar(app);
}

/// The desk, shown and focused; `go` takes it to a page first (Sign in from the floating window, a task from the
/// menu bar's sheet, which hides as the desk comes forward).
/// From the menu bar it is a regular app again first, so the Dock icon, ⌘Tab and the app menu come back with it.
pub fn show_main(app: &AppHandle, go: Option<&str>) {
    hide_menubar(app);
    if let Some(w) = app.get_webview_window(MAIN) {
        background::bring_forward(app);
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

pub(crate) fn screens(w: &WebviewWindow) -> Vec<Screen> {
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

/// The note window takes the keyboard the same way.
pub(crate) fn focus_panel(w: &WebviewWindow) {
    focus_floating(w);
}

/// Key window without activating the app, so the desk stays where it is (the floating bar and the sheet).
fn focus_floating(w: &WebviewWindow) {
    #[cfg(target_os = "macos")]
    panel::make_key(w);
    #[cfg(not(target_os = "macos"))]
    let _ = w.set_focus();
}

/// Tudu Test only: Reduce motion as a test sets it (0: as macOS says, 1: off, 2: on), since CI's Macs have it on.
#[cfg(feature = "control")]
pub(crate) static REDUCE_MOTION_OVERRIDE: std::sync::atomic::AtomicU8 =
    std::sync::atomic::AtomicU8::new(0);

/// macOS's Reduce motion (Accessibility › Display).
pub(crate) fn reduce_motion() -> bool {
    #[cfg(feature = "control")]
    match REDUCE_MOTION_OVERRIDE.load(std::sync::atomic::Ordering::SeqCst) {
        1 => return false,
        2 => return true,
        _ => {}
    }
    #[cfg(target_os = "macos")]
    return panel::reduce_motion();
    #[cfg(not(target_os = "macos"))]
    false
}

/// The window takes a frame (physical pixels) in one step, place and size together, so an edge being dragged
/// doesn't make the far edge jitter.
pub(crate) fn set_frame_now(w: &WebviewWindow, f: crate::place::Frame) {
    #[cfg(target_os = "macos")]
    panel::set_frame(w, f);
    #[cfg(not(target_os = "macos"))]
    {
        let _ = w.set_size(tauri::PhysicalSize::new(f.width as u32, f.height as u32));
        let _ = w.set_position(PhysicalPosition::new(f.x as i32, f.y as i32));
    }
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

    #[test]
    fn c20_u06_a_click_or_an_app_outside_tudu_puts_the_shown_sheet_away() {
        assert!(outside_hides(true, false));
        assert!(!outside_hides(false, false));
        assert!(!outside_hides(true, true));
        assert!(!outside_hides(false, true));
    }
}

#[cfg(target_os = "macos")]
mod panel {
    use std::ptr::NonNull;

    use block2::RcBlock;
    use objc2::rc::Retained;
    use objc2::runtime::{AnyClass, AnyObject};
    use objc2::{define_class, ClassType, MainThreadMarker, MainThreadOnly};
    use objc2_app_kit::{
        NSEvent, NSEventMask, NSPanel, NSRunningApplication, NSScreen, NSWindow,
        NSWindowCollectionBehavior, NSWindowStyleMask, NSWorkspace, NSWorkspaceApplicationKey,
        NSWorkspaceDidActivateApplicationNotification,
    };
    use objc2_foundation::{NSNotification, NSOperationQueue, NSPoint, NSRect, NSSize};
    use tauri::{AppHandle, WebviewWindow};

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

    /// For the process's life, as the sheet is: a mouse down in another app (a global monitor sees only clicks
    /// sent to other apps, so the tick and the sheet's own clicks never come here, and mouse monitors need no
    /// Accessibility permission), and another app becoming the active one (⌘Tab, a Dock click).
    pub fn watch_outside(app: &AppHandle) {
        let a = app.clone();
        let _ = app.run_on_main_thread(move || {
            let click = a.clone();
            let on_click = RcBlock::new(move |_: NonNull<NSEvent>| {
                super::outside(&click, "click", None, false)
            });
            let mask = NSEventMask::LeftMouseDown
                | NSEventMask::RightMouseDown
                | NSEventMask::OtherMouseDown;
            if let Some(m) = NSEvent::addGlobalMonitorForEventsMatchingMask_handler(mask, &on_click)
            {
                std::mem::forget(m);
            }
            let front = a.clone();
            let on_front = RcBlock::new(move |n: NonNull<NSNotification>| {
                // The app the notification names, not who is active by the time it is read: Tudu itself coming
                // forward (the desk) is not outside.
                let n = unsafe { n.as_ref() };
                let Some(came) = activated(n) else {
                    return;
                };
                let ours = came == NSRunningApplication::currentApplication();
                let who = came.bundleIdentifier().map(|b| b.to_string());
                super::outside(&front, "activate", who, ours);
            });
            let center = NSWorkspace::sharedWorkspace().notificationCenter();
            let o = unsafe {
                center.addObserverForName_object_queue_usingBlock(
                    Some(NSWorkspaceDidActivateApplicationNotification),
                    None,
                    Some(&NSOperationQueue::mainQueue()),
                    &on_front,
                )
            };
            std::mem::forget(o);
        });
    }

    /// The app a did-activate notification is about.
    fn activated(n: &NSNotification) -> Option<Retained<NSRunningApplication>> {
        let info = n.userInfo()?;
        let key: &AnyObject = unsafe { NSWorkspaceApplicationKey };
        let app = info.objectForKey(key)?;
        app.downcast::<NSRunningApplication>().ok()
    }

    pub fn reduce_motion() -> bool {
        NSWorkspace::sharedWorkspace().accessibilityDisplayShouldReduceMotion()
    }

    /// A frame (physical pixels, top-left) as Cocoa has it: points, from the bottom-left of the primary screen.
    fn cocoa(win: &NSWindow, f: crate::place::Frame) -> NSRect {
        let mtm = MainThreadMarker::from(win);
        let primary = NSScreen::screens(mtm)
            .firstObject()
            .map(|s| s.frame().size.height)
            .unwrap_or(0.0);
        let r = crate::place::cocoa_rect(f, win.backingScaleFactor(), primary);
        NSRect::new(NSPoint::new(r.x, r.y), NSSize::new(r.width, r.height))
    }

    pub fn set_frame(w: &WebviewWindow, f: crate::place::Frame) {
        let w2 = w.clone();
        let _ = w.run_on_main_thread(move || {
            if let Some(win) = ns_window(&w2) {
                win.setFrame_display(cocoa(&win, f), true);
            }
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
