//! The From anywhere shortcuts in the running app: kept in `shortcuts.json` in the app's config folder, registered with
//! macOS at launch (before any page loads, so a launch at login has them), changed from Settings › Shortcuts, checked
//! again on wake and whenever Settings asks, and acted on even before the desk has said whether you are signed in.
//! The rules themselves (the file, the order of a change, what is refused) are in `shortcuts.rs`.

use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

use crate::shortcuts::{self, Bindings, Hold, Id, Registrar, IDS};
use crate::App;

/// How long a press made before the desk has said whether you are signed in waits for it.
pub const HOLD_FOR: Duration = Duration::from_secs(8);

#[derive(Default)]
pub struct Hotkeys {
    bindings: Mutex<Bindings>,
    /// Shortcuts macOS would not take (another app has the keys).
    broken: Mutex<Vec<Id>>,
    /// A press waiting for the desk to say whether you are signed in.
    held: Mutex<Hold>,
}

impl Hotkeys {
    pub fn bindings(&self) -> Bindings {
        self.bindings.lock().map(|b| b.clone()).unwrap_or_default()
    }

    pub fn held(&self) -> Option<Id> {
        self.held.lock().ok().and_then(|h| h.waiting())
    }
}

/// One row of Settings › Shortcuts, as the page shows it.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Row {
    pub id: Id,
    /// The plugin's form (`Shift+Super+KeyN`); none when it is off.
    pub accelerator: Option<String>,
    /// As people read it (`⇧⌘N`).
    pub label: Option<String>,
    pub registered: bool,
    /// Why it isn't working, when it is on and macOS doesn't have it.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

fn file(app: &AppHandle) -> Option<PathBuf> {
    #[cfg(feature = "control")]
    if let Some(d) = crate::control::data_dir() {
        return Some(d.join("shortcuts.json"));
    }
    app.path()
        .app_config_dir()
        .ok()
        .map(|d| d.join("shortcuts.json"))
}

fn save(app: &AppHandle, b: &Bindings) -> Result<(), String> {
    let path = file(app).ok_or("No folder to keep it in.")?;
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    // Written beside and moved over, so a crash mid-write never leaves half a file.
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, shortcuts::to_file(b)).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &path).map_err(|e| e.to_string())
}

/// The plugin, as `shortcuts::rebind` and `ensure` see it.
struct Plugin<'a>(&'a AppHandle);

impl Registrar for Plugin<'_> {
    fn register(&mut self, accel: &str) -> Result<(), String> {
        #[cfg(feature = "control")]
        if crate::control::taken(accel) {
            return Err("HotKey already registered (Tudu Test says another app holds it)".into());
        }
        self.0
            .global_shortcut()
            .register(accel)
            .map_err(|e| e.to_string())
    }

    fn unregister(&mut self, accel: &str) {
        let _ = self.0.global_shortcut().unregister(accel);
    }

    fn is_registered(&self, accel: &str) -> bool {
        self.0.global_shortcut().is_registered(accel)
    }
}

/// At launch, before any window: your keys from the file (the usual ones when there is none), registered.
pub fn start(app: &AppHandle) {
    let b = file(app)
        .and_then(|p| std::fs::read(p).ok())
        .map(|bytes| shortcuts::from_file(&bytes))
        .unwrap_or_default();
    app.manage(Hotkeys::default());
    let h = app.state::<Hotkeys>();
    if let Ok(mut cur) = h.bindings.lock() {
        *cur = b;
    }
    check(app);
}

/// Makes sure macOS still has every shortcut that is on, registering again any it lost; remembers the ones it
/// refused. On launch, on wake, and when Settings opens.
pub fn check(app: &AppHandle) -> Vec<Row> {
    let h = app.state::<Hotkeys>();
    let b = h.bindings();
    let states = shortcuts::ensure(&mut Plugin(app), &b);
    let broken: Vec<Id> = states
        .iter()
        .filter(|(_, s)| *s == Some(false))
        .map(|(id, _)| *id)
        .collect();
    for id in &broken {
        eprintln!(
            "tudu: {} ({}) could not be registered: another app may hold it",
            id.name(),
            b.get(*id).unwrap_or("")
        );
    }
    let changed = h.broken.lock().map(|mut cur| {
        let changed = *cur != broken;
        *cur = broken;
        changed
    });
    let rows = rows(app);
    if changed.unwrap_or(false) {
        let _ = app.emit("shortcuts:changed", &rows);
    }
    rows
}

