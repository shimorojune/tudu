#[cfg(target_os = "macos")]
use objc2::AnyThread;
#[cfg(target_os = "macos")]
use objc2::MainThreadMarker;
#[cfg(target_os = "macos")]
use objc2_app_kit::{NSApplication, NSImage};
#[cfg(target_os = "macos")]
use objc2_foundation::{NSData, NSSize, NSString};

#[cfg(target_os = "macos")]
pub fn set_unread_badge(count: u32) -> Result<(), String> {
    let marker = MainThreadMarker::new()
        .ok_or_else(|| "Dock badge update must run on the main thread".to_string())?;

    let app = NSApplication::sharedApplication(marker);
    let tile = app.dockTile();
    if count == 0 {
        tile.setBadgeLabel(None);
    } else {
        let label = if count > 99 {
            "99+".to_string()
        } else {
            count.to_string()
        };
        let ns_label = NSString::from_str(&label);
        tile.setBadgeLabel(Some(&ns_label));
    }
    Ok(())
}

#[cfg(not(target_os = "macos"))]
pub fn set_unread_badge(_count: u32) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub fn set_unread_badge_command(count: u32) -> Result<(), String> {
    set_unread_badge(count)
}

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
