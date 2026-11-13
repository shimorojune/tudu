//! The From anywhere shortcuts (issue #57): New task and New note, which you can change in Settings › Shortcuts.
//!
//! This file is the part with no Tauri in it: what is kept on disk, how an accelerator is written for people, which
//! keys are refused, and the order a change happens in so you are never left with no keys. `hotkeys.rs` joins it to
//! the global-shortcut plugin. The keys live here, in the app, not in the page: at login there is no page yet, and
//! the keys must work from the first second.

use serde::{Deserialize, Serialize};

use crate::track::{NOTES, SUMMON};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Id {
    NewTask,
    NewNote,
}

pub const IDS: [Id; 2] = [Id::NewTask, Id::NewNote];

impl Id {
    pub fn name(self) -> &'static str {
        match self {
            Id::NewTask => "New task",
            Id::NewNote => "New note",
        }
    }

    pub fn default_accelerator(self) -> &'static str {
        match self {
            Id::NewTask => SUMMON,
            Id::NewNote => NOTES,
        }
    }

    pub fn parse(s: &str) -> Option<Id> {
        match s {
            "newTask" => Some(Id::NewTask),
            "newNote" => Some(Id::NewNote),
            _ => None,
        }
    }
}

/// Each shortcut's accelerator; `None` is Off.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Bindings {
    pub new_task: Option<String>,
    pub new_note: Option<String>,
}

impl Default for Bindings {
    fn default() -> Self {
        Bindings {
            new_task: Some(SUMMON.to_string()),
            new_note: Some(NOTES.to_string()),
        }
    }
}

impl Bindings {
    pub fn get(&self, id: Id) -> Option<&str> {
        match id {
            Id::NewTask => self.new_task.as_deref(),
            Id::NewNote => self.new_note.as_deref(),
        }
    }

    pub fn with(&self, id: Id, accel: Option<String>) -> Bindings {
        let mut b = self.clone();
        match id {
            Id::NewTask => b.new_task = accel,
            Id::NewNote => b.new_note = accel,
        }
        b
    }

    /// The shortcut these keys belong to, if any.
    pub fn owner(&self, accel: &str) -> Option<Id> {
        IDS.into_iter()
            .find(|id| self.get(*id).is_some_and(|a| same(a, accel)))
    }
}

/// The saved file, read field by field: missing means the usual keys, `null` means Off, anything unreadable is the
/// usual keys again (a torn write never leaves you with nothing).
pub fn from_file(bytes: &[u8]) -> Bindings {
    let mut b = Bindings::default();
    let Ok(v) = serde_json::from_slice::<serde_json::Value>(bytes) else {
        return b;
    };
    for id in IDS {
        let key = match id {
            Id::NewTask => "newTask",
            Id::NewNote => "newNote",
        };
        match v.get(key) {
            Some(serde_json::Value::Null) => b = b.with(id, None),
            Some(serde_json::Value::String(s)) if parts(s).is_some() => {
                b = b.with(id, Some(s.clone()))
            }
            _ => {}
        }
    }
    b
}

pub fn to_file(b: &Bindings) -> Vec<u8> {
    serde_json::to_vec_pretty(&serde_json::json!({
        "newTask": b.new_task,
        "newNote": b.new_note,
    }))
    .unwrap_or_default()
}

const CTRL: u8 = 1;
const ALT: u8 = 2;
const SHIFT: u8 = 4;
const CMD: u8 = 8;

