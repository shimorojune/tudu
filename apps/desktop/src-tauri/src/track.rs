//! The three builds of the app: Tudu (production), Tudu Staging and Tudu Test. Each is its own app with its own
//! identifier, name and update feed, so all three can be installed side by side.

use serde::Serialize;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Track {
    Production,
    Staging,
    Test,
}

impl Track {
    /// The track a build belongs to, read from its bundle identifier.
    pub fn from_identifier(identifier: &str) -> Track {
        match identifier {
            "net.ezdev.tudu.staging" => Track::Staging,
            "net.ezdev.tudu.test" => Track::Test,
            _ => Track::Production,
        }
    }

    pub fn identifier(self) -> &'static str {
        match self {
            Track::Production => "net.ezdev.tudu",
            Track::Staging => "net.ezdev.tudu.staging",
            Track::Test => "net.ezdev.tudu.test",
        }
    }

    /// The app's name: under its icon, on the window, in the tray and in About.
    pub fn name(self) -> &'static str {
        match self {
            Track::Production => "Tudu",
            Track::Staging => "Tudu Staging",
            Track::Test => "Tudu Test",
        }
    }

    /// Where Tudu lives on the web: the app's windows open it (the page and the API share a site, so the session
    /// cookie works as it does in a browser). Tudu Test opens the harness's local web app instead.
    pub fn web(self) -> &'static str {
        match self {
            Track::Production => "https://tudu.ezdev.net",
            Track::Staging => "https://staging.tudu.ezdev.net",
            Track::Test => "http://localhost:5173",
        }
    }

    /// Where the app asks for a newer version of itself: its own track's API.
    pub fn endpoint(self) -> &'static str {
        match self {
            Track::Production => "https://api.tudu.ezdev.net/updates/latest.json",
            Track::Staging => "https://api.staging.tudu.ezdev.net/updates/latest.json",
            Track::Test => "http://localhost:3456/updates/latest.json",
        }
    }
}

/// The summon: one global shortcut that brings up the floating Quick Add over whatever you are doing.
pub const SUMMON: &str = "CommandOrControl+Shift+N";
/// The summon as the web app (and the menu bar's New task) shows it.
pub const SUMMON_LABEL: &str = "⌘⇧N";

#[cfg(test)]
mod tests {
    use super::*;
    use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut};

    #[test]
    fn c11_u08_the_summon_is_command_shift_n() {
        let s: Shortcut = SUMMON.parse().expect("the summon parses");
        assert_eq!(
            s,
            Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::KeyN)
        );
        assert_eq!(SUMMON_LABEL, "⌘⇧N");
    }

    #[test]
    fn c11_u08_the_track_comes_from_the_build() {
        for t in [Track::Production, Track::Staging, Track::Test] {
            assert_eq!(Track::from_identifier(t.identifier()), t);
        }
        assert_eq!(Track::from_identifier("anything.else"), Track::Production);
        assert_eq!(Track::Production.name(), "Tudu");
        assert_eq!(Track::Staging.name(), "Tudu Staging");
        assert_eq!(Track::Test.name(), "Tudu Test");
        assert_eq!(
            Track::Production.endpoint(),
            "https://api.tudu.ezdev.net/updates/latest.json"
        );
        assert_eq!(
            Track::Staging.endpoint(),
            "https://api.staging.tudu.ezdev.net/updates/latest.json"
        );
        assert!(Track::Test.endpoint().starts_with("http://localhost:"));
        assert_eq!(Track::Production.web(), "https://tudu.ezdev.net");
        assert_eq!(Track::Staging.web(), "https://staging.tudu.ezdev.net");
    }
}
