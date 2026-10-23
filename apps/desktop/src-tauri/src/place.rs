//! Where the floating Quick Add appears (top centre of the screen the pointer is on), and where the menu bar's sheet
//! drops (under the tick). Physical pixels throughout, as the monitors, the pointer and the tray report them.

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Screen {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub scale: f64,
}

impl Screen {
    pub fn contains(&self, x: f64, y: f64) -> bool {
        x >= self.x && x < self.x + self.width && y >= self.y && y < self.y + self.height
    }
}

/// The floating window's width in points.
pub const FLOATING_WIDTH: f64 = 640.0;
/// Tall enough for the bar with a picker open under it; the clear part around the bar passes clicks to the page,
/// which hides the window.
pub const FLOATING_HEIGHT: f64 = 520.0;
/// The bar's top sits this far down the screen, in points.
pub const FLOATING_TOP: f64 = 140.0;

/// The screen holding the pointer, else the first one.
pub fn screen_for(pointer: Option<(f64, f64)>, screens: &[Screen]) -> Option<Screen> {
    pointer
        .and_then(|(x, y)| screens.iter().find(|s| s.contains(x, y)).copied())
        .or_else(|| screens.first().copied())
}

/// The window's top-left corner: centred across the screen, a fixed distance from its top.
pub fn floating_origin(screen: Screen) -> (f64, f64) {
    let w = FLOATING_WIDTH * screen.scale;
    let x = screen.x + ((screen.width - w) / 2.0).round();
    let top = FLOATING_TOP.min(screen.height / screen.scale / 4.0) * screen.scale;
    (x, screen.y + top.round())
}

/// The tick's place in the menu bar, as its click reports it.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Icon {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

/// The sheet's size in points (K-MenuBar): 360 wide, up to 600 tall; it scrolls past that.
pub const SHEET_WIDTH: f64 = 360.0;
pub const SHEET_HEIGHT: f64 = 600.0;
/// Between the menu bar and the sheet, in points.
pub const SHEET_GAP: f64 = 6.0;
/// The least room between the sheet and the screen's side, in points.
pub const SHEET_MARGIN: f64 = 8.0;

/// The sheet's top-left corner: centred under the tick, slid along so it stays on the tick's screen.
pub fn sheet_origin(icon: Icon, screen: Screen) -> (f64, f64) {
    let w = SHEET_WIDTH * screen.scale;
    let m = SHEET_MARGIN * screen.scale;
    let centred = icon.x + icon.width / 2.0 - w / 2.0;
    let x = centred
        .min(screen.x + screen.width - w - m)
        .max(screen.x + m);
    (
        x.round(),
        (icon.y + icon.height + SHEET_GAP * screen.scale).round(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    const LEFT: Screen = Screen {
        x: 0.0,
        y: 0.0,
        width: 3024.0,
        height: 1964.0,
        scale: 2.0,
    };
    const RIGHT: Screen = Screen {
        x: 3024.0,
        y: 0.0,
        width: 1920.0,
        height: 1080.0,
        scale: 1.0,
    };

    #[test]
    fn c11_u08_the_floating_window_goes_top_centre_of_the_pointers_screen() {
        let s = screen_for(Some((3500.0, 400.0)), &[LEFT, RIGHT]).unwrap();
        assert_eq!(s, RIGHT);
        assert_eq!(floating_origin(s), (3024.0 + 640.0, 140.0));
        let s = screen_for(Some((10.0, 10.0)), &[LEFT, RIGHT]).unwrap();
        assert_eq!(floating_origin(s), ((3024.0 - 1280.0) / 2.0, 280.0));
    }

    #[test]
    fn c11_u08_no_pointer_takes_the_first_screen() {
        assert_eq!(screen_for(None, &[LEFT, RIGHT]), Some(LEFT));
        assert_eq!(screen_for(Some((-50.0, -50.0)), &[RIGHT]), Some(RIGHT));
        assert_eq!(screen_for(None, &[]), None);
    }

    #[test]
    fn c11_u08_a_short_screen_keeps_the_bar_in_its_top_quarter() {
        let small = Screen {
            x: 0.0,
            y: 0.0,
            width: 1280.0,
            height: 400.0,
            scale: 1.0,
        };
        assert_eq!(floating_origin(small), (320.0, 100.0));
    }

    /// A tick 44 by 48 physical pixels (22 by 24 points), at `x` on the top edge of a screen.
    fn tick(x: f64, screen: Screen) -> Icon {
        Icon {
            x: screen.x + x,
            y: screen.y,
            width: 22.0 * screen.scale,
            height: 24.0 * screen.scale,
        }
    }

    #[test]
    fn c20_u05_the_sheet_drops_centred_under_the_tick() {
        let i = tick(2000.0, LEFT);
        assert_eq!(sheet_origin(i, LEFT), (2000.0 + 22.0 - 360.0, 48.0 + 12.0));
    }

    #[test]
    fn c20_u05_near_the_right_edge_the_sheet_slides_left_to_stay_on_screen() {
        let i = tick(2960.0, LEFT);
        assert_eq!(sheet_origin(i, LEFT).0, 3024.0 - 720.0 - 16.0);
        let i = tick(1880.0, RIGHT);
        let (x, y) = sheet_origin(i, RIGHT);
        assert_eq!(x, 3024.0 + 1920.0 - 360.0 - 8.0);
        assert_eq!(y, 24.0 + 6.0);
    }

    #[test]
    fn c20_u05_near_the_left_edge_it_slides_right() {
        let i = tick(10.0, RIGHT);
        assert_eq!(sheet_origin(i, RIGHT).0, 3024.0 + 8.0);
        assert_eq!(
            screen_for(Some((i.x + 11.0, i.y + 12.0)), &[LEFT, RIGHT]),
            Some(RIGHT)
        );
    }
}