pub fn rows(app: &AppHandle) -> Vec<Row> {
    let h = app.state::<Hotkeys>();
    let b = h.bindings();
    IDS.into_iter()
        .map(|id| {
            let accel = b.get(id).map(str::to_string);
            let label = accel.as_deref().and_then(shortcuts::label);
            let registered = accel
                .as_deref()
                .is_some_and(|a| app.global_shortcut().is_registered(a));
            let error = (accel.is_some() && !registered).then(|| {
                format!(
                    "Another app took {}, so it isn’t working. Pick other keys.",
                    label.clone().unwrap_or_default()
                )
            });
            Row {
                id,
                accelerator: accel,
                label,
                registered,
                error,
            }
        })
        .collect()
}

/// The label of a shortcut while macOS has it (for the menu bar's tooltips): none when it is off or not working.
pub fn live_label(app: &AppHandle, id: Id) -> Option<String> {
    rows(app)
        .into_iter()
        .find(|r| r.id == id && r.registered)
        .and_then(|r| r.label)
}

/// A global shortcut pressed: whichever of yours it is.
pub fn pressed(app: &AppHandle, shortcut: &Shortcut) {
    let b = app.state::<Hotkeys>().bindings();
    let id = IDS.into_iter().find(|id| {
        b.get(*id)
            .and_then(|a| a.parse::<Shortcut>().ok())
            .is_some_and(|s| &s == shortcut)
    });
    if let Some(id) = id {
        act(app, id);
    }
}

/// Acts on a shortcut, or holds it while the desk has not yet said whether you are signed in (the first seconds
/// after a launch at login): the press then runs as soon as it does, or after `HOLD_FOR` as it would have before.
pub fn act(app: &AppHandle, id: Id) {
    let known = app
        .state::<App>()
        .seen
        .lock()
        .ok()
        .and_then(|s| s.signed_in);
    if known.is_some() {
        run(app, id);
        return;
    }
    let Some(n) = app
        .state::<Hotkeys>()
        .held
        .lock()
        .ok()
        .map(|mut h| h.hold(id))
    else {
        run(app, id);
        return;
    };
    let a = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(HOLD_FOR);
        let still = a
            .state::<Hotkeys>()
            .held
            .lock()
            .ok()
            .and_then(|mut h| h.expire(n));
        if let Some(id) = still {
            let b = a.clone();
            let _ = a.run_on_main_thread(move || run(&b, id));
        }
    });
}

/// The desk said whether you are signed in: a held press runs now.
pub fn signed_in_known(app: &AppHandle) {
    let held = app
        .state::<Hotkeys>()
        .held
        .lock()
        .ok()
        .and_then(|mut h| h.release());
    if let Some(id) = held {
        let a = app.clone();
        let _ = app.run_on_main_thread(move || run(&a, id));
    }
}

fn run(app: &AppHandle, id: Id) {
    match id {
        Id::NewTask => crate::windows::summon(app, true),
        Id::NewNote => crate::notes::open(app, None, None),
    }
}

/// Settings › Shortcuts: every From anywhere shortcut, checked with macOS first.
#[tauri::command]
pub fn shortcuts_get(app: AppHandle) -> Vec<Row> {
    check(&app)
}

/// Settings › Shortcuts: one shortcut changed (`accelerator` none: off). Answers the rows, or the line to show under
/// the row when it was refused; refused, the old keys stay.
#[tauri::command]
pub fn shortcuts_set(
    app: AppHandle,
    id: String,
    accelerator: Option<String>,
) -> Result<Vec<Row>, String> {
    let id = Id::parse(&id).ok_or("No such shortcut.")?;
    let h = app.state::<Hotkeys>();
    let current = h.bindings();
    let next = accelerator.as_deref();
    let keys = next
        .and_then(shortcuts::label)
        .unwrap_or_else(|| next.unwrap_or("").to_string());
    let after = shortcuts::rebind(&mut Plugin(&app), &current, id, next, |b| save(&app, b))
        .map_err(|r| r.text(&keys, current.get(id)))?;
    if let Ok(mut cur) = h.bindings.lock() {
        *cur = after;
    }
    if let Ok(mut broken) = h.broken.lock() {
        broken.retain(|b| *b != id);
    }
    let rows = rows(&app);
    let _ = app.emit("shortcuts:changed", &rows);
    Ok(rows)
}
