//! Where the floating Quick Add appears: top centre of the screen the pointer is on. Physical pixels throughout,
//! as the monitors and the pointer report them.

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
}