/// An accelerator as its modifiers and its key (`N`, `1`, `Space`, `↑`, `F5`), or None when it is not one.
/// `CommandOrControl` is ⌘: this is the Mac app.
pub fn parts(accel: &str) -> Option<(u8, String)> {
    let mut mods = 0u8;
    let mut key: Option<String> = None;
    let tokens: Vec<&str> = accel.split('+').filter(|t| !t.is_empty()).collect();
    let (last, rest) = tokens.split_last()?;
    for t in rest {
        mods |= match t.to_ascii_uppercase().as_str() {
            "SHIFT" => SHIFT,
            "ALT" | "OPTION" => ALT,
            "CONTROL" | "CTRL" => CTRL,
            "SUPER" | "CMD" | "COMMAND" | "META" => CMD,
            "COMMANDORCONTROL" | "COMMANDORCTRL" | "CMDORCTRL" | "CMDORCONTROL" => CMD,
            _ => return None,
        };
    }
    let up = last.to_ascii_uppercase();
    if let Some(k) = up
        .strip_prefix("KEY")
        .filter(|k| k.len() == 1 && k.chars().all(|c| c.is_ascii_uppercase()))
    {
        key = Some(k.to_string());
    } else if let Some(d) = up
        .strip_prefix("DIGIT")
        .filter(|d| d.len() == 1 && d.chars().all(|c| c.is_ascii_digit()))
    {
        key = Some(d.to_string());
    } else if up.len() == 1 && up.chars().all(|c| c.is_ascii_alphanumeric()) {
        key = Some(up.clone());
    } else if up.len() >= 2
        && up.starts_with('F')
        && up[1..].parse::<u8>().is_ok_and(|n| (1..=24).contains(&n))
    {
        key = Some(up.clone());
    } else {
        let named = [
            ("SPACE", "Space"),
            ("ARROWUP", "↑"),
            ("UP", "↑"),
            ("ARROWDOWN", "↓"),
            ("DOWN", "↓"),
            ("ARROWLEFT", "←"),
            ("LEFT", "←"),
            ("ARROWRIGHT", "→"),
            ("RIGHT", "→"),
            ("ENTER", "↩"),
            ("MINUS", "-"),
            ("EQUAL", "="),
            ("BRACKETLEFT", "["),
            ("BRACKETRIGHT", "]"),
            ("BACKSLASH", "\\"),
            ("SEMICOLON", ";"),
            ("QUOTE", "'"),
            ("COMMA", ","),
            ("PERIOD", "."),
            ("SLASH", "/"),
            ("BACKQUOTE", "`"),
            ("TAB", "Tab"),
        ];
        if let Some((_, k)) = named.iter().find(|(n, _)| *n == up) {
            key = Some((*k).to_string());
        }
    }
    key.map(|k| (mods, k))
}

/// Whether two accelerators are the same keys, however they are spelled.
pub fn same(a: &str, b: &str) -> bool {
    matches!((parts(a), parts(b)), (Some(x), Some(y)) if x == y)
}

/// As people read it, in the order macOS writes modifiers: `⇧⌘N`, `⌥⌘N`, `⌃⌥T`.
pub fn label(accel: &str) -> Option<String> {
    let (mods, key) = parts(accel)?;
    let mut s = String::new();
    for (bit, glyph) in [(CTRL, '⌃'), (ALT, '⌥'), (SHIFT, '⇧'), (CMD, '⌘')] {
        if mods & bit != 0 {
            s.push(glyph);
        }
    }
    s.push_str(&key);
    Some(s)
}

/// Keys macOS or Tudu keep. Each answer is the line Settings shows.
pub fn reserved(accel: &str) -> Option<&'static str> {
    const KEPT: [(&str, &str); 13] = [
        ("Super+KeyQ", "⌘Q quits Tudu."),
        ("Super+KeyW", "⌘W closes the window."),
        ("Super+KeyH", "⌘H hides Tudu."),
        ("Super+KeyM", "⌘M minimises the window."),
        ("Super+KeyC", "⌘C copies."),
        ("Super+KeyV", "⌘V pastes."),
        ("Super+KeyX", "⌘X cuts."),
        ("Super+KeyZ", "⌘Z undoes."),
        ("Shift+Super+KeyZ", "⇧⌘Z redoes."),
        ("Super+KeyA", "⌘A selects everything."),
        ("Super+Comma", "⌘, opens Settings."),
        ("Super+Space", "macOS keeps ⌘Space for Spotlight."),
        ("Super+Tab", "macOS keeps ⌘Tab for switching apps."),
    ];
    KEPT.iter()
        .find(|(k, _)| same(k, accel))
        .map(|(_, why)| *why)
}

/// Why a change was refused; `text` is the line under the row's name.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum Refusal {
    /// Not an accelerator at all.
    Invalid,
    /// No ⌘, ⌃ or ⌥.
    Modifier,
    Reserved {
        why: String,
    },
    /// Another Tudu shortcut has these keys.
    Taken {
        by: Id,
    },
    /// macOS or another app holds them; the old keys stay.
    Refused {
        detail: String,
    },
    /// The choice could not be saved; the old keys stay.
    Save {
        detail: String,
    },
}

