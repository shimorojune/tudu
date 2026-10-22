// The app's own commands, as permissions the web page is granted in the capabilities (tauri.conf.json): Tudu on
// the web is a remote origin, and remote pages get no command they are not given. `control_reply` exists only in
// Tudu Test.
const COMMANDS: &[&str] = &[
    "app_info",
    "set_signed_in",
    "set_badge",
    "open_external",
    "save_download",
    "show_main",
    "hide_floating",
    "update_check",
    "update_install",
];
const TEST_COMMANDS: &[&str] = &[
    "app_info",
    "set_signed_in",
    "set_badge",
    "open_external",
    "save_download",
    "show_main",
    "hide_floating",
    "update_check",
    "update_install",
    "control_reply",
];

fn main() {
    let commands = if std::env::var("CARGO_FEATURE_CONTROL").is_ok() {
        TEST_COMMANDS
    } else {
        COMMANDS
    };
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(commands)),
    )
    .expect("the Tauri build step failed");
}
