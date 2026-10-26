// ci filter test
// No console window on release builds (a no-op on macOS, kept for other targets).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tudu_desktop::run()
}
