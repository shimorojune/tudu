# Notebook canvas kit (reference only, delete before merge)

Copied from the approved canvas (v118) so the build can port it. Not shipped code.
Kit names are canvas-only: PadX components and tp-pd-* classes become Notebook/note names and tp-nb-* in the real code.
Never call notes "pad" anywhere user-facing.

Shared DS fix also made on the canvas: `.tp-td-compose` padding is `12px 36px 14px` (compact `10px 20px max(12px, env(safe-area-inset-bottom))`).
