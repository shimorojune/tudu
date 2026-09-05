#[cfg(target_os = "macos")]
use objc2::AnyThread;
#[cfg(target_os = "macos")]
use objc2::MainThreadMarker;
#[cfg(target_os = "macos")]
use objc2_app_kit::{NSApplication, NSImage};
#[cfg(target_os = "macos")]
use objc2_foundation::{NSData, NSSize};

#[cfg(target_os = "macos")]
const DOCK_ICON: &[u8] = include_bytes!("../icons/dock-dev.png");

#[cfg(target_os = "macos")]
const TRAY_ICON: &[u8] = include_bytes!("../icons/tray-template.png");

#[cfg(target_os = "macos")]
pub fn set_dock_icon() -> Result<(), String> {
    let marker = MainThreadMarker::new()
        .ok_or_else(|| "Dock icon update must run on the main thread".to_string())?;

    let data = NSData::from_vec(DOCK_ICON.to_vec());
    let ns_image = NSImage::initWithData(NSImage::alloc(), &data)
        .ok_or_else(|| "Failed to create macOS dock icon image".to_string())?;
    ns_image.setSize(NSSize {
        width: 128.0,
        height: 128.0,
    });

    let app = NSApplication::sharedApplication(marker);
    unsafe {
        app.setApplicationIconImage(Some(&ns_image));
    }
    Ok(())
}

#[cfg(not(target_os = "macos"))]
pub fn set_dock_icon() -> Result<(), String> {
    Ok(())
}

#[cfg(target_os = "macos")]
pub fn tray_icon() -> Result<tauri::image::Image<'static>, String> {
    tauri::image::Image::from_bytes(TRAY_ICON)
        .map_err(|error| format!("Failed to load macOS tray icon: {error}"))
}