impl Refusal {
    pub fn text(&self, keys: &str, still: Option<&str>) -> String {
        let still = still
            .and_then(label)
            .map(|l| format!("Still {l}."))
            .unwrap_or_else(|| "It stays off.".to_string());
        match self {
            Refusal::Invalid => "Those keys can’t be used. Pick other keys.".to_string(),
            Refusal::Modifier => "Add ⌘, ⌃ or ⌥, so it can’t go off while you type.".to_string(),
            Refusal::Reserved { why } => format!("{why} Pick other keys."),
            Refusal::Taken { by } => format!("{keys} is {}. Pick other keys.", by.name()),
            Refusal::Refused { .. } => format!("macOS or another app already uses {keys}. {still}"),
            Refusal::Save { .. } => format!("Couldn’t save that on this Mac. {still} Try again."),
        }
    }
}

/// What registers keys with macOS. The plugin in the app, a fake in tests.
pub trait Registrar {
    fn register(&mut self, accel: &str) -> Result<(), String>;
    fn unregister(&mut self, accel: &str);
    fn is_registered(&self, accel: &str) -> bool;
}

/// Checks a change on its own: is it keys, has it a modifier, is it kept, has another shortcut got it.
pub fn check(current: &Bindings, id: Id, next: &str) -> Result<(), Refusal> {
    let Some((mods, _)) = parts(next) else {
        return Err(Refusal::Invalid);
    };
    if mods & (CTRL | ALT | CMD) == 0 {
        return Err(Refusal::Modifier);
    }
    if let Some(why) = reserved(next) {
        return Err(Refusal::Reserved {
            why: why.to_string(),
        });
    }
    match current.owner(next) {
        Some(other) if other != id => Err(Refusal::Taken { by: other }),
        _ => Ok(()),
    }
}

/// Changes one shortcut, in the only order that never leaves you without keys: the new keys are registered first;
/// only then are they saved and the old ones let go. If registering fails, nothing changes. If saving fails, the new
/// registration is taken back, so what runs is always what is saved.
pub fn rebind<R: Registrar>(
    r: &mut R,
    current: &Bindings,
    id: Id,
    next: Option<&str>,
    save: impl FnOnce(&Bindings) -> Result<(), String>,
) -> Result<Bindings, Refusal> {
    let old = current.get(id).map(str::to_string);
    if let Some(n) = next {
        check(current, id, n)?;
        if old.as_deref().is_some_and(|o| same(o, n)) {
            return Ok(current.clone());
        }
        r.register(n)
            .map_err(|detail| Refusal::Refused { detail })?;
    } else if old.is_none() {
        return Ok(current.clone());
    }
    let after = current.with(id, next.map(str::to_string));
    if let Err(detail) = save(&after) {
        if let Some(n) = next {
            r.unregister(n);
        }
        return Err(Refusal::Save { detail });
    }
    if let Some(o) = old {
        r.unregister(&o);
    }
    Ok(after)
}

/// How each shortcut stands after making sure: one that macOS no longer has is registered again. `Some(false)`:
/// another app took it; `None`: it is off.
pub fn ensure<R: Registrar>(r: &mut R, b: &Bindings) -> [(Id, Option<bool>); 2] {
    IDS.map(|id| {
        let state = b
            .get(id)
            .map(|a| r.is_registered(a) || r.register(a).is_ok());
        (id, state)
    })
}

/// A press made before the desk has said whether you are signed in: it waits, and runs either when the desk says
/// (`release`) or when its time is up (`expire`), never both. A newer press replaces an older one.
#[derive(Default, Debug)]
pub struct Hold {
    waiting: Option<(Id, u64)>,
    next: u64,
}

impl Hold {
    /// Holds the press; the number is what its timer hands back to `expire`.
    pub fn hold(&mut self, id: Id) -> u64 {
        self.next += 1;
        self.waiting = Some((id, self.next));
        self.next
    }

    /// The desk said: the press waiting, if any, to run now.
    pub fn release(&mut self) -> Option<Id> {
        self.waiting.take().map(|(id, _)| id)
    }

