//! Where the floating Quick Add appears (top centre of the screen the pointer is on), where the menu bar's sheet
//! drops (under the tick), and where the note window sits (where you left it, kept on a screen). Physical pixels
//! throughout, as the monitors, the pointer and the tray report them.

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

/// The note window's first size in points (P-Floating), and the least it can be resized to.
pub const NOTE_WIDTH: f64 = 780.0;
pub const NOTE_HEIGHT: f64 = 560.0;
pub const NOTE_MIN_WIDTH: f64 = 420.0;
pub const NOTE_MIN_HEIGHT: f64 = 320.0;
/// Filling the screen keeps this much room at its edges, in points.
pub const NOTE_FILL_MARGIN: f64 = 8.0;
/// At least this much of the window's bar stays on a screen, in points, so it can always be dragged back.
pub const NOTE_KEEP: f64 = 120.0;

/// A window's place and size, in physical pixels.
#[derive(Clone, Copy, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct Frame {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

/// The note window the first time: its own size, centred across the screen, a little way down from the top.
pub fn note_default(screen: Screen) -> Frame {
    let width = (NOTE_WIDTH * screen.scale).min(screen.width);
    let height = (NOTE_HEIGHT * screen.scale).min(screen.height);
    Frame {
        x: screen.x + ((screen.width - width) / 2.0).round(),
        y: screen.y
            + (FLOATING_TOP * screen.scale)
                .min(screen.height - height)
                .max(0.0)
                .round(),
        width,
        height,
    }
}

/// Where you left it, if a screen still shows enough of it (displays come and go); else on the screen it was mostly
/// on, or the first one, pulled in so its bar is on that screen, never bigger than the screen.
pub fn keep_on_screen(f: Frame, screens: &[Screen]) -> Option<Frame> {
    let centre = (f.x + f.width / 2.0, f.y + 20.0);
    let s = screens
        .iter()
        .find(|s| s.contains(centre.0, centre.1))
        .or_else(|| screens.iter().find(|s| s.contains(f.x + 20.0, f.y + 20.0)))
        .or_else(|| screens.first())
        .copied()?;
    let width = f
        .width
        .min(s.width)
        .max((NOTE_MIN_WIDTH * s.scale).min(s.width));
    let height = f
        .height
        .min(s.height)
        .max((NOTE_MIN_HEIGHT * s.scale).min(s.height));
    let keep = NOTE_KEEP * s.scale;
    let x = f.x.max(s.x - width + keep).min(s.x + s.width - keep);
    let y = f.y.max(s.y).min(s.y + s.height - 40.0 * s.scale);
    Some(Frame {
        x: x.round(),
        y: y.round(),
        width: width.round(),
        height: height.round(),
    })
}

/// Fill the screen: its whole work area (without the menu bar and the Dock) but a small margin.
pub fn fill(area: Screen) -> Frame {
    let m = NOTE_FILL_MARGIN * area.scale;
    Frame {
        x: (area.x + m).round(),
        y: (area.y + m).round(),
        width: (area.width - 2.0 * m).round(),
        height: (area.height - 2.0 * m).round(),
    }
}

/// Resizing from an edge or corner (`n`, `ne`, `e`, `se`, `s`, `sw`, `w`, `nw`): the edges it names follow the pointer
/// by `dx`, `dy` while the opposite ones stay put, never smaller than `min_w` × `min_h`. All in physical pixels.
pub fn resize(f: Frame, edge: &str, dx: f64, dy: f64, min_w: f64, min_h: f64) -> Frame {
    let (right, bottom) = (f.x + f.width, f.y + f.height);
    let mut out = f;
    if edge.contains('e') {
        out.width = (f.width + dx).max(min_w);
    }
    if edge.contains('s') {
        out.height = (f.height + dy).max(min_h);
    }
    if edge.contains('w') {
        out.x = (f.x + dx).min(right - min_w);
        out.width = right - out.x;
    }
    if edge.contains('n') {
        out.y = (f.y + dy).min(bottom - min_h);
        out.height = bottom - out.y;
    }
    out
}

/// Part way through a glide from `a` to `b`: `t` from 0 to 1 eased in and out (cubic), each edge on whole pixels.
pub fn between(a: Frame, b: Frame, t: f64) -> Frame {
    let t = t.clamp(0.0, 1.0);
    let e = if t < 0.5 {
        4.0 * t * t * t
    } else {
        1.0 - (-2.0 * t + 2.0).powi(3) / 2.0
    };
    let mix = |p: f64, q: f64| (p + (q - p) * e).round();
    Frame {
        x: mix(a.x, b.x),
        y: mix(a.y, b.y),
        width: mix(a.width, b.width),
        height: mix(a.height, b.height),
    }
}

