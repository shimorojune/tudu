/* global window, document */
// The look the app built this window with (window.__TUDU_LOOK__, from Settings › Appearance and Less motion),
// before the first paint: Tudu's theme, not macOS's. With nothing saved yet it follows macOS.
(function () {
  try {
    var look = window.__TUDU_LOOK__ || {};
    var root = document.documentElement;
    var dark =
      look.theme === 'dark' ||
      (look.theme !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    root.classList.toggle('dark', dark);
    root.style.colorScheme = dark ? 'dark' : 'light';
    if (look.lessMotion) root.dataset.motion = 'less';
  } catch {
    /* the loader still paints, in the light palette */
  }
})();