    /// The timer of press `n` ran out: it runs if it is still the one waiting.
    pub fn expire(&mut self, n: u64) -> Option<Id> {
        match self.waiting {
            Some((id, m)) if m == n => {
                self.waiting = None;
                Some(id)
            }
            _ => None,
        }
    }

    pub fn waiting(&self) -> Option<Id> {
        self.waiting.map(|(id, _)| id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    #[derive(Default)]
    struct Fake {
        held: HashSet<(u8, String)>,
        taken: Vec<&'static str>,
        log: Vec<String>,
    }

    impl Registrar for Fake {
        fn register(&mut self, accel: &str) -> Result<(), String> {
            self.log.push(format!("+{accel}"));
            if self.taken.iter().any(|t| same(t, accel)) {
                return Err("HotKey already registered".into());
            }
            self.held.insert(parts(accel).unwrap());
            Ok(())
        }
        fn unregister(&mut self, accel: &str) {
            self.log.push(format!("-{accel}"));
            self.held.remove(&parts(accel).unwrap());
        }
        fn is_registered(&self, accel: &str) -> bool {
            parts(accel).is_some_and(|p| self.held.contains(&p))
        }
    }

    fn started() -> (Fake, Bindings) {
        let mut f = Fake::default();
        let b = Bindings::default();
        ensure(&mut f, &b);
        f.log.clear();
        (f, b)
    }

    #[test]
    fn sk_r01_the_file_missing_broken_or_saved() {
        assert_eq!(from_file(b""), Bindings::default());
        assert_eq!(from_file(b"{nope"), Bindings::default());
        assert_eq!(from_file(br#"{"newTask": 7}"#), Bindings::default());
        assert_eq!(from_file(br#"{"newTask": "Hyper+N"}"#), Bindings::default());
        let b = from_file(br#"{"newTask": "Control+Alt+KeyT", "newNote": null}"#);
        assert_eq!(b.new_task.as_deref(), Some("Control+Alt+KeyT"));
        assert_eq!(b.new_note, None);
        assert_eq!(from_file(&to_file(&b)), b);
    }

    #[test]
    fn sk_r02_the_new_keys_are_registered_before_the_old_ones_go() {
        let (mut f, b) = started();
        let after = rebind(
            &mut f,
            &b,
            Id::NewTask,
            Some("Control+Alt+KeyT"),
            |_| Ok(()),
        )
        .unwrap();
        assert_eq!(
            f.log,
            vec!["+Control+Alt+KeyT".to_string(), format!("-{SUMMON}")]
        );
        assert_eq!(after.new_task.as_deref(), Some("Control+Alt+KeyT"));
        assert!(f.is_registered("Control+Alt+KeyT"));
        assert!(!f.is_registered(SUMMON));
    }

    #[test]
    fn sk_r02_keys_another_app_holds_change_nothing() {
        let (mut f, b) = started();
        f.taken.push("Alt+Space");
        let err = rebind(&mut f, &b, Id::NewTask, Some("Alt+Space"), |_| {
            panic!("not saved")
        })
        .unwrap_err();
        assert!(matches!(err, Refusal::Refused { .. }));
        assert_eq!(
            err.text("⌥Space", b.get(Id::NewTask)),
            "macOS or another app already uses ⌥Space. Still ⇧⌘N."
        );
        assert!(f.is_registered(SUMMON));
    }

    #[test]
    fn sk_r03_a_failed_save_takes_the_new_keys_back() {
        let (mut f, b) = started();
        let err = rebind(&mut f, &b, Id::NewTask, Some("Control+Alt+KeyT"), |_| {
            Err("disk full".into())
        })
        .unwrap_err();
        assert!(matches!(err, Refusal::Save { .. }));
        assert!(!f.is_registered("Control+Alt+KeyT"));
        assert!(f.is_registered(SUMMON));
        assert_eq!(
            err.text("⌃⌥T", b.get(Id::NewTask)),
            "Couldn’t save that on this Mac. Still ⇧⌘N. Try again."
        );
    }

    #[test]
    fn sk_r04_reserved_clashing_and_bare_keys_are_refused_here_too() {
        let (mut f, b) = started();
        let r = |f: &mut Fake, id, k| rebind(f, &b, id, Some(k), |_| Ok(())).unwrap_err();
        assert_eq!(
            r(&mut f, Id::NewTask, "Super+KeyQ").text("⌘Q", None),
            "⌘Q quits Tudu. Pick other keys."
        );
        assert_eq!(
            r(&mut f, Id::NewTask, NOTES),
            Refusal::Taken { by: Id::NewNote }
        );
        assert_eq!(r(&mut f, Id::NewTask, "Shift+KeyK"), Refusal::Modifier);
        assert_eq!(r(&mut f, Id::NewTask, "KeyK"), Refusal::Modifier);
        assert_eq!(r(&mut f, Id::NewTask, "Hyper+K"), Refusal::Invalid);
        assert!(f.log.is_empty(), "nothing registered: {:?}", f.log);
    }

    #[test]
    fn sk_r04_off_and_back_and_the_same_keys_again() {
        let (mut f, b) = started();
        let off = rebind(&mut f, &b, Id::NewNote, None, |_| Ok(())).unwrap();
        assert_eq!(off.new_note, None);
        assert!(!f.is_registered(NOTES));
        let back = rebind(
            &mut f,
            &off,
            Id::NewNote,
            Some("Alt+Super+KeyN"),
            |_| Ok(()),
        )
        .unwrap();
        assert!(f.is_registered(NOTES));
        f.log.clear();
        // The same keys spelled another way: nothing to do.
        rebind(&mut f, &back, Id::NewNote, Some(NOTES), |_| {
            panic!("not saved")
        })
        .unwrap();
        assert!(f.log.is_empty());
    }

    #[test]
    fn sk_r05_ensure_registers_again_and_reports_what_it_could_not() {
        let (mut f, b) = started();
        f.held.clear();
        f.taken.push(NOTES);
        let st = ensure(&mut f, &b);
        assert_eq!(st, [(Id::NewTask, Some(true)), (Id::NewNote, Some(false))]);
        assert!(f.is_registered(SUMMON));
        let off = b.with(Id::NewNote, None);
        assert_eq!(ensure(&mut f, &off)[1], (Id::NewNote, None));
    }

    #[test]
    fn sk_r05_the_owner_of_a_press_follows_the_bindings() {
        let b = Bindings::default().with(Id::NewTask, Some("Control+Alt+KeyT".into()));
        assert_eq!(b.owner("Control+Alt+KeyT"), Some(Id::NewTask));
        assert_eq!(b.owner("Ctrl+Option+T"), Some(Id::NewTask));
        assert_eq!(b.owner(SUMMON), None);
        assert_eq!(b.owner(NOTES), Some(Id::NewNote));
    }

    #[test]
    fn sk_r06_a_press_before_the_desk_says_waits_and_runs_once() {
        let mut h = Hold::default();
        let n = h.hold(Id::NewTask);
        assert_eq!(h.waiting(), Some(Id::NewTask));
        assert_eq!(h.release(), Some(Id::NewTask));
        // Its timer, later, finds nothing to run.
        assert_eq!(h.expire(n), None);
        // No report in time: the timer runs it, once.
        let n = h.hold(Id::NewNote);
        assert_eq!(h.expire(n), Some(Id::NewNote));
        assert_eq!(h.release(), None);
        // A newer press replaces the older one; the older timer leaves it alone.
        let old = h.hold(Id::NewTask);
        let new = h.hold(Id::NewNote);
        assert_eq!(h.expire(old), None);
        assert_eq!(h.expire(new), Some(Id::NewNote));
    }

    #[test]
    fn sk_r07_labels_in_macos_order() {
        assert_eq!(label(SUMMON).as_deref(), Some("⇧⌘N"));
        assert_eq!(label(NOTES).as_deref(), Some("⌥⌘N"));
        assert_eq!(
            label("Super+Shift+Alt+Control+Digit1").as_deref(),
            Some("⌃⌥⇧⌘1")
        );
        assert_eq!(label("Alt+Space").as_deref(), Some("⌥Space"));
        assert_eq!(label("Control+ArrowUp").as_deref(), Some("⌃↑"));
        assert_eq!(label("nope+N"), None);
    }
}