/// A frame in Cocoa's terms, for setting a window's frame in one step: points, from the bottom-left of the
/// primary screen. `scale` is the window's backing scale, `primary_height` the primary screen's height in points.
pub fn cocoa_rect(f: Frame, scale: f64, primary_height: f64) -> Frame {
    let (x, y) = (f.x / scale, f.y / scale);
    let (width, height) = (f.width / scale, f.height / scale);
    Frame {
        x,
        y: primary_height - (y + height),
        width,
        height,
    }
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

    #[test]
    fn c22_d02_the_note_window_opens_where_it_was_and_stays_on_a_screen() {
        let first = note_default(LEFT);
        assert_eq!(first.width, 1560.0);
        assert_eq!(first.x, ((3024.0 - 1560.0) / 2.0_f64).round());
        assert_eq!(first.y, 280.0);
        // Left on the right screen: it stays exactly there.
        let there = Frame {
            x: 3400.0,
            y: 200.0,
            width: 780.0,
            height: 560.0,
        };
        assert_eq!(keep_on_screen(there, &[LEFT, RIGHT]), Some(there));
        // The right screen unplugged: it comes back onto the left one, its bar in reach, never bigger than it.
        let back = keep_on_screen(there, &[LEFT]).unwrap();
        assert!(back.x + NOTE_KEEP * 2.0 <= 3024.0);
        assert!(back.width <= 3024.0 && back.height <= 1964.0);
        // Dragged mostly off the top-left: its bar comes back on.
        let off = keep_on_screen(
            Frame {
                x: -5000.0,
                y: -300.0,
                width: 1560.0,
                height: 1120.0,
            },
            &[LEFT],
        )
        .unwrap();
        assert_eq!(off.y, 0.0);
        assert_eq!(off.x, -1560.0 + NOTE_KEEP * 2.0);
        assert_eq!(keep_on_screen(there, &[]), None);
    }

    #[test]
    fn c22_d03_filling_the_screen_keeps_a_small_margin() {
        let area = Screen {
            x: 0.0,
            y: 50.0,
            width: 3024.0,
            height: 1800.0,
            scale: 2.0,
        };
        assert_eq!(
            fill(area),
            Frame {
                x: 16.0,
                y: 66.0,
                width: 2992.0,
                height: 1768.0
            }
        );
    }

    #[test]
    fn c22_u68_a_glide_s_frame_flips_to_cocoa_points() {
        // A 2× primary screen 900 points tall: 200,100 (points) from its top-left, 640×520 points.
        let f = Frame {
            x: 400.0,
            y: 200.0,
            width: 1280.0,
            height: 1040.0,
        };
        assert_eq!(
            cocoa_rect(f, 2.0, 900.0),
            Frame {
                x: 200.0,
                y: 900.0 - (100.0 + 520.0),
                width: 640.0,
                height: 520.0
            }
        );
        // On a 1× screen above the primary one (negative y in Tauri's terms): above the primary in Cocoa's.
        let above = Frame {
            x: -300.0,
            y: -800.0,
            width: 600.0,
            height: 500.0,
        };
        assert_eq!(
            cocoa_rect(above, 1.0, 900.0),
            Frame {
                x: -300.0,
                y: 1200.0,
                width: 600.0,
                height: 500.0
            }
        );
    }

    #[test]
    fn c22_u71_a_glide_eases_from_one_frame_to_the_other() {
        let a = Frame {
            x: 100.0,
            y: 100.0,
            width: 640.0,
            height: 480.0,
        };
        let b = Frame {
            x: 8.0,
            y: 33.0,
            width: 1904.0,
            height: 1039.0,
        };
        assert_eq!(between(a, b, 0.0), a);
        assert_eq!(between(a, b, 1.0), b);
        assert_eq!(between(a, b, 2.0), b);
        let mid = between(a, b, 0.5);
        assert_eq!(mid.width, 1272.0);
        // Slow at the ends, quick in the middle.
        assert!(between(a, b, 0.1).width - a.width < (b.width - a.width) * 0.1);
        assert!(between(a, b, 0.9).width > a.width + (b.width - a.width) * 0.9);
    }

    #[test]
    fn c22_u69_resizing_from_an_edge_moves_only_its_edges() {
        let f = Frame {
            x: 100.0,
            y: 100.0,
            width: 800.0,
            height: 600.0,
        };
        let r = |e: &str, dx: f64, dy: f64| resize(f, e, dx, dy, 420.0, 320.0);
        assert_eq!(r("e", 50.0, 9.0), Frame { width: 850.0, ..f });
        assert_eq!(r("s", 9.0, 40.0), Frame { height: 640.0, ..f });
        assert_eq!(
            r("w", 30.0, 0.0),
            Frame {
                x: 130.0,
                width: 770.0,
                ..f
            }
        );
        assert_eq!(
            r("nw", -20.0, -10.0),
            Frame {
                x: 80.0,
                y: 90.0,
                width: 820.0,
                height: 610.0
            }
        );
        assert_eq!(
            r("ne", 10.0, 20.0),
            Frame {
                y: 120.0,
                width: 810.0,
                height: 580.0,
                ..f
            }
        );
        // Never smaller than the least; the far edge stays where it was.
        assert_eq!(
            r("se", -900.0, -900.0),
            Frame {
                width: 420.0,
                height: 320.0,
                ..f
            }
        );
        let w = r("w", 900.0, 0.0);
        assert_eq!((w.x + w.width, w.width), (900.0, 420.0));
        let n = r("n", 0.0, 900.0);
        assert_eq!((n.y + n.height, n.height), (700.0, 320.0));
    }
}
